# @vyft/cli

[![CI](https://github.com/vyftlabs/vyft/workflows/CI/badge.svg)](https://github.com/vyftlabs/vyft/actions)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![npm version](https://img.shields.io/npm/v/@vyft/cli.svg)](https://www.npmjs.com/package/@vyft/cli)
[![Node.js Version](https://img.shields.io/node/v/@vyft/cli.svg)](https://nodejs.org/)
[![Coverage](https://codecov.io/gh/vyftlabs/vyft/branch/main/graph/badge.svg)](https://codecov.io/gh/vyftlabs/vyft)

Self-host without the hassle.

## Installation

```bash
npm install -g @vyft/cli
```

## Quick Start

```bash
vyft deploy
```

## Commands

### `vyft deploy`

Deploy your application to the cloud. Works in any project directory.

### `vyft init`

Initialize a new Vyft project (optional - for advanced configuration).

### `vyft provider`

Manage cloud providers (Hetzner, Kubernetes, etc.).

### `vyft cluster`

Manage deployment clusters and environments.

### `vyft ssh`

Connect to your deployed infrastructure via SSH.

## Development

```bash
# Clone the repository
git clone https://github.com/vyftlabs/vyft.git
cd vyft

# Install dependencies
pnpm install

# Build the CLI
pnpm build

# Run tests
pnpm test
```

## License

AGPL v3 - Commercial use allowed, commercialization prevented.

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for details.
