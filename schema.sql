-- Qwui D1-Datenbankschema
-- Ein generischer Key-Value-Speicher, der exakt die bisherige window.storage-API
-- abbildet (get/set/delete/list mit key + shared-Flag). Dadurch bleibt die gesamte
-- bestehende App-Logik (Firma, Kunden, Quittungen) unverändert — nur der Speicherort
-- wechselt vom Browser-localStorage in eine echte, zentrale Datenbank.

CREATE TABLE IF NOT EXISTS kv_store (
  full_key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_kv_store_prefix ON kv_store(full_key);
