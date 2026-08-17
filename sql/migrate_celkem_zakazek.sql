-- Ruční „Celkem zakázek“ v Přehledu po lokalitách
ALTER TABLE prehled_obdobi
  ADD COLUMN IF NOT EXISTS celkem_zakazek NUMERIC(10, 2) NOT NULL DEFAULT 0;
