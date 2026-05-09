-- name: GetRegistry :one
SELECT * FROM registries WHERE id = $1;

-- name: GetRegistryByName :one
SELECT * FROM registries WHERE name = $1;

-- name: ListRegistries :many
SELECT * FROM registries ORDER BY name;

-- name: CreateRegistry :one
INSERT INTO registries (id, name, url, username, password_encrypted)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: UpdateRegistry :one
UPDATE registries
   SET name = $2, url = $3, username = $4, password_encrypted = $5
 WHERE id = $1
RETURNING *;

-- name: DeleteRegistry :exec
DELETE FROM registries WHERE id = $1;
