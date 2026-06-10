-- Migrace existující DB na verzi s číselníkem období a koeficienty krajů
-- Po migraci spusťte: psql -d trasovani -f sql/schema_prehled.sql (seed data ON CONFLICT)

BEGIN;

CREATE TABLE IF NOT EXISTS koeficienty_kraje (
  id          SERIAL PRIMARY KEY,
  kraj        TEXT NOT NULL,
  rok         SMALLINT NOT NULL,
  mesic       SMALLINT NOT NULL,
  koeficient  NUMERIC(10, 6) NOT NULL,
  UNIQUE (kraj, rok, mesic)
);

CREATE TABLE IF NOT EXISTS lokalita_kraje (
  lokalita    TEXT NOT NULL,
  kraj        TEXT NOT NULL,
  PRIMARY KEY (lokalita, kraj)
);

CREATE TABLE IF NOT EXISTS ciselnik_obdobi (
  id          SERIAL PRIMARY KEY,
  nazev       TEXT NOT NULL,
  od          DATE NOT NULL,
  "do"        DATE NOT NULL,
  aktivni     BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS prehled_nastaveni (
  id              SMALLINT PRIMARY KEY DEFAULT 1,
  nastaveny_mesic SMALLINT NOT NULL DEFAULT 6,
  nastaveny_rok   SMALLINT NOT NULL DEFAULT 2026,
  CHECK (id = 1)
);

ALTER TABLE prehled_obdobi
  ADD COLUMN IF NOT EXISTS ciselnik_id INTEGER REFERENCES ciselnik_obdobi(id) ON DELETE SET NULL;

INSERT INTO prehled_nastaveni (id, nastaveny_mesic, nastaveny_rok) VALUES (1, 8, 2026)
ON CONFLICT (id) DO NOTHING;

COMMIT;
