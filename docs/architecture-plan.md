# Package Architecture Plan

## Goal

Restructure the monorepo so that:
1. `core` wraps engine + store as the integration layer users import from
2. `primitives` is contracts only (types, validation, symbols)
3. Resource constructors are pure functions with no side effects
4. Each package owns the code that belongs to it

## Package Graph

```
errors      (leaf — no deps)
logger      (leaf — no deps)
primitives  → errors
store       → errors

engine   → primitives + store + logger
runtime  → primitives + logger

core     → primitives + engine + store + logger + errors
vyft     → core + runtime

provider → primitives
recipes  → core + std
platform → primitives
```

Other packages (`@vyft/hcloud`, `@vyft/e2e`, etc.) import from `@vyft/core` — no change needed since core re-exports everything.

No cycles. Errors and logger are true leaves. Primitives and store depend only on errors.

## Errors

`@vyft/errors` — generic error base categories. Zero deps.

```typescript
// generic base categories
export class VyftError extends Error {}
export class ValidationError extends VyftError {}
export class TimeoutError extends VyftError {}
export class NotFoundError extends VyftError {}

// type guards
export function isVyftError(e: unknown): e is VyftError { ... }
export function isValidationError(e: unknown): e is ValidationError { ... }
```

Packages extend with domain-specific errors:

```typescript
// @vyft/store
import { VyftError } from "@vyft/errors";
export class StateError extends VyftError {}
export class LockError extends StateError {}

// @vyft/core
import { VyftError } from "@vyft/errors";
export class CliError extends VyftError {}
```

Every layer can throw and validate — store validates WAL entries on disk, engine validates graphs, primitives validates IDs/cron/ports, runtime validates configs, CLI validates user input. All use `ValidationError` from `@vyft/errors`.

CLI catches all expected errors with one check: `isVyftError(e)`.

## Logger

`@vyft/logger` — own leaf package, zero deps. Every package can import it for debug/info/warn/error logging.

Why its own package: logging is needed everywhere for debugging — store (lock acquire/release, WAL writes), engine (transform diffs, apply dispatches), runtime (image builds, container ops), core (config loading). It can't live in core because store and engine are below core. It doesn't belong in primitives (unrelated to resource types).

### API

```typescript
interface Logger {
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  child(name: string): Logger;
  span(name: string): Span;
}

interface Span extends Logger, Disposable {
  end(): void;
  [Symbol.dispose](): void; // calls end()
}
```

### Scoped loggers

`logger` is the root. `.child(name)` creates scoped loggers. Scopes chain and appear in output for traceability and filtering.

```typescript
import { logger } from "@vyft/logger";

// package-level
const log = logger.child("store");
log.info("state loaded");           // 14:23:05.123 inf [store] state loaded

// subsystem
const lockLog = log.child("lock");
lockLog.info("acquired");           // 14:23:05.124 inf [store:lock] acquired
```

Each package creates `logger.child("package-name")` at module level. Subsystems chain further.

### Spans

Spans are child loggers that track timing. They implement `Disposable` — use the `using` keyword for automatic cleanup:

```typescript
const log = logger.child("engine");

{
  using span = log.span("deploy");
  span.info("starting");

  {
    using op = span.span("apply:data");
    op.info("creating volume");
  }

  {
    using op = span.span("apply:api");
    op.info("building image");
  }
}
```

No manual `.end()` needed. Spans auto-close when the scope exits. Works with `async using` for async operations.

### Output format

Unicode box-drawing characters for span nesting. Scopes are dimmed, durations on close:

```
14:23:05.123 inf ┌ engine:deploy
14:23:05.123 inf │ starting
14:23:05.124 inf │ ┌ apply:data
14:23:05.124 inf │ │ creating volume
14:23:05.274 inf │ └ apply:data (150ms)
14:23:05.275 inf │ ┌ apply:api
14:23:05.275 inf │ │ building image
14:23:07.075 inf │ └ apply:api (1.8s)
14:23:07.076 inf └ engine:deploy (1.95s)
```

Regular (non-span) child logger messages use the scope as prefix:

```
14:23:05.123 inf [store] state loaded
14:23:05.124 inf [store:lock] acquired
14:23:05.125 wrn [store:lock] stale lock found
```

### Configuration

