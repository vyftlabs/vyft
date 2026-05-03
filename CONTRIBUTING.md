# Contributing to Vyft

Thank you for your interest in contributing. This document provides guidelines for contributing to the project.

## Prerequisites

- [Node.js](https://nodejs.org/) 24+
- [pnpm](https://pnpm.io/) 10+

## Development Setup

```bash
pnpm install
```

## Commands

| Command | Description |
|---------|-------------|
| `pnpm build` | Build all packages |
| `pnpm test` | Run Nx `test` targets across packages (Playwright uses the separate `e2e` target) |
| `pnpm test:e2e` | Run Playwright (`nx run @vyft/e2e:e2e`) |
| `pnpm lint` | Run Biome lint and format checks |

Playwright uses `http://localhost:3000` as `baseURL` for `pnpm test:e2e`; run whatever serves that URL locally.

## Code Style

The project uses [Biome](https://biomejs.dev/) for formatting and linting. Run `pnpm lint` before committing. Formatting is applied automatically on save when using the Biome extension.

## Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/) for versioning and changelog generation. Use prefixes such as `feat:`, `fix:`, `docs:`, `chore:`, etc.

## Pull Request Process

1. Fork the repository and create a branch from `main`
2. Make your changes and ensure `pnpm lint` and `pnpm test` pass (run `pnpm test:e2e` when you change flows covered there)
3. Open a pull request with a clear description of the change
4. Address any review feedback

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold its standards.
