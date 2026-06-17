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

-- name: UpdateDeploymentSnapshot :exec
-- Used post-Discard to refresh the baseline's snapshot to reflect the
-- now-current rows (which have new updated_at timestamps from the writes,
-- even though their content matches the original snapshot). Keeps the
-- frontend's hasChanges gate in sync after a discard.
UPDATE deployments
   SET snapshot = $2
 WHERE id = $1;

-- name: RecordRollout :exec
-- Records the k8s pod-template-hash a deployment produced for a resource, so
-- later events on that rollout's RS/Pods can be attributed to the deployment.
INSERT INTO deployment_rollouts (deployment_id, resource_id, pod_template_hash)
VALUES ($1, $2, $3)
ON CONFLICT (deployment_id, resource_id)
DO UPDATE SET pod_template_hash = EXCLUDED.pod_template_hash;

-- name: FindDeploymentByRollout :one
-- Resolves a (resource, pod-template-hash) pair to the deployment that created
-- it. Newest wins when a hash was reused (rollback onto a retained RS).
SELECT deployment_id
  FROM deployment_rollouts
 WHERE resource_id = $1 AND pod_template_hash = $2
 ORDER BY created DESC
 LIMIT 1;

-- name: GetRolloutHash :one
-- Resolves a (deployment, resource) pair to the pod-template-hash, for scoping
-- logs to a single deployment's pods.
SELECT pod_template_hash
  FROM deployment_rollouts
 WHERE deployment_id = $1 AND resource_id = $2;
