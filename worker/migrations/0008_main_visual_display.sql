-- Add main visual display columns to theme_settings
ALTER TABLE theme_settings ADD COLUMN main_visual_display_key TEXT;
ALTER TABLE theme_settings ADD COLUMN main_visual_display_mime_type TEXT;
