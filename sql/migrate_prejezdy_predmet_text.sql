-- Pokud už máte DB vytvořenou se starým schématem (predmet NUMERIC)
ALTER TABLE raynet_prejezdy
  ALTER COLUMN predmet TYPE TEXT
  USING predmet::TEXT;
