# Contributing to Vyft

Thank you for your interest in contributing. This document provides guidelines for contributing to the project.

## Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 10+

## Development Setup

```bash
pnpm install
```

## Commands

| Command | Description |
|---------|-------------|
| `pnpm build` | Build all packages |
| `pnpm test` | Run tests for all packages |
| `pnpm lint` | Run Biome lint and format checks |

## Code Style

The project uses [Biome](https://biomejs.dev/) for formatting and linting. Run `pnpm lint` before committing. Formatting is applied automatically on save when using the Biome extension.

## Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/) for versioning and changelog generation. Use prefixes such as `feat:`, `fix:`, `docs:`, `chore:`, etc.

## Pull Request Process

1. Fork the repository and create a branch from `main`
2. Make your changes and ensure `pnpm lint` and `pnpm test` pass
3. Open a pull request with a clear description of the change
4. Address any review feedback

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold its standards.
