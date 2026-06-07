require('dotenv').config();
const express = require('express');
const http    = require('http');
const { Server: IOServer } = require('socket.io');
const path    = require('path');
const fs      = require('fs');

const db           = require('./db/database');
const tickProducer = require('./services/tickProducer');
const tickFeeder   = require('./services/tickFeeder');
const marketHours  = require('./utils/marketHours');
const { getUnderlyings, getExpiriesForExchange, getMCXExpiries, getOptionChain, getMCXOptionChain, getNearestFuturesSymbol } = require('./openalgo/rest');
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

// Indices that get a futures subscription (nearest monthly contract)
const FUTURES_TRACK = [
  { sym: 'NIFTY',      seg: 'NFO', exch: 'NFO' },
  { sym: 'BANKNIFTY',  seg: 'NFO', exch: 'NFO' },
  { sym: 'FINNIFTY',   seg: 'NFO', exch: 'NFO' },
  { sym: 'MIDCPNIFTY', seg: 'NFO', exch: 'NFO' },
  { sym: 'SENSEX',     seg: 'BFO', exch: 'BFO' },
  { sym: 'BANKEX',     seg: 'BFO', exch: 'BFO' },
];

const SEGMENT_META = {
  NFO: { contractExchange: 'NFO' },
  BFO: { contractExchange: 'BFO' },
  MCX: { contractExchange: 'MCX' },
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
  underlyings:  { NFO: [], BFO: [], MCX: [] },
  expiries:     {},
  chain:        {},   // [symbol][expiry] = chainData
  symMeta:      {},
  subscribed:   new Set(),
  futures:      {},   // { "NIFTY": { symbol:"NIFTY25JUN26FUT", ltp:0, prev_close:0, chg:0, pct:0 } }
  futureSymMap: {},   // { "NIFTY25JUN26FUT": "NIFTY" }  reverse lookup
};

// ─── Express + HTTP + Socket.IO ───────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new IOServer(server, {
  path: '/chain/socket.io',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
});

app.use(express.json());

// Serve React build
const reactBuild = path.join(__dirname, 'frontend', 'build');
if (fs.existsSync(reactBuild)) {
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


// ─── Days to expiry helper ────────────────────────────────────────────────────
function daysToExpiry(expiryStr) {
  const months = { JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11 };
  const d = parseInt(expiryStr.slice(0, 2));
  const m = months[expiryStr.slice(2, 5)];
  const y = 2000 + parseInt(expiryStr.slice(5, 7));
  const exp = new Date(y, m, d, 15, 30);
  return Math.max((exp - Date.now()) / (1000 * 60 * 60 * 24), 0);
}

// ─── Tick handler: update cache + compute Greeks + save + broadcast ───────────
function onTick(tick) {
  const { symbol, exchange } = tick;
  db.upsertTick(tick);

  // ── Futures tick (NIFTYFUT, BANKNIFTYFUT, etc.) ───────────────────────────
  const underlyingForFut = state.futureSymMap[symbol];
  if (underlyingForFut) {
    const pc  = tick.prev_close || 0;
    const chg = pc ? +(tick.ltp - pc).toFixed(2) : 0;
    const pct = pc ? +((tick.ltp - pc) / pc * 100).toFixed(2) : 0;
    state.futures[underlyingForFut] = {
      ...state.futures[underlyingForFut],
      ltp: tick.ltp, prev_close: pc, chg, pct,
    };
    // Keep chain data aware of futures price
    const chainData = state.chain[underlyingForFut];
    if (chainData) {
      for (const exp of Object.keys(chainData)) {
        if (chainData[exp]) chainData[exp].futures_ltp = tick.ltp;
      }
    }
    tickProducer.saveFutures(underlyingForFut, symbol, exchange, tick.ltp, { futures_chg: chg, futures_pct_chg: pct });
    return;
  }

  const futMeta = state.symMeta[symbol];
  if (futMeta?.isFutures) {
    const chainData = state.chain[futMeta.underlying];
    if (chainData) {
      for (const expiry of Object.keys(chainData)) {
        if (chainData[expiry]) chainData[expiry].underlying_ltp = tick.ltp;
      }
      tickProducer.saveSpot(futMeta.underlying, exchange, tick.ltp);
    }
    return;
  }

  const chainData = state.chain[symbol];
  if (chainData) {
    for (const expiry of Object.keys(chainData)) {
      if (chainData[expiry]) chainData[expiry].underlying_ltp = tick.ltp;
    }
    const pc = tick.prev_close || 0;
    tickProducer.saveSpot(symbol, exchange, tick.ltp, {
      spot_chg:     pc ? +(tick.ltp - pc).toFixed(2) : 0,
      spot_pct_chg: pc ? +((tick.ltp - pc) / pc * 100).toFixed(2) : 0,
    });
    return;
  }

  const meta = state.symMeta[symbol];
  if (!meta) return;

  const { underlying, expiry, strike, side } = meta;
  const cd = state.chain[underlying]?.[expiry];
  if (!cd) return;

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

  tickProducer.save(enriched);
}

function getOptFields(underlying, expiry, symbol, side) {
  const cd = state.chain[underlying]?.[expiry];
  if (!cd) return {};
  for (const row of cd.strikes || []) {
    if (row[side]?.symbol === symbol) {
      const o = row[side];
      return { ltp_chg: o.ltp_chg, oi: o.oi, oi_chg: o.oi_chg, iv: o.iv, delta: o.delta, gamma: o.gamma, theta: o.theta, vega: o.vega, rho: o.rho };
    }
  }
  return {};
}

// ─── OpenAlgo WS client ───────────────────────────────────────────────────────
const algoWS = new OpenAlgoWSClient(WS_URL, API_KEY, onTick, () => resubscribeAll());

// ─── Subscribe option symbols ─────────────────────────────────────────────────
function subscribeChain(underlying, expiry, segment, chainData) {
  const undSym  = (segment === 'MCX' && chainData.underlying_futures) ? chainData.underlying_futures : underlying;
  const wsExch  = segment === 'MCX' ? 'MCX' : getIndexWsExchange(underlying, segment);
  const undKey  = `${undSym}:${wsExch}`;
  if (!state.subscribed.has(undKey)) {
    algoWS.subscribe(undSym, wsExch, 2);
    state.subscribed.add(undKey);
  }
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
      state.symMeta[opt.symbol] = { underlying, expiry, strike: row.strike, side, segment, dte };
      opt._baseOI = opt.oi || 0;

      if (opt.ltp && chainData.underlying_ltp) {
        const g = computeGreeks(opt.ltp, chainData.underlying_ltp, row.strike, dte, side === 'ce');
        if (g) { opt.iv = g.iv; opt.delta = g.delta; opt.gamma = g.gamma; opt.theta = g.theta; opt.vega = g.vega; }
      }
    }
  }
}

