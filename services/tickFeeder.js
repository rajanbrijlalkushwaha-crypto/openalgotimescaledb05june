/**
 * tickFeeder.js
 * Reads saved ticks from DB and pushes them to connected users via WebSocket.
 *
 * LIVE MODE:
 *   - tickProducer notifies us on every new saved tick
 *   - We forward it to all subscribed WS clients immediately
 *
 * HISTORICAL REPLAY MODE:
 *   - User sends { action:'replay', symbol, expiry, date, speed }
 *   - We read ticks from DB for that date and send them in order
 *   - Speed: 1 = real time, 2 = 2x faster, 0 = instant (all at once)
 */

const db           = require('../db/database');
const producer     = require('./tickProducer');
const marketHours  = require('../utils/marketHours');

// Map: ws client → { underlying, expiry, mode: 'live'|'replay' }
const clients = new Map();

// Register a WS client
function addClient(ws) {
  clients.set(ws, { underlying: null, expiry: null, mode: 'live', replayTimer: null });

  ws.on('close', () => {
    const info = clients.get(ws);
    if (info?.replayTimer) clearTimeout(info.replayTimer);
    clients.delete(ws);
  });
}

// Handle messages from frontend WS
async function handleMessage(ws, msg) {
  if (msg.action === 'subscribe_feed') {
    // User subscribes to live feed for a symbol
    const info = clients.get(ws);
    if (!info) return;
    info.underlying = msg.symbol?.toUpperCase();
    info.expiry     = msg.expiry?.toUpperCase();
    info.mode       = 'live';
    if (info.replayTimer) { clearTimeout(info.replayTimer); info.replayTimer = null; }

    // Send latest snapshot immediately so user sees data right away
    if (info.underlying && info.expiry) {
      const snap = db.getLatestSnapshot(info.underlying, info.expiry);
      if (snap) {
        send(ws, { type: 'chain_update', symbol: info.underlying, expiry: info.expiry, data: snap });
      }
    }
    return;
  }

  if (msg.action === 'replay') {
    // User requests historical replay
    const info = clients.get(ws);
    if (!info) return;
    info.mode       = 'replay';
    info.underlying = msg.symbol?.toUpperCase();
    info.expiry     = msg.expiry?.toUpperCase();
    if (info.replayTimer) { clearTimeout(info.replayTimer); info.replayTimer = null; }

    const date  = msg.date;   // 'YYYY-MM-DD'
    const speed = msg.speed || 1;

    await startReplay(ws, info.underlying, info.expiry, date, speed);
    return;
  }

  if (msg.action === 'stop_replay') {
    const info = clients.get(ws);
    if (!info) return;
    if (info.replayTimer) { clearTimeout(info.replayTimer); info.replayTimer = null; }
    info.mode = 'live';
    send(ws, { type: 'replay_stopped' });
  }
}

// ── Live feed: tickProducer notifies us, we push to subscribed clients ────────
producer.onNewTick((tick) => {
  for (const [ws, info] of clients) {
    if (info.mode !== 'live') continue;
    if (!info.underlying || info.underlying !== tick.underlying) continue;
    if (info.expiry && info.expiry !== tick.expiry && tick.side !== 'spot') continue;
    if (ws.readyState !== 1) continue;

    send(ws, { type: 'tick', data: tick });
  }
});

// ── Historical replay ─────────────────────────────────────────────────────────
async function startReplay(ws, underlying, expiry, date, speed) {
  const info = clients.get(ws);
  if (!info) return;

  // Build timestamp range for the date in IST
  const dayStart = new Date(`${date}T03:30:00.000Z`).getTime(); // 9:00 IST = 3:30 UTC
  const dayEnd   = dayStart + 24 * 60 * 60 * 1000;

  const ticks = db.getTicksRange(underlying, expiry, dayStart, dayEnd);

  if (!ticks.length) {
    send(ws, { type: 'replay_empty', message: `No data for ${underlying} ${expiry} on ${date}` });
    return;
  }

  send(ws, { type: 'replay_start', symbol: underlying, expiry, date, total: ticks.length });

  let i = 0;

  function sendNext() {
    if (!clients.has(ws) || clients.get(ws).mode !== 'replay') return;
    if (i >= ticks.length) {
      send(ws, { type: 'replay_done' });
      return;
    }

    const tick = ticks[i];
    send(ws, { type: 'tick', data: tick });
    i++;

    if (speed === 0) {
      // Instant — send all with no delay (batched)
      if (i % 500 === 0) {
        // yield every 500 ticks to avoid blocking
        info.replayTimer = setTimeout(sendNext, 0);
      } else {
        sendNext();
      }
    } else {
      // Calculate delay to match original timing
      const nextDelay = i < ticks.length
        ? Math.max(0, (ticks[i].ts - tick.ts) / speed)
        : 0;
      info.replayTimer = setTimeout(sendNext, nextDelay);
    }
  }

  sendNext();
}

// ── Available replay dates ────────────────────────────────────────────────────
function getAvailableDates(underlying) {
  return db.getAvailableDates(underlying);
}

// ── Market status broadcast ───────────────────────────────────────────────────
function broadcastMarketStatus() {
  const status = marketHours.status();
  const msg = JSON.stringify({ type: 'market_status', data: status });
  for (const [ws] of clients) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

// Broadcast market status every minute
setInterval(broadcastMarketStatus, 60_000);

function send(ws, obj) {
  try {
    if (ws.readyState === 1) ws.send(JSON.stringify(obj));
  } catch (_) {}
}

module.exports = { addClient, handleMessage, getAvailableDates };
