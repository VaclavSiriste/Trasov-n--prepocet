-- Přidání lokalit: Zlín, Olomouc, Vysočina, České Budějovice
BEGIN;

INSERT INTO lokalita_kraje (lokalita, kraj) VALUES
  ('Zlín', 'Zlínský kraj'),
  ('Olomouc', 'Olomoucký kraj'),
  ('Vysočina', 'Kraj Vysočina'),
  ('České Budějovice', 'Jihočeský kraj')
ON CONFLICT DO NOTHING;

INSERT INTO podklady_lokality (lokalita, fond, koeficient) VALUES
  ('Zlín', 6.5, 2.022727),
  ('Olomouc', 6.5, 1.807692),
  ('Vysočina', 8.0, 1.954545),
  ('České Budějovice', 6.0, 1.625)
ON CONFLICT (lokalita) DO NOTHING;

INSERT INTO prehled_obdobi (od, "do", skupina, lokalita, objednano_ks, sort_order)
SELECT v.od, v.end_date, v.skupina, v.lokalita, v.objednano_ks, v.sort_order
FROM (VALUES
  ('2026-06-01'::date, '2026-06-14'::date, 'Zlín', 'Zlín', 0, 8),
  ('2026-06-01'::date, '2026-06-14'::date, 'Olomouc', 'Olomouc', 0, 9),
  ('2026-06-01'::date, '2026-06-14'::date, 'Vysočina', 'Vysočina', 0, 10),
  ('2026-06-01'::date, '2026-06-14'::date, 'České Budějovice', 'České Budějovice', 0, 11)
) AS v(od, end_date, skupina, lokalita, objednano_ks, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM prehled_obdobi p WHERE p.lokalita = v.lokalita
);

COMMIT;
