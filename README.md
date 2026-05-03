# Vyft

Open source platform for deploying apps. Connect a repo, pick what you want to run, and Vyft handles the rest. Self-host it on your own server, or use the hosted version.

> Early development. Things will change.

[![CI](https://github.com/vyftlabs/vyft/actions/workflows/ci.yml/badge.svg)](https://github.com/vyftlabs/vyft/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/vyftlabs/vyft)](LICENSE)

## What it does

- Deploy apps straight from a GitHub repo
- Spin up databases like Postgres and Redis
- Host static sites on a custom domain
- Run scheduled jobs and background workers
- Manage environment variables across services

## Getting started

Self-host on Kubernetes with Helm:

```bash
helm repo add vyft https://charts.vyft.dev
helm install vyft vyft/vyft -n vyft --create-namespace
```

See [vyft.dev/docs/self-host](https://vyft.dev/docs/self-host) for config.

## Docs

Guides and reference at [vyft.dev/docs](https://vyft.dev/docs).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[Apache-2.0](LICENSE)
