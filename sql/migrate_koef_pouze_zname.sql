-- Ponechat jen koeficienty z Excelu (měsíce 7, 8, 9). Ostatní měsíce = prázdné.

BEGIN;

DELETE FROM koeficienty_kraje WHERE mesic NOT IN (7, 8, 9);

COMMIT;
