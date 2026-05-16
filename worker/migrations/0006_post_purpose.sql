ALTER TABLE posts ADD COLUMN post_purpose TEXT NOT NULL DEFAULT 'album';
UPDATE posts SET post_purpose = 'video' WHERE file_type = 'video';
