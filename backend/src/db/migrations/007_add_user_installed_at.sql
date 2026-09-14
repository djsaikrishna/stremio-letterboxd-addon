-- Migration: 007_add_user_installed_at
-- First manifest fetch per user. Stremio refetches the manifest constantly, so
-- the install event is only emitted when this is still NULL.

ALTER TABLE users ADD COLUMN installed_at TEXT;

-- Users already tracked as installed must not be counted again after deploy.
UPDATE users
SET installed_at = created_at
WHERE id IN (SELECT DISTINCT user_id FROM events WHERE event = 'install' AND user_id IS NOT NULL);
