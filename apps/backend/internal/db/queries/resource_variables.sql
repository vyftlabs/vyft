-- name: ListResourceImports :many
SELECT * FROM resource_variables
 WHERE resource_id = $1
 ORDER BY key;

-- name: ListImportsOfVariable :many
SELECT * FROM resource_variables
 WHERE variable_id = $1
 ORDER BY resource_id, key;

-- name: CreateResourceVariable :one
INSERT INTO resource_variables (project_id, resource_id, variable_id, key)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: DeleteResourceVariable :exec
DELETE FROM resource_variables
 WHERE resource_id = $1 AND key = $2;

-- name: DeleteAllResourceVariables :exec
DELETE FROM resource_variables WHERE resource_id = $1;
