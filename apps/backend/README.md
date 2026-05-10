# Backend

Go backend that embeds the web build output and serves it statically.

## Local

```bash
pnpm nx run @vyft/backend:dev
```

## Live Reload

Install Air once:

```bash
go install github.com/air-verse/air@latest
```

Then run:

```bash
air -c .air.toml
```

## Docker

```bash
docker build -f apps/backend/Dockerfile -t vyft-backend .
docker run --rm -p 8080:8080 vyft-backend
```

The service listens on `:8080` by default. Set `ADDR` to override it.

## Kubernetes runtime

Deployments are reconciled against a real cluster when the backend can find
kube credentials. Resolution order:

1. `KUBECONFIG=/path/to/kubeconfig` env var → external cluster.
2. In-cluster service account (running as a Pod).
3. Neither → falls back to `StubRuntime` (records calls, no cluster I/O).

```bash
export KUBECONFIG=$HOME/.kube/config
pnpm nx run @vyft/backend:dev
```

The backend creates one namespace per `(project, environment)`:
`vyft-<projectSlug>-<envSlug>`. Project deletion deletes every namespace
labeled `vyft.dev/project=<slug>` (best-effort, async).

## Tests

```bash
go test ./...
```

Golden YAML tests for the k8s build live in
`internal/runtime/k8s/testdata/`. Regenerate with:

```bash
go test ./internal/runtime/k8s/... -update
```

End-to-end tests against `envtest` (kube-apiserver in-process) are deferred
until the envtest binaries are installed; track separately.
