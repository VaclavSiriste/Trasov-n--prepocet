-- Zámek seznamu montérů per měsíc: po ruční úpravě se už nenačítají z Raynetu.

BEGIN;

CREATE TABLE IF NOT EXISTS mesicni_roster_config (
  mesic_key  TEXT PRIMARY KEY,
  configured BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
