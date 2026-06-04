const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'ticks.db'));
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA synchronous = NORMAL");
db.exec("PRAGMA cache_size = -64000"); // 64MB cache

db.exec(`
  CREATE TABLE IF NOT EXISTS ticks (
    symbol     TEXT NOT NULL,
    exchange   TEXT NOT NULL,
    ltp        REAL,
    ltp_chg    REAL,
    bid        REAL,
    ask        REAL,
    open       REAL,
    high       REAL,
    low        REAL,
    close      REAL,
    prev_close REAL,
    volume     INTEGER,
    oi         INTEGER,
    oi_chg     INTEGER,
    iv         REAL,
    delta      REAL,
    gamma      REAL,
    theta      REAL,
    vega       REAL,
    updated_at INTEGER,
    PRIMARY KEY (symbol, exchange)
  );

  CREATE TABLE IF NOT EXISTS option_snapshots (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    underlying  TEXT NOT NULL,
    expiry      TEXT NOT NULL,
    snapshot    TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_snapshots
    ON option_snapshots (underlying, expiry, created_at DESC);
`);

const upsertTick = db.prepare(`
  INSERT INTO ticks
    (symbol, exchange, ltp, ltp_chg, bid, ask, open, high, low, close, prev_close,
     volume, oi, oi_chg, iv, delta, gamma, theta, vega, updated_at)
  VALUES
    (@symbol, @exchange, @ltp, @ltp_chg, @bid, @ask, @open, @high, @low, @close, @prev_close,
     @volume, @oi, @oi_chg, @iv, @delta, @gamma, @theta, @vega, @updated_at)
  ON CONFLICT(symbol, exchange) DO UPDATE SET
    ltp        = excluded.ltp,
    ltp_chg    = COALESCE(excluded.ltp_chg,    ltp_chg),
    bid        = COALESCE(excluded.bid,        bid),
    ask        = COALESCE(excluded.ask,        ask),
    open       = COALESCE(excluded.open,       open),
    high       = COALESCE(excluded.high,       high),
    low        = COALESCE(excluded.low,        low),
    close      = COALESCE(excluded.close,      close),
    prev_close = COALESCE(excluded.prev_close, prev_close),
    volume     = COALESCE(excluded.volume,     volume),
    oi         = COALESCE(excluded.oi,         oi),
    oi_chg     = COALESCE(excluded.oi_chg,     oi_chg),
    iv         = COALESCE(excluded.iv,         iv),
    delta      = COALESCE(excluded.delta,      delta),
    gamma      = COALESCE(excluded.gamma,      gamma),
    theta      = COALESCE(excluded.theta,      theta),
    vega       = COALESCE(excluded.vega,       vega),
    updated_at = excluded.updated_at
`);

// ── Tick history: append-only, every tick saved with timestamp ───────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS ticks_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol      TEXT    NOT NULL,
    exchange    TEXT    NOT NULL,
    underlying  TEXT,
    expiry      TEXT,
    strike      REAL,
    side        TEXT,
    ltp         REAL,
    ltp_chg     REAL,
    volume      INTEGER,
    oi          INTEGER,
    oi_chg      INTEGER,
    iv          REAL,
    delta       REAL,
    gamma       REAL,
    theta       REAL,
    vega        REAL,
    ts          INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_th_sym_ts
    ON ticks_history (underlying, expiry, ts);

  CREATE INDEX IF NOT EXISTS idx_th_ts
    ON ticks_history (ts);
`);

const insertTickHistory = db.prepare(`
  INSERT INTO ticks_history
    (symbol, exchange, underlying, expiry, strike, side,
     ltp, ltp_chg, volume, oi, oi_chg, iv, delta, gamma, theta, vega, ts)
  VALUES
    (@symbol, @exchange, @underlying, @expiry, @strike, @side,
     @ltp, @ltp_chg, @volume, @oi, @oi_chg, @iv, @delta, @gamma, @theta, @vega, @ts)