// ─── Load chain ───────────────────────────────────────────────────────────────
async function loadChain(symbol, expiry, segment) {
  if (!segment) {
    segment = Object.keys(SEGMENT_META).find(s => state.underlyings[s]?.includes(symbol)) || 'NFO';
  }

  let chainData;
  if (segment === 'MCX') {
    chainData = await getMCXOptionChain(API_KEY, REST_URL, symbol, expiry, STRIKE_COUNT);
  } else {
    const chainExchange = getOptionChainExchange(symbol, segment);
    chainData = await getOptionChain(API_KEY, REST_URL, symbol, chainExchange, expiry, STRIKE_COUNT);
  }

  for (const row of chainData.strikes || []) {
    for (const side of ['ce', 'pe']) {
      if (!row[side]) continue;
      const o = row[side];
      o.ltp_chg = o.ltp != null && o.prev_close != null ? +(o.ltp - o.prev_close).toFixed(2) : 0;
      o.oi_chg  = 0;
    }
  }

  state.chain[symbol]         = state.chain[symbol] || {};
  state.chain[symbol][expiry] = chainData;

  subscribeChain(symbol, expiry, segment, chainData); // computes Greeks into chainData first
  db.saveSnapshot(symbol, expiry, chainData);         // now snapshot includes Greeks
  tickProducer.startSnapshotTimer(symbol, expiry, () => state.chain[symbol]?.[expiry]);

  return chainData;
}

// ─── Re-subscribe after WS reconnect ─────────────────────────────────────────
function resubscribeAll() {
  if (!algoWS.authenticated) return;
  let count = 0;
  for (const key of state.subscribed) {
    const [sym, exch] = key.split(':');
    if (sym && exch) { algoWS.subscribe(sym, exch, 2); count++; }
  }
  if (count) console.log(`[ws] Re-subscribed ${count} symbols`);
}

// ─── Subscribe nearest futures for NSE/BSE indices ───────────────────────────
async function subscribeNearestFutures() {
  for (const { sym, seg, exch } of FUTURES_TRACK) {
    try {
      const futSym = await getNearestFuturesSymbol(API_KEY, REST_URL, sym, seg);
      if (!futSym) { console.warn(`[futures] No futures found for ${sym}`); continue; }
      state.futures[sym]          = { symbol: futSym, exchange: exch, ltp: 0, prev_close: 0, chg: 0, pct: 0 };
      state.futureSymMap[futSym]  = sym;
      algoWS.subscribe(futSym, exch, 2);
      state.subscribed.add(`${futSym}:${exch}`);
      console.log(`[futures] ${sym} → ${futSym} (${exch})`);
    } catch (e) {
      console.error(`[futures] ${sym}:`, e.message);
    }
  }
}

