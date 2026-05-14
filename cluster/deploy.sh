#!/usr/bin/env bash
# Full-stack local: kind cluster + observability + postgres + vyft, all in
# one script. Builds the vyft image from this checkout, loads it into kind,
# applies manifests, port-forwards :8080 so the UI is reachable on localhost.
set -euo pipefail

CLUSTER=vyft
IMAGE=vyft:dev
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${DIR}/.." && pwd)"
KUBECONFIG_PATH="${ROOT}/.kube/config"

cd "${ROOT}"

# ─── 1. kind cluster ──────────────────────────────────────────────────────
if ! kind get clusters | grep -q "^${CLUSTER}$"; then
  kind create cluster --config "${DIR}/kind.yaml"
fi
mkdir -p "${ROOT}/.kube"
kind get kubeconfig --name "${CLUSTER}" > "${KUBECONFIG_PATH}"
chmod 644 "${KUBECONFIG_PATH}"

export KUBECONFIG="${KUBECONFIG_PATH}"
kubectl cluster-info

# ─── 2. observability stack (prom, loki, beyla) ──────────────────────────
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts >/dev/null 2>&1 || true
helm repo add grafana https://grafana.github.io/helm-charts >/dev/null 2>&1 || true
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

# ─── 3. build vyft image + load into kind ────────────────────────────────
docker build -f apps/backend/Dockerfile -t "${IMAGE}" .
kind load docker-image "${IMAGE}" --name "${CLUSTER}"

# ─── 4. apply vyft manifests + rollout ───────────────────────────────────
kubectl apply -f "${DIR}/manifests/vyft.yaml"
# Same-tag reloads don't trigger a pod replacement on their own. Force one
# so the new image is actually exercised.
kubectl -n vyft-system rollout restart deploy/vyft
kubectl -n vyft-system rollout status deploy/postgres --timeout=120s
kubectl -n vyft-system rollout status deploy/vyft --timeout=180s

echo
echo "vyft ready on http://localhost:8080  (admin / admin)"
echo "ctrl-c stops the port-forward; cluster keeps running"
exec kubectl -n vyft-system port-forward svc/vyft 8080:8080
