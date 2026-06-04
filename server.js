require('dotenv').config();
const express = require('express');
const http    = require('http');
const { WebSocketServer } = require('ws');
const path    = require('path');

const db           = require('./db/database');
const tickProducer = require('./services/tickProducer');
const tickFeeder   = require('./services/tickFeeder');
const marketHours  = require('./utils/marketHours');
const { getUnderlyings, getExpiriesForExchange, getMCXExpiries, getOptionChain, getMCXOptionChain } = require('./openalgo/rest');
const OpenAlgoWSClient = require('./openalgo/wsClient');
const { computeGreeks } = require('./utils/greeks');

// ─── Config ───────────────────────────────────────────────────────────────────
const REST_URL     = process.env.OPENALGO_REST_URL || 'http://127.0.0.1:5001';
const WS_URL       = process.env.OPENALGO_WS_URL   || 'ws://127.0.0.1:8765';
const API_KEY      = process.env.OPENALGO_API_KEY  || '';
const PORT         = parseInt(process.env.PORT     || '3001');
const STRIKE_COUNT = parseInt(process.env.STRIKE_COUNT || '20');

const NSE_INDICES = new Set(['NIFTY','BANKNIFTY','FINNIFTY','MIDCPNIFTY','NIFTYNXT50']);
const BSE_INDICES = new Set(['SENSEX','BANKEX','SENSEX50']);

const SEGMENT_META = {
  NFO: { contractExchange: 'NFO' },
  BFO: { contractExchange: 'BFO' },
  MCX: { contractExchange: 'MCX' }, // Uses getMCXOptionChain (custom, bypasses OpenAlgo option chain)
};

function getOptionChainExchange(symbol, segment) {
  if (segment === 'NFO') return NSE_INDICES.has(symbol) ? 'NSE_INDEX' : 'NSE';
  if (segment === 'BFO') return BSE_INDICES.has(symbol) ? 'BSE_INDEX' : 'BSE';
  return segment;
}
function getIndexWsExchange(symbol, segment) {
  return getOptionChainExchange(symbol, segment);
}

// ─── In-memory state ──────────────────────────────────────────────────────────
const state = {
  underlyings: { NFO: [], BFO: [], MCX: [] },
  expiries:    {},
  chain:       {},  // [symbol][expiry] = chainData
  // symMeta[optionSymbol] = { underlying, expiry, strike, side, segment, daysToExpiry }
  symMeta:     {},
  subscribed:  new Set(),
};

// ─── Express + HTTP + WS ──────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server, path: '/ws' });

app.use(express.json());
// Serve React build; fall back to public/ for the old plain HTML UI
const reactBuild = path.join(__dirname, 'frontend', 'build');
const fs = require('fs');
if (fs.existsSync(reactBuild)) {
  // Cache JS/CSS forever (they have content hash in filename), never cache index.html
  app.use(express.static(reactBuild, {
    setHeaders(res, filePath) {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    }
  }));
} else {
  app.use(express.static(path.join(__dirname, 'public')));
}

function broadcast(msg) {
  const data = JSON.stringify(msg);
  wss.clients.forEach(c => c.readyState === 1 && c.send(data));
}

// ─── Days to expiry helper ────────────────────────────────────────────────────
function daysToExpiry(expiryStr) {
  // expiryStr = "09JUN26"  → parse as DDMMMYY
  const months = { JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11 };
  const d = parseInt(expiryStr.slice(0, 2));
  const m = months[expiryStr.slice(2, 5)];
  const y = 2000 + parseInt(expiryStr.slice(5, 7));
  const exp = new Date(y, m, d, 15, 30); // 3:30 PM IST expiry
  return Math.max((exp - Date.now()) / (1000 * 60 * 60 * 24), 0);
}

