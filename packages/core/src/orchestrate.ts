import { join } from "node:path";
import type { Change, StateEntry } from "@vyft/engine";
import {
  buildGraph,
  checkDuplicateIds,
  collect,
  execute,
  fingerprint,
  plan,
  resourceURN,
  serializeConfig,
} from "@vyft/engine";
import { logger } from "@vyft/logger";
import type {
  CronJob,
  Resource,
  Service,
  URN,
  Variable,
} from "@vyft/primitives";
import { buildURN, isSecretVariable, parseURN } from "@vyft/primitives";
import type { ExtendedRuntime, Operation, RuntimeOptions } from "@vyft/runtime";
import { docker, kubernetes, swarm } from "@vyft/runtime";
import type { EncryptedPayload, ResourceState } from "@vyft/store";
import { decrypt, encrypt, resolvePassphrase, Store } from "@vyft/store";
import type { RuntimeName } from "./config.ts";
import { findConfig, loadConfig, projectInfo, resolveStage } from "./config.ts";
import { CliError } from "./errors.ts";
import { generateSecret } from "./generate.ts";
import { buildImage, imageDigest } from "./image.ts";

const log = logger.child("core");

// ── Internal Helpers ─────────────────────────────────────────────────

const runtimeFactories: Record<
  RuntimeName,
  (opts: RuntimeOptions) => ExtendedRuntime
> = { docker, swarm, k8s: kubernetes };

function createRuntime(
  name: RuntimeName,
  opts: RuntimeOptions,
): ExtendedRuntime {
  return runtimeFactories[name](opts);
}

function buildSecretMap(
  state: Iterable<ResourceState>,
  passphrase: string,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const rs of state) {
    try {
      const parsed = parseURN(rs.urn);
      if (parsed.resource !== "variable") continue;
    } catch {
      continue;
    }
    const { id } = parseURN(rs.urn);
    const raw = rs.outputs["value"];
    if (raw === undefined) continue;
    if (rs.sensitive?.includes("value")) {
      map.set(id, decrypt(raw as EncryptedPayload, passphrase));
    } else {
      map.set(id, raw as string);
    }
  }
  return map;
}

function makeVariableState(
  name: string,
  value: string,
  passphrase: string,
  existing?: ResourceState,
): ResourceState {
  const now = new Date().toISOString();
  const encrypted = encrypt(value, passphrase);
  return {
    urn: buildURN("platform", "default", "variable", name),
    fingerprint: JSON.stringify({ value: encrypted }),
    inputs: {},
    outputs: { value: encrypted },
    dependencies: [],
    created: existing?.created ?? now,
    modified: now,
    taint: false,
    sensitive: ["value"],
  };
}

function toOperation(change: Change): Operation {
  if (change.status === "remove") {
    const { id, resource: kind } = parseURN(change.urn);
    return { action: "remove", urn: change.urn, id, kind };
  }
  return {
    action: change.status === "create" ? "create" : "update",
    resource: change.resource,
  };
}

async function executePlan(
  changes: Change[][],
  store: Store,
  runtime: ExtendedRuntime,
): Promise<void> {
  for (const level of changes) {
    await Promise.all(
      level.map(async (change) => {
        const urn =
          change.status === "remove"
            ? change.urn
            : resourceURN(change.resource);

        await store.append({
          type: "pending",
          urn,
          action:
            change.status === "create"
              ? "creating"
              : change.status === "modify"
                ? "updating"
                : "deleting",
        });

        await execute(change, async (c) => {
          await runtime.execute(toOperation(c));
        });

        if (change.status === "remove") {
          await store.append({ type: "removed", urn });
        } else {
          const id = change.resource.id;
          await store.append({
            type: "committed",
            urn,
            fingerprint: fingerprint(change.resource),
            inputs: serializeConfig(
              change.resource.kind === "provider"
                ? (change.resource.input as object)
                : (change.resource.config as object),
            ),
            outputs: runtime.runtimeState().get(id) ?? {},
          });
        }
      }),
    );
  }
}

async function withStore<T>(
  stage: string | undefined,
  fn: (
    store: Store,
    ctx: {
      stage: string;
      project: string;
      runtimeName: RuntimeName;
      root: string;
    },
  ) => Promise<T>,
): Promise<T> {
  const info = await projectInfo();
  const resolvedStage = stage ?? (await resolveStage(info.root));
  const dir = join(info.root, info.context, info.project, resolvedStage);
  const store = await Store.open(dir);
  try {
    return await fn(store, {
      stage: resolvedStage,
      project: info.project,
      runtimeName: info.runtimeName,
      root: info.root,
    });
  } finally {
    await store.dispose();
  }
}

