# Comprehensive Fix Plan: vyft gaps vs explore

## Context

The vyft codebase was cleaned up from the explore codebase but several features were dropped or left incomplete. This plan addresses all gaps except logger and railpack (explicitly excluded).

**Corrections from initial analysis:**
- Diff handlers ARE already wired in `core/src/plan.ts:37-54` — not missing
- Client generation code exists in `core/src/client-generate.ts` — just needs CLI command
- The delete WAL bug, lack of fingerprinting, and stubbed commands are the real issues

---

## Phase 1: Critical Bug Fixes

### 1a. Delete WAL bug
**File:** `packages/core/src/apply.ts`

After a successful delete (line 52 onward), the dispatcher writes `{ type: "set" }` — it should write `{ type: "remove" }`. The store already supports remove entries (`packages/store/src/wal.ts:32-34`).

**Change:** After the `resolve()` call, branch on `change.action === "delete"`:
- Write `{ type: "remove", key: change.urn }` to store
- Emit committed event with empty output `{}`
- Return early (skip the `{ type: "set" }` path)

The pending WAL write before resolve (line 48) can stay as `set` — it records intent. Only the final commit matters.

### 1b. Fingerprinting / change detection
**Files:**
- New: `packages/engine/src/fingerprint.ts`
- Edit: `packages/engine/src/types.ts`
- Edit: `packages/engine/src/plan.ts`
- Edit: `packages/engine/src/index.ts`
- Edit: `packages/core/src/apply.ts`
- Edit: `packages/core/src/plan.ts`
- Edit: `packages/vyft/src/runtime.ts`

**Steps:**
1. Create `fingerprint.ts`: SHA-256 of `JSON.stringify(input, stableReplacer)` where `stableReplacer` recursively sorts object keys. Return hex string.
2. Add optional `fingerprint?: string` to `Entry` in `types.ts`
3. In `engine/plan.ts`: when URN exists in both desired and current, compare fingerprints. Skip update if fingerprints match. Accept optional `taintedIds?: Set<string>` — tainted URNs force update regardless of fingerprint.
4. Export `fingerprint` from `engine/index.ts`
5. In `apply.ts`: when writing the committed WAL entry for create/update, include `fingerprint: fingerprint(desired.entries[change.urn])` in the data
6. In `runtime.ts` `buildCurrentState()`: read fingerprint from stored data, set it on the Entry so it's available for next plan comparison
7. Update `core/plan.ts` to accept and forward `taintedIds` to `engine.plan()`

---

## Phase 2: Safety & Deploy Improvements

### 2a. Destroy confirmation
**File:** `packages/vyft/src/commands/destroy.ts`

- Add `.option("-y, --yes", "Skip confirmation", false)`
- Before calling `destroy()`, count resources in current state
- If `!opts.yes`, use `confirm()` from `@clack/prompts`: `Destroy ${count} resource(s)?`
- If cancelled, `process.exit(0)`

### 2b. Deploy `--refresh` flag
**File:** `packages/vyft/src/commands/deploy.ts`

- Add `.option("--refresh", "Refresh state before deploying", false)`
- After opening store but before `apply()`:
  - If `opts.refresh`, call `refresh(buildCurrentState(store), ctx)`
  - Then rebuild current: `const current = buildCurrentState(store)` (store is now updated)

### 2c. Diff `--live` flag
**File:** `packages/vyft/src/commands/diff.ts`

- Add `.option("--live", "Compare against live infrastructure", false)`
- If `opts.live`, call `refresh(current, ctx)` first, then rebuild current from store
- This reuses the existing `refresh()` which calls read handlers

---

## Phase 3: New CLI Commands

### 3a. `vyft output`
**New file:** `packages/vyft/src/commands/output.ts`

```
vyft output [--stage <name>] [--json] [--show-secrets]
```

- Open store, iterate entries with `status: "committed"`
- Display URN + output key/value pairs
- Secret values (objects with `kind: "secret"`) show `[secret]` unless `--show-secrets`
- With `--show-secrets`, decrypt via cipher
- `--json` outputs as JSON object
- Register in `packages/vyft/src/index.ts`

