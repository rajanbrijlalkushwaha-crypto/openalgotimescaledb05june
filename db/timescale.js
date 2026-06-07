const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/soctickdata',
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => console.error('[DB] pool error:', err.message));

async function init() {
  // Latest-value table (one row per symbol+exchange)
  await pool.query(`
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
      volume     BIGINT,
      oi         BIGINT,
      oi_chg     BIGINT,
      iv         REAL,
      delta      REAL,
      gamma      REAL,
      theta      REAL,
      vega       REAL,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (symbol, exchange)
    )
  `);

  // Tick history — TimescaleDB hypertable
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ticks_history (
      time       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      symbol     TEXT        NOT NULL,
      exchange   TEXT,
      underlying TEXT,
      expiry     TEXT,
      strike     REAL,
      side       TEXT,
      ltp        REAL,
      ltp_chg    REAL,
      volume     BIGINT,
      oi         BIGINT,
      oi_chg     BIGINT,
      iv         REAL,
      delta      REAL,
      gamma      REAL,
      theta      REAL,
      vega       REAL
    )
  `);

  // Create hypertable — skip if TimescaleDB extension is not installed
  await pool.query(`SELECT create_hypertable('ticks_history', 'time', if_not_exists => TRUE)`)
    .catch(() => {});

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_th_underlying_expiry_time
      ON ticks_history (underlying, expiry, time DESC)
  `);

  // Periodic chain snapshots (JSON blobs for replay bootstrap)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS option_snapshots (
      id          SERIAL PRIMARY KEY,
      underlying  TEXT        NOT NULL,
      expiry      TEXT        NOT NULL,
      snapshot    JSONB       NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_snapshots_lookup
      ON option_snapshots (underlying, expiry, created_at DESC)
  `);

  // ── Data retention: auto-delete ticks_history older than N days ──────────────
  // TimescaleDB drops full chunks — much faster than row-by-row DELETE.
  const retentionDays = parseInt(process.env.TICK_RETENTION_DAYS || '90');
  await pool.query(
    `SELECT add_retention_policy('ticks_history', INTERVAL '${retentionDays} days', if_not_exists => TRUE)`
  ).catch(() => {}); // silently skip if TimescaleDB extension not installed

  // Keep option_snapshots lean — only last 1000 rows per underlying+expiry
  await pool.query(`
    CREATE OR REPLACE FUNCTION prune_snapshots() RETURNS void AS $$
    BEGIN
      DELETE FROM option_snapshots
      WHERE id NOT IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (
            PARTITION BY underlying, expiry ORDER BY created_at DESC
          ) AS rn FROM option_snapshots
        ) ranked WHERE rn <= 1000
      );
    END;
    $$ LANGUAGE plpgsql;
  `).catch(() => {});

  console.log(`[DB] TimescaleDB ready — ticks_history retention: ${retentionDays} days`);
}

// ── Latest-value upsert ───────────────────────────────────────────────────────
function upsertTick(tick) {
  pool.query(`
    INSERT INTO ticks
      (symbol, exchange, ltp, ltp_chg, bid, ask, open, high, low, close, prev_close,
       volume, oi, oi_chg, iv, delta, gamma, theta, vega, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19, NOW())
    ON CONFLICT (symbol, exchange) DO UPDATE SET
      ltp        = COALESCE(EXCLUDED.ltp,        ticks.ltp),
      ltp_chg    = COALESCE(EXCLUDED.ltp_chg,    ticks.ltp_chg),
      bid        = COALESCE(EXCLUDED.bid,        ticks.bid),
      ask        = COALESCE(EXCLUDED.ask,        ticks.ask),
      open       = COALESCE(EXCLUDED.open,       ticks.open),
      high       = COALESCE(EXCLUDED.high,       ticks.high),
      low        = COALESCE(EXCLUDED.low,        ticks.low),
      close      = COALESCE(EXCLUDED.close,      ticks.close),
      prev_close = COALESCE(EXCLUDED.prev_close, ticks.prev_close),
      volume     = COALESCE(EXCLUDED.volume,     ticks.volume),
      oi         = COALESCE(EXCLUDED.oi,         ticks.oi),
      oi_chg     = COALESCE(EXCLUDED.oi_chg,     ticks.oi_chg),
      iv         = COALESCE(EXCLUDED.iv,         ticks.iv),
      delta      = COALESCE(EXCLUDED.delta,      ticks.delta),
      gamma      = COALESCE(EXCLUDED.gamma,      ticks.gamma),
      theta      = COALESCE(EXCLUDED.theta,      ticks.theta),
      vega       = COALESCE(EXCLUDED.vega,       ticks.vega),
      updated_at = NOW()
  `, [
    tick.symbol, tick.exchange,
    tick.ltp ?? null, tick.ltp_chg ?? null,
    tick.bid ?? null, tick.ask ?? null,
    tick.open ?? null, tick.high ?? null, tick.low ?? null,
    tick.close ?? null, tick.prev_close ?? null,
    tick.volume ?? null, tick.oi ?? null, tick.oi_chg ?? null,
    tick.iv ?? null, tick.delta ?? null, tick.gamma ?? null,
    tick.theta ?? null, tick.vega ?? null,
  ]).catch(e => console.error('[DB] upsertTick:', e.message));
}

// ── Tick history append ───────────────────────────────────────────────────────
function insertTick(tick) {
  pool.query(`
    INSERT INTO ticks_history
      (time, symbol, exchange, underlying, expiry, strike, side,
       ltp, ltp_chg, volume, oi, oi_chg, iv, delta, gamma, theta, vega)
    VALUES (to_timestamp($1 / 1000.0), $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
  `, [
    tick.ts ?? Date.now(),
    tick.symbol ?? null, tick.exchange ?? null,
    tick.underlying ?? null, tick.expiry ?? null,
    tick.strike ?? null, tick.side ?? null,
    tick.ltp ?? null, tick.ltp_chg ?? null,
    tick.volume ?? null, tick.oi ?? null, tick.oi_chg ?? null,
    tick.iv ?? null, tick.delta ?? null, tick.gamma ?? null,
    tick.theta ?? null, tick.vega ?? null,
  ]).catch(e => console.error('[DB] insertTick:', e.message));
}

// ── Snapshots ─────────────────────────────────────────────────────────────────
function saveSnapshot(underlying, expiry, chainData) {
  pool.query(
    `INSERT INTO option_snapshots (underlying, expiry, snapshot, created_at) VALUES ($1, $2, $3, NOW())`,
    [underlying, expiry, JSON.stringify(chainData)]
  ).catch(e => console.error('[DB] saveSnapshot:', e.message));
}

async function getLatestSnapshot(underlying, expiry) {
  const res = await pool.query(
    `SELECT snapshot FROM option_snapshots
     WHERE underlying=$1 AND expiry=$2
     ORDER BY created_at DESC LIMIT 1`,
    [underlying, expiry]
  );
  return res.rows[0]?.snapshot ?? null;
}

// ── Tick history queries ──────────────────────────────────────────────────────
async function getTicksRange(underlying, expiry, fromTs, toTs) {
  const res = await pool.query(`
    SELECT *,
           FLOOR(EXTRACT(EPOCH FROM time) * 1000)::BIGINT AS ts
    FROM ticks_history
    WHERE underlying = $1
      AND expiry     = $2
      AND time BETWEEN to_timestamp($3 / 1000.0) AND to_timestamp($4 / 1000.0)
    ORDER BY time ASC
  `, [underlying, expiry, fromTs, toTs]);
  return res.rows;
}

async function getTicksSince(underlying, expiry, sinceTs) {
  const res = await pool.query(`
    SELECT *,
           FLOOR(EXTRACT(EPOCH FROM time) * 1000)::BIGINT AS ts
    FROM ticks_history
    WHERE underlying = $1
      AND expiry     = $2
      AND time > to_timestamp($3 / 1000.0)
    ORDER BY time ASC
  `, [underlying, expiry, sinceTs]);
  return res.rows;
}

async function getAvailableDates(underlying) {
  const res = await pool.query(`
    SELECT DISTINCT
      ((time AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')::date::text AS date
    FROM ticks_history
    WHERE underlying = $1
    ORDER BY date DESC
  `, [underlying]);
  return res.rows.map(r => r.date);
}

module.exports = {
  init,
  upsertTick,
  insertTick,
  saveSnapshot,
  getLatestSnapshot,
  getTicksRange,
  getTicksSince,
  getAvailableDates,
  pool,
};