// ─── Load underlyings ─────────────────────────────────────────────────────────
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
          else console.error(`[init] ${seg} failed:`, e.message);
        }
      }
    })
  );
}

// ─── Startup ──────────────────────────────────────────────────────────────────
async function init() {
  await db.init();

  if (!API_KEY) { console.warn('[init] OPENALGO_API_KEY not set — set it in .env'); return; }

  // Load all underlyings (fast — just the instrument list, no chain data)
  console.log('[init] Fetching instrument list from OpenAlgo...');
  await loadUnderlyings();

  const total = state.underlyings.NFO.length + state.underlyings.BFO.length + state.underlyings.MCX.length;
  console.log(`[init] Ready — ${total} symbols available. Select any symbol in the frontend to load its chain.`);

  // Connect to OpenAlgo WebSocket (stays connected, ready for subscriptions)
  algoWS.connect();
  await new Promise(r => setTimeout(r, 2000)); // wait for WS auth

  // Subscribe nearest futures for all tracked indices
  await subscribeNearestFutures();
}

// ─── REST API ─────────────────────────────────────────────────────────────────
app.get('/api/auth/check-session',   (_, res) => res.json({ authenticated: true, user: { id: 1, name: 'Trader' } }));
app.get('/api/auth/bootstrap',       (_, res) => res.json({ authenticated: true, user: { id: 1, name: 'Trader' }, settings: {}, subscription: {} }));
app.get('/api/market/global-indices',(_, res) => res.json({ indices: [] }));
app.get('/api/trainai/stock-signals/live', (_, res) => res.json({ signals: [] }));
app.get('/api/indicators',           (_, res) => res.json({ success: false, indicators: {} }));
app.get('/api/live/:symbol',         (_, res) => res.json({ chain: [], spot_price: 0 }));
app.post('/api/auth/logout',         (_, res) => res.json({ success: true }));
app.get('/api/voloichng/:symbol',    (_, res) => res.json({}));

app.get('/api/symbols', (req, res) => {
  const all = [...state.underlyings.NFO, ...state.underlyings.BFO, ...state.underlyings.MCX];
  res.json(all.length ? all : ['NIFTY', 'BANKNIFTY']);
});

