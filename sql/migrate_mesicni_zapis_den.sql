-- Ruční denní zápis z měsíčního listu (Kolik vybral, Důvod nesplnění)

BEGIN;

CREATE TABLE IF NOT EXISTS mesicni_zapis_den (
  mesic_key   TEXT NOT NULL,
  datum       DATE NOT NULL,
  collected   NUMERIC(10, 2) NOT NULL DEFAULT 0,
  reason      TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (mesic_key, datum)
);

COMMIT;