### 3b. `vyft variable set/get/ls/rm`
**New files:** `packages/vyft/src/commands/variable/index.ts`, `set.ts`, `get.ts`, `list.ts`, `remove.ts`

Variable URN: `urn:vyft:resource:std:variable:{name}`

- **set:** `vyft variable set <name> <value> [--secret]`
  - If `--secret`, encrypt value with cipher before storing
  - Write to store as `{ type: "set", key: urn, data: { status: "committed", input: { name }, output: { value } } }`
  - Plain values stored as-is, secret values encrypted via `cipher.encrypt()`
- **get:** `vyft variable get <name>`
  - Read from store, decrypt if encrypted, print value
- **ls:** `vyft variable ls`
  - List all variable URNs (filter by `urn:vyft:resource:std:variable:`)
- **rm:** `vyft variable rm <name>`
  - Write `{ type: "remove", key: urn }` to store

Register in `packages/vyft/src/index.ts`

### 3c. `vyft stage ls/rm`
**New files:** `packages/vyft/src/commands/stage/index.ts`, `list.ts`, `remove.ts`

Stages are directories: `.vyft/<context>/<project>/<stage>/`

- **ls:** list stage directories under `.vyft/<context>/<project>/`
- **rm:** confirm and recursively delete `.vyft/<context>/<project>/<stage>/`
- No "add" needed — stages are created implicitly by deploy

Register in `packages/vyft/src/index.ts`

### 3d. `vyft generate`
**New file:** `packages/vyft/src/commands/generate.ts`

- Import `generate` from `@vyft/core` (add export to `packages/core/src/index.ts`)
- Call `generate(process.cwd())`
- Print confirmation
- Register in `packages/vyft/src/index.ts`

### 3e. `local env <service>`
**New file:** `packages/vyft/src/commands/local/env.ts`

```
vyft local env <service> [--stage <name>]
```

- Load config, find the service entry by ID
- Extract env vars from service input
- Resolve refs against outputs of other resources in store
- Replace infra hostnames with `localhost` (reuse host replacement from Phase 5)
- Print as `KEY=value` format (quote values with special chars)
- Register in `packages/vyft/src/commands/local/index.ts`

---

## Phase 4: Local Commands & Taint

### 4a. `local up`
**File:** `packages/vyft/src/commands/local/up.ts`

Deploy infra-only services (services with `image` and no `path`).

1. Load config, classify services (infra = has image, no path)
2. Filter entries to infra services + their volume dependencies
3. Use stage `"development"`, resolve runtime provider
4. Open store, build context, run `apply(desired, current, ctx)`
5. Print started services with ports

### 4b. `local down`
**File:** `packages/vyft/src/commands/local/down.ts`

Stop all resources by deploying empty desired state.

1. Open store for development stage
2. If store empty, print "nothing running" and exit
3. Call `destroy(current, ctx)` (empty desired = delete all)
4. Print stopped count

### 4c. `local reset`
**File:** `packages/vyft/src/commands/local/reset.ts`

Down + delete all state.

1. Do everything `down` does
2. Call `store.delete()` to remove all state files
3. Print "reset complete"

### 4d. Taint mechanism
**Files:**
- `packages/core/src/plan.ts` — accept `taintedIds`, forward to engine
- `packages/core/src/apply.ts` — accept `taintedIds` in options, forward to plan
- `packages/vyft/src/commands/deploy.ts` — compute tainted set

**Computing tainted set in deploy:**
1. After building current state, collect all variable entries (URN contains `:variable:`)
2. Compare current variable values against stored variable values
3. If a variable changed, scan all resource inputs for references to that variable's URN
4. Add those resource URNs to `taintedIds`
5. Pass to `apply(desired, current, ctx, { taintedIds, onEvent })`

---

## Phase 5: Structural Improvements

### 5a. Two-phase destruction
**File:** `packages/core/src/destroy.ts`

After planning, partition delete changes by resource type:
- Runtime: services, cronjobs (delete first)
- Platform: volumes (delete second)

Use `urn.parse()` to classify. Reorder the plan steps so runtime deletes execute before platform deletes.

### 5b. Service classification utility
**New file:** `packages/vyft/src/commands/local/classify.ts`

