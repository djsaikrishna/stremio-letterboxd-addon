-- Migration: 006_add_session_epoch
-- Cut-off timestamp (unix seconds) for session tokens: any token issued before
-- it is rejected, which makes sign-out and "log out everywhere" actually revoke.

ALTER TABLE users ADD COLUMN session_epoch INTEGER NOT NULL DEFAULT 0;
