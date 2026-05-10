-- name: GetDeployment :one
SELECT * FROM deployments WHERE id = $1;

-- name: GetActiveDeployment :one
-- The unique partial index guarantees at most one row per (project, env).
SELECT * FROM deployments
 WHERE project_id     = $1
   AND environment_id = $2
   AND status IN ('pending', 'applying');

-- name: ListDeploymentsByProject :many
SELECT * FROM deployments
 WHERE project_id = $1
 ORDER BY created DESC
 LIMIT $2 OFFSET $3;

-- name: ListDeploymentsByProjectEnv :many
SELECT * FROM deployments
 WHERE project_id     = $1
   AND environment_id = $2
 ORDER BY created DESC
 LIMIT $3 OFFSET $4;

-- name: ListActiveDeployments :many
-- Boot recovery: re-fire goroutines for deployments stuck in pending/applying.
SELECT * FROM deployments
 WHERE status IN ('pending', 'applying')
 ORDER BY created;

-- name: CreateDeployment :one
INSERT INTO deployments (id, project_id, environment_id, status, snapshot)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: UpdateDeploymentStatus :one
UPDATE deployments
   SET status = $2,
       error  = $3
 WHERE id = $1
RETURNING *;

-- name: MarkDeploymentApplied :one
UPDATE deployments
   SET status = 'applied',
       applied = NOW(),
       error = NULL
 WHERE id = $1
RETURNING *;

-- name: MarkDeploymentFailed :one
UPDATE deployments
   SET status = 'failed',
       error  = $2
 WHERE id = $1
RETURNING *;
