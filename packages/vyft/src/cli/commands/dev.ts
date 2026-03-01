import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { watch } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  BindValue,
  Config,
  EnvValue,
  RuntimeName,
  Service,
} from "@vyft/core";
import {
  findConfig,
  generateSecret,
  isSecretConfig,
  loadConfig,
  projectInfo,
  resolve,
  resolveStage,
} from "@vyft/core";
import * as log from "@vyft/core/logger";
import { buildGraph, collect, deploy as engineDeploy } from "@vyft/engine";
import {
  createFileStore,
  createStageStore,
  decrypt,
  encrypt,
  resolvePassphrase,
} from "@vyft/store";
import type { Command } from "commander";
import {
  collectLinkables,
  linkEnvVarName,
  writeResource,
} from "../../generate.ts";
import { createRuntime } from "../../runtime-factory.ts";
import { withLifecycle } from "../lifecycle.ts";

// ── Service Classification ───────────────────────────────────────────

interface ClassifiedServices {
  infra: Service[];
  dev: Service[];
  buildOnly: Service[];
}

function classifyServices(
  resources: import("@vyft/core").Resource[],
): ClassifiedServices {
  const infra: Service[] = [];
  const dev: Service[] = [];
  const buildOnly: Service[] = [];

  for (const r of resources) {
    if (r.kind !== "service") continue;
    if (r.config.dev) {
      dev.push(r);
    } else if (r.config.image && !r.config.build) {
      infra.push(r);
    } else if (r.config.build) {
      buildOnly.push(r);
      log.info('skipping build-only service "%s" (no dev field)', r.id);
    }
  }

  return { infra, dev, buildOnly };
}

// ── Binding Resolution ───────────────────────────────────────────────

function resolveBindValue(
  value: BindValue,
  secrets: ReadonlyMap<string, string>,
  infraIds: Set<string>,
): { resolved: string; type: "string" | "number" } {
  if (typeof value === "number") {
    return { resolved: String(value), type: "number" };
  }
  if (typeof value === "string") {
    // If the string equals an infra service id, replace with localhost
    const resolved = infraIds.has(value) ? "localhost" : value;
    return { resolved, type: "string" };
  }
  // Reference or Interpolation — resolve then replace hostnames
  let resolved = resolve(value as EnvValue, secrets);
  for (const id of infraIds) {
    resolved = resolved.replaceAll(id, "localhost");
  }
  return { resolved, type: "string" };
}

// ── Console prefix colors ────────────────────────────────────────────

const COLORS = [
  "\x1b[32m", // green
  "\x1b[33m", // yellow
  "\x1b[34m", // blue
  "\x1b[35m", // magenta
  "\x1b[36m", // cyan
];
const RESET = "\x1b[0m";

// ── Dev Command ──────────────────────────────────────────────────────

interface DevState {
  context: string;
  project: string;
  stage: string;
  runtimeName: RuntimeName;
  unlock: () => Promise<void>;
  ac: AbortController;
}

