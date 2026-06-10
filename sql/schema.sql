-- PostgreSQL schéma pro Raynet data z Excelu „Trasování“
-- Listy: Raynet MONTÁŽE, Raynet ZAMĚŘOVAČI, Raynet OBVOLAT RMA, Raynet PREJEZDY
--
-- Spuštění:
--   createdb trasovani
--   psql -d trasovani -f sql/schema.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- Raynet MONTÁŽE (20 sloupců – bez pivot tabulek vpravo)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS raynet_montaze (
  id                      BIGSERIAL PRIMARY KEY,

  kategorie               TEXT,
  naplanovano_od          TIMESTAMPTZ,          -- Naplánováno od
  naplanovano_do          TIMESTAMPTZ,          -- Naplánováno do
  trvani                  INTERVAL,             -- Trvání
  predmet                 TEXT,                 -- Předmět
  ucastnici               TEXT,                 -- Účastníci
  monteri                 TEXT,                 -- montéři
  monter_c_1              TEXT,                 -- montér č. 1
  monter_c_2              TEXT,                 -- montér č. 2
  monter_c_3              TEXT,                 -- montér č. 3
  monteru                 NUMERIC(6, 2),        -- Montérů
  pocet_monterohodin      NUMERIC(10, 2),       -- Počet montérohodin
  hodin                   NUMERIC(10, 2),       -- hodin
  mesic                   SMALLINT,             -- měsíc
  naplanovano_od_datum    DATE,                 -- Naplánováno od (datum bez času)
  mesic_datum             SMALLINT,             -- měsíc (z data)
  misto_setkani           TEXT,                 -- Místo setkání
  kraj                    TEXT,                 -- Kraj
  rok                     SMALLINT,             -- Rok
  stitky                  TEXT,                 -- Štítky

  imported_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE raynet_montaze IS 'Excel list: Raynet MONTÁŽE';
COMMENT ON COLUMN raynet_montaze.kategorie IS 'Kategorie';
COMMENT ON COLUMN raynet_montaze.naplanovano_od IS 'Naplánováno od';
COMMENT ON COLUMN raynet_montaze.naplanovano_do IS 'Naplánováno do';
COMMENT ON COLUMN raynet_montaze.trvani IS 'Trvání';
COMMENT ON COLUMN raynet_montaze.predmet IS 'Předmět';
COMMENT ON COLUMN raynet_montaze.ucastnici IS 'Účastníci';
COMMENT ON COLUMN raynet_montaze.monteri IS 'montéři';
COMMENT ON COLUMN raynet_montaze.monter_c_1 IS 'montér č. 1';
COMMENT ON COLUMN raynet_montaze.monter_c_2 IS 'montér č. 2';
COMMENT ON COLUMN raynet_montaze.monter_c_3 IS 'montér č. 3';
COMMENT ON COLUMN raynet_montaze.monteru IS 'Montérů';
COMMENT ON COLUMN raynet_montaze.pocet_monterohodin IS 'Počet montérohodin';
COMMENT ON COLUMN raynet_montaze.hodin IS 'hodin';
COMMENT ON COLUMN raynet_montaze.mesic IS 'měsíc';
COMMENT ON COLUMN raynet_montaze.naplanovano_od_datum IS 'Naplánováno od (datum)';
COMMENT ON COLUMN raynet_montaze.mesic_datum IS 'měsíc (z data)';
COMMENT ON COLUMN raynet_montaze.misto_setkani IS 'Místo setkání';
COMMENT ON COLUMN raynet_montaze.kraj IS 'Kraj';
COMMENT ON COLUMN raynet_montaze.rok IS 'Rok';
COMMENT ON COLUMN raynet_montaze.stitky IS 'Štítky';

CREATE INDEX IF NOT EXISTS idx_raynet_montaze_rok_mesic
  ON raynet_montaze (rok, mesic);
CREATE INDEX IF NOT EXISTS idx_raynet_montaze_naplanovano_od
  ON raynet_montaze (naplanovano_od);
CREATE INDEX IF NOT EXISTS idx_raynet_montaze_monter_c_1
  ON raynet_montaze (monter_c_1);

-- ---------------------------------------------------------------------------
-- Raynet ZAMĚŘOVAČI (20 sloupců – bez pivot tabulek vpravo)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS raynet_zamerovaci (
  id                      BIGSERIAL PRIMARY KEY,

  kategorie               TEXT,                 -- Kategorie
  naplanovano_od          TIMESTAMPTZ,          -- Naplánováno od
  naplanovano_do          TIMESTAMPTZ,          -- Naplánováno do
  trvani                  INTERVAL,             -- Trvání
  predmet                 TEXT,                 -- Předmět
  ucastnici               TEXT,                 -- Účastníci
  zamerovac               TEXT,                 -- Zaměřovač
  zamerovac_c_1           TEXT,                 -- Zaměřovač č.1
  zamerovac_c_2           TEXT,                 -- Zaměřovač č.2
  zamerovac_c_3           TEXT,                 -- Zaměřovač č.3
  zamerovacu              NUMERIC(6, 2),        -- Zaměřovačů
  pocet_hodin_zamereni    NUMERIC(10, 2),       -- Počet hodin zaměření
  hodin                   NUMERIC(10, 2),       -- hodin
  mesic                   SMALLINT,             -- měsíc
  naplanovano_od_datum    DATE,                 -- Naplánováno_od
  mesic_datum             SMALLINT,             -- měsic
  misto_setkani           TEXT,                 -- Místo setkání
  kraj                    TEXT,                 -- Kraj
  rok                     SMALLINT,             -- Rok
  stitky                  TEXT,                 -- Štítky

  imported_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE raynet_zamerovaci IS 'Excel list: Raynet ZAMĚŘOVAČI';
COMMENT ON COLUMN raynet_zamerovaci.kategorie IS 'Kategorie';
COMMENT ON COLUMN raynet_zamerovaci.naplanovano_od IS 'Naplánováno od';
COMMENT ON COLUMN raynet_zamerovaci.naplanovano_do IS 'Naplánováno do';
COMMENT ON COLUMN raynet_zamerovaci.trvani IS 'Trvání';
COMMENT ON COLUMN raynet_zamerovaci.predmet IS 'Předmět';
COMMENT ON COLUMN raynet_zamerovaci.ucastnici IS 'Účastníci';
COMMENT ON COLUMN raynet_zamerovaci.zamerovac IS 'Zaměřovač';
COMMENT ON COLUMN raynet_zamerovaci.zamerovac_c_1 IS 'Zaměřovač č.1';
COMMENT ON COLUMN raynet_zamerovaci.zamerovac_c_2 IS 'Zaměřovač č.2';
COMMENT ON COLUMN raynet_zamerovaci.zamerovac_c_3 IS 'Zaměřovač č.3';
COMMENT ON COLUMN raynet_zamerovaci.zamerovacu IS 'Zaměřovačů';
COMMENT ON COLUMN raynet_zamerovaci.pocet_hodin_zamereni IS 'Počet hodin zaměření';
COMMENT ON COLUMN raynet_zamerovaci.hodin IS 'hodin';
COMMENT ON COLUMN raynet_zamerovaci.mesic IS 'měsíc';
COMMENT ON COLUMN raynet_zamerovaci.naplanovano_od_datum IS 'Naplánováno_od';
COMMENT ON COLUMN raynet_zamerovaci.mesic_datum IS 'měsic';
COMMENT ON COLUMN raynet_zamerovaci.misto_setkani IS 'Místo setkání';
COMMENT ON COLUMN raynet_zamerovaci.kraj IS 'Kraj';
COMMENT ON COLUMN raynet_zamerovaci.rok IS 'Rok';
COMMENT ON COLUMN raynet_zamerovaci.stitky IS 'Štítky';

CREATE INDEX IF NOT EXISTS idx_raynet_zamerovaci_rok_mesic
  ON raynet_zamerovaci (rok, mesic);
CREATE INDEX IF NOT EXISTS idx_raynet_zamerovaci_naplanovano_od
  ON raynet_zamerovaci (naplanovano_od);
CREATE INDEX IF NOT EXISTS idx_raynet_zamerovaci_zamerovac_c_1
  ON raynet_zamerovaci (zamerovac_c_1);

-- ---------------------------------------------------------------------------
-- Raynet OBVOLAT RMA (6 sloupců)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS raynet_obvolat_rma (
  id                      BIGSERIAL PRIMARY KEY,

  kategorie               TEXT,                 -- Kategorie
  naplanovano_od          TIMESTAMPTZ,          -- Naplánováno od
  naplanovano_do          TIMESTAMPTZ,          -- Naplánováno do
  trvani                  INTERVAL,             -- Trvání
  predmet                 TEXT,                 -- Předmět
  ucastnici               TEXT,                 -- Účastníci

  imported_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE raynet_obvolat_rma IS 'Excel list: Raynet OBVOLAT RMA';
COMMENT ON COLUMN raynet_obvolat_rma.kategorie IS 'Kategorie';
COMMENT ON COLUMN raynet_obvolat_rma.naplanovano_od IS 'Naplánováno od';
COMMENT ON COLUMN raynet_obvolat_rma.naplanovano_do IS 'Naplánováno do';
COMMENT ON COLUMN raynet_obvolat_rma.trvani IS 'Trvání';
COMMENT ON COLUMN raynet_obvolat_rma.predmet IS 'Předmět';
COMMENT ON COLUMN raynet_obvolat_rma.ucastnici IS 'Účastníci';

CREATE INDEX IF NOT EXISTS idx_raynet_obvolat_rma_naplanovano_od
  ON raynet_obvolat_rma (naplanovano_od);

-- ---------------------------------------------------------------------------
-- Raynet PREJEZDY (14 sloupců – bez pivot tabulek vpravo)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS raynet_prejezdy (
  id                      BIGSERIAL PRIMARY KEY,

  kategorie               TEXT,                 -- Kategorie
  cas_od                  TIMESTAMPTZ,          -- Čas od
  cas_do                  TIMESTAMPTZ,          -- Čas do
  trvani                  TIME,                 -- Trvání (doba jízdy)
  predmet                 TEXT,                 -- Předmět (z Raynet API = title)
  technik                 TEXT,                 -- Technik
  hodiny                  NUMERIC(10, 2),       -- Hodiny
  naplanovano_od          DATE,                   -- Naplánováno od
  naplanovano_do          DATE,                   -- Naplánováno do
  mesic                   SMALLINT,             -- Měsíc
  rok                     SMALLINT,             -- Rok
  tyden                   SMALLINT,             -- Týden
  mvt                     TEXT,                 -- MVT
  pocet_km_na_zakazku     NUMERIC(10, 3),       -- Počet Km na zakázku

  imported_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE raynet_prejezdy IS 'Excel list: Raynet PREJEZDY';
COMMENT ON COLUMN raynet_prejezdy.kategorie IS 'Kategorie';
COMMENT ON COLUMN raynet_prejezdy.cas_od IS 'Čas od';
COMMENT ON COLUMN raynet_prejezdy.cas_do IS 'Čas do';
COMMENT ON COLUMN raynet_prejezdy.trvani IS 'Trvání';
COMMENT ON COLUMN raynet_prejezdy.predmet IS 'Předmět';
COMMENT ON COLUMN raynet_prejezdy.technik IS 'Technik';
COMMENT ON COLUMN raynet_prejezdy.hodiny IS 'Hodiny';
COMMENT ON COLUMN raynet_prejezdy.naplanovano_od IS 'Naplánováno od';
COMMENT ON COLUMN raynet_prejezdy.naplanovano_do IS 'Naplánováno do';
COMMENT ON COLUMN raynet_prejezdy.mesic IS 'Měsíc';
COMMENT ON COLUMN raynet_prejezdy.rok IS 'Rok';
COMMENT ON COLUMN raynet_prejezdy.tyden IS 'Týden';
COMMENT ON COLUMN raynet_prejezdy.mvt IS 'MVT';
COMMENT ON COLUMN raynet_prejezdy.pocet_km_na_zakazku IS 'Počet Km na zakázku';

CREATE INDEX IF NOT EXISTS idx_raynet_prejezdy_rok_mesic
  ON raynet_prejezdy (rok, mesic);
CREATE INDEX IF NOT EXISTS idx_raynet_prejezdy_technik
  ON raynet_prejezdy (technik);
CREATE INDEX IF NOT EXISTS idx_raynet_prejezdy_cas_od
  ON raynet_prejezdy (cas_od);

COMMIT;
