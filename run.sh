#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ -f ".venv/bin/python" ]; then
    exec .venv/bin/python TiktokStreamKeyGenerator.py "$@"
else
    exec python3 TiktokStreamKeyGenerator.py "$@"
fi
