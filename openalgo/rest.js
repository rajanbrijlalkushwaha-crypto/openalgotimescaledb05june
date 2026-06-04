const axios = require('axios');

// "05-JUN-25" -> "05JUN25"
function toOptionChainExpiry(expiry) {
  return expiry.replace(/-/g, '');
}

// Extract underlying from option symbol: "HINDALCO30JUN261230CE" -> "HINDALCO"
function extractUnderlying(symbol) {
  const m = symbol.match(/^([A-Z0-9&-]+?)(\d{2}[A-Z]{3}\d{2})/);
  return m ? m[1] : symbol;
}

// Parse CSV instruments → unique underlyings (by name field for MCX, by symbol prefix for NFO/BFO)
function parseUnderlyings(csvText, instrumentExchange) {
  const lines = csvText.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers  = lines[0].split(',');
  const symIdx   = headers.indexOf('symbol');
  const typeIdx  = headers.indexOf('instrumenttype');
  const nameIdx  = headers.indexOf('name');

  const seen = new Set();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (!cols[typeIdx]) continue;
    const type = cols[typeIdx].trim();
    if (type !== 'CE' && type !== 'PE') continue;

    if (instrumentExchange === 'MCX' && nameIdx >= 0) {
      // MCX: use the 'name' field (GOLD, SILVER, etc.)
      const name = cols[nameIdx]?.trim();
      if (name) seen.add(name);
    } else {
      // NFO/BFO: extract from symbol prefix
      const und = extractUnderlying(cols[symIdx].trim());
      if (und) seen.add(und);
    }
  }
  return Array.from(seen).sort();
}

async function getUnderlyings(apiKey, baseUrl, instrumentExchange) {
  const res = await axios.get(`${baseUrl}/api/v1/instruments`, {
    params: { apikey: apiKey, exchange: instrumentExchange, format: 'csv' },
    timeout: 30000,
  });
  return parseUnderlyings(res.data, instrumentExchange);
}

async function getExpiries(apiKey, baseUrl, symbol) {
  const res = await axios.post(`${baseUrl}/api/v1/expiry`, {
    apikey:         apiKey,
    symbol:         symbol,
    exchange:       'NFO',
    instrumenttype: 'options',
  }, { timeout: 10000 });
  if (res.data.status !== 'success') throw new Error(res.data.message || `Expiry fetch failed for ${symbol}`);
  return res.data.data.map(toOptionChainExpiry);
}

async function getExpiriesForExchange(apiKey, baseUrl, symbol, exchange) {
  const res = await axios.post(`${baseUrl}/api/v1/expiry`, {
    apikey:         apiKey,
    symbol:         symbol,
    exchange:       exchange,
    instrumenttype: 'options',
  }, { timeout: 10000 });
  if (res.data.status !== 'success') throw new Error(res.data.message || `Expiry fetch failed for ${symbol}`);
  return res.data.data.map(toOptionChainExpiry);
}

async function getOptionChain(apiKey, baseUrl, underlying, exchange, expiry, strikeCount = 20) {
  const res = await axios.post(`${baseUrl}/api/v1/optionchain`, {
    apikey:       apiKey,
    underlying:   underlying,
    exchange:     exchange,
    expiry_date:  expiry,
    strike_count: strikeCount,
  }, { timeout: 15000 });

  if (res.data.status !== 'success') throw new Error(res.data.message || `Option chain failed for ${underlying}`);

  const { underlying_ltp, atm_strike, chain } = res.data;
  return { underlying_ltp: underlying_ltp || 0, atm_strike: atm_strike || 0, strikes: chain || [], fetched_at: Date.now() };
}

// ─── MCX option chain — built manually since OpenAlgo can't quote MCX underlyings ───
// Parses instruments CSV to find option symbols + nearest futures for LTP
let _mcxCache = null;  // { csv, time }

async function getMCXInstruments(apiKey, baseUrl) {
  // Cache for 1 hour
  if (_mcxCache && Date.now() - _mcxCache.time < 3600000) return _mcxCache.csv;
  const res = await axios.get(`${baseUrl}/api/v1/instruments`, {
    params: { apikey: apiKey, exchange: 'MCX', format: 'csv' }, timeout: 30000,
  });
  _mcxCache = { csv: res.data, time: Date.now() };
  return res.data;
}