export function registerDev(program: Command): void {
  program
    .command("dev")
    .description("Start local development environment")
    .option("-c, --config <path>", "Path to config file", "vyft.config.ts")
    .option("--stage <stage>", "Stage to use for config values")
    .action(
      withLifecycle<DevState>({
        async setup(opts: { stage?: string } = {}) {
          const { root, context, project, runtimeName } = await projectInfo();
          const stage = opts.stage ?? (await resolveStage(root));
          const store = createFileStore(root);
          const unlock = await store.lock(context, project, stage);
          const ac = new AbortController();

          // Signal handling
          const onSignal = () => ac.abort();
          process.on("SIGINT", onSignal);
          process.on("SIGTERM", onSignal);

          return { context, project, stage, runtimeName, unlock, ac };
        },

        async run({ context, project, stage, runtimeName, ac }) {
          const configPath = await findConfig(process.cwd());
          const devProcesses = new Map<string, ChildProcess>();

          async function loadAndRun(): Promise<void> {
            const config = await loadConfig(configPath);
            log.info("loaded config from %s", configPath);

            const resources = collect(config);
            const { infra, dev } = classifyServices(resources);
            const infraIds = new Set(infra.map((s) => s.id));

            // Resolve config values from stage
            const { root } = await projectInfo();
            const store = createFileStore(root);
            const stageStore = createStageStore(root);
            const stageData = await stageStore.loadStage(stage);
            const previous = await store.load(context, project, stage);
            const passphrase = await resolvePassphrase();
            const secretMap = new Map<string, string>();

            // Load from stage storage
            if (stageData?.values) {
              for (const [k, v] of Object.entries(stageData.values))
                secretMap.set(k, v);
            }
            if (stageData?.secrets) {
              const raw = JSON.parse(
                decrypt(stageData.secrets, passphrase),
              ) as Record<string, string>;
              for (const [k, v] of Object.entries(raw)) secretMap.set(k, v);
            }

            // Fallback to state secrets
            if (previous?.secrets) {
              const raw = JSON.parse(
                decrypt(previous.secrets, passphrase),
              ) as Record<string, string>;
              for (const [k, v] of Object.entries(raw)) {
                if (!secretMap.has(k)) secretMap.set(k, v);
              }
            }

            // Auto-generate missing secrets
            const configResources = resources.filter(
              (r): r is Config => r.kind === "config",
            );
            let secretsChanged = false;
            for (const cr of configResources) {
              if (!secretMap.has(cr.id)) {
                if (isSecretConfig(cr.config)) {
                  if (cr.config.generated === false) continue;
                  secretMap.set(
                    cr.id,
                    generateSecret(cr.config.length, cr.config.alphabet),
                  );
                  secretsChanged = true;
                }
                // Plain config with no value: skip for dev (warn only)
              }
            }

            if (secretsChanged) {
              const currentStageData = (await stageStore.loadStage(stage)) ?? {
                version: 1,
                values: {},
                secrets: null,
              };
              const stageSecrets: Record<string, string> = {};
              if (currentStageData.secrets) {
                const existing = JSON.parse(
                  decrypt(currentStageData.secrets, passphrase),
                ) as Record<string, string>;
                Object.assign(stageSecrets, existing);
              }
              for (const cr of configResources) {
                if (isSecretConfig(cr.config) && secretMap.has(cr.id)) {
                  const val = secretMap.get(cr.id);
                  if (val !== undefined) stageSecrets[cr.id] = val;
                }
              }
              await stageStore.saveStage(stage, {
                ...currentStageData,
                secrets: encrypt(JSON.stringify(stageSecrets), passphrase),
              });

              const allSecrets = Object.fromEntries(secretMap);
              const encrypted = encrypt(JSON.stringify(allSecrets), passphrase);
              await store.save(context, project, stage, {
                version: previous?.version ?? 1,
                manifest: { timestamp: new Date().toISOString(), tool: "vyft" },
                resources: previous?.resources ?? [],
                secrets: encrypted,
              });
            }

            // Generate resource bindings files
            const thisFile = fileURLToPath(import.meta.url);
            const distDir = path.resolve(path.dirname(thisFile), "..", "..");
            const entries = await writeResource(config, distDir);
            log.info(
              "generated resource bindings (%d export(s))",
              entries.length,
            );

            // Build binding env vars from linkables with dev-resolved values
            const linkables = collectLinkables(config);
            const bindingEnv: Record<string, string> = {};
            for (const entry of linkables) {
              // Find the original linkable object to get binding values
              const linkable = (config as Record<string, unknown>)[
                entry.exportName
              ] as Record<string, unknown>;
              for (const b of entry.bindings) {
                const binding = linkable[b.key] as { value: BindValue };
                const envVar = linkEnvVarName(entry.id, b.key);
                const { resolved } = resolveBindValue(
                  binding.value,
                  secretMap,
                  infraIds,
                );
                bindingEnv[envVar] = resolved;
              }
            }

            // Deploy infra services
            if (infra.length > 0) {
              log.info("deploying %d infra service(s)...", infra.length);

              // Build port bindings: expose each infra service's port on the same host port
              const portBindingsMap: Record<string, number> = {};
              for (const svc of infra) {
                portBindingsMap[svc.id] = svc.port;
              }

              // Filter resources to infra services + their deps (volumes, secrets)
              const graph = buildGraph(resources);
              const infraDepIds = new Set<string>();
              for (const svc of infra) {
                infraDepIds.add(svc.id);
                const deps = graph.dependencies.get(svc.id);
                if (deps) {
                  for (const dep of deps) infraDepIds.add(dep);
                }
              }
              const infraResources = resources.filter((r) =>
                infraDepIds.has(r.id),
              );

              const runtimeOpts = {
                project,
                secrets: secretMap,
                portBindings: portBindingsMap,
              };
              const runtime = createRuntime(runtimeName, runtimeOpts);

              await engineDeploy(infraResources, [], runtime);
              log.info("infra services deployed");
            }

            // Kill existing dev processes
            for (const [id, proc] of devProcesses) {
              log.info('stopping dev process "%s"', id);
              proc.kill("SIGTERM");
            }
            devProcesses.clear();

            // Spawn dev processes
            let colorIdx = 0;
            for (const svc of dev) {
              const devConfig = svc.config.dev;
              if (!devConfig) continue;

              const color = COLORS[colorIdx++ % COLORS.length];
              const prefix = `${color}[${svc.id}]${RESET}`;
              const svcId = svc.id;

              // Resolve service env vars, replacing infra hostnames with localhost
              const svcEnv: Record<string, string> = {};
              if (svc.config.env) {
                for (const [key, val] of Object.entries(svc.config.env)) {
                  let resolved = resolve(val, secretMap);
                  for (const id of infraIds) {
                    resolved = resolved.replaceAll(id, "localhost");
                  }
                  svcEnv[key] = resolved;
                }
              }

              const child = spawn("sh", ["-c", devConfig.command], {
                cwd: devConfig.cwd ?? process.cwd(),
                env: { ...process.env, ...svcEnv, ...bindingEnv },
                stdio: ["ignore", "pipe", "pipe"],
              });

              child.stdout?.on("data", (data: Buffer) => {
                for (const line of data.toString().split("\n")) {
                  if (line) process.stdout.write(`${prefix} ${line}\n`);
                }
              });

              child.stderr?.on("data", (data: Buffer) => {
                for (const line of data.toString().split("\n")) {
                  if (line) process.stderr.write(`${prefix} ${line}\n`);
                }
              });

              child.on("exit", (code, signal) => {
                if (!ac.signal.aborted) {
                  log.warn(
                    'dev process "%s" exited (code=%s, signal=%s)',
                    svcId,
                    code,
                    signal,
                  );
                }
                devProcesses.delete(svcId);
              });

              devProcesses.set(svcId, child);
              log.info(
                'started dev process "%s": %s',
                svcId,
                devConfig.command,
              );
            }
          }

          // Initial load
          await loadAndRun();

          // Config file watching
          let debounceTimer: ReturnType<typeof setTimeout> | null = null;
          const watcher = watch(configPath, { signal: ac.signal }, () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(async () => {
              log.info("config changed, reloading...");
              try {
                await loadAndRun();
              } catch (err) {
                log.error(
                  "reload failed: %s",
                  err instanceof Error ? err.message : err,
                );
              }
            }, 300);
          });

          watcher.on("error", (err) => {
            if (
              (err as NodeJS.ErrnoException).code !== "ERR_USE_AFTER_CLOSE" &&
              (err as NodeJS.ErrnoException).code !== "ABORT_ERR"
            ) {
              log.error("watcher error: %s", err.message);
            }
          });

          // Block until abort
          await new Promise<void>((resolve) => {
            if (ac.signal.aborted) return resolve();
            ac.signal.addEventListener("abort", () => resolve(), {
              once: true,
            });
          });

          // Cleanup dev processes
          for (const [id, proc] of devProcesses) {
            log.info('stopping dev process "%s"', id);
            proc.kill("SIGTERM");
          }

          // Grace period
          if (devProcesses.size > 0) {
            await new Promise((r) => setTimeout(r, 500));
            for (const [, proc] of devProcesses) {
              proc.kill("SIGKILL");
            }
          }
          devProcesses.clear();
        },

        async cleanup(state) {
          if (state) {
            state.ac.abort();
            await state.unlock();
          }
        },
      }),
    );
}
