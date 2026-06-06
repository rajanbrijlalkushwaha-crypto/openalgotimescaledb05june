#!/bin/bash
# ─────────────────────────────────────────────────────────────────
#  start-linux.sh  —  Linux production startup
#
#  Run this ONCE after deployment, or after every git pull.
#  After first run, soctickdata stays alive via PM2.
#  You only need to re-run for updates or after a server reboot.
#
#  Pre-requisites (first time only):
#    sudo apt install -y nodejs npm docker.io docker-compose-plugin
#    npm install -g pm2
#    npm install       (in this directory)
#
#  Daily routine:
#    1. Open browser → http://YOUR-SERVER-IP:5001
#    2. Login to OpenAlgo → generate access token
#    3. That's it — soctickdata auto-reconnects to OpenAlgo WS
# ─────────────────────────────────────────────────────────────────
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "═══════════════════════════════════════════════"
echo "  soctickdata — Linux deploy"
echo "═══════════════════════════════════════════════"

# ── 1. TimescaleDB ────────────────────────────────────────────────
echo "[1/4] Starting TimescaleDB..."
docker compose up -d timescaledb

echo "      Waiting for DB to be ready..."
until docker exec soctickdata-db pg_isready -U postgres -d soctickdata -q 2>/dev/null; do
  sleep 1
done
echo "      TimescaleDB ready ✓"

# ── 2. OpenAlgo ───────────────────────────────────────────────────
echo "[2/4] Starting OpenAlgo..."
cd "$ROOT/openalgo-server"
docker compose up -d
cd "$ROOT"
echo "      OpenAlgo starting (takes ~30s for first boot)..."

# ── 3. Install node deps ──────────────────────────────────────────
echo "[3/4] Checking node dependencies..."
npm install --production 2>&1 | tail -3

# ── 4. Start/restart soctickdata with PM2 ────────────────────────
echo "[4/4] Starting soctickdata with PM2..."
if pm2 list | grep -q "soctickdata"; then
  pm2 restart soctickdata
else
  pm2 start ecosystem.config.js
fi
pm2 save

echo ""
echo "═══════════════════════════════════════════════"
echo "  Done!"
echo ""
echo "  ► Open in browser:  http://$(hostname -I | awk '{print $1}'):5001"
echo "  ► Login to OpenAlgo, generate daily access token"
echo "  ► Then open:        http://$(hostname -I | awk '{print $1}'):3001"
echo ""
echo "  PM2 commands:"
echo "    pm2 logs soctickdata     — view live logs"
echo "    pm2 status               — check running processes"
echo "    pm2 restart soctickdata  — restart after .env change"
echo "═══════════════════════════════════════════════"
