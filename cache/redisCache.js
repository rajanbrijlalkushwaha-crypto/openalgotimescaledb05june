/**
 * redisCache.js
 * Optional Redis cache layer for chain snapshots and expiries.
 * Gracefully degrades to no-op if REDIS_URL is not set or Redis is unreachable.
 *
 * Set REDIS_URL=redis://127.0.0.1:6379 in .env to enable.
 */

let client = null;
let enabled = false;

async function connect() {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.log('[redis] REDIS_URL not set — using in-memory cache only');
    return;
  }
  try {
    const Redis = require('ioredis');
    client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    client.on('error', () => {}); // suppress unhandled rejections
    await client.connect();
    await client.ping();
    enabled = true;
    console.log(`[redis] Connected: ${url}`);
  } catch (e) {
    console.log(`[redis] Not available (${e.message}) — using in-memory cache only`);
    client = null;
    enabled = false;
  }
}

async function getChain(symbol, expiry) {
  if (!enabled) return null;
  try {
    const raw = await client.get(`chain:${symbol}:${expiry}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function setChain(symbol, expiry, data) {
  if (!enabled) return;
  try {
    // Cache for 10 minutes — long enough to survive brief reconnects
    await client.setex(`chain:${symbol}:${expiry}`, 600, JSON.stringify(data));
  } catch {}
}

async function getExpiries(symbol) {
  if (!enabled) return null;
  try {
    const raw = await client.get(`expiries:${symbol}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function setExpiries(symbol, expiries) {
  if (!enabled) return;
  try {
    // Cache expiries for 1 hour
    await client.setex(`expiries:${symbol}`, 3600, JSON.stringify(expiries));
  } catch {}
}

function isEnabled() { return enabled; }

module.exports = { connect, getChain, setChain, getExpiries, setExpiries, isEnabled };
