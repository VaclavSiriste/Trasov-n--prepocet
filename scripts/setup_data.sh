#!/bin/bash
# Jednorázové nastavení DB a import dat z Excelu + volitelně Raynet API
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PYLIBS="$ROOT/../.pylibs"
export PYTHONPATH="$PYLIBS"
XLSX="${1:-/Users/vaclavsiriste/Downloads/Kopie souboru Trasování (1).xlsx}"

if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

DSN="${DATABASE_URL:-postgresql://localhost/trasovani}"

echo "==> Schéma raynet tabulek"
psql "$DSN" -f "$ROOT/sql/schema.sql"

echo "==> Schéma přehled montáže"
psql "$DSN" -f "$ROOT/sql/schema_prehled.sql"

echo "==> Import z Excelu: $XLSX"
python3 "$ROOT/scripts/import_raynet_xlsx.py" "$XLSX" --dsn "$DSN" --truncate

if [ -n "${RAYNET_API_KEY:-}" ] && [ "$RAYNET_API_KEY" != "your-api-key-here" ]; then
  echo "==> Sync z Raynet API"
  python3 "$ROOT/scripts/sync_raynet_api.py"
else
  echo "==> Raynet API přeskočeno (doplňte RAYNET_API_KEY v .env)"
fi

echo "Hotovo. Spusťte ./start.sh"