- `LOG_LEVEL` env var — debug/info/warn/error/silent (default: info)
- `NO_COLOR` env var — disables color output
- TTY detection — color only when writing to a terminal
- Levels: debug=dim, info=cyan, warn=yellow, error=red
- Streams: warn/error → stderr, debug/info → stdout

## Resource Collection Model

### Current system (two collection mechanisms)

1. **Global collector** (`core/collector.ts`) — stack-based. Constructors call `currentCollector()?.push(v)`. Used by `resource()` composites and `provider/builder.ts`.
2. **Engine graph traversal** (`engine/graph.ts` `collect()`) — walks a value tree recursively, discovers resources by `kind` property. Already used for top-level collection.

`loadConfig()` returns the raw module. Engine's `collect(module)` walks it to find all resources. The global collector is only needed for composites and providers.

### New system (explicit only)

Remove the global collector entirely. Engine's `collect()` in graph.ts is the sole discovery mechanism.

**Top level** — `loadConfig()` returns the raw module, engine's `collect()` walks the entire module object recursively and discovers resources by `kind`. Named or default exports both work — no change from how it currently works:

```typescript
// vyft.config.ts — named exports (current pattern)
export const v = volume("data");
export const api = service("api", {
  image: "node:20",
  mounts: [{ source: v, path: "/data" }],
});

// inline resources discovered via config references
export const api = service("api", {
  mounts: [{ source: volume("data"), path: "/data" }],
});
// engine finds the volume by walking api.config.mounts
```

Engine's `collect()` already finds resources by walking the value tree. No change needed at this level.

**Composites** — `resource()` returns children in `[INTERNAL].resources`:

```typescript
// current: children auto-registered via global collector
const bucket = resource("bucket", (id, opts) => {
  const svc = service("minio", { ... });
  const init = job("init", { dependsOn: [svc] });
  return { outputs: { endpoint: svc.url }, ready: init[INTERNAL].ready };
});

// new: children listed explicitly
const bucket = resource("bucket", (id, opts) => {
  const svc = service("minio", { ... });
  const init = job("init", { dependsOn: [svc] });
  return {
    resources: [svc, init],
    outputs: { endpoint: svc.url },
    ready: init[INTERNAL].ready,
  };
});
```

Engine's `collect()` updated to check `[INTERNAL].resources` on composite objects and include those children.

**Providers** — currently `builder.ts` creates a ProviderResource and pushes to collector, then returns a separate output proxy. The proxy and the ProviderResource are different objects — engine can't discover the ProviderResource from the proxy alone.

Fix: extend the existing `[INTERNAL]` on the proxy. Currently the proxy returns a ResourceDefinition for `[INTERNAL]`. Change it to return `{ definition, resource: providerResource }`. Engine's `collect()` checks `obj[INTERNAL]?.resource` on any object it walks — consistent with how composites use `[INTERNAL].resources`.

**Lifecycle hooks** — `beforeDelete` in composites (e.g., bucket cleanup job) currently creates resources inside a callback that auto-register via collector. With explicit model, lifecycle hooks return resource arrays:

```typescript
return {
  resources: [svc, init],
  outputs: { endpoint: svc.url },
  ready: init[INTERNAL].ready,
  beforeDelete: () => [
    job("cleanup", { image: "minio/mc", dependsOn: [svc], ... }),
  ],
};
```

Engine calls the hook, gets resources back, includes them in the destroy plan. Explicit, extensible to future hooks (afterDelete, beforeCreate, etc.).

### What this eliminates

- `collector.ts` (collect, currentCollector, currentParent) — deleted
- `currentCollector()?.push(v)` in every constructor — removed
- `currentParent()` auto-scoping — use explicit `{ parent: id }` option
- Global mutable state — gone

## Env Resolution

### Current system

Two separate mechanisms:
1. `resolve.ts` — `resolveEnv(env, secretsMap)` takes a pre-built secrets map. Used by runtime (6 call sites) and dev/local modes.
2. `apply.ts` — `resolveInput(input, resolve)` takes a `resolve(urn, key)` closure. Used by the apply pipeline.

### New system

One mechanism: `resolve(urn: URN, key: string) => unknown`. The CLI builds this closure over store state + passphrase:

```typescript
const resolve = (urn, key) => {
  const rs = store.state.get(urn);
  if (!rs) throw new Error(`Resource ${urn} not found`);
  const value = rs.outputs[key];
  if (rs.sensitive?.includes(key)) return decrypt(value, passphrase);
  return value;
};
```

