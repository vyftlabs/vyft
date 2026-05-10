-- name: GetVariable :one
SELECT * FROM variables WHERE id = $1;

-- name: ListVariablesByProject :many
SELECT * FROM variables WHERE project_id = $1 ORDER BY scope, key;

-- name: ListVariablesByProjectEnv :many
SELECT * FROM variables
 WHERE project_id = $1 AND environment_id = $2
 ORDER BY scope, key;

-- name: ListOwnedVariables :many
SELECT * FROM variables
 WHERE project_id = $1 AND environment_id = $2 AND resource_id = $3
 ORDER BY key;

-- name: GetOwnedVariableByKey :one
SELECT * FROM variables
 WHERE project_id     = $1
   AND environment_id = $2
   AND resource_id    = $3
   AND key            = $4;

-- name: CreatePlainVariable :one
INSERT INTO variables (id, project_id, environment_id, resource_id, key, value)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: CreateSecretVariable :one
INSERT INTO variables (id, project_id, environment_id, resource_id, key, value_encrypted)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: UpdateVariableKey :one
UPDATE variables SET key = $2 WHERE id = $1 RETURNING *;

-- name: UpdatePlainVariableValue :one
UPDATE variables
   SET value = $2, value_encrypted = NULL
 WHERE id = $1
RETURNING *;

-- name: UpdateSecretVariableValue :one
UPDATE variables
   SET value_encrypted = $2, value = NULL
 WHERE id = $1
RETURNING *;

-- name: DeleteVariable :exec
DELETE FROM variables WHERE id = $1;
