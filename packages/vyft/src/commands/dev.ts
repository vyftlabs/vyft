import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BindValue, Config, EnvValue, Service } from "@vyft/core";
import {
  findConfig,
  generateSecret,
  isSecretConfig,
  loadConfig,
  projectInfo,
  resolve,
} from "@vyft/core";
import * as log from "@vyft/core/logger";
import { collect, deploy as engineDeploy } from "@vyft/engine";
import type { DockerRuntimeOptions } from "@vyft/runtime";
import { createFileStore } from "@vyft/store";
import type { Command } from "commander";
import {
  collectLinkables,
  linkEnvVarName,
  resolveClientDir,
  writeEnv,
} from "../generate.ts";
import { createRuntime } from "../runtime-factory.ts";

export const DEV_STAGE = "__dev__";

// ── Service Classification ───────────────────────────────────────────

export interface ClassifiedServices {
  infra: Service[];
  dev: Service[];
  buildOnly: Service[];
}

export function classifyServices(
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
      log.debug('skipping build-only service "%s" (no dev field)', r.id);
    }
  }

  return { infra, dev, buildOnly };
}

// ── Binding Resolution ───────────────────────────────────────────────

export function replaceInfraHosts(
  value: string,
  infraIds: Set<string>,
): string {
  if (infraIds.has(value)) return "localhost";
  let resolved = value;
  for (const id of infraIds) {
    // Replace hostname in URLs (after :// or @, before : or / or end)
    resolved = resolved.replaceAll(`://${id}:`, `://localhost:`);
    resolved = resolved.replaceAll(`://${id}/`, `://localhost/`);
    resolved = resolved.replaceAll(`@${id}:`, `@localhost:`);
    resolved = resolved.replaceAll(`@${id}/`, `@localhost/`);
  }
  return resolved;
}

export function resolveBindValue(
  value: BindValue,
  secrets: ReadonlyMap<string, string>,
  infraIds: Set<string>,
): { resolved: string; type: "string" | "number" } {
  if (typeof value === "number") {
    return { resolved: String(value), type: "number" };
  }
  if (typeof value === "string") {
    return { resolved: replaceInfraHosts(value, infraIds), type: "string" };
  }
  const resolved = replaceInfraHosts(
    resolve(value as EnvValue, secrets),
    infraIds,
  );
  return { resolved, type: "string" };
}

// ── Dev Secrets (plain JSON, no encryption) ─────────────────────────

export async function loadDevSecrets(
  secretsPath: string,
): Promise<Map<string, string>> {
  try {
    const raw = await readFile(secretsPath, "utf8");
    return new Map(Object.entries(JSON.parse(raw) as Record<string, string>));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return new Map();
    throw err;
  }
}

async function saveDevSecrets(
  secretsPath: string,
  secrets: Map<string, string>,
): Promise<void> {
  await mkdir(path.dirname(secretsPath), { recursive: true });
  await writeFile(
    secretsPath,
    `${JSON.stringify(Object.fromEntries(secrets), null, 2)}\n`,
    "utf8",
  );
}

// ── Deterministic dev ports ──────────────────────────────────────────

const DEV_PORT_MIN = 3000;
const DEV_PORT_MAX = 9999;

function hashPort(id: string): number {
  let hash = 0;
  for (const ch of id) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  return DEV_PORT_MIN + (Math.abs(hash) % (DEV_PORT_MAX - DEV_PORT_MIN + 1));
}

