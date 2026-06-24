CREATE TABLE IF NOT EXISTS room_feedback_counts (
  room_id    TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('ok', 'line')),
  count      INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (room_id, kind),
  FOREIGN KEY (room_id) REFERENCES rooms(id)
);
