-- Add provider/external tracking columns to media_derivatives.
-- Existing rows default to provider='r2' (backward compatible).
ALTER TABLE media_derivatives ADD COLUMN provider TEXT NOT NULL DEFAULT 'r2';
ALTER TABLE media_derivatives ADD COLUMN external_id TEXT;
ALTER TABLE media_derivatives ADD COLUMN delivery_url TEXT;
ALTER TABLE media_derivatives ADD COLUMN error_message TEXT;