export function assignDevPorts(services: Service[]): Map<string, number> {
  const sorted = [...services].sort((a, b) => a.id.localeCompare(b.id));
  const assigned = new Map<string, number>();
  const usedPorts = new Set<number>();

  for (const svc of sorted) {
    let port = hashPort(svc.id);
    while (usedPorts.has(port)) {
      port = port >= DEV_PORT_MAX ? DEV_PORT_MIN : port + 1;
    }
    assigned.set(svc.id, port);
    usedPorts.add(port);
  }

  return assigned;
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

export function registerDev(program: Command): void {
  program
    .command("dev")
    .description("Start local development environment")
    .option("-c, --config <path>", "Path to config file", "vyft.config.ts")
    .option("--stage <stage>", "Stage to use for config values")
    .action(async () => {
      const { root, context, project, runtimeName } = await projectInfo();
      const stage = "__dev__";
      const secretsPath = path.join(root, "dev-secrets.json");
      const configPath = await findConfig(process.cwd());
      const store = createFileStore(root);
      const devProcesses = new Map<string, ChildProcess>();
      const ac = new AbortController();

      const onSignal = () => ac.abort();
      process.on("SIGINT", onSignal);
      process.on("SIGTERM", onSignal);

      async function loadAndRun(): Promise<void> {
        const config = await loadConfig(configPath);
        log.debug("loaded config from %s", configPath);

        const resources = collect(config);
        const { infra, dev } = classifyServices(resources);
        const infraIds = new Set(infra.map((s) => s.id));

        // Load or generate secrets — plain JSON, no encryption
        const secretMap = await loadDevSecrets(secretsPath);
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
          }
        }

        if (secretsChanged) {
          await saveDevSecrets(secretsPath, secretMap);
        }

        // Generate resource bindings files
        const clientDir = resolveClientDir(process.cwd());
        const entries = await writeEnv(config, clientDir);
        log.debug("generated env bindings (%d export(s))", entries.length);

        // Build binding env vars from linkables with dev-resolved values
        const linkables = collectLinkables(config);
        const bindingEnv: Record<string, string> = {};
        for (const entry of linkables) {
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

        // Deploy infra services through the engine
        if (infra.length > 0) {
          log.debug("ensuring %d infra service(s)...", infra.length);

          const portBindingsMap: Record<string, number> = {};
          for (const svc of infra) {
            portBindingsMap[svc.id] = svc.port;
          }

          // Collect infra services and their volume dependencies
          const infraDepIds = new Set<string>(infra.map((s) => s.id));
          for (const svc of infra) {
            if (svc.config.mounts) {
              for (const m of svc.config.mounts) {
                if (m.source.kind !== "bind") infraDepIds.add(m.source.id);
              }
            }
          }
          const infraResources = resources.filter((r) => infraDepIds.has(r.id));

          const runtimeOpts: DockerRuntimeOptions = {
            project,
            stage,
            secrets: secretMap,
            portBindings: portBindingsMap,
          };
          const runtime = createRuntime(runtimeName, runtimeOpts);

          const previous = await store.load(context, project, stage);
          const result = await engineDeploy(
            infraResources,
            previous?.resources ?? [],
            runtime,
          );

          const runtimeStateMap = runtime.runtimeState();
          const finalResources = result.state.map((rs) => {
            const extra = runtimeStateMap.get(rs.id);
            if (extra) return { ...rs, runtime: { ...rs.runtime, ...extra } };
            return rs;
          });

          await store.save(context, project, stage, {
            version: 1,
            manifest: { timestamp: new Date().toISOString(), tool: "vyft" },
            resources: finalResources,
            secrets: null,
            secretOutputs: null,
          });

          log.debug("infra services ready");
        }

        // Assign deterministic dev ports
        const devPorts = assignDevPorts(dev);

        // Kill existing dev processes
        for (const [id, proc] of devProcesses) {
          log.debug('stopping dev process "%s"', id);
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

          const svcEnv: Record<string, string> = {};
          if (svc.config.env) {
            for (const [key, val] of Object.entries(svc.config.env)) {
              svcEnv[key] = replaceInfraHosts(
                resolve(val, secretMap),
                infraIds,
              );
            }
          }

          const devPort = devPorts.get(svcId);
          const portEnv: Record<string, string> = devPort
            ? { PORT: String(devPort) }
            : {};

          const child = spawn("sh", ["-c", devConfig.command], {
            cwd: devConfig.cwd ?? process.cwd(),
            env: {
              ...process.env,
              NODE_ENV: "development",
              ...svcEnv,
              ...bindingEnv,
              ...portEnv,
            },
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
          if (devPort) {
            log.info(
              'started dev process "%s": %s → http://localhost:%d',
              svcId,
              devConfig.command,
              devPort,
            );
          } else {
            log.info('started dev process "%s": %s', svcId, devConfig.command);
          }
        }
      }

      try {
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
      } finally {
        // Cleanup dev processes
        for (const [id, proc] of devProcesses) {
          log.debug('stopping dev process "%s"', id);
          proc.kill("SIGTERM");
        }

        if (devProcesses.size > 0) {
          await new Promise((r) => setTimeout(r, 500));
          for (const [, proc] of devProcesses) {
            proc.kill("SIGKILL");
          }
        }
        devProcesses.clear();
      }
    });
}
