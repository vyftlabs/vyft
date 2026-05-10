-- +goose Up
-- Store the snapshot the runtime saw at apply time on each deployment row.
-- Frontend hashes (current state | deployment.snapshot) client-side to
-- decide whether the deploy button is needed — no separate checksum
-- endpoint, no server-side hashing.
--
-- JSONB so the same shape that lands on the wire (existing list endpoints
-- for resources/routes/variables) round-trips without translation.

ALTER TABLE deployments ADD COLUMN snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

-- +goose Down
ALTER TABLE deployments DROP COLUMN snapshot;
