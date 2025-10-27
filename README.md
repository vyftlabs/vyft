# Vyft

[![CI](https://github.com/vyftlabs/vyft/workflows/CI/badge.svg)](https://github.com/vyftlabs/vyft/actions)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![npm version](https://img.shields.io/npm/v/@vyft/cli.svg)](https://www.npmjs.com/package/@vyft/cli)
[![Node.js Version](https://img.shields.io/node/v/@vyft/cli.svg)](https://nodejs.org/)
[![Coverage](https://codecov.io/gh/vyftlabs/vyft/branch/main/graph/badge.svg)](https://codecov.io/gh/vyftlabs/vyft)

Self-host without the hassle. Building the complete open source toolkit for startups and developers.

## Installation

```bash
npm install -g @vyft/cli
```

## Deploy

```bash
vyft deploy
```

## What is Vyft?

Vyft is an open source, all-in-one infrastructure toolkit designed to make self-hosting applications as easy and fast as possible. You can deploy any app in less than 5 minutes while maintaining full control over your infrastructure.

Our mission is to empower startups and developers with everything needed to seamlessly run and manage software on your own servers. No need for a platform as a service, and no compromises on developer experience.

## CLI Commands

### Core Commands

```bash
vyft help                   # Show help information
vyft --version              # Show version
```

### Provider Management

```bash
vyft provider add           # Add a new cloud provider
vyft provider list          # List configured providers
vyft provider remove        # Remove a cloud provider
```

### Cluster Management

```bash
vyft cluster add            # Add a new Kubernetes cluster
vyft cluster list           # List configured clusters
vyft cluster use            # Set the current active cluster
vyft cluster current        # Show the current active cluster
vyft cluster remove         # Remove a cluster
vyft cluster scale          # Scale cluster up or down
```

### Infrastructure Access

```bash
vyft ssh                    # SSH into cluster nodes
```

## Development

```bash
git clone https://github.com/vyftlabs/vyft.git
cd vyft
pnpm install
pnpm dev
```

## License

AGPL v3 - Use freely, but keep it open source.

---

**Made with ❤️ in Sweden**
