-- Only registrations made by the new application opt into this cohort.
-- Historical accounts remain NULL; migration time is not instrumentation time.
ALTER TABLE users ADD COLUMN onboarding_version INTEGER;
ALTER TABLE users ADD COLUMN setup_opened_at INTEGER;
CREATE INDEX idx_events_onboarding ON events(user_id, ts) WHERE kind = 'attempt';
