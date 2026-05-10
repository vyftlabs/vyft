-- name: ListResourceImports :many
SELECT * FROM resource_variables
 WHERE resource_id = $1 AND environment_id = $2
 ORDER BY key;

-- name: ListResourceImportsByEnv :many
SELECT * FROM resource_variables
 WHERE project_id = $1 AND environment_id = $2
 ORDER BY resource_id, key;

-- name: ListImportsOfVariable :many
SELECT * FROM resource_variables
 WHERE variable_id = $1
 ORDER BY resource_id, key;

-- name: CreateResourceVariable :one
INSERT INTO resource_variables (project_id, environment_id, resource_id, variable_id, key)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: DeleteResourceVariable :exec
DELETE FROM resource_variables
 WHERE resource_id    = $1
   AND environment_id = $2
   AND key            = $3;

-- name: DeleteAllResourceVariables :exec
DELETE FROM resource_variables WHERE resource_id = $1;