// ─── Tick handler: update cache + compute Greeks + save + broadcast ───────────
function onTick(tick) {
  const { symbol, exchange } = tick;
  db.upsertTick(tick); // keep latest-value table updated

  // Is this a futures tick (MCX underlying)?
  const futMeta = state.symMeta[symbol];
  if (futMeta?.isFutures) {
    const chainData = state.chain[futMeta.underlying];
    if (chainData) {
      for (const expiry of Object.keys(chainData)) {
        if (chainData[expiry]) chainData[expiry].underlying_ltp = tick.ltp;
      }
      const spotTick = { ...tick, symbol: futMeta.underlying };
      tickProducer.saveSpot(futMeta.underlying, exchange, tick.ltp);
      broadcast({ type: 'tick', data: spotTick });
    }
    return;
  }

  // Is this an underlying index tick?
  const chainData = state.chain[symbol];
  if (chainData) {
    for (const expiry of Object.keys(chainData)) {
      if (chainData[expiry]) chainData[expiry].underlying_ltp = tick.ltp;
    }
    tickProducer.saveSpot(symbol, exchange, tick.ltp);
    broadcast({ type: 'tick', data: tick });
    return;
  }

  // Is this an option tick?
  const meta = state.symMeta[symbol];
  if (!meta) { broadcast({ type: 'tick', data: tick }); return; }

  const { underlying, expiry, strike, side } = meta;
  const cd = state.chain[underlying]?.[expiry];
  if (!cd) return;

  // Find the row and update in-memory cache
  for (const row of cd.strikes || []) {
    if (row[side]?.symbol !== symbol) continue;
    const opt = row[side];

    if (tick.ltp    != null) { opt.ltp_chg = +(tick.ltp - (opt.prev_close || tick.ltp)).toFixed(2); opt.ltp = tick.ltp; }
    if (tick.bid    != null) opt.bid    = tick.bid;
    if (tick.ask    != null) opt.ask    = tick.ask;
    if (tick.volume != null) opt.volume = tick.volume;
    if (tick.oi     != null) {
      if (!opt._baseOI) opt._baseOI = tick.oi;
      opt.oi_chg = tick.oi - opt._baseOI;
      opt.oi = tick.oi;
    }
    if (tick.open   != null) opt.open   = tick.open;
    if (tick.high   != null) opt.high   = tick.high;
    if (tick.low    != null) opt.low    = tick.low;

    if (opt.ltp && cd.underlying_ltp) {
      const g = computeGreeks(opt.ltp, cd.underlying_ltp, strike, daysToExpiry(expiry), side === 'ce');
      if (g) { opt.iv = g.iv; opt.delta = g.delta; opt.gamma = g.gamma; opt.theta = g.theta; opt.vega = g.vega; }
    }
    break;
  }

  const enriched = {
    ...tick,
    underlying, expiry, strike: meta.strike, side,
    ...getOptFields(underlying, expiry, symbol, side),
  };

  // Save to history DB (users get data from DB, not directly from broker)
  tickProducer.save(enriched);

  broadcast({ type: 'tick', data: enriched });
}

// Get current enriched option fields for broadcasting
function getOptFields(underlying, expiry, symbol, side) {
  const cd = state.chain[underlying]?.[expiry];
  if (!cd) return {};
  for (const row of cd.strikes || []) {
    if (row[side]?.symbol === symbol) {
      const o = row[side];
      return { ltp_chg: o.ltp_chg, oi: o.oi, oi_chg: o.oi_chg, iv: o.iv, delta: o.delta, gamma: o.gamma, theta: o.theta, vega: o.vega };
    }
  }
  return {};
}

// ─── OpenAlgo WS client ───────────────────────────────────────────────────────
const algoWS = new OpenAlgoWSClient(WS_URL, API_KEY, onTick, () => resubscribeAll());

// ─── Subscribe option symbols ─────────────────────────────────────────────────
function subscribeChain(underlying, expiry, segment, chainData) {
  // For MCX: subscribe the futures contract for underlying LTP, not the underlying name
  const undSym  = (segment === 'MCX' && chainData.underlying_futures) ? chainData.underlying_futures : underlying;
  const wsExch  = segment === 'MCX' ? 'MCX' : getIndexWsExchange(underlying, segment);
  const undKey  = `${undSym}:${wsExch}`;
  if (!state.subscribed.has(undKey)) {
    algoWS.subscribe(undSym, wsExch, 2);
    state.subscribed.add(undKey);
  }
  // Register futures symbol → maps to underlying in onTick
  if (segment === 'MCX' && chainData.underlying_futures) {
    state.symMeta[chainData.underlying_futures] = { underlying, isFutures: true };
  }

  const { contractExchange } = SEGMENT_META[segment];
  const dte = daysToExpiry(expiry);

  for (const row of chainData.strikes || []) {
    for (const side of ['ce', 'pe']) {
      const opt = row[side];
      if (!opt?.symbol) continue;
      const key = `${opt.symbol}:${contractExchange}`;
      if (!state.subscribed.has(key)) {
        algoWS.subscribe(opt.symbol, contractExchange, 2);
        state.subscribed.add(key);
      }
      // Register symbol metadata for tick processing
      state.symMeta[opt.symbol] = { underlying, expiry, strike: row.strike, side, segment, dte };
      opt._baseOI = opt.oi || 0;  // fixed baseline at load time — never changes

      // Compute initial Greeks from REST snapshot data
      if (opt.ltp && chainData.underlying_ltp) {
        const g = computeGreeks(opt.ltp, chainData.underlying_ltp, row.strike, dte, side === 'ce');
        if (g) { opt.iv = g.iv; opt.delta = g.delta; opt.gamma = g.gamma; opt.theta = g.theta; opt.vega = g.vega; }
      }
    }
  }
}

