#!/usr/bin/env bash
# Import dumpu do cloud PostgreSQL (Supabase nebo Railway Postgres).
# DATABASE_URL načte z .env nebo z prostředí.
set -euo pipefail
cd "$(dirname "$0")/.."

DUMP="${1:-}"
if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
  echo "Použití: bash scripts/import_db_to_cloud.sh cesta/k/trasovani_full_YYYYMMDD.sql"
  exit 1
fi

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Chybí DATABASE_URL – nastavte v .env nebo export DATABASE_URL=..."
  exit 1
fi

PSQL="${PSQL:-psql}"
if ! command -v psql >/dev/null 2>&1; then
  PSQL="/Library/PostgreSQL/18/bin/psql"
fi

echo "==> Import do: ${DATABASE_URL%%@*}@***"
echo "==> Soubor: $DUMP"
"$PSQL" "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$DUMP"
echo "==> Import hotovo"