// ── Public Types ─────────────────────────────────────────────────────

export interface PreviewChange {
  status: "create" | "modify" | "remove";
  kind: string;
  id: string;
}

export interface DeployResult {
  changes: PreviewChange[];
  resourceCount: number;
}

export interface DestroyResult {
  destroyed: number;
}

export interface RefreshResult {
  changed: number;
  removed: number;
}

export interface DiffResult {
  driftCount: number;
  missingCount: number;
}

// ── Public Functions ─────────────────────────────────────────────────

function flattenChanges(levels: Change[][]): PreviewChange[] {
  return levels.flat().map((c) => {
    if (c.status === "remove") {
      const { id, resource: kind } = parseURN(c.urn);
      return { status: "remove" as const, kind, id };
    }
    return {
      status: c.status,
      kind: c.resource.kind,
      id: c.resource.id,
    };
  });
}

export async function deploy(options?: {
  stage?: string | undefined;
  refresh?: boolean | undefined;
}): Promise<DeployResult> {
  return withStore(options?.stage, async (store, ctx) => {
    const configPath = await findConfig(process.cwd());
    const config = await loadConfig(configPath);
    log.info("loaded config from %s", configPath);

    const passphrase = await resolvePassphrase();
    const secretMap = buildSecretMap(store.state.values(), passphrase);

    const collected = collect(config);
    const resources = checkDuplicateIds(collected);

    // Auto-generate missing secret values
    const variables = resources.filter(
      (r): r is Variable => r.kind === "variable",
    );
    let secretsChanged = false;
    for (const v of variables) {
      if (!secretMap.has(v.id)) {
        if (isSecretVariable(v.config)) {
          if (v.config.generated === false) continue;
          const generated = generateSecret(v.config.length, v.config.alphabet);
          secretMap.set(v.id, generated);
          const varUrn = buildURN("platform", "default", "variable", v.id);
          store.state.set(
            varUrn,
            makeVariableState(
              v.id,
              generated,
              passphrase,
              store.state.get(varUrn),
            ),
          );
          secretsChanged = true;
        } else {
          throw new CliError(
            `Variable "${v.id}" has no value. Set it with: vyft variable set ${v.id} <value> --stage ${ctx.stage}`,
          );
        }
      }
    }
    if (secretsChanged) await store.checkpoint();

    // Taint detection — resources that depend on changed secrets
    const oldSecrets = new Map(secretMap); // snapshot before generation already happened
    const taintedIds = new Set<string>();
    const graph = buildGraph(resources);
    for (const v of variables) {
      const oldVal = oldSecrets.get(v.id);
      const newVal = secretMap.get(v.id);
      if (oldVal !== undefined && oldVal !== newVal) {
        for (const [id, deps] of graph.dependencies) {
          if (deps.has(v.id)) taintedIds.add(id);
        }
      }
    }

    // Pre-build images for services whose config is unchanged but source may have changed
    const buildables = resources.filter(
      (r): r is Service | CronJob =>
        (r.kind === "service" || r.kind === "cronjob") && !!r.config.build,
    );
    for (const r of buildables) {
      const rUrn = resourceURN(r);
      const prev = store.state.get(rUrn);
      if (!prev || prev.fingerprint !== fingerprint(r)) continue;
      const build = r.config.build;
      if (!build) continue;
      const tag = `vyft-build-${r.id}:latest`;
      log.info('building image for "%s"...', r.id);
      await buildImage(tag, build);
    }

    const runtime = createRuntime(ctx.runtimeName, {
      project: ctx.project,
      stage: ctx.stage,
      secrets: secretMap,
    });

    // Optional: refresh live state before planning
    if (options?.refresh && store.state.size > 0 && runtime.inspect) {
      log.info("inspecting live infrastructure...");
      await refreshState(store, runtime);
    }

    // Plan + execute
    const current: StateEntry[] = [...store.state.values()];
    const changes = plan(resources, current, taintedIds);

    if (changes.length === 0) {
      log.info("no changes");
    } else {
      await executePlan(changes, store, runtime);
      await store.checkpoint();
    }

    // Finalize proxy/ingress
    const services = resources.filter(
      (r): r is Service => r.kind === "service",
    );
    await runtime.finalize(services);

    // Capture image digests
    for (const r of buildables) {
      const tag = `vyft-build-${r.id}:latest`;
      await imageDigest(tag).catch(() => {});
    }

    log.info("state saved (%d resources)", store.state.size);

    return {
      changes: flattenChanges(changes),
      resourceCount: store.state.size,
    };
  });
}