// ─── Load chain (REST once for structure, then WS keeps it live) ──────────────
async function loadChain(symbol, expiry, segment) {
  if (!segment) {
    segment = Object.keys(SEGMENT_META).find(s => state.underlyings[s]?.includes(symbol)) || 'NFO';
  }

  // MCX uses custom builder (OpenAlgo's optionchain endpoint can't quote MCX underlyings)
  let chainData;
  if (segment === 'MCX') {
    chainData = await getMCXOptionChain(API_KEY, REST_URL, symbol, expiry, STRIKE_COUNT);
  } else {
    const chainExchange = getOptionChainExchange(symbol, segment);
    chainData = await getOptionChain(API_KEY, REST_URL, symbol, chainExchange, expiry, STRIKE_COUNT);
  }

  // Compute ltp_chg from prev_close for each option
  for (const row of chainData.strikes || []) {
    for (const side of ['ce', 'pe']) {
      if (!row[side]) continue;
      const o = row[side];
      o.ltp_chg = o.ltp != null && o.prev_close != null ? +(o.ltp - o.prev_close).toFixed(2) : 0;
      o.oi_chg  = 0;
    }
  }

  state.chain[symbol]        = state.chain[symbol] || {};
  state.chain[symbol][expiry] = chainData;

  // Save initial snapshot
  db.saveSnapshot(symbol, expiry, chainData);

  // Subscribe all symbols via WebSocket
  subscribeChain(symbol, expiry, segment, chainData);

  // Start 60s snapshot timer so we have point-in-time chain data for replay
  tickProducer.startSnapshotTimer(symbol, expiry, () => state.chain[symbol]?.[expiry]);

  broadcast({ type: 'chain_update', symbol, expiry, data: chainData });
  return chainData;
}

// ─── Re-subscribe all known symbols after WS reconnect ────────────────────────
function resubscribeAll() {
  if (!algoWS.authenticated) return;
  let count = 0;
  for (const key of state.subscribed) {
    const [sym, exch] = key.split(':');
    if (sym && exch) { algoWS.subscribe(sym, exch, 2); count++; }
  }
  if (count) console.log(`[ws] Re-subscribed ${count} symbols after reconnect`);
}

// ─── Load underlyings with retry ──────────────────────────────────────────────
async function loadUnderlyings() {
  await Promise.all(
    Object.keys(SEGMENT_META).map(async (seg) => {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          state.underlyings[seg] = await getUnderlyings(API_KEY, REST_URL, seg);
          console.log(`[init] ${seg}: ${state.underlyings[seg].length} underlyings`);
          return;
        } catch (e) {
          if (attempt < 3) await new Promise(r => setTimeout(r, 3000 * attempt));
          else console.error(`[init] ${seg} failed after 3 attempts:`, e.message);
        }
      }
    })
  );
}

