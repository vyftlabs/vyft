# @vyft/cli

Infrastructure deployment made simple and accessible.

## Installation

```bash
npm install -g @vyft/cli
```

## Quick Start

```bash
# Initialize a new project
vyft init

# Deploy your application
vyft deploy
```

## Commands

### `vyft init`

Initialize a new Vyft project with configuration files and project structure.

### `vyft deploy`

Deploy your application to the configured infrastructure.

### `vyft provider`

Manage cloud providers (Hetzner, Kubernetes, etc.).

### `vyft cluster`

Manage deployment clusters and environments.

### `vyft ssh`

Connect to your deployed infrastructure via SSH.

## Configuration

Create a `vyft.config.ts` file in your project:

```typescript
import { defineConfig } from '@vyft/cli';

export default defineConfig({
  name: 'my-app',
  version: '1.0.0',
  description: 'My awesome application',

  infrastructure: {
    provider: 'hetzner',
    region: 'nbg1',
    size: 'cx11',
  },

  app: {
    port: 3000,
    env: {
      NODE_ENV: 'production',
    },
  },
});
```

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
