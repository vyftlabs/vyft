-- name: GetRoute :one
SELECT * FROM routes WHERE id = $1;

-- name: ListRoutesByProject :many
SELECT * FROM routes WHERE project_id = $1 ORDER BY domain, path;

-- name: ListRoutesByProjectEnv :many
SELECT * FROM routes
 WHERE project_id = $1 AND environment_id = $2
 ORDER BY domain, path;

-- name: ListRoutesByResource :many
SELECT * FROM routes WHERE resource_id = $1 ORDER BY domain, path;

-- name: ListRoutesByResourceEnv :many
SELECT * FROM routes
 WHERE resource_id = $1 AND environment_id = $2
 ORDER BY domain, path;

-- name: LookupRoute :one
SELECT * FROM routes
 WHERE environment_id = $1 AND domain = $2 AND path = $3;

-- name: CreateRoute :one
INSERT INTO routes (id, project_id, environment_id, resource_id, domain, path, path_type, port, tls, config)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING *;

-- name: UpdateRoute :one
UPDATE routes
   SET domain    = $2,
       path      = $3,
       path_type = $4,
       port      = $5,
       tls       = $6,
       config    = $7
 WHERE id = $1
RETURNING *;

-- name: DeleteRoute :exec
DELETE FROM routes WHERE id = $1;