`);

const insertSnapshot = db.prepare(`
  INSERT INTO option_snapshots (underlying, expiry, snapshot, created_at)
  VALUES (?, ?, ?, ?)
`);

module.exports = {
  upsertTick(tick) {
    try {
      upsertTick.run({
        symbol:     tick.symbol,
        exchange:   tick.exchange,
        ltp:        tick.ltp        ?? null,
        ltp_chg:    tick.ltp_chg    ?? null,
        bid:        tick.bid        ?? null,
        ask:        tick.ask        ?? null,
        open:       tick.open       ?? null,
        high:       tick.high       ?? null,
        low:        tick.low        ?? null,
        close:      tick.close      ?? null,
        prev_close: tick.prev_close ?? null,
        volume:     tick.volume     ?? null,
        oi:         tick.oi         ?? null,
        oi_chg:     tick.oi_chg     ?? null,
        iv:         tick.iv         ?? null,
        delta:      tick.delta      ?? null,
        gamma:      tick.gamma      ?? null,
        theta:      tick.theta      ?? null,
        vega:       tick.vega       ?? null,
        updated_at: Date.now(),
      });
    } catch (e) {
      console.error('[DB] upsertTick:', e.message);
    }
  },

  // Append one tick to history — called for every live tick
  insertTick(tick) {
    try {
      insertTickHistory.run({
        symbol:     tick.symbol     ?? null,
        exchange:   tick.exchange   ?? null,
        underlying: tick.underlying ?? null,
        expiry:     tick.expiry     ?? null,
        strike:     tick.strike     ?? null,
        side:       tick.side       ?? null,
        ltp:        tick.ltp        ?? null,
        ltp_chg:    tick.ltp_chg    ?? null,
        volume:     tick.volume     ?? null,
        oi:         tick.oi         ?? null,
        oi_chg:     tick.oi_chg     ?? null,
        iv:         tick.iv         ?? null,
        delta:      tick.delta      ?? null,
        gamma:      tick.gamma      ?? null,
        theta:      tick.theta      ?? null,
        vega:       tick.vega       ?? null,
        ts:         tick.ts         ?? Date.now(),
      });
    } catch (e) {
      console.error('[DB] insertTick:', e.message);
    }
  },

  saveSnapshot(underlying, expiry, chainData) {
    try {
      insertSnapshot.run(underlying, expiry, JSON.stringify(chainData), Date.now());
    } catch (e) {
      console.error('[DB] saveSnapshot:', e.message);
    }
  },

  // Get all ticks for a symbol+expiry after a given timestamp
  getTicksSince(underlying, expiry, sinceTs) {
    return db.prepare(`
      SELECT * FROM ticks_history
      WHERE underlying = ? AND expiry = ? AND ts > ?
      ORDER BY ts ASC
    `).all(underlying, expiry, sinceTs);
  },

  // Get ticks for a date range (historical replay)
  getTicksRange(underlying, expiry, fromTs, toTs) {
    return db.prepare(`
      SELECT * FROM ticks_history
      WHERE underlying = ? AND expiry = ? AND ts BETWEEN ? AND ?
      ORDER BY ts ASC
    `).all(underlying, expiry, fromTs, toTs);
  },

  // Latest snapshot for a symbol+expiry
  getLatestSnapshot(underlying, expiry) {
    const row = db.prepare(`
      SELECT snapshot FROM option_snapshots
      WHERE underlying = ? AND expiry = ?
      ORDER BY created_at DESC LIMIT 1
    `).get(underlying, expiry);
    return row ? JSON.parse(row.snapshot) : null;
  },

  // Available dates that have data for a symbol
  getAvailableDates(underlying) {
    return db.prepare(`
      SELECT DISTINCT date(ts/1000, 'unixepoch', '+5 hours', '30 minutes') as date
      FROM ticks_history
      WHERE underlying = ?
      ORDER BY date DESC
    `).all(underlying).map(r => r.date);
  },

  getAllTicks() {
    return db.prepare('SELECT * FROM ticks').all();
  },
};
