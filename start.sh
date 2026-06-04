#!/bin/bash
ROOT="/Users/admin/Desktop/soctickdata"

echo "Stopping any running instances..."
pkill -f "app.py" 2>/dev/null
pkill -f "node server.js" 2>/dev/null
lsof -ti:5001 | xargs kill -9 2>/dev/null
lsof -ti:8765 | xargs kill -9 2>/dev/null
lsof -ti:3001 | xargs kill -9 2>/dev/null
sleep 3

echo "Starting OpenAlgo (broker server)..."
cd "$ROOT/openalgo-server" && .venv/bin/python app.py &
OPENALGO_PID=$!
cd "$ROOT"

echo "Waiting for OpenAlgo to be ready..."
sleep 6
echo ""
echo "➡  Login to Upstox at: http://127.0.0.1:5001"
open "http://127.0.0.1:5001" 2>/dev/null
echo "   1. Login → Broker → Connect Upstox → authorize"
echo "   2. Then press ENTER here to continue..."
read -r _

echo "Building React frontend..."
cd "$ROOT/frontend" && CI=false npm run build 2>&1 | tail -3
cd "$ROOT"

echo "Starting soctickdata (data + frontend)..."
node server.js &
NODE_PID=$!

echo ""
echo "OpenAlgo running  →  http://127.0.0.1:5001"
echo "Option Chain UI   →  http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop both"

trap "kill $OPENALGO_PID $NODE_PID 2>/dev/null; exit" INT TERM
wait
