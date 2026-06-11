#!/usr/bin/env bash
# Import lokální DB trasovani do Railway PostgreSQL z Macu.
#
# Před spuštěním:
# 1. Railway → + New → Database → PostgreSQL
# 2. Postgres služba → Connect → zkopírujte veřejný connection string (TCP / Public URL)
# 3. export RAILWAY_DATABASE_URL='postgresql://postgres:heslo@...railway.app:port/railway'
#
# Použití:
#   bash scripts/import_local_to_railway.sh
#   bash scripts/import_local_to_railway.sh 'postgresql://...'   # URL jako argument
set -euo pipefail
cd "$(dirname "$0")/.."

PG_BIN="${PG_BIN:-/Library/PostgreSQL/18/bin}"
PSQL="${PSQL:-$PG_BIN/psql}"
TARGET="${1:-${RAILWAY_DATABASE_URL:-}}"

if [ -z "$TARGET" ]; then
  echo "Chybí Railway connection string."
  echo ""
  echo "Railway → PostgreSQL služba → Connect → Public / TCP proxy URL"
  echo ""
  echo "  export RAILWAY_DATABASE_URL='postgresql://postgres:...@...railway.app:PORT/railway'"
  echo "  bash scripts/import_local_to_railway.sh"
  exit 1
fi

if ! "$PG_BIN/pg_isready" -h 127.0.0.1 -p 5435 -q 2>/dev/null; then
  echo "Spouštím lokální DB..."
  bash scripts/start_local_db.sh
fi

DUMP="./backups/trasovani_for_railway.sql"
mkdir -p backups
STAMP=$(date +%Y%m%d_%H%M%S)
DUMP="./backups/trasovani_for_railway_${STAMP}.sql"

echo "==> 1/3 Export z lokálu (127.0.0.1:5435)..."
"$PG_BIN/pg_dump" -h 127.0.0.1 -p 5435 -U trasovani -d trasovani \
  --no-owner --no-acl --clean --if-exists -f "$DUMP"

echo "==> 2/3 Import do Railway PostgreSQL..."
if [ -x "$PSQL" ]; then
  "$PSQL" "$TARGET" -v ON_ERROR_STOP=1 -f "$DUMP"
else
  psql "$TARGET" -v ON_ERROR_STOP=1 -f "$DUMP"
fi

echo "==> 3/3 Hotovo. Dump uložen: $DUMP"
echo ""
echo "Teď v Railway u WEB služby (aplikace):"
echo "  Variables → Add Reference → PostgreSQL → DATABASE_URL"
echo "  (nebo vložte stejnou URL ručně)"
echo "  → Redeploy aplikace"
