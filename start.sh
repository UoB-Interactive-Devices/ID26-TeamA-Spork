#!/bin/bash
# ═══════════════════════════════════════
#   Launcher (Mac/Linux)
#   Double-click or run: ./start.sh
# ═══════════════════════════════════════

cd "$(dirname "$0")"

# ── Check dependencies ──────────────────
if ! command -v python3 &>/dev/null && ! command -v python &>/dev/null; then
  echo "[!] Python not found. Please install Python 3."
  read -p "Press Enter to exit..."
  exit 1
fi

if ! command -v npm &>/dev/null; then
  echo "[!] npm not found. Please install Node.js."
  read -p "Press Enter to exit..."
  exit 1
fi

PYTHON=$(command -v python3 || command -v python)

echo ""
echo "  ═══════════════════════════════════════"
echo "    Stir Things Up - Habit Disrupting Game"
echo "  ═══════════════════════════════════════"
echo "  Python : $PYTHON"
echo "  Node   : $(node --version 2>/dev/null || echo 'unknown')"
echo ""

# ── Install frontend deps if needed ────
if [ ! -d "webapp/node_modules" ]; then
  echo "  [*] Installing frontend dependencies..."
  npm install --prefix webapp
fi

# ── Start frontend dev server ───────────
echo "  [*] Starting frontend..."
npm run dev --prefix webapp &
FRONTEND_PID=$!

# Give the frontend a moment to start
sleep 2

# ── Start backend bridge ────────────────
echo "  [*] Starting backend bridge..."
echo "  [*] Press Ctrl+C to stop everything."
echo ""
$PYTHON backend/launcher.py --mag-port /dev/cu.usbmodem101 --nfc-port /dev/cu.usbmodem1101

# ── Cleanup on exit ─────────────────────
echo ""
echo "  [*] Shutting down frontend..."
kill $FRONTEND_PID 2>/dev/null
wait $FRONTEND_PID 2>/dev/null
echo "  Done."