// Get expiry dates for an MCX underlying directly from the instruments CSV
async function getMCXExpiries(apiKey, baseUrl, underlyingName) {
  const csv = await getMCXInstruments(apiKey, baseUrl);
  const lines = csv.split('\n').filter(l => l.trim());
  const headers = lines[0].split(',');
  const nameIdx = headers.indexOf('name');
  const typeIdx = headers.indexOf('instrumenttype');
  const expIdx  = headers.indexOf('expiry');

  const seen = new Set();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const name = cols[nameIdx]?.trim().toUpperCase();
    const type = cols[typeIdx]?.trim();
    const exp  = cols[expIdx]?.trim();  // "30-JUN-26"
    if (name === underlyingName.toUpperCase() && (type === 'CE' || type === 'PE') && exp) {
      // Convert "30-JUN-26" → "30JUN26"
      seen.add(exp.replace(/-/g, ''));
    }
  }
  // Sort ascending
  return Array.from(seen).sort((a, b) => {
    const months = { JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11 };
    const parse = s => new Date(2000+parseInt(s.slice(5)), months[s.slice(2,5)], parseInt(s.slice(0,2)));
    return parse(a) - parse(b);
  });
}

async function getMCXOptionChain(apiKey, baseUrl, underlyingName, expiry, strikeCount = 20) {
  const csv = await getMCXInstruments(apiKey, baseUrl);
  const lines = csv.split('\n').filter(l => l.trim());
  const headers = lines[0].split(',');
  const symIdx  = headers.indexOf('symbol');
  const nameIdx = headers.indexOf('name');
  const typeIdx = headers.indexOf('instrumenttype');
  const expIdx  = headers.indexOf('expiry');
  const strIdx  = headers.indexOf('strike');
  const lotIdx  = headers.indexOf('lotsize');
  const tickIdx = headers.indexOf('tick_size');

  // Convert expiry "30JUN26" → match instruments "30-JUN-26"
  const expDash = expiry.slice(0, 2) + '-' + expiry.slice(2, 5) + '-' + expiry.slice(5);

  // Collect options for this underlying + expiry
  const optMap = {};  // strike → { ce: sym, pe: sym, lotsize, tick_size }
  let futSym = null;  // nearest futures contract

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (!cols[typeIdx]) continue;
    const name = cols[nameIdx]?.trim().toUpperCase();
    const type = cols[typeIdx]?.trim();
    const sym  = cols[symIdx]?.trim();
    const exp  = cols[expIdx]?.trim();
    const lot  = parseInt(cols[lotIdx] || '1');
    const tick = parseFloat(cols[tickIdx] || '0.5');

    // Collect nearest futures for underlying LTP
    if (name === underlyingName.toUpperCase() && type === 'FUT' && !futSym) {
      futSym = sym; // instruments are sorted by expiry
    }

    // Collect options matching this expiry
    if (name === underlyingName.toUpperCase() && exp === expDash && (type === 'CE' || type === 'PE')) {
      const strike = parseFloat(cols[strIdx] || '0');
      if (!optMap[strike]) optMap[strike] = { strike, lotsize: lot, tick_size: tick };
      if (type === 'CE') optMap[strike].ceSymbol = sym;
      if (type === 'PE') optMap[strike].peSymbol = sym;
    }
  }

  if (!futSym) throw new Error(`No futures found for ${underlyingName} on MCX`);

  const allStrikes = Object.keys(optMap).map(Number).sort((a, b) => a - b);
  if (!allStrikes.length) throw new Error(`No options found for ${underlyingName} expiry ${expiry}`);

  // Get underlying LTP from futures quote
  const futQuote = await axios.post(`${baseUrl}/api/v1/quotes`, {
    apikey: apiKey, symbol: futSym, exchange: 'MCX',
  }, { timeout: 10000 });

  const q = futQuote.data?.data || {};
  // Use ltp when live; fall back to ask or prev_close when market is closed
  const underlyingLtp = q.ltp || q.ask || q.prev_close || 0;

  // Find ATM strike
  const atmStrike = allStrikes.reduce((prev, cur) =>
    Math.abs(cur - underlyingLtp) < Math.abs(prev - underlyingLtp) ? cur : prev
  );

  // Limit to strikeCount above + below ATM
  const atmIdx    = allStrikes.indexOf(atmStrike);
  const sliceStart = Math.max(0, atmIdx - strikeCount);
  const sliceEnd   = Math.min(allStrikes.length, atmIdx + strikeCount + 1);
  const selected   = allStrikes.slice(sliceStart, sliceEnd);

  // Batch-fetch all option quotes via multiquotes
  const symbols = [];
  for (const strike of selected) {
    if (optMap[strike].ceSymbol) symbols.push({ symbol: optMap[strike].ceSymbol, exchange: 'MCX' });
    if (optMap[strike].peSymbol) symbols.push({ symbol: optMap[strike].peSymbol, exchange: 'MCX' });
  }

  // Multiquotes in batches of 50
  const quotesMap = {};
  for (let i = 0; i < symbols.length; i += 50) {
    const chunk = symbols.slice(i, i + 50);
    try {
      const res = await axios.post(`${baseUrl}/api/v1/multiquotes`, {
        apikey: apiKey, symbols: chunk,
      }, { timeout: 15000 });
      if (res.data.status === 'success') {
        for (const item of res.data.results || []) {
          if (item.symbol) quotesMap[item.symbol] = item;
        }
      }
    } catch (_) {}
    if (i + 50 < symbols.length) await new Promise(r => setTimeout(r, 300));
  }

  // Build chain
  const strikes = selected.map(strike => {
    const ceSym = optMap[strike].ceSymbol;
    const peSym = optMap[strike].peSymbol;
    const ceQ   = quotesMap[ceSym] || {};
    const peQ   = quotesMap[peSym] || {};
    const lot   = optMap[strike].lotsize;

    return {
      strike,
      ce: ceSym ? {
        symbol: ceSym, ltp: ceQ.ltp || 0, bid: ceQ.bid || 0, ask: ceQ.ask || 0,
        open: ceQ.open || 0, high: ceQ.high || 0, low: ceQ.low || 0,
        prev_close: ceQ.prev_close || ceQ.close || 0, volume: ceQ.volume || 0,
        oi: ceQ.oi || 0, lotsize: lot,
        ltp_chg: (ceQ.ltp || 0) - (ceQ.prev_close || ceQ.close || 0),
        oi_chg: 0,
      } : null,
      pe: peSym ? {
        symbol: peSym, ltp: peQ.ltp || 0, bid: peQ.bid || 0, ask: peQ.ask || 0,
        open: peQ.open || 0, high: peQ.high || 0, low: peQ.low || 0,
        prev_close: peQ.prev_close || peQ.close || 0, volume: peQ.volume || 0,
        oi: peQ.oi || 0, lotsize: lot,
        ltp_chg: (peQ.ltp || 0) - (peQ.prev_close || peQ.close || 0),
        oi_chg: 0,
      } : null,
    };
  });

  return {
    underlying_ltp: underlyingLtp,
    atm_strike:     atmStrike,
    strikes,
    underlying_futures: futSym,
    fetched_at: Date.now(),
  };
}

