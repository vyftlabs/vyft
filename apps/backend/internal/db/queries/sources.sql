-- name: GetSource :one
SELECT * FROM sources WHERE id = $1;

-- name: ListSources :many
SELECT * FROM sources ORDER BY name;

-- name: CreateSource :one
INSERT INTO sources (id, kind, name, config, auth_encrypted)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: UpdateSource :one
UPDATE sources
   SET name = $2, config = $3, auth_encrypted = $4
 WHERE id = $1
RETURNING *;

-- name: DeleteSource :exec
DELETE FROM sources WHERE id = $1;

-- name: GetSourceDefault :one
SELECT s.*
  FROM source_defaults d
  JOIN sources s ON s.id = d.source_id
 WHERE d.domain = $1;

-- name: SetSourceDefault :exec
INSERT INTO source_defaults (domain, source_id)
VALUES ($1, $2)
ON CONFLICT (domain) DO UPDATE
   SET source_id = EXCLUDED.source_id,
       updated = NOW();

-- name: DeleteSourceDefault :exec
DELETE FROM source_defaults WHERE domain = $1;