export async function destroy(options?: {
  stage?: string | undefined;
}): Promise<DestroyResult> {
  return withStore(options?.stage, async (store, ctx) => {
    if (store.state.size === 0) {
      log.info("no resources to destroy");
      // Still teardown infrastructure
      const runtime = createRuntime(ctx.runtimeName, {
        project: ctx.project,
        stage: ctx.stage,
        secrets: new Map(),
      });
      await runtime.finalize([]);
      await runtime.teardown();
      return { destroyed: 0 };
    }

    const passphrase = await resolvePassphrase();
    const secretMap = buildSecretMap(store.state.values(), passphrase);
    const count = store.state.size;

    const runtime = createRuntime(ctx.runtimeName, {
      project: ctx.project,
      stage: ctx.stage,
      secrets: secretMap,
    });

    const current: StateEntry[] = [...store.state.values()];
    const changes = plan([], current);
    await executePlan(changes, store, runtime);
    await store.checkpoint();
    await store.delete();

    await runtime.finalize([]);
    await runtime.teardown();

    log.info("destroyed %d resources", count);
    return { destroyed: count };
  });
}

export async function preview(options?: {
  stage?: string | undefined;
}): Promise<PreviewChange[]> {
  return withStore(options?.stage, async (store) => {
    const configPath = await findConfig(process.cwd());
    const config = await loadConfig(configPath);

    const collected = collect(config);
    const resources = checkDuplicateIds(collected);

    const current: StateEntry[] = [...store.state.values()];
    const changes = plan(resources, current);

    return flattenChanges(changes);
  });
}

export async function refresh(options?: {
  stage?: string | undefined;
  clearPending?: boolean | undefined;
}): Promise<RefreshResult> {
  return withStore(options?.stage, async (store, ctx) => {
    if (options?.clearPending) {
      if (!(await store.hasWAL())) {
        log.info("no pending operations to clear");
        return { changed: 0, removed: 0 };
      }
      await store.checkpoint();
      log.info("cleared pending operations");
      return { changed: 0, removed: 0 };
    }

    if (store.state.size === 0) {
      throw new CliError("No state to refresh. Run `vyft deploy` first.");
    }

    if (await store.hasWAL()) {
      log.warn("WAL exists — clearing pending operations during refresh");
    }

    const passphrase = await resolvePassphrase();
    const secretMap = buildSecretMap(store.state.values(), passphrase);

    const runtime = createRuntime(ctx.runtimeName, {
      project: ctx.project,
      stage: ctx.stage,
      secrets: secretMap,
    });

    const result = await refreshState(store, runtime);

    if (result.changed === 0 && result.removed === 0) {
      log.info("live state matches stored state");
    } else {
      log.info(
        "refreshed: %d changed, %d gone",
        result.changed,
        result.removed,
      );
    }

    return result;
  });
}

