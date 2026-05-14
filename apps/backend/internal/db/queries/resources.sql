-- name: GetResource :one
SELECT * FROM resources WHERE id = $1;

-- name: GetResourceByName :one
SELECT * FROM resources WHERE project_id = $1 AND name = $2;

-- name: ListResourcesByProject :many
SELECT * FROM resources WHERE project_id = $1 ORDER BY created;

-- name: CreateResource :one
INSERT INTO resources (id, project_id, name, slug, kind, position_x, position_y, spec)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: UpdateResource :one
UPDATE resources
   SET name = $2, kind = $3, spec = $4
 WHERE id = $1
RETURNING *;

-- name: UpdateResourcePosition :exec
UPDATE resources
   SET position_x = $2, position_y = $3
 WHERE id = $1;

-- name: DeleteResource :exec
DELETE FROM resources WHERE id = $1;
