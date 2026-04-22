CREATE TABLE IF NOT EXISTS rooms (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  passcode     TEXT,
  host_token   TEXT NOT NULL UNIQUE,
  description  TEXT,
  expires_at   INTEGER NOT NULL,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id            TEXT PRIMARY KEY,
  room_id       TEXT NOT NULL,
  nickname      TEXT NOT NULL,
  file_key      TEXT NOT NULL,
  file_type     TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  file_size     INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'visible',
  sort_order    INTEGER,
  upload_status TEXT NOT NULL DEFAULT 'pending',
  uploaded_at   INTEGER,
  created_at    INTEGER NOT NULL,
  FOREIGN KEY (room_id) REFERENCES rooms(id)
);

CREATE INDEX IF NOT EXISTS idx_posts_room_id_status_created
  ON posts(room_id, status, created_at);

CREATE TABLE IF NOT EXISTS slideshow_settings (
  room_id          TEXT PRIMARY KEY,
  interval_seconds INTEGER NOT NULL DEFAULT 5,
  show_nickname    INTEGER NOT NULL DEFAULT 1,
  order_mode       TEXT NOT NULL DEFAULT 'asc',
  updated_at       INTEGER NOT NULL,
  FOREIGN KEY (room_id) REFERENCES rooms(id)
);
