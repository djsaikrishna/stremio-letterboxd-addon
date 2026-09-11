-- Migration: 007_create_subscriptions
-- Create subscriptions table to store billing state for paid features
-- One row per user reflecting the current state of their paid subscription,
-- kept in sync by the billing webhook. See docs/adr/0001-entitlement-computation.md.

CREATE TABLE IF NOT EXISTS subscriptions (
    user_id TEXT PRIMARY KEY REFERENCES users(id),
    provider_subscription_id TEXT NOT NULL UNIQUE,
    variant_id TEXT NOT NULL,
    status TEXT NOT NULL,
    current_period_end TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_provider_id ON subscriptions(provider_subscription_id);
