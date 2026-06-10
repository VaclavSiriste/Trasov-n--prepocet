#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${DB_NAME:-trasovani}"
DB_USER="${DB_USER:-$USER}"

echo "Vytvářím databázi: $DB_NAME"
createdb "$DB_NAME" 2>/dev/null || echo "Databáze $DB_NAME už existuje"

echo "Aplikuji schéma..."
psql -d "$DB_NAME" -f "$(dirname "$0")/schema.sql"

echo "Hotovo. Připojení: postgresql://localhost/$DB_NAME"
