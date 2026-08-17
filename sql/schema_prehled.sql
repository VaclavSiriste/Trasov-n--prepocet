-- Přehled MONTÁŽE – podklady, období, koeficienty krajů

BEGIN;

CREATE TABLE IF NOT EXISTS podklady_lokality (
  lokalita    TEXT PRIMARY KEY,
  fond        NUMERIC(6, 2) NOT NULL,
  koeficient  NUMERIC(10, 6) NOT NULL DEFAULT 1
);

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

CREATE TABLE IF NOT EXISTS prehled_obdobi (
  id                  SERIAL PRIMARY KEY,
  ciselnik_id         INTEGER REFERENCES ciselnik_obdobi(id) ON DELETE SET NULL,
  od                  DATE NOT NULL,
  "do"                DATE NOT NULL,
  skupina             TEXT,
  lokalita            TEXT NOT NULL,
  objednano_ks        NUMERIC(10, 2) NOT NULL DEFAULT 0,
  celkem_zakazek      NUMERIC(10, 2) NOT NULL DEFAULT 0,
  posunout_vyrobu     TEXT NOT NULL DEFAULT 'NE',
  sort_order          SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS mesicni_rozpis_montazu (
  id                  SERIAL PRIMARY KEY,
  mesic_key           TEXT NOT NULL,
  jmeno               TEXT NOT NULL,
  target_flag         SMALLINT NOT NULL DEFAULT 0,
  destination_region  TEXT NOT NULL,
  UNIQUE (mesic_key, jmeno)
);

CREATE TABLE IF NOT EXISTS mesicni_rozpis_den (
  mesic_key           TEXT NOT NULL,
  jmeno               TEXT NOT NULL,
  datum               DATE NOT NULL,
  target_flag         SMALLINT NOT NULL DEFAULT 0,
  destination_region  TEXT NOT NULL DEFAULT 'MSK',
  PRIMARY KEY (mesic_key, jmeno, datum)
);

CREATE TABLE IF NOT EXISTS mesicni_zapis_den (
  mesic_key   TEXT NOT NULL,
  datum       DATE NOT NULL,
  collected   NUMERIC(10, 2) NOT NULL DEFAULT 0,
  reason      TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (mesic_key, datum)
);

-- Mapování lokalit -> kraje (z Excelu Přehled MONTÁŽE vzorce C21–C27)
INSERT INTO lokalita_kraje (lokalita, kraj) VALUES
  ('MSK',    'Olomoucký kraj'),
  ('MSK',    'Moravskoslezský kraj'),
  ('MSK',    'Zlínský kraj'),
  ('PR/ST',  'Hlavní město Praha'),
  ('PR/ST',  'Středočeský kraj'),
  ('PR/ST',  'Jihočeský kraj'),
  ('BR',     'Jihomoravský kraj'),
  ('BR',     'Kraj Vysočina'),
  ('PCE/KH', 'Pardubický kraj'),
  ('PCE/KH', 'Královéhradecký kraj'),
  ('PL',     'Plzeňský kraj'),
  ('Ústí',   'Ústecký kraj'),
  ('Libr',   'Liberecký kraj'),
  ('Zlín',   'Zlínský kraj'),
  ('Olomouc','Olomoucký kraj'),
  ('Vysočina','Kraj Vysočina'),
  ('České Budějovice', 'Jihočeský kraj')
ON CONFLICT DO NOTHING;

-- Koeficienty krajů z Excelu (Přehled MONTÁŽE ř. 31–43, sloupce E=7, F=8, G=9, rok 2025)
INSERT INTO koeficienty_kraje (kraj, rok, mesic, koeficient) VALUES
  ('Hlavní město Praha', 2025, 7, 1.502641), ('Hlavní město Praha', 2025, 8, 1.496767), ('Hlavní město Praha', 2025, 9, 1.446809),
  ('Jihomoravský kraj', 2025, 7, 1.618608), ('Jihomoravský kraj', 2025, 8, 1.578311), ('Jihomoravský kraj', 2025, 9, 1.369667),
  ('Kraj Vysočina', 2025, 7, 2.375), ('Kraj Vysočina', 2025, 8, 1.954545), ('Kraj Vysočina', 2025, 9, 3.0),
  ('Královéhradecký kraj', 2025, 7, 1.673171), ('Královéhradecký kraj', 2025, 8, 1.941957), ('Královéhradecký kraj', 2025, 9, 2.145385),
  ('Liberecký kraj', 2025, 7, 1.85), ('Liberecký kraj', 2025, 8, 1.79), ('Liberecký kraj', 2025, 9, 1.363636),
  ('Moravskoslezský kraj', 2025, 7, 1.775093), ('Moravskoslezský kraj', 2025, 8, 1.872298), ('Moravskoslezský kraj', 2025, 9, 1.917317),
  ('Olomoucký kraj', 2025, 7, 1.942857), ('Olomoucký kraj', 2025, 8, 1.807692), ('Olomoucký kraj', 2025, 9, 1.846154),
  ('Pardubický kraj', 2025, 7, 1.768095), ('Pardubický kraj', 2025, 8, 1.94), ('Pardubický kraj', 2025, 9, 1.875),
  ('Plzeňský kraj', 2025, 7, 1.795634), ('Plzeňský kraj', 2025, 8, 1.744247), ('Plzeňský kraj', 2025, 9, 1.541667),
  ('Středočeský kraj', 2025, 7, 1.830699), ('Středočeský kraj', 2025, 8, 1.873278), ('Středočeský kraj', 2025, 9, 1.532658),
  ('Ústecký kraj', 2025, 7, 2.221519), ('Ústecký kraj', 2025, 8, 2.043269), ('Ústecký kraj', 2025, 9, 2.15625),
  ('Zlínský kraj', 2025, 7, 1.909091), ('Zlínský kraj', 2025, 8, 2.022727), ('Zlínský kraj', 2025, 9, 1.954545),
  ('Jihočeský kraj', 2025, 7, 1.0), ('Jihočeský kraj', 2025, 8, 1.625), ('Jihočeský kraj', 2025, 9, 1.666667)
ON CONFLICT (kraj, rok, mesic) DO NOTHING;

-- 2026 – kopie 2025 jako výchozí (doplní se editací)
INSERT INTO koeficienty_kraje (kraj, rok, mesic, koeficient)
SELECT kraj, 2026, mesic, koeficient FROM koeficienty_kraje WHERE rok = 2025
ON CONFLICT (kraj, rok, mesic) DO NOTHING;

INSERT INTO podklady_lokality (lokalita, fond, koeficient) VALUES
  ('MSK',    6.5, 1.900906),
  ('PR/ST',  6.0, 1.665015),
  ('BR',     8.0, 1.766428),
  ('PCE/KH', 5.5, 1.940978),
  ('PL',     6.0, 1.744247),
  ('Ústí',   5.0, 2.043269),
  ('Libr',   6.5, 1.79),
  ('Zlín',   6.5, 2.022727),
  ('Olomouc',6.5, 1.807692),
  ('Vysočina', 8.0, 1.954545),
  ('České Budějovice', 6.0, 1.625)
ON CONFLICT (lokalita) DO NOTHING;

INSERT INTO ciselnik_obdobi (nazev, od, "do", sort_order) VALUES
  ('Červen 2026 – týden 1', '2026-06-02', '2026-06-08', 1),
  ('Červen 2026 – týden 2', '2026-06-09', '2026-06-15', 2),
  ('Červen 2026 – celý',    '2026-06-01', '2026-06-30', 3)
ON CONFLICT DO NOTHING;

INSERT INTO prehled_nastaveni (id, nastaveny_mesic, nastaveny_rok) VALUES (1, 8, 2026)
ON CONFLICT (id) DO NOTHING;

INSERT INTO prehled_obdobi (od, "do", skupina, lokalita, objednano_ks, sort_order) VALUES
  ('2026-06-15', '2026-06-21', 'MSK',              'MSK',    106, 1),
  ('2026-06-16', '2026-06-22', 'PR/ST+Libr',       'PR/ST',   29, 2),
  ('2026-06-16', '2026-06-22', 'PR/ST+Libr',       'Libr',    10, 3),
  ('2026-06-17', '2026-06-23', 'BR',               'BR',     127, 4),
  ('2026-06-11', '2026-06-24', 'PAR+PL+ÚST+PCE+HK','PCE/KH',  58, 5),
  ('2026-06-11', '2026-06-24', 'PAR+PL+ÚST+PCE+HK','PL',      27, 6),
  ('2026-06-11', '2026-06-24', 'PAR+PL+ÚST+PCE+HK','Ústí',    13, 7),
  ('2026-06-01', '2026-06-14', 'Zlín',             'Zlín',     0, 8),
  ('2026-06-01', '2026-06-14', 'Olomouc',          'Olomouc',  0, 9),
  ('2026-06-01', '2026-06-14', 'Vysočina',         'Vysočina', 0, 10),
  ('2026-06-01', '2026-06-14', 'České Budějovice', 'České Budějovice', 0, 11);

COMMIT;
