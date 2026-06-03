-- Add pre-generated lightweight background display columns to theme_settings
ALTER TABLE theme_settings ADD COLUMN background_display_image_key TEXT;
ALTER TABLE theme_settings ADD COLUMN background_display_mime_type TEXT;
