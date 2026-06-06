/**
 * tickFeeder.js
 * Reads saved ticks from TimescaleDB and pushes them to connected users via Socket.IO.
 *
 * LIVE MODE:
 *   tickProducer notifies us on every new saved tick → forward to subscribed sockets.
 *
 * REPLAY MODE:
 *   User sends 'replay' event { symbol, expiry, date, speed }
 *   We read ticks from DB for that date and emit them in order.
 *   speed: 1 = real-time, 2 = 2x, 0 = instant
 */

const db          = require('../db/database');
const producer    = require('./tickProducer');
const marketHours = require('../utils/marketHours');

// Map: socket → { underlying, expiry, mode: 'live'|'replay', replayTimer }
const clients = new Map();

function addClient(socket) {
  clients.set(socket, { underlying: null, expiry: null, mode: 'live', replayTimer: null });

  socket.on('disconnect', () => {
    const info = clients.get(socket);
    if (info?.replayTimer) clearTimeout(info.replayTimer);
    clients.delete(socket);
  });
}

async function handleMessage(socket, msg) {
  if (msg.action === 'subscribe_feed') {
    const info = clients.get(socket);
    if (!info) return;
    info.underlying = msg.symbol?.toUpperCase() || null;
    info.expiry     = msg.expiry?.toUpperCase()  || null;
    info.mode       = 'live';
    if (info.replayTimer) { clearTimeout(info.replayTimer); info.replayTimer = null; }

    // Send latest DB snapshot immediately
    if (info.underlying && info.expiry) {
      const snap = await db.getLatestSnapshot(info.underlying, info.expiry);
      if (snap) {
        socket.emit('chain_update', { symbol: info.underlying, expiry: info.expiry, data: snap });
      }
    }
    return;
  }

  if (msg.action === 'replay') {
    const info = clients.get(socket);
    if (!info) return;
    info.mode       = 'replay';
    info.underlying = msg.symbol?.toUpperCase() || null;
    info.expiry     = msg.expiry?.toUpperCase()  || null;
    if (info.replayTimer) { clearTimeout(info.replayTimer); info.replayTimer = null; }

    await startReplay(socket, info.underlying, info.expiry, msg.date, msg.speed || 1);
    return;
  }

  if (msg.action === 'stop_replay') {
    const info = clients.get(socket);
    if (!info) return;
    if (info.replayTimer) { clearTimeout(info.replayTimer); info.replayTimer = null; }
    info.mode = 'live';
    socket.emit('replay_stopped');
  }
}

// ── Live feed: tickProducer notifies us → push to subscribed sockets ──────────
producer.onNewTick((tick) => {
  for (const [socket, info] of clients) {
    if (info.mode !== 'live') continue;
    if (!info.underlying || info.underlying !== tick.underlying) continue;
    if (info.expiry && info.expiry !== tick.expiry && tick.side !== 'spot') continue;
    if (!socket.connected) continue;
    socket.emit('tick', tick);
  }
});

// ── Historical replay ─────────────────────────────────────────────────────────
async function startReplay(socket, underlying, expiry, date, speed) {
  const info = clients.get(socket);
  if (!info) return;

  const dayStart = new Date(`${date}T03:30:00.000Z`).getTime(); // 9:00 IST
  const dayEnd   = dayStart + 24 * 60 * 60 * 1000;

  const ticks = await db.getTicksRange(underlying, expiry, dayStart, dayEnd);

  if (!ticks.length) {
    socket.emit('replay_empty', { message: `No data for ${underlying} ${expiry} on ${date}` });
    return;
  }

  socket.emit('replay_start', { symbol: underlying, expiry, date, total: ticks.length });

  let i = 0;

  function sendNext() {
    if (!clients.has(socket) || clients.get(socket).mode !== 'replay') return;
    if (i >= ticks.length) {
      socket.emit('replay_done');
      return;
    }

    const tick = ticks[i];
    socket.emit('tick', tick);
    i++;

    if (speed === 0) {
      if (i % 500 === 0) {
        info.replayTimer = setTimeout(sendNext, 0);
      } else {
        sendNext();
      }
    } else {
      const nextDelay = i < ticks.length
        ? Math.max(0, (ticks[i].ts - tick.ts) / speed)
        : 0;
      info.replayTimer = setTimeout(sendNext, nextDelay);
    }
  }

  sendNext();
}

// ── Available replay dates ────────────────────────────────────────────────────
async function getAvailableDates(underlying) {
  if (!underlying) return [];
  return db.getAvailableDates(underlying);
}

function getClientInfo(socket) {
  return clients.get(socket) || null;
}

module.exports = { addClient, handleMessage, getAvailableDates, getClientInfo };
