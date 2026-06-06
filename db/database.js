/**
 * db/database.js — auto-selects storage backend:
 *
 *   Mac (dev/test)  → DATABASE_URL not set → SQLite  (zero setup)
 *   Linux (prod)    → DATABASE_URL=postgresql://... → TimescaleDB
 */

const url = process.env.DATABASE_URL || '';

if (url.startsWith('postgres')) {
  console.log('[DB] Using TimescaleDB (PostgreSQL)');
  module.exports = require('./timescale');
} else {
  console.log('[DB] Using SQLite (local dev)');
  module.exports = require('./sqlite');
}
