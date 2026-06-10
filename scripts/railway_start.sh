#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PYTHONPATH="${PWD}/server:${PYTHONPATH:-}"

echo "==> Inicializace databáze (pokud je potřeba)"
python3 scripts/init_db.py

echo "==> Spouštím server na portu ${PORT:-8080}"
exec python3 server/app.py
