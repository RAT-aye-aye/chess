#!/usr/bin/env bash
# Serve the chess app locally. Open the printed URL in the phone's browser.
set -e
cd "$(dirname "$0")"
PORT="${1:-8123}"
echo "Chess is running at: http://127.0.0.1:${PORT}/"
exec python3 -m http.server "$PORT" --bind 127.0.0.1
