#!/usr/bin/env bash
# Lokální PostgreSQL jen pro trasovani-reporting (port 5435, bez hesla)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="$ROOT/.pgdata"
PG_BIN="${PG_BIN:-/Library/PostgreSQL/18/bin}"
PORT=5435

if [ ! -x "$PG_BIN/pg_ctl" ]; then
  echo "Nenalezen PostgreSQL v $PG_BIN – nastavte PG_BIN nebo nainstalujte PostgreSQL."
  exit 1
fi

if [ ! -f "$DATA_DIR/PG_VERSION" ]; then
  mkdir -p "$DATA_DIR"
  "$PG_BIN/initdb" -D "$DATA_DIR" -U trasovani --no-locale -E UTF8
  {
    echo "host all all 127.0.0.1/32 trust"
    echo "host all all ::1/128 trust"
    echo "local all all trust"
  } >> "$DATA_DIR/pg_hba.conf"
fi

if ! "$PG_BIN/pg_isready" -h 127.0.0.1 -p "$PORT" -q 2>/dev/null; then
  "$PG_BIN/pg_ctl" -D "$DATA_DIR" -l "$DATA_DIR/server.log" -o "-p $PORT -k $DATA_DIR" start
  sleep 1
fi

"$PG_BIN/createdb" -h 127.0.0.1 -p "$PORT" -U trasovani trasovani 2>/dev/null || true
echo "PostgreSQL běží: postgresql://trasovani@127.0.0.1:$PORT/trasovani"
