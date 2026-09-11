-- Migration: 008_add_subscription_event_timestamp
-- Track the provider's own event timestamp on each subscription row so the
-- webhook handler can discard out-of-order / replayed events instead of
-- blindly overwriting the row with whatever arrived last.

ALTER TABLE subscriptions ADD COLUMN provider_updated_at TEXT DEFAULT NULL;
