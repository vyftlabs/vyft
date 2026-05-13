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

-- name: SetDefaultSource :exec
-- Atomically flips is_default for one row in the domain and clears it on
-- the rest. The single statement is one SQL transaction.
UPDATE sources
   SET is_default = (id = $1)
 WHERE domain = $2;
