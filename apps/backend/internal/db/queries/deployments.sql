-- name: GetDeployment :one
SELECT * FROM deployments WHERE id = $1;

-- name: GetActiveDeployment :one
-- The unique partial index guarantees at most one row.
SELECT * FROM deployments
 WHERE project_id = $1
   AND status IN ('pending', 'applying');

-- name: GetLatestDeployment :one
SELECT * FROM deployments
 WHERE project_id = $1
 ORDER BY seq DESC
 LIMIT 1;

-- name: ListDeploymentsByProject :many
SELECT * FROM deployments
 WHERE project_id = $1
 ORDER BY seq DESC
 LIMIT $2 OFFSET $3;

-- name: CreateDeployment :one
-- seq is NULL on insert; the BEFORE INSERT trigger assigns it under the
-- per-project advisory lock.
INSERT INTO deployments (id, project_id, status, status_message, payload, checksum)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: UpdateDeploymentStatus :one
UPDATE deployments
   SET status = $2, status_message = $3
 WHERE id = $1
RETURNING *;

-- name: MarkDeploymentApplied :one
UPDATE deployments
   SET status = 'applied', applied = NOW(), status_message = NULL
 WHERE id = $1
RETURNING *;

-- name: MarkDeploymentFailed :one
UPDATE deployments
   SET status = 'failed', status_message = $2
 WHERE id = $1
RETURNING *;