- **Runtime**: `resolveEnv` calls removed. apply() resolves env before dispatching. Runtime receives plain strings.
- **Dev/local modes**: build a synthetic state map (from dev secrets), use the same `resolve(urn, key)` pattern.
- **`resolve.ts`**: deleted. `resolveCompat` deleted. The `resolve(urn, key)` closure is built at the call site, not in a shared module.

## What Lives Where

### @vyft/errors (leaf — no deps)

Generic error base categories and type guards:
- `VyftError`, `ValidationError`, `TimeoutError`, `NotFoundError`
- `isVyftError()`, `isValidationError()`, etc.

### @vyft/logger (leaf — no deps)

From current `core/src/`:
- `logger.ts` — rewritten with Logger/Span interfaces, child(), span(), box-drawing output

Exported as `@vyft/logger` (replaces `@vyft/core/logger` import path).

### @vyft/primitives (errors)

Contracts only. Pure types, validation, symbols, refs. No constructors, no IO.

From current `core/src/`:
- `resource.ts` — Resource types (Service, Volume, CronJob, Job, Variable, ProviderResource), config types (ServiceConfig, VolumeConfig, etc.), INTERNAL/MOUNTABLE symbols, validation (validateId, validateCron, validateRoute, validateDuration) — validation throws `ValidationError` from `@vyft/errors`
- `primitives.ts` — Binding, BindValue, SecretOutput, VariableOptions
- `ref.ts` — EnvValue, Reference, VariableRef, OutputRef, Interpolation, SecretRef, interpolate, isReference, isInterpolation

### @vyft/store (errors)

State persistence. Owns the identity system and state schema.

Keeps:
- `store.ts` — Store class (open, append, checkpoint, dispose)
- `wal.ts` — WALog, replay()
- `state-store.ts` — StateStore (disk read/write)
- `lock.ts` — Lock, LockError (extends StateError extends VyftError)
- `encrypt.ts` — encrypt/decrypt
- `passphrase.ts` — resolvePassphrase

Moves in from `core/src/`:
- `urn.ts` — URN type, buildURN, parseURN
- `state.ts` — ResourceState, State (Map<URN, ResourceState>), WALEntry

Domain errors:
- `StateError extends VyftError` — state corruption, inconsistency
- `LockError extends StateError` — lock contention

### @vyft/engine (primitives + store + logger)

Diffing, planning, execution, graph traversal. Pure logic (no IO).

