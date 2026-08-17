-- Seznam montérů pro „Tým a dostupnost“ (PostgreSQL = zdroj pravdy, ne hardcoded JS)

BEGIN;

CREATE TABLE IF NOT EXISTS tym_monteru (
  id            SERIAL PRIMARY KEY,
  jmeno         TEXT NOT NULL UNIQUE,
  dostupnost    TEXT NOT NULL DEFAULT '',
  sort_order    SMALLINT NOT NULL DEFAULT 0
);

-- Výchozí montéři (stejný seznam jako server/raynet_derive.py MONTERI_SEZNAM)
INSERT INTO tym_monteru (jmeno, dostupnost, sort_order) VALUES
  ('Jaroslav Balog', '', 1),
  ('Dominik Žihala', '', 2),
  ('Mirek Truhelka', '', 3),
  ('Jakub Krejza', '', 4),
  ('Vojtěch Žihala', '', 5),
  ('Karel Vengřinovič', '', 6),
  ('Tomáš Bok', '', 7),
  ('Stanislav Ivanov', '', 8),
  ('Roman Bek', '', 9),
  ('Filip Špígl', '', 10),
  ('Viktor Heger', '', 11),
  ('Adam Blažej', '', 12),
  ('Martin Strakoš', '', 13),
  ('Vladimír Novotný', '', 14),
  ('Petr Griač', '', 15),
  ('Kamil Beneš', '', 16),
  ('Radomír Ipri', '', 17),
  ('Arnošt Mynář', '', 18),
  ('Josef Fojtík', '', 19),
  ('Rostislav Vjačka', '', 20),
  ('Milan Smutný', '', 21),
  ('Miroslav Pecháček', '', 22),
  ('David Vallo', '', 23),
  ('Jakub Bečvář', '', 24),
  ('Jiří Dvořák', '', 25),
  ('Michal Kurfiřt', '', 26),
  ('Roman Marejka', '', 27),
  ('Jan Lorenc', '', 28),
  ('Radek Smoček', '', 29),
  ('René Berger', '', 30),
  ('Martin Bursík', '', 31),
  ('Petr Orel', '', 32),
  ('David Dočkal', '', 33),
  ('Matěj Čerych', '', 34),
  ('Maksim Dziarabkin', '', 35),
  ('Denis Willert', '', 36),
  ('Vladimir Chmelík', '', 37),
  ('Norbert Bider', '', 38),
  ('Tomáš Nesvačil', '', 39),
  ('Martin Žák', '', 40),
  ('Daniel Krkoška', '', 41),
  ('Jakub Fišer', '', 42),
  ('René Rovňak', '', 43),
  ('Jan Zemčík', '', 44),
  ('Lukáš Pospíšil', '', 45),
  ('Ondřej Crha', '', 46),
  ('Radovan Tesař', '', 47),
  ('Jan Perlík', '', 48),
  ('Václav Vála', '', 49),
  ('Tomáš Stoklasa', '', 50),
  ('Pavel Čajka', '', 51),
  ('Karel Kretschmann', '', 52)
ON CONFLICT (jmeno) DO NOTHING;

COMMIT;
