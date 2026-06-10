#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

export PYTHONPATH="$(dirname "$0")/../.pylibs:$(dirname "$0")/server:${PYTHONPATH:-}"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

bash scripts/start_local_db.sh

PORT="${PORT:-8080}"
export PORT

echo "Aplikace (UI + API + přihlášení): http://127.0.0.1:${PORT}"
echo "Přihlášení:                     http://127.0.0.1:${PORT}/login.html"
python3 server/app.py &
API_PID=$!

sleep 1
if ! kill -0 "$API_PID" 2>/dev/null; then
  echo "CHYBA: Server se nespustil. Zkuste: PORT=${PORT} python3 server/app.py"
  exit 1
fi

trap 'kill $API_PID 2>/dev/null' EXIT
wait