export async function diff(options?: {
  stage?: string | undefined;
}): Promise<DiffResult> {
  return withStore(options?.stage, async (store, ctx) => {
    if (store.state.size === 0) {
      throw new CliError("No state to diff. Run `vyft deploy` first.");
    }

    const passphrase = await resolvePassphrase();
    const secretMap = buildSecretMap(store.state.values(), passphrase);

    const runtime = createRuntime(ctx.runtimeName, {
      project: ctx.project,
      stage: ctx.stage,
      secrets: secretMap,
    });
    if (!runtime.inspect) {
      throw new CliError("Runtime does not support inspection.");
    }

    let driftCount = 0;
    let missingCount = 0;

    const nonInspectableFields = new Set([
      "port",
      "dependsOn",
      "link",
      "route",
      "dev",
      "replicas",
      "expose",
      "build",
      "schedule",
    ]);

    for (const [, rs] of store.state) {
      const { id: rsId, resource: rsKind } = parseURN(rs.urn);
      if (
        rsKind === "secret" ||
        rsKind === "variable" ||
        rsKind === "config" ||
        rsKind === "cronjob"
      )
        continue;

      const live = await runtime.inspect(rsId, rsKind as Resource["kind"]);
      if (!live) {
        log.info("missing %s", rsId);
        missingCount++;
        continue;
      }

      const storedKeys = Object.keys(rs.inputs)
        .filter((k) => !nonInspectableFields.has(k))
        .sort();

      const volumePrefix = `vyft-${ctx.project}-${ctx.stage}-`;
      let hasDrift = false;

      for (const key of storedKeys) {
        const storedInput = rs.inputs[key];
        const liveInput = live[key];

        if (
          key === "env" &&
          typeof storedInput === "object" &&
          storedInput !== null &&
          typeof liveInput === "object" &&
          liveInput !== null
        ) {
          const storedEnv = storedInput as Record<string, string>;
          const liveEnv = liveInput as Record<string, string>;
          for (const envKey of Object.keys(storedEnv)) {
            const rawStoredValue = storedEnv[envKey] ?? "";
            const storedValue = secretMap.get(rawStoredValue) ?? rawStoredValue;
            if (storedValue !== liveEnv[envKey]) {
              if (!hasDrift) {
                log.info("drift %s", rsId);
                hasDrift = true;
                driftCount++;
              }
              log.debug(
                "  env.%s: %s → %s",
                envKey,
                JSON.stringify(storedValue),
                JSON.stringify(liveEnv[envKey]),
              );
            }
          }
          continue;
        }

        if (
          key === "mounts" &&
          Array.isArray(storedInput) &&
          Array.isArray(liveInput)
        ) {
          const storedMounts = storedInput as Array<{
            source: string;
            path: string;
          }>;
          const liveMounts = liveInput as Array<{
            source: string;
            path: string;
          }>;
          for (const storedMount of storedMounts) {
            const liveMount = liveMounts.find(
              (m) => m.path === storedMount.path,
            );
            if (!liveMount) {
              if (!hasDrift) {
                log.info("drift %s", rsId);
                hasDrift = true;
                driftCount++;
              }
              log.debug("  mounts: missing mount at %s", storedMount.path);
              continue;
            }
            const expectedSource = volumePrefix + storedMount.source;
            if (
              liveMount.source !== expectedSource &&
              liveMount.source !== storedMount.source
            ) {
              if (!hasDrift) {
                log.info("drift %s", rsId);
                hasDrift = true;
                driftCount++;
              }
              log.debug(
                "  mounts[%s]: %s → %s",
                storedMount.path,
                expectedSource,
                liveMount.source,
              );
            }
          }
          continue;
        }

        const storedVal = JSON.stringify(storedInput);
        const liveVal = JSON.stringify(liveInput);
        if (storedVal !== liveVal) {
          if (!hasDrift) {
            log.info("drift %s", rsId);
            hasDrift = true;
            driftCount++;
          }
          log.debug("  %s: %s → %s", key, storedVal, liveVal);
        }
      }
    }

    if (driftCount === 0 && missingCount === 0) {
      log.info("no drift detected");
    } else {
      log.info("%d drifted, %d missing", driftCount, missingCount);
    }

    return { driftCount, missingCount };
  });
}

// ── Internal: refresh state ──────────────────────────────────────────

async function refreshState(
  store: Store,
  runtime: ExtendedRuntime,
): Promise<RefreshResult> {
  if (!runtime.inspect) {
    throw new Error("Runtime does not support inspection.");
  }

  const now = new Date().toISOString();
  const reconciled = new Map<URN, ResourceState>();
  let removedCount = 0;
  let changedCount = 0;

  for (const [urn, rs] of store.state) {
    const { id: rsId, resource: rsKind } = parseURN(urn);
    if (rsKind === "secret" || rsKind === "variable" || rsKind === "config") {
      reconciled.set(urn, rs);
      continue;
    }

    const live = await runtime.inspect(rsId, rsKind as Resource["kind"]);
    if (!live) {
      log.info("gone %s", rsId);
      removedCount++;
      continue;
    }

    const liveFingerprint = JSON.stringify(live);
    if (liveFingerprint !== JSON.stringify(rs.inputs)) {
      log.info("drift %s", rsId);
      changedCount++;
      reconciled.set(urn, { ...rs, inputs: live, modified: now });
    } else {
      reconciled.set(urn, rs);
    }
  }

  store.state = reconciled;
  await store.checkpoint();

  return { changed: changedCount, removed: removedCount };
}
