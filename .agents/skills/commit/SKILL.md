---
name: commit
description: Organize all current uncommitted changes into atomic, logically grouped conventional commits. Use when the user asks to split work into commits, clean up local history, or create local commits without pushing.
---

# Atomic Commit

Organize all current uncommitted changes into atomic, logically grouped commits using conventional commits.

## Steps

1. Run `git status` and `git diff` (staged + unstaged) to understand all changes.
2. Analyze the changes and group them into logical units — each commit should represent one coherent change (e.g. a single feature, fix, refactor, or config change).
3. For each group, stage only the relevant files and create a commit.
4. Use conventional commit format: `<type>(<scope>): <description>`
   - **Types**: `feat`, `fix`, `docs`, `chore`, `ci`, `refactor`, `test`, `perf`
   - **Scopes**: package name without `@vyft/` prefix (e.g. `engine`, `store`, `core`, `std`). Omit scope for repo-wide changes.
5. Keep commit messages concise — focus on the "why", not the "what".
6. Run `git log --oneline -n <count>` after to show the resulting commits.

## Rules

- Never combine unrelated changes in a single commit.
- Prefer more granular commits over fewer large ones.
- Config/tooling changes go in their own commit.
- Test changes go with the code they test, unless they are standalone test additions.
- Do not push — only create local commits.
- Never include "Co-Authored-By" trailers in commit messages.
