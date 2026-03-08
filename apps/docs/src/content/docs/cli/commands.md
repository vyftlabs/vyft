---
title: Commands
description: Vyft CLI reference.
---

## `vyft init [name]`

Scaffold a new Vyft project. Prompts for project name, template, and options.

## `vyft deploy`

Deploy all resources defined in `vyft.config.ts`.

```bash
vyft deploy [--stage <name>] [--project <name>]
```

| Flag | Description |
|------|-------------|
| `--stage` | Deployment stage (default: `production`) |
| `--project` | Project name |

## `vyft destroy`

Tear down all deployed resources.

```bash
vyft destroy [--stage <name>] [--project <name>] [-y]
```

| Flag | Description |
|------|-------------|
| `-y, --yes` | Skip confirmation prompt |

## `vyft preview`

Preview planned changes without deploying.

```bash
vyft preview [--stage <name>] [--project <name>]
```

Output format:
```
+ urn:vyft:resource:runtime:service:app   (create)
~ urn:vyft:resource:runtime:service:api   (update)
- urn:vyft:resource:runtime:volume:data   (delete)
```

## `vyft refresh`

Sync local state with the actual runtime state by calling resource `read` handlers.

```bash
vyft refresh [--stage <name>] [--project <name>]
```

## `vyft context`

Manage deployment contexts.

```bash
vyft context list              # List all contexts
vyft context add <name>        # Add a new context
vyft context use <name>        # Switch active context
vyft context remove <name>     # Remove a context
```
