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
