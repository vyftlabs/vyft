#!/usr/bin/env bash
# Foreground port-forwards for the in-compose k3s observability stack so
# the host-side backend (and ad-hoc curl/kubectl) can hit them at
# localhost. Lives under `pnpm dev` via tools/cluster/project.json, so nx
# manages the lifecycle and SIGINT propagates from the dev orchestrator.
set -euo pipefail

export KUBECONFIG="${KUBECONFIG:-$(pwd)/.kube/config}"

if [ ! -s "$KUBECONFIG" ]; then
  echo "cluster:forward: $KUBECONFIG missing — run 'pnpm cluster:up' first" >&2
  exit 1
fi

# Wait for services to exist before forwarding — helm-controller installs
# the obs stack asynchronously after k3s boots, so on a fresh cluster
# these may not be ready for a couple of minutes.
wait_svc() {
  local svc=$1 ns=$2 attempt=0
  until kubectl -n "$ns" get svc "$svc" >/dev/null 2>&1; do
    attempt=$((attempt + 1))
    if [ "$attempt" -gt 60 ]; then
      echo "cluster:forward: svc/$svc still missing after 5min — obs stack likely failed to install (check 'kubectl get pods -A')" >&2
      return 1
    fi
    echo "cluster:forward: waiting for svc/$svc in $ns ($attempt/60)…"
    sleep 5
  done
}

wait_svc kps-prometheus observability
wait_svc loki observability

kubectl -n observability port-forward svc/kps-prometheus 9090:9090 &
PROM_PID=$!
kubectl -n observability port-forward svc/loki 3100:3100 &
LOKI_PID=$!

trap 'kill "$PROM_PID" "$LOKI_PID" 2>/dev/null || true' EXIT INT TERM
wait
