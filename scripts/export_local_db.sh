#!/usr/bin/env bash
# Export lokální DB trasovani (port 5435) do souboru pro import do Supabase / Railway Postgres.
set -euo pipefail
cd "$(dirname "$0")/.."

PG_BIN="${PG_BIN:-/Library/PostgreSQL/18/bin}"
HOST=127.0.0.1
PORT=5435
USER=trasovani
DB=trasovani
OUT_DIR="${1:-./backups}"
STAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p "$OUT_DIR"

if [ ! -x "$PG_BIN/pg_dump" ]; then
  echo "Nenalezen pg_dump v $PG_BIN – nastavte PG_BIN nebo spusťte ./start.sh (lokální DB)."
  exit 1
fi

if ! "$PG_BIN/pg_isready" -h "$HOST" -p "$PORT" -q 2>/dev/null; then
  echo "Lokální PostgreSQL neběží. Spusťte: bash scripts/start_local_db.sh"
  exit 1
fi

SCHEMA="$OUT_DIR/trasovani_schema_${STAMP}.sql"
DATA="$OUT_DIR/trasovani_data_${STAMP}.sql"
FULL="$OUT_DIR/trasovani_full_${STAMP}.sql"

echo "==> Schéma + data (doporučeno pro novou cloud DB)"
"$PG_BIN/pg_dump" -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" \
  --no-owner --no-acl --clean --if-exists -f "$FULL"

echo "==> Jen data (když cloud DB už má schéma z init_db.py)"
"$PG_BIN/pg_dump" -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" \
  --data-only --no-owner --no-acl -f "$DATA"

echo ""
echo "Hotovo:"
echo "  Celý dump:  $FULL"
echo "  Jen data:   $DATA"
echo ""
echo "Import do cloudu: bash scripts/import_db_to_cloud.sh \"$FULL\""