// ─── Startup ──────────────────────────────────────────────────────────────────
async function init() {
  if (!API_KEY) { console.warn('[init] OPENALGO_API_KEY not set'); return; }

  console.log('[init] Loading instruments from broker...');
  await loadUnderlyings();

  // Connect WebSocket — all live data flows through here
  algoWS.connect();
  await new Promise(r => setTimeout(r, 2000));

  // Load initial chains for NIFTY + BANKNIFTY
  for (const symbol of ['NIFTY', 'BANKNIFTY']) {
    try {
      const expiries = await getExpiriesForExchange(API_KEY, REST_URL, symbol, 'NFO');
      state.expiries[symbol] = expiries;
      if (expiries.length) {
        await loadChain(symbol, expiries[0], 'NFO');
        console.log(`[init] Subscribed: ${symbol} ${expiries[0]} (${state.subscribed.size} total symbols)`);
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (e) {
      console.error(`[init] ${symbol}:`, e.message);
    }
  }

  console.log(`[init] Ready — ${state.subscribed.size} symbols live on WebSocket`);
}

// ─── REST API ─────────────────────────────────────────────────────────────────

// Stub routes that the React frontend calls but we don't need
app.get('/api/auth/check-session',   (_, res) => res.json({ authenticated: true, user: { id: 1, name: 'Trader' } }));
app.get('/api/auth/bootstrap',       (_, res) => res.json({ authenticated: true, user: { id: 1, name: 'Trader' }, settings: {}, subscription: {} }));
app.get('/api/market/global-indices',(_, res) => res.json({ indices: [] }));
app.get('/api/trainai/stock-signals/live', (_, res) => res.json({ signals: [] }));
app.get('/api/indicators',           (_, res) => res.json({ success: false, indicators: {} }));
app.get('/api/live/:symbol',         (_, res) => res.json({ chain: [], spot_price: 0 }));
app.post('/api/auth/logout',         (_, res) => res.json({ success: true }));
app.get('/api/voloichng/:symbol',    (_, res) => res.json({}));

// Symbols list for Topbar dropdown — return all loaded underlyings
app.get('/api/symbols', (req, res) => {
  const type = req.query.type || 'live';
  const all = [...state.underlyings.NFO, ...state.underlyings.BFO, ...state.underlyings.MCX];
  res.json(all.length ? all : ['NIFTY', 'BANKNIFTY']);
});

app.get('/api/prefetch', (req, res) => {
  const all = [...state.underlyings.NFO, ...state.underlyings.BFO, ...state.underlyings.MCX];
  const firstSym = Object.keys(state.chain)[0] || 'NIFTY';
  const firstExp = Object.keys(state.chain[firstSym] || {})[0];
  const cd = firstExp ? state.chain[firstSym][firstExp] : null;
  res.json({
    liveSymbols: all.length ? all : ['NIFTY', 'BANKNIFTY'],
    allSymbols:  all.length ? all : ['NIFTY', 'BANKNIFTY'],
    firstSymbol: firstSym,
    groups: {},
    liveData: cd ? {
      chain:             (cd.strikes || []).map(r => ({
        strike: r.strike,
        call: { ltp: r.ce?.ltp||0, ltp_change: r.ce?.ltp_chg||0, oi: r.ce?.oi||0, oi_change: r.ce?.oi_chg||0, volume: r.ce?.volume||0, delta: r.ce?.delta||0, iv: r.ce?.iv||0, gamma: r.ce?.gamma||0, theta: r.ce?.theta||0, vega: r.ce?.vega||0 },
        put:  { ltp: r.pe?.ltp||0, ltp_change: r.pe?.ltp_chg||0, oi: r.pe?.oi||0, oi_change: r.pe?.oi_chg||0, volume: r.pe?.volume||0, delta: r.pe?.delta||0, iv: r.pe?.iv||0, gamma: r.pe?.gamma||0, theta: r.pe?.theta||0, vega: r.pe?.vega||0 },
      })),
      spot_price:        cd.underlying_ltp || 0,
      expiry:            firstExp,
      availableExpiries: state.expiries[firstSym] || [],
      lot_size:          25,
    } : null,
  });
});

app.get('/api/status', (req, res) => {
  res.json({
    wsConnected:     algoWS.isConnected,
    wsAuthenticated: algoWS.authenticated,
    subscribedCount: state.subscribed.size,
    segments:        Object.fromEntries(Object.entries(state.underlyings).map(([k,v]) => [k, v.length])),
    market:          marketHours.status(),
  });
});

app.get('/api/market/status', (req, res) => {
  res.json({ status: 'success', data: marketHours.status() });
});

app.get('/api/replay/dates/:symbol', (req, res) => {
  const dates = tickFeeder.getAvailableDates(req.params.symbol.toUpperCase());
  res.json({ status: 'success', symbol: req.params.symbol, dates });
});

app.get('/api/underlyings', (req, res) => {
  res.json({ status: 'success', data: state.underlyings });
});

app.get('/api/expiries/:segment/:symbol', async (req, res) => {
  const sym = req.params.symbol.toUpperCase();
  const seg = req.params.segment.toUpperCase();
  if (SEGMENT_META[seg]?.disabled)
    return res.status(400).json({ status: 'error', message: `${seg} not supported by current broker` });
  if (state.expiries[sym]) return res.json({ status: 'success', data: state.expiries[sym] });
  try {
    let list;
    if (seg === 'MCX') {
      list = await getMCXExpiries(API_KEY, REST_URL, sym);
    } else {
      const exch = SEGMENT_META[seg]?.contractExchange || 'NFO';
      list = await getExpiriesForExchange(API_KEY, REST_URL, sym, exch);
    }
    state.expiries[sym] = list;
    res.json({ status: 'success', data: list });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

app.get('/api/chain/:symbol/:expiry', (req, res) => {
  const sym    = req.params.symbol.toUpperCase();
  const expiry = req.params.expiry.toUpperCase();
  const data   = state.chain[sym]?.[expiry];
  if (!data) return res.status(404).json({ status: 'error', message: 'Not loaded yet' });
  res.json({ status: 'success', data });
});

app.post('/api/load', async (req, res) => {
  const { symbol, expiry, segment } = req.body;
  if (!symbol || !expiry) return res.status(400).json({ error: 'symbol and expiry required' });
  const sym = symbol.toUpperCase();
  const seg = (segment || 'NFO').toUpperCase();
  if (!state.expiries[sym]) {
    state.expiries[sym] = await (seg === 'MCX'
      ? getMCXExpiries(API_KEY, REST_URL, sym)
      : getExpiriesForExchange(API_KEY, REST_URL, sym, SEGMENT_META[seg]?.contractExchange || 'NFO')
    ).catch(() => []);
  }
  try {
    const data = await loadChain(sym, expiry.toUpperCase(), seg);
    res.json({ status: 'success', data });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// ─── Frontend WS ──────────────────────────────────────────────────────────────
wss.on('connection', (ws) => {
  console.log('[WS] Frontend connected');

  // Register with tickFeeder — live ticks come from DB, not broker directly
  tickFeeder.addClient(ws);

  ws.send(JSON.stringify({
    type: 'init',
    data: { underlyings: state.underlyings, expiries: state.expiries },
  }));

  // Send current market status
  ws.send(JSON.stringify({ type: 'market_status', data: marketHours.status() }));

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      // Feeder actions: subscribe_feed, replay, stop_replay
      if (['subscribe_feed', 'replay', 'stop_replay'].includes(msg.action)) {
        await tickFeeder.handleMessage(ws, msg);
        return;
      }

      // Available replay dates for a symbol
      if (msg.action === 'get_dates') {
        const dates = tickFeeder.getAvailableDates(msg.symbol?.toUpperCase());
        ws.send(JSON.stringify({ type: 'available_dates', symbol: msg.symbol, dates }));
        return;
      }

      // Load chain (fetch from broker REST + subscribe WS)
      if (msg.action === 'load' && msg.symbol && msg.expiry) {
        const sym = msg.symbol.toUpperCase();
        const exp = msg.expiry.toUpperCase();
        const seg = (msg.segment || 'NFO').toUpperCase();

        if (!state.expiries[sym]) {
          state.expiries[sym] = await (seg === 'MCX'
            ? getMCXExpiries(API_KEY, REST_URL, sym)
            : getExpiriesForExchange(API_KEY, REST_URL, sym, SEGMENT_META[seg]?.contractExchange || 'NFO')
          ).catch(() => []);
          ws.send(JSON.stringify({ type: 'expiries_update', symbol: sym, data: state.expiries[sym] }));
        }

        const data = await loadChain(sym, exp, seg).catch(e => {
          ws.send(JSON.stringify({ type: 'error', message: e.message }));
          return null;
        });
        if (data) {
          ws.send(JSON.stringify({ type: 'chain_update', symbol: sym, expiry: exp, data }));
          // Auto-subscribe this client to live feed for the loaded symbol
          await tickFeeder.handleMessage(ws, { action: 'subscribe_feed', symbol: sym, expiry: exp });
        }
      }
    } catch (_) {}
  });

  ws.on('close', () => console.log('[WS] Frontend disconnected'));
});

// SPA catch-all — serve React index.html for any non-API route
if (fs.existsSync(reactBuild)) {
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/') && !req.path.startsWith('/ws')) {
      res.sendFile(path.join(reactBuild, 'index.html'));
    }
  });
}

// ─── Crash guards — keep server alive on unhandled errors ─────────────────────
process.on('uncaughtException',  e => console.error('[server] uncaughtException:', e.message));
process.on('unhandledRejection', e => console.error('[server] unhandledRejection:', e?.message || e));

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\nsoctickdata → http://localhost:${PORT}`);
  init().catch(e => console.error('[init] Fatal:', e));
});
