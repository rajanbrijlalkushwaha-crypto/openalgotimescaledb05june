#!/bin/bash
# ─────────────────────────────────────────────────────────────────
#  start.sh  —  Mac development startup
#
#  Mac uses SQLite (no Docker needed).
#  Linux production uses TimescaleDB (set DATABASE_URL in .env).
#
#  What this does:
#    1. Start OpenAlgo broker server
#    2. Wait for you to login + generate daily access token
#    3. Build React frontend
#    4. Start soctickdata node server
# ─────────────────────────────────────────────────────────────────
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

# ── 1. Stop anything already running ──────────────────────────────
echo "[1/4] Stopping any running instances..."
pkill -f "app.py"         2>/dev/null || true
pkill -f "node server.js" 2>/dev/null || true
lsof -ti:5001 | xargs kill -9 2>/dev/null || true
lsof -ti:8765 | xargs kill -9 2>/dev/null || true
lsof -ti:3001 | xargs kill -9 2>/dev/null || true
sleep 2

# ── 2. Start OpenAlgo ─────────────────────────────────────────────
echo "[2/4] Starting OpenAlgo (broker server)..."
cd "$ROOT/openalgo-server"
if command -v uv &>/dev/null; then
  uv run app.py &
else
  .venv/bin/python app.py &
fi
OPENALGO_PID=$!
cd "$ROOT"

echo "      Waiting for OpenAlgo to start..."
sleep 6

echo ""
echo "┌─────────────────────────────────────────────────────────┐"
echo "│  ACTION REQUIRED — Login to OpenAlgo                   │"
echo "│                                                         │"
echo "│  URL: http://127.0.0.1:5001                            │"
echo "│                                                         │"
echo "│  Steps:                                                 │"
echo "│   1. Open the URL above in your browser                │"
echo "│   2. Login with your credentials                       │"
echo "│   3. Go to Broker → Connect → authorize with broker    │"
echo "│   4. Wait for 'Access Token generated' confirmation    │"
echo "│   5. Download Contracts if prompted                    │"
echo "│                                                         │"
echo "│  Then press ENTER here to continue...                  │"
echo "└─────────────────────────────────────────────────────────┘"
open "http://127.0.0.1:5001" 2>/dev/null || true
read -r _

# ── 3. Build React frontend ───────────────────────────────────────
echo "[3/4] Building React frontend..."
cd "$ROOT/frontend"
CI=false npm run build 2>&1 | tail -5
cd "$ROOT"

# ── 4. Start soctickdata ──────────────────────────────────────────
echo "[4/4] Starting soctickdata (SQLite mode)..."
node server.js &
NODE_PID=$!

echo ""
echo "┌─────────────────────────────────────────────────────────┐"
echo "│  All services running                                   │"
echo "│                                                         │"
echo "│  OpenAlgo      →  http://127.0.0.1:5001               │"
echo "│  Option Chain  →  http://localhost:3001                │"
echo "│                                                         │"
echo "│  Press Ctrl+C to stop                                  │"
echo "└─────────────────────────────────────────────────────────┘"

trap "echo 'Stopping...'; kill $OPENALGO_PID $NODE_PID 2>/dev/null; exit" INT TERM
wait
