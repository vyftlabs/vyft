-- +goose Up

-- Correlates a vyft deployment to the Kubernetes rollout it produced for each
-- resource. The pod-template-hash is k8s's own per-rollout identity and is
-- embedded in ReplicaSet/Pod names, which is exactly what Events reference —
-- so events can be attributed to a deployment by parsing the hash from the
-- involved object name and looking it up here.
CREATE TABLE deployment_rollouts (
  deployment_id     UUID  NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  resource_id       UUID  NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  pod_template_hash TEXT  NOT NULL,
  created           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (deployment_id, resource_id)
);

-- Event correlation looks up by (resource, hash); newest deployment wins when a
-- hash is reused (e.g. a rollback reuses a retained ReplicaSet).
CREATE INDEX idx_deployment_rollouts_lookup
  ON deployment_rollouts (resource_id, pod_template_hash, created DESC);

-- +goose Down

DROP TABLE deployment_rollouts;
