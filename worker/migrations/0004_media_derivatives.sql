CREATE TABLE IF NOT EXISTS media_derivatives (
  id         TEXT PRIMARY KEY,
  post_id    TEXT NOT NULL REFERENCES posts(id),
  type       TEXT NOT NULL,
  file_key   TEXT,
  mime_type  TEXT,
  status     TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_media_derivatives_post_id
  ON media_derivatives(post_id);
