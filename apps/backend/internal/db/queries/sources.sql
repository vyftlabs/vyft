-- name: GetSource :one
SELECT * FROM sources WHERE id = $1;

-- name: ListSources :many
SELECT * FROM sources ORDER BY name;

-- name: ListSourcesByDomain :many
SELECT * FROM sources WHERE domain = $1 ORDER BY name;

-- name: GetDefaultSource :one
SELECT * FROM sources WHERE domain = $1 AND is_default = true;

-- name: CountSourcesInDomain :one
SELECT COUNT(*) FROM sources WHERE domain = $1;

-- name: CreateSource :one
INSERT INTO sources (id, kind, domain, name, is_default, config, auth_encrypted)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: UpdateSource :one
UPDATE sources
   SET name = $2, config = $3, auth_encrypted = $4
 WHERE id = $1
RETURNING *;

-- name: DeleteSource :exec
DELETE FROM sources WHERE id = $1;

-- name: ClearDefaultSource :exec
-- Step 1 of promotion: clear is_default on every other row in the
-- domain. Paired w/ SetDefaultTrue under a single Go transaction so the
-- partial unique index on (domain) WHERE is_default = true doesn't fire
-- mid-row of a multi-row UPDATE.
UPDATE sources
   SET is_default = false
 WHERE domain = $1 AND id <> $2 AND is_default = true;

-- name: SetDefaultTrue :exec
-- Step 2: mark the target row as default. Must run after
-- ClearDefaultSource inside the same transaction.
UPDATE sources
   SET is_default = true
 WHERE id = $1;

-- name: UpsertProvisionedSource :one
-- Idempotent write for sources sourced from /etc/vyft/provisioning. Match
-- by name (unique) so the deterministic ID from the loader is recorded
-- on first insert and stable across restarts. is_default is left alone
-- on update so an operator's PromoteDefault choice survives reloads.
INSERT INTO sources (id, kind, domain, name, is_default, config, auth_encrypted, provisioned, editable)
VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8)
ON CONFLICT (name) DO UPDATE
  SET kind           = EXCLUDED.kind,
      domain         = EXCLUDED.domain,
      config         = EXCLUDED.config,
      auth_encrypted = EXCLUDED.auth_encrypted,
      provisioned    = true,
      editable       = EXCLUDED.editable
RETURNING *;

-- name: DeleteProvisionedSourcesNotIn :exec
-- Sync delete: drop provisioned rows whose name is absent from the
-- current config snapshot. Empty $1 (no provisioned entries in config)
-- deletes every provisioned row.
DELETE FROM sources
 WHERE provisioned = true
   AND NOT (name = ANY($1::text[]));
