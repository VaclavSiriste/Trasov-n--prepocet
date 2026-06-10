-- Slot montéra = sloupec v měsíčním listu (Excel může mít stejné jméno ve více blocích)

BEGIN;

ALTER TABLE mesicni_rozpis_den ADD COLUMN IF NOT EXISTS col_index SMALLINT NOT NULL DEFAULT 0;

DELETE FROM mesicni_rozpis_den;

ALTER TABLE mesicni_rozpis_den DROP CONSTRAINT IF EXISTS mesicni_rozpis_den_pkey;
ALTER TABLE mesicni_rozpis_den ADD PRIMARY KEY (mesic_key, col_index, datum);

COMMIT;
