-- Denní target + lokalita montérů (sloupce Q/R v měsíčním listu Excelu)

BEGIN;

CREATE TABLE IF NOT EXISTS mesicni_rozpis_den (
  mesic_key           TEXT NOT NULL,
  jmeno               TEXT NOT NULL,
  datum               DATE NOT NULL,
  target_flag         SMALLINT NOT NULL DEFAULT 0,
  destination_region  TEXT NOT NULL DEFAULT 'MSK',
  PRIMARY KEY (mesic_key, jmeno, datum)
);

CREATE INDEX IF NOT EXISTS idx_mesicni_rozpis_den_lookup
  ON mesicni_rozpis_den (mesic_key, datum, destination_region);

COMMIT;
