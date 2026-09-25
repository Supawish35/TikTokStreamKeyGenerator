#!/bin/bash
set -e

# Resolve directory of this script
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# Auto-detect Python interpreter
if [ -f "$DIR/.venv/bin/python" ]; then
    PYTHON_CMD="$DIR/.venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
    PYTHON_CMD="python3"
elif command -v python >/dev/null 2>&1; then
    PYTHON_CMD="python"
else
    echo "Error: Python interpreter not found." >&2
    exit 1
fi

echo "Starting TikTok Stream Key Generator Web UI..."
echo "Using Python: $PYTHON_CMD"

# Start Flask backend
"$PYTHON_CMD" app.py &
FLASK_PID=$!

# Start Vite frontend
(cd frontend && npm run dev) &
VITE_PID=$!

# Trap signals for graceful cleanup
cleanup() {
    echo "Stopping web server processes (Flask PID: $FLASK_PID, Vite PID: $VITE_PID)..."
    kill -TERM "$FLASK_PID" "$VITE_PID" 2>/dev/null || true
    wait "$FLASK_PID" "$VITE_PID" 2>/dev/null || true
    echo "Shutdown complete."
}

trap cleanup EXIT INT TERM

wait
