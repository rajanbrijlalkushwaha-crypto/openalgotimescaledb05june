/**
 * tickProducer.js
 * Receives every live tick from the broker (via server.js onTick),
 * saves it to ticks_history DB, then notifies the tickFeeder.
 *
 * Users NEVER get data directly from broker.
 * Flow: Broker → onTick → tickProducer.save() → DB → tickFeeder → Users
 */

const db           = require('../db/database');
const marketHours  = require('../utils/marketHours');

// Listeners registered by tickFeeder to be notified of new ticks
const listeners = new Set();

// Snapshot timer per underlying (saves full chain every 60s during market hours)
const snapshotTimers = new Map();

function onNewTick(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(tick) {
  for (const fn of listeners) {
    try { fn(tick); } catch (_) {}
  }
}

/**
 * Call this from server.js onTick for every option tick.
 * tick must include: symbol, exchange, underlying, expiry, strike, side,
 *                    ltp, ltp_chg, volume, oi, oi_chg, iv, delta, gamma, theta, vega
 */
function save(tick) {
  const exchange = tick.exchange?.split('_')[0] || tick.exchange; // 'NFO' from 'NFO' etc
  const seg = exchange === 'MCX' ? 'MCX' : exchange?.startsWith('NSE') ? 'NSE' : 'BFO';

  // Only save during market hours
  if (!marketHours.isOpen(seg === 'NSE' ? 'NSE' : seg)) return;

  const record = { ...tick, ts: Date.now() };
  db.insertTick(record);
  notify(record);
}

/**
 * Call this from server.js when underlying spot price changes.
 * Saves a spot-price tick so users can replay spot movements.
 */
function saveSpot(underlying, exchange, ltp) {
  const seg = exchange?.includes('MCX') ? 'MCX' : exchange?.includes('BSE') ? 'BFO' : 'NSE';
  if (!marketHours.isOpen(seg)) return;

  const record = {
    symbol: underlying, exchange,
    underlying, expiry: null, strike: null, side: 'spot',
    ltp, ts: Date.now(),
  };
  db.insertTick(record);
  notify(record);
}

/**
 * Start saving periodic chain snapshots for a symbol every 60 seconds.
 * Called when a chain is loaded.
 */
function startSnapshotTimer(underlying, expiry, getChainFn) {
  const key = `${underlying}:${expiry}`;
  if (snapshotTimers.has(key)) return;

  const timer = setInterval(() => {
    const seg = ['COPPER','GOLD','SILVER','CRUDEOIL','NATURALGAS','ZINC','CRUDE OIL'].includes(underlying) ? 'MCX' : 'NSE';
    if (!marketHours.isOpen(seg)) return;
    const chain = getChainFn();
    if (chain) db.saveSnapshot(underlying, expiry, chain);
  }, 60_000);

  snapshotTimers.set(key, timer);
  console.log(`[producer] Snapshot timer started: ${underlying} ${expiry}`);
}

function stopSnapshotTimer(underlying, expiry) {
  const key = `${underlying}:${expiry}`;
  const t = snapshotTimers.get(key);
  if (t) { clearInterval(t); snapshotTimers.delete(key); }
}

function stopAll() {
  for (const [key, t] of snapshotTimers) {
    clearInterval(t);
    snapshotTimers.delete(key);
  }
}

module.exports = { save, saveSpot, startSnapshotTimer, stopSnapshotTimer, stopAll, onNewTick };
