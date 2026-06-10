#!/usr/bin/env bash
# Ověří, že před pushem na GitHub / Railway nechybí kritické složky.
set -euo pipefail
cd "$(dirname "$0")/.."

missing=0
for path in server/app.py server/prehled_engine.py scripts/init_db.py scripts/railway_start.sh sql/schema.sql Dockerfile railway.toml; do
  if [[ ! -f "$path" ]]; then
    echo "CHYBÍ: $path"
    missing=1
  fi
done

count_server=$(find server -type f | wc -l | tr -d ' ')
count_scripts=$(find scripts -type f | wc -l | tr -d ' ')
count_sql=$(find sql -type f | wc -l | tr -d ' ')

echo "server/:  ${count_server} souborů"
echo "scripts/: ${count_scripts} souborů"
echo "sql/:     ${count_sql} souborů"

if [[ "$missing" -eq 1 ]]; then
  exit 1
fi

echo "OK – struktura je kompletní. Pushněte celý repozitář: git push -u origin main"