```typescript
function classifyEntries(entries: ResourceEntry[]): {
  infra: ResourceEntry[];  // image, no path
  dev: ResourceEntry[];    // path, no image
  build: ResourceEntry[];  // both image and path
  other: ResourceEntry[];  // volumes, cronjobs, etc.
}
```

Used by `local up` (Phase 4a) and `local dev`.

### 5c. Deterministic port assignment
**Added to:** `packages/vyft/src/commands/local/classify.ts`

```typescript
function assignPort(id: string): number {
  let hash = 0;
  for (const ch of id) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  return 3000 + (Math.abs(hash) % 7000);
}
```

Collision-resistant via linear probing. Used by `local dev` and `local env`.

### 5d. Host replacement for dev mode
**Added to:** `packages/vyft/src/commands/local/classify.ts`

```typescript
function replaceInfraHosts(value: string, infraIds: Set<string>): string
```

Replace container hostnames (infra service IDs) with `localhost` in env var values. Used by `local dev` and `local env`.

---

## File Change Summary

| Phase | File | Action |
|-------|------|--------|
| 1a | `packages/core/src/apply.ts` | Fix delete to write `{ type: "remove" }` |
| 1b | `packages/engine/src/fingerprint.ts` | **New** — SHA-256 fingerprint fn |
| 1b | `packages/engine/src/types.ts` | Add `fingerprint?` to Entry |
| 1b | `packages/engine/src/plan.ts` | Add fingerprint comparison + taintedIds |
| 1b | `packages/engine/src/index.ts` | Export fingerprint |
| 1b | `packages/core/src/apply.ts` | Store fingerprint in WAL committed entry |
| 1b | `packages/core/src/plan.ts` | Accept + forward taintedIds |
| 1b | `packages/vyft/src/runtime.ts` | Read fingerprint in buildCurrentState |
| 2a | `packages/vyft/src/commands/destroy.ts` | Add -y flag + confirm prompt |
| 2b | `packages/vyft/src/commands/deploy.ts` | Add --refresh flag |
| 2c | `packages/vyft/src/commands/diff.ts` | Add --live flag |
| 3a | `packages/vyft/src/commands/output.ts` | **New** — output command |
| 3b | `packages/vyft/src/commands/variable/*.ts` | **New** — variable CRUD |
| 3c | `packages/vyft/src/commands/stage/*.ts` | **New** — stage ls/rm |
| 3d | `packages/vyft/src/commands/generate.ts` | **New** — generate command |
| 3d | `packages/core/src/index.ts` | Export `generate` |
| 3e | `packages/vyft/src/commands/local/env.ts` | **New** — local env command |
| 3e | `packages/vyft/src/commands/local/index.ts` | Register env command |
| 3* | `packages/vyft/src/index.ts` | Register all new commands |
| 4abc | `packages/vyft/src/commands/local/up,down,reset.ts` | Implement |
| 4d | `packages/core/src/plan.ts` | Forward taintedIds |
| 4d | `packages/core/src/apply.ts` | Accept taintedIds in options |
| 4d | `packages/vyft/src/commands/deploy.ts` | Compute tainted set |
| 5a | `packages/core/src/destroy.ts` | Two-phase deletion |
| 5bcd | `packages/vyft/src/commands/local/classify.ts` | **New** — classify, ports, host replace |

## Verification

After each phase:
1. `npx nx build @vyft/engine` — engine builds
2. `npx nx build @vyft/core` — core builds
3. `npx nx build @vyft/store` — store builds
4. `node --test 'packages/engine/src/**/*.test.ts'` — engine tests pass
5. `node --test 'packages/store/src/**/*.test.ts'` — store tests pass
6. `node --test 'packages/core/src/**/*.test.ts'` — core tests pass (if any)

End-to-end:
- `vyft deploy` on a test config — only changed resources should trigger handlers
- `vyft deploy` again with no changes — should report no changes (fingerprint works)
- `vyft destroy -y` — resources removed, state cleaned (no ghosts)
- `vyft output` — shows outputs
- `vyft variable set foo bar --secret` + `vyft variable get foo` — round-trips
- `vyft local up` + `vyft local down` + `vyft local reset` — lifecycle works
