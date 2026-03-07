# Agent Instructions

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, commands, and conventions.

## Skills

- [commit](.agents/skills/commit/SKILL.md) — organize changes into atomic conventional commits
- [issue](.agents/skills/issue/SKILL.md) — draft and create GitHub issues

## Style

- No `as` casts — use explicit checks or proper typing
- Prefer object exports: `export const urn = { build, parse }`
- Input interfaces use `<Name>Args` convention
- Keep it simple — no over-engineering
