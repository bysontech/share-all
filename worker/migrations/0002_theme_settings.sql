CREATE TABLE IF NOT EXISTS theme_settings (
  room_id             TEXT PRIMARY KEY,
  title               TEXT,
  message             TEXT,
  main_visual_key     TEXT,
  background_image_key TEXT,
  theme_color         TEXT,
  animation_mode      TEXT NOT NULL DEFAULT 'none',
  updated_at          INTEGER NOT NULL,
  FOREIGN KEY (room_id) REFERENCES rooms(id)
);
