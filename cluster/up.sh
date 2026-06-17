#!/usr/bin/env bash
# Bring up local kind cluster + observability stack.
set -euo pipefail

CLUSTER=vyft
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${DIR}/.." && pwd)"

if kind get clusters | grep -q "^${CLUSTER}$"; then
  if ! docker inspect -f '{{.State.Running}}' "${CLUSTER}-control-plane" 2>/dev/null | grep -q true; then
    if ! docker start "${CLUSTER}-control-plane" >/dev/null 2>&1; then
      kind delete cluster --name "${CLUSTER}"
      kind create cluster --config "${DIR}/kind.yaml"
    fi
  fi
else
  kind create cluster --config "${DIR}/kind.yaml"
fi

mkdir -p "${ROOT}/.kube"
kind get kubeconfig --name "${CLUSTER}" > "${ROOT}/.kube/config"
chmod 644 "${ROOT}/.kube/config"

kubectl --kubeconfig "${ROOT}/.kube/config" cluster-info

helm repo add prometheus-community https://prometheus-community.github.io/helm-charts >/dev/null 2>&1 || true
helm repo add grafana https://grafana.github.io/helm-charts >/dev/null 2>&1 || true
helm repo add cnpg https://cloudnative-pg.github.io/charts >/dev/null 2>&1 || true
helm repo add ot-helm https://ot-container-kit.github.io/helm-charts >/dev/null 2>&1 || true
helm repo update >/dev/null

kubectl create namespace observability --dry-run=client -o yaml | kubectl apply -f -

helm upgrade --install kps prometheus-community/kube-prometheus-stack \
  --version 76.0.0 \
  --namespace observability \
  --values "${DIR}/values-kps.yaml" \
  --wait --timeout 5m --atomic --cleanup-on-fail

helm upgrade --install loki grafana/loki-stack \
  --version 2.10.2 \
  --namespace observability \
  --values "${DIR}/values-loki.yaml" \
  --wait --timeout 5m --atomic --cleanup-on-fail

helm upgrade --install beyla grafana/beyla \
  --version 1.7.0 \
  --namespace observability \
  --values "${DIR}/values-beyla.yaml" \
  --wait --timeout 5m --atomic --cleanup-on-fail

# CloudNativePG operator + CRDs — required for postgres resources (the
# Cluster CR the backend renders). Without it, applying a Cluster 404s.
helm upgrade --install cnpg cnpg/cloudnative-pg \
  --namespace cnpg-system --create-namespace \
  --wait --timeout 5m --atomic --cleanup-on-fail

# OpsTree redis-operator + CRDs — required for redis resources (the Redis CR
# the backend renders). Without it, applying a Redis 404s.
helm upgrade --install redis-operator ot-helm/redis-operator \
  --namespace redis-operator --create-namespace \
  --wait --timeout 5m --atomic --cleanup-on-fail

echo
echo "prometheus: http://localhost:30090"
echo "loki:       http://localhost:30100"
