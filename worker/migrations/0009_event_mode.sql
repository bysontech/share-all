-- Room publication mode and schedule control (Cycle 24)
ALTER TABLE rooms ADD COLUMN event_mode TEXT;            -- 'draft' | 'event_live' | 'archive' | NULL (auto)
ALTER TABLE rooms ADD COLUMN slideshow_open_at INTEGER;  -- Unix timestamp: slideshow opens / event starts
ALTER TABLE rooms ADD COLUMN slideshow_close_at INTEGER; -- Unix timestamp: slideshow closes / archive begins
ALTER TABLE rooms ADD COLUMN gallery_open_at INTEGER;    -- Unix timestamp: photo gallery access opens
ALTER TABLE rooms ADD COLUMN video_open_at INTEGER;      -- Unix timestamp: video access opens
