/**
 * tickProducer.js
 * Receives every live tick from the broker (via server.js onTick),
 * saves it to TimescaleDB ticks_history, then notifies tickFeeder.
 *
 * Flow: Broker → onTick → tickProducer.save() → TimescaleDB → tickFeeder → Users
 */

const db          = require('../db/database');
const marketHours = require('../utils/marketHours');

const listeners = new Set();

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

function save(tick) {
  const exchange = tick.exchange?.split('_')[0] || tick.exchange;
  const seg = exchange === 'MCX' ? 'MCX' : exchange?.startsWith('NSE') ? 'NSE' : 'BFO';

  if (!marketHours.isOpen(seg === 'NSE' ? 'NSE' : seg)) return;

  const record = { ...tick, ts: Date.now() };
  db.insertTick(record); // fire-and-forget async insert
  notify(record);
}

function saveFutures(underlying, futSymbol, exchange, ltp, extra = {}) {
  const seg = exchange?.includes('BFO') ? 'BFO' : 'NSE';
  if (!marketHours.isOpen(seg)) return;
  const record = {
    symbol: futSymbol, exchange,
    underlying, expiry: null, strike: null, side: 'futures',
    ltp, ts: Date.now(), ...extra,
  };
  db.insertTick(record);
  notify(record);
}

function saveSpot(underlying, exchange, ltp, extra = {}) {
  const seg = exchange?.includes('MCX') ? 'MCX' : exchange?.includes('BSE') ? 'BFO' : 'NSE';
  if (!marketHours.isOpen(seg)) return;

  const record = {
    symbol: underlying, exchange,
    underlying, expiry: null, strike: null, side: 'spot',
    ltp, ts: Date.now(), ...extra,
  };
  db.insertTick(record);
  notify(record);
}

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
  for (const [, t] of snapshotTimers) clearInterval(t);
  snapshotTimers.clear();
}

module.exports = { save, saveSpot, saveFutures, startSnapshotTimer, stopSnapshotTimer, stopAll, onNewTick };