app.get('/api/prefetch', (req, res) => {
  const all      = [...state.underlyings.NFO, ...state.underlyings.BFO, ...state.underlyings.MCX];
  const firstSym = Object.keys(state.chain)[0] || 'NIFTY';
  const firstExp = Object.keys(state.chain[firstSym] || {})[0];
  const cd       = firstExp ? state.chain[firstSym][firstExp] : null;
  res.json({
    liveSymbols: all.length ? all : ['NIFTY', 'BANKNIFTY'],
    allSymbols:  all.length ? all : ['NIFTY', 'BANKNIFTY'],
    firstSymbol: firstSym,
    groups: {},
    liveData: cd ? {
      chain: (cd.strikes || []).map(r => ({
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

app.get('/api/replay/dates/:symbol', async (req, res) => {
  const dates = await tickFeeder.getAvailableDates(req.params.symbol.toUpperCase());
  res.json({ status: 'success', symbol: req.params.symbol, dates });
});

app.get('/api/underlyings', (req, res) => {
  res.json({ status: 'success', data: state.underlyings });
});

// Current futures subscriptions + prices
app.get('/api/futures', (_, res) => {
  res.json({ status: 'success', data: state.futures });
});

app.get('/api/expiries/:segment/:symbol', async (req, res) => {
  const sym = req.params.symbol.toUpperCase();
  const seg = req.params.segment.toUpperCase();
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

// ─── Socket.IO — frontend connections ─────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('[SIO] Frontend connected:', socket.id);

  tickFeeder.addClient(socket);

  socket.emit('init', { underlyings: state.underlyings, expiries: state.expiries });
  socket.emit('market_status', marketHours.status());

  socket.on('disconnect', () => {
    console.log('[SIO] Frontend disconnected:', socket.id);
  });

  // Get available replay dates for a symbol
  socket.on('get_dates', async (msg) => {
    const dates = await tickFeeder.getAvailableDates(msg?.symbol?.toUpperCase());
    socket.emit('available_dates', { symbol: msg?.symbol, dates });
  });

  // subscribe_chain: send current snapshot + register for live ticks
  socket.on('subscribe_chain', async (msg) => {
    const underlying = msg?.underlying?.toUpperCase();
    if (!underlying) return;

    // Push all loaded expiry snapshots for this underlying
    for (const [expiry, cd] of Object.entries(state.chain[underlying] || {})) {
      if (cd) socket.emit('chain_update', { symbol: underlying, expiry, data: cd });
    }

    // Auto-subscribe live feed for first loaded expiry
    const expiries = Object.keys(state.chain[underlying] || {});
    if (expiries.length) {
      await tickFeeder.handleMessage(socket, { action: 'subscribe_feed', symbol: underlying, expiry: expiries[0] });
    }
  });

  socket.on('unsubscribe_chain', () => {/* cleanup handled by disconnect */});

  // subscribe: raw tick subscription (used by socketioClient.subscribe())
  socket.on('subscribe', async (msg) => {
    const symbols = msg?.symbols || (msg?.symbol ? [msg.symbol] : []);
    if (symbols.length > 0) {
      await tickFeeder.handleMessage(socket, {
        action: 'subscribe_feed',
        symbol: symbols[0].toUpperCase(),
        expiry: null,
      });
    }
  });

  // unsubscribe: client is done watching a symbol's ticks
  socket.on('unsubscribe', (msg) => {
    // tickFeeder uses underlying match — just clear if it matches current subscription
    const info = tickFeeder.getClientInfo?.(socket);
    if (info && info.underlying === msg?.symbol?.toUpperCase()) {
      tickFeeder.handleMessage(socket, { action: 'subscribe_feed', symbol: null, expiry: null });
    }
  });

  // subscribe_feed: explicit feed subscription with expiry
  socket.on('subscribe_feed', async (msg) => {
    await tickFeeder.handleMessage(socket, { action: 'subscribe_feed', symbol: msg?.symbol, expiry: msg?.expiry });
  });

  // load: fetch chain from broker and start live streaming
  socket.on('load', async (msg) => {
    const { symbol, expiry, segment } = msg || {};
    if (!symbol || !expiry) return;
    const sym = symbol.toUpperCase();
    const exp = expiry.toUpperCase();
    const seg = (segment || 'NFO').toUpperCase();

    if (!state.expiries[sym]) {
      state.expiries[sym] = await (seg === 'MCX'
        ? getMCXExpiries(API_KEY, REST_URL, sym)
        : getExpiriesForExchange(API_KEY, REST_URL, sym, SEGMENT_META[seg]?.contractExchange || 'NFO')
      ).catch(() => []);
      socket.emit('expiries_update', { symbol: sym, data: state.expiries[sym] });
    }

    const data = await loadChain(sym, exp, seg).catch(e => {
      socket.emit('error', { message: e.message });
      return null;
    });
    if (data) {
      socket.emit('chain_update', { symbol: sym, expiry: exp, data });
      await tickFeeder.handleMessage(socket, { action: 'subscribe_feed', symbol: sym, expiry: exp });
    }
  });

  // load_futures: subscribe to nearest futures contract for any underlying on-demand
  socket.on('load_futures', async (msg) => {
    const underlying = msg?.underlying?.toUpperCase();
    const seg        = (msg?.seg || 'NFO').toUpperCase();
    if (!underlying) return;

    try {
      // Check if already subscribed
      let futInfo = state.futures[underlying];
      if (!futInfo) {
        const futSym = await getNearestFuturesSymbol(API_KEY, REST_URL, underlying, seg);
        if (!futSym) { socket.emit('futures_error', { underlying, message: 'No futures contract found' }); return; }
        const exch = seg;
        futInfo = { symbol: futSym, exchange: exch, ltp: 0, prev_close: 0, chg: 0, pct: 0 };
        state.futures[underlying]       = futInfo;
        state.futureSymMap[futSym]      = underlying;
        algoWS.subscribe(futSym, exch, 2);
        state.subscribed.add(`${futSym}:${exch}`);
        console.log(`[futures] on-demand: ${underlying} → ${futSym}`);
      }
      // Send current snapshot immediately
      socket.emit('futures_loaded', { underlying, ...futInfo });
    } catch (e) {
      socket.emit('futures_error', { underlying, message: e.message });
    }
  });

  // replay controls
  socket.on('replay',      async (msg) => tickFeeder.handleMessage(socket, { ...msg, action: 'replay' }));
  socket.on('stop_replay', ()          => tickFeeder.handleMessage(socket, { action: 'stop_replay' }));
});

// ─── Periodic market status broadcast ────────────────────────────────────────
setInterval(() => {
  io.emit('market_status', marketHours.status());
}, 60_000);

// ─── Crash guards ─────────────────────────────────────────────────────────────
process.on('uncaughtException',  e => console.error('[server] uncaughtException:', e.message));
process.on('unhandledRejection', e => console.error('[server] unhandledRejection:', e?.message || e));

// SPA catch-all
if (fs.existsSync(reactBuild)) {
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/') && !req.path.startsWith('/socket.io')) {
      res.sendFile(path.join(reactBuild, 'index.html'));
    }
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\nsoctickdata → http://localhost:${PORT}`);
  init().catch(e => console.error('[init] Fatal:', e));
});
