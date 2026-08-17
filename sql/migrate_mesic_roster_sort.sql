-- Pořadí montérů v měsíční mřížce (konfigurovatelné per mesic_key)

BEGIN;

ALTER TABLE mesicni_rozpis_montazu
  ADD COLUMN IF NOT EXISTS sort_order SMALLINT NOT NULL DEFAULT 0;

COMMIT;
