CREATE TABLE IF NOT EXISTS models (
  slug        TEXT PRIMARY KEY,
  blob_url    TEXT NOT NULL,
  filename    TEXT NOT NULL,
  file_size   INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_models_created_at ON models (created_at);
