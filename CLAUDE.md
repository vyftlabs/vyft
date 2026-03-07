# Claude Code Instructions

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, commands, and conventions.

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/). Format: `<type>(<scope>): <description>`

Types: `feat`, `fix`, `docs`, `chore`, `ci`, `refactor`, `test`, `perf`

Scopes: package name without `@vyft/` prefix (e.g. `engine`, `store`, `core`, `std`). Omit scope for repo-wide changes.

Examples:
- `feat(engine): add recursive diff support`
- `fix(store): release lock on open failure`
- `ci: remove NPM_TOKEN from release workflow`
- `chore: update dependencies`

## Project Structure

- Monorepo managed with **pnpm** and **nx**
- Build: `pnpm build` or `npx nx build <project>`
- Test: `pnpm test` or `node --test 'src/**/*.test.ts'`
- Lint: `pnpm lint` (Biome)

## Style

- No `as` casts — use explicit checks or proper typing
- Prefer object exports: `export const urn = { build, parse }`
- Input interfaces use `<Name>Args` convention
- Keep it simple — no over-engineering
