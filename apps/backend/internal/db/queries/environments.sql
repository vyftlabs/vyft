-- name: GetEnvironment :one
SELECT * FROM environments WHERE id = $1;

-- name: GetEnvironmentBySlug :one
SELECT * FROM environments
 WHERE project_id = $1 AND slug = $2;

-- name: ListEnvironmentsByProject :many
SELECT * FROM environments
 WHERE project_id = $1
 ORDER BY created;

-- name: CreateEnvironment :one
INSERT INTO environments (id, project_id, slug)
VALUES ($1, $2, $3)
RETURNING *;

-- name: DeleteEnvironment :exec
DELETE FROM environments WHERE id = $1;