Keeps:
- `transform.ts` — transform() builder, hydrate()
- `apply.ts` — apply(op, dispatcher, resolve), Dispatcher, Resolve types
- `plan.ts` — plan(), resourceURN(), fingerprint, serializeConfig, resourceReplacer, Change, StateEntry types (merged from core's plan.ts)
- `graph.ts` — buildGraph, collect (graph traversal that discovers resources), collectBindings
- `order.ts` — levels(), order()
- `validate.ts` — validate(), checkDuplicateIds()
- `deploy.ts` — deploy()
- `execute.ts` — execute()

Moves in from `core/src/`:
- `plan.ts` contents (fingerprint, serializeConfig, etc.) — merged into engine's existing `plan.ts`
- `diff.ts` — changedFields, hasSpecChange, NON_SPEC_FIELDS

Changes:
- `graph.ts` `collect()` updated to discover:
  - Composite children via `[INTERNAL].resources`
  - Provider resources via `[INTERNAL].resource`
  - Lifecycle hook resources via calling `beforeDelete()` etc. at plan time
- Import `Resource`, `INTERNAL`, `MOUNTABLE` etc. from `@vyft/primitives`
- Import `URN`, `State`, `ResourceState`, `WALEntry` from `@vyft/store`
- Import logging from `@vyft/logger`

### @vyft/runtime (primitives + logger)

Runtime implementations (docker, swarm, kubernetes). Owns everything runtime-specific.

Keeps:
- `docker/`, `swarm/`, `kubernetes/` — service builders, cronjob builders, inspect, plans
- `contracts.ts`, `init.ts`

Moves in from `core/src/`:
- `runtime.ts` — Runtime, RuntimeOptions, ExtendedRuntime, Operation types
- `runtime-states.ts` — RuntimeServiceState, RuntimeVariableState, RuntimeCronJobState, RuntimeVolumeState
- `duration.ts` — durationToMs, durationToNanos, durationToSeconds, nanosToDigits
- `image.ts` — buildImage, pullImage, pushImage, imageDigest (currently uses `@vyft/railpack`)

Changes:
- `resolveEnv` calls removed (6 call sites) — runtime receives pre-resolved plain strings in env
- Imports shift from `@vyft/core` to `@vyft/primitives`
- Logger imports shift from `@vyft/core/logger` to `@vyft/logger`

### @vyft/platform (primitives or no deps)

Moves in from `core/src/`:
- `platform.ts` — PlatformBucketConfig, PlatformPostgresConfig, PlatformQueueConfig, PlatformSecretConfig, PlatformServerConfig, PlatformVolumeConfig, SSHConnection, and corresponding state types

### @vyft/core (primitives + engine + store + logger + errors)

Integration/orchestration layer. Wraps lower packages, provides constructors, config loading.

Resource constructors (move from `primitives/src/`):
- volume(), service(), cronjob(), job(), variable(), bind(), secret(), bindable()
- resource() composite function — rewritten to take explicit `resources` array, attaches to `[INTERNAL].resources`

Keeps from current `core/src/`:
- `config.ts` — findConfig, loadConfig, loadContextConfig, saveContextConfig, resolveContext, resolveStage, vyftRoot, projectInfo, RUNTIMES, RuntimeName
- `env.ts` — loadEnv, parseEnv
- `generate.ts` — generateSecret
- `client-generate.ts` — generate, writeEnv, etc.

Domain errors:
- `CliError extends VyftError` — user-facing CLI errors

Deleted:
- `resolve.ts` — replaced by `resolve(urn, key)` closures at call sites
- `collector.ts` — removed (explicit collection model)
- `errors.ts` — generic errors moved to `@vyft/errors`, CliError defined locally

Re-exports from primitives, engine, store, logger, errors for convenience (single import point).

Integration tests live here (can import Store + engine + primitives together).

### @vyft/provider (primitives)

Changes:
- `builder.ts` — remove `currentCollector()?.push(resource)`. Attach ProviderResource to proxy via `[INTERNAL]`: `{ definition, resource: providerResource }`. Engine discovers it via `obj[INTERNAL]?.resource`.
- Imports shift from `@vyft/core` to `@vyft/primitives` (for INTERNAL, OutputRef, ProviderResource types)

### @vyft/recipes (core)

Uses `resource()` and constructors from `@vyft/core`. Core re-exports primitives, so recipes only need `@vyft/core`.

Changes:
- All imports from `@vyft/core` + `@vyft/primitives` → `@vyft/core` (core re-exports everything)
- Composite resources updated to use explicit `resources` array
- `beforeDelete` callbacks return resource arrays

### @vyft/vyft (CLI) (core + runtime)

Commands import from `@vyft/core` (which re-exports primitives + engine + store). Runtime operations from `@vyft/runtime`.

Changes:
- Build `resolve(urn, key)` closure at deploy/preview/etc. and pass to apply
- Dev/local modes: build synthetic state map, use same `resolve(urn, key)` pattern
- Delete `secrets.ts` (buildSecretMap)
- Remove all `resolveEnv` / `resolveCompat` usage

## Migration Steps

### Phase 1: Create @vyft/errors

1. Create `packages/errors/` with generic error categories
2. `VyftError`, `ValidationError`, `TimeoutError`, `NotFoundError` + type guards
3. `package.json` — no deps
4. Core re-exports from `@vyft/errors` for backward compat

### Phase 2: Create @vyft/logger

1. Create `packages/logger/` — rewrite current `logger.ts` with child/span API
2. `package.json` — no deps
3. Core re-exports from `@vyft/logger` as `@vyft/core/logger` for backward compat

### Phase 3: Create primitives as contracts package

1. Move type definitions from `core/src/` to `primitives/src/`:
   - `resource.ts` (types + validation + symbols)
   - `primitives.ts` (Binding types)
   - `ref.ts` (EnvValue, refs, interpolate)
2. Update `primitives/package.json` — remove `@vyft/core`, add `@vyft/errors`
3. Temporarily have `core` re-export everything from primitives for backward compat

### Phase 4: Move URN + state into store

1. Move `urn.ts` and `state.ts` from `core/src/` to `store/src/`
2. Add domain errors: `StateError`, `LockError`
3. Update `store/package.json` — remove `@vyft/core`, add `@vyft/errors`
4. Store exports URN, buildURN, parseURN, ResourceState, State, WALEntry
5. Core re-exports from store for backward compat

### Phase 5: Update engine imports + graph traversal

1. Change engine's `@vyft/core` imports to `@vyft/primitives` + `@vyft/store` + `@vyft/logger`
2. Merge core's `plan.ts` (fingerprint, serializeConfig) into engine's existing `plan.ts`
3. Move `core/src/diff.ts` into engine
4. Update `graph.ts` `collect()` to discover:
   - Composite children via `[INTERNAL].resources`
   - Provider resources via `[INTERNAL].resource`
5. Update `engine/package.json` — depend on `@vyft/primitives` + `@vyft/store` + `@vyft/logger`, drop `@vyft/core`
6. Update engine tests — imports change to `@vyft/primitives` + `@vyft/store`

### Phase 6: Move runtime-specific code

1. Move into `runtime/src/`:
   - `core/src/runtime.ts` (types)
   - `core/src/runtime-states.ts` (types)
   - `core/src/duration.ts`
   - `core/src/image.ts` (+ `@vyft/railpack` dependency)
2. Update runtime imports from `@vyft/core` to `@vyft/primitives` + `@vyft/logger` + own files
3. Remove `resolveEnv` calls from runtime (apply resolves env now)
4. Update `runtime/package.json` — depend on `@vyft/primitives` + `@vyft/logger`, drop `@vyft/core`
5. Update runtime tests — imports change to `@vyft/primitives`

### Phase 7: Move platform types

1. Move `core/src/platform.ts` into `platform/src/`
2. Update platform imports

### Phase 8: Restructure core as integration layer

1. Move constructors from `primitives/src/` to `core/src/`:
   - volume(), service(), cronjob(), job(), variable(), bind(), secret(), bindable()
   - resource() composite
2. Rewrite resource() to accept explicit `resources` array
3. Remove constructor auto-push (`currentCollector()?.push()`)
4. Delete `collector.ts`
5. Delete `resolve.ts`
6. Delete `errors.ts` (replaced by `@vyft/errors` + local CliError)
7. Update `core/package.json` — add `@vyft/primitives`, `@vyft/engine`, `@vyft/store`, `@vyft/logger`, `@vyft/errors` as deps. Remove `@vyft/railpack`.
8. Set up re-exports from all sub-packages
9. Remove backward-compat re-exports added in earlier phases
10. Move integration tests here

### Phase 9: Update provider

1. Remove `currentCollector()?.push(resource)` from builder.ts
2. Extend `[INTERNAL]` on proxy to include `{ definition, resource: providerResource }`
3. Update imports to `@vyft/primitives`

### Phase 10: Update recipes

1. Import everything from `@vyft/core` (core re-exports primitives)
2. Update composite resources to use explicit `resources` array
3. Update `beforeDelete` callbacks to return resource arrays

### Phase 11: Update CLI

1. Build `resolve(urn, key)` closure and pass to apply
2. Migrate dev/local modes to use `resolve(urn, key)` with synthetic state
3. Delete `secrets.ts` (buildSecretMap)
4. Remove all `resolveEnv` / `resolveCompat` usage
5. Remove any remaining dead code
6. Update test imports

## Package.json Changes

| Package | Remove deps | Add deps |
|---------|-------------|----------|
| errors | (new package) | (none — leaf) |
| logger | (new package) | (none — leaf) |
| primitives | `@vyft/core` | `@vyft/errors` |
| store | `@vyft/core` | `@vyft/errors` |
| engine | `@vyft/core`, `@vyft/primitives` | `@vyft/primitives`, `@vyft/store`, `@vyft/logger` |
| runtime | `@vyft/core` | `@vyft/primitives`, `@vyft/logger` |
| platform | `@vyft/core` | `@vyft/primitives` (if needed) |
| core | `@vyft/railpack` | `@vyft/primitives`, `@vyft/engine`, `@vyft/store`, `@vyft/logger`, `@vyft/errors` |
| provider | `@vyft/core` | `@vyft/primitives` |
| recipes | `@vyft/primitives` | (keeps `@vyft/core` + `@vyft/std`) |
| vyft | (no change) | (no change — imports from core) |

Note: `@vyft/railpack` dependency moves from core to runtime (with image.ts).