// Batch Greeks — max 50 per request
async function getMultiGreeks(apiKey, baseUrl, symbols, contractExchange) {
  if (!symbols || symbols.length === 0) return {};
  const BATCH = 50;
  const result = {};
  for (let i = 0; i < symbols.length; i += BATCH) {
    const chunk = symbols.slice(i, i + BATCH);
    const res = await axios.post(`${baseUrl}/api/v1/multioptiongreeks`, {
      apikey: apiKey,
      symbols: chunk.map(s => ({ symbol: s, exchange: contractExchange })),
    }, { timeout: 30000 }).catch(e => {
      const d = e.response?.data ? JSON.stringify(e.response.data) : e.message;
      throw new Error(`multioptiongreeks ${e.response?.status || ''}: ${d}`);
    });
    if (res.data.status !== 'success') continue;
    for (const item of res.data.data || []) {
      if (item.status === 'success' && item.greeks) {
        result[item.symbol] = {
          iv: item.implied_volatility ?? null, delta: item.greeks.delta ?? null,
          gamma: item.greeks.gamma ?? null, theta: item.greeks.theta ?? null, vega: item.greeks.vega ?? null,
        };
      }
    }
    if (i + BATCH < symbols.length) await new Promise(r => setTimeout(r, 500));
  }
  return result;
}

module.exports = { getUnderlyings, getExpiries, getExpiriesForExchange, getMCXExpiries, getOptionChain, getMCXOptionChain, getMultiGreeks };
