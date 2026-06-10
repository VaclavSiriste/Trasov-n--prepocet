-- Sjednocení období podle skupin (jako číselník v Excelu)
BEGIN;

UPDATE prehled_obdobi SET od = '2026-06-15', "do" = '2026-06-21', skupina = 'MSK' WHERE lokalita = 'MSK';
UPDATE prehled_obdobi SET od = '2026-06-16', "do" = '2026-06-22', skupina = 'PR/ST+Libr' WHERE lokalita IN ('PR/ST', 'Libr');
UPDATE prehled_obdobi SET od = '2026-06-17', "do" = '2026-06-23', skupina = 'BR' WHERE lokalita = 'BR';
UPDATE prehled_obdobi SET od = '2026-06-11', "do" = '2026-06-24', skupina = 'PAR+PL+ÚST+PCE+HK'
  WHERE lokalita IN ('PCE/KH', 'PL', 'Ústí');

COMMIT;
