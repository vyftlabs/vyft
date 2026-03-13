import { type ChildProcess, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import {
  type ApplyEvent,
  apply,
  type Provider,
  reconcile,
  resolveValue,
  sealInput,
  toState,
  urn,
} from "@vyft/core";
import docker, { createClient } from "@vyft/docker";
import {
  type DevConfig,
  RUNTIME_PROVIDER_NAME,
  type ServiceConfig,
} from "@vyft/runtime";
import { Command } from "commander";
import { loadConfig, resolveName } from "../../config.ts";
import { waitForHealthy as waitForHealthyContainers } from "../../health.ts";
import {
  buildContext,
  buildCurrentState,
  createCipher,
  loadSalt,
  openStore,
  resolveLocalStateDir,
  resolvePassphrase,
} from "../../runtime.ts";
import { createTreeRenderer, type TreeEntry } from "../../tree.ts";
import { detectDev } from "./detect.ts";

function configHasImage(config: unknown): boolean {
  return (
    typeof config === "object" &&
    config !== null &&
    "image" in config &&
    typeof (config as Record<string, unknown>)["image"] === "string"
  );
}

const dim = (s: string) => `\x1b[2m${s}\x1b[22m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[39m`;
const red = (s: string) => `\x1b[31m${s}\x1b[39m`;

const CONFIG_FILES = [
  "vyft.config.ts",
  "vyft.config.js",
  "vyft.config.mjs",
  "vyft.config.mts",
];

const DEFAULT_EXCLUDE = [
  "node_modules",
  "dist",
  ".git",
  "__pycache__",
  "target",
];

interface NativeService {
  name: string;
  command: string[];
  cwd: string;
  env: Record<string, string>;
  include: string[];
  exclude: string[];
  proc: ChildProcess | null;
  watcher: ReturnType<typeof fs.watch> | null;
  debounce: ReturnType<typeof setTimeout> | null;
}

function parseDevConfig(
  dev: DevConfig,
  defaults: { include: string[]; cwd: string },
): {
  command: string[];
  env: Record<string, string>;
  cwd: string;
  include: string[];
  exclude: string[];
} {
  if (typeof dev === "string") {
    return {
      command: dev.split(" "),
      env: {},
      cwd: defaults.cwd,
      include: defaults.include,
      exclude: DEFAULT_EXCLUDE,
    };
  }
  if (Array.isArray(dev)) {
    return {
      command: dev,
      env: {},
      cwd: defaults.cwd,
      include: defaults.include,
      exclude: DEFAULT_EXCLUDE,
    };
  }
  return {
    command:
      typeof dev.command === "string" ? dev.command.split(" ") : dev.command,
    env: dev.env ?? {},
    cwd: dev.cwd ? path.resolve(defaults.cwd, dev.cwd) : defaults.cwd,
    include: dev.include ?? defaults.include,
    exclude: dev.exclude ?? DEFAULT_EXCLUDE,
  };
}

function matchGlob(relPath: string, pattern: string): boolean {
  const regexStr = pattern
    .replace(/[.+^$()|[\]\\]/g, (c) => `\\${c}`)
    .replace(/\*\*\//g, "(?:[^/]+/)*")
    .replace(/\*/g, "[^/]*")
    .replace(
      /\{([^}]+)\}/g,
      (_m, group: string) => `(?:${group.split(",").join("|")})`,
    );
  return new RegExp(`^${regexStr}$`).test(relPath);
}

function shouldWatch(
  relPath: string,
  include: string[],
  exclude: string[],
): boolean {
  for (const ex of exclude) {
    if (!ex.includes("*")) {
      if (relPath === ex || relPath.startsWith(`${ex}/`)) return false;
    } else if (matchGlob(relPath, ex)) {
      return false;
    }
  }
  return include.some((pattern) => matchGlob(relPath, pattern));
}

function prefixedLog(name: string, data: Buffer, isErr: boolean): void {
  const prefix = dim(`[${name}]`);
  for (const line of data.toString().split("\n")) {
    if (line) {
      if (isErr) {
        process.stderr.write(`${prefix} ${line}\n`);
      } else {
        process.stdout.write(`${prefix} ${line}\n`);
      }
    }
  }
}

function startProcess(svc: NativeService): void {
  const [cmd, ...args] = svc.command;
  if (!cmd) return;

  const proc = spawn(cmd, args, {
    cwd: svc.cwd,
    env: { ...process.env, ...svc.env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });

  proc.stdout?.on("data", (d: Buffer) => prefixedLog(svc.name, d, false));
  proc.stderr?.on("data", (d: Buffer) => prefixedLog(svc.name, d, true));
  proc.on("exit", (code) => {
    if (code !== null && code !== 0) {
      console.error(
        `${dim(`[${svc.name}]`)} ${red(`exited with code ${code}`)}`,
      );
    }
  });

  svc.proc = proc;
}

function killProcess(svc: NativeService): void {
  const p = svc.proc;
  svc.proc = null;
  if (p?.pid) {
    try {
      process.kill(-p.pid, "SIGTERM");
    } catch {
      p.kill("SIGTERM");
    }
  }
}

function watchService(svc: NativeService): void {
  try {
    const watcher = fs.watch(
      svc.cwd,
      { recursive: true },
      (_event, filename) => {
        if (!filename) return;
        const relPath = filename.replace(/\\/g, "/");
        if (!shouldWatch(relPath, svc.include, svc.exclude)) return;

        if (svc.debounce) clearTimeout(svc.debounce);
        svc.debounce = setTimeout(() => {
          console.log(
            `${dim(`[${svc.name}]`)} ${yellow("change detected, restarting...")}`,
          );

          killProcess(svc);
          startProcess(svc);
        }, 300);
      },
    );
    svc.watcher = watcher;
  } catch {
    // File watching not available on this platform/path; skip
  }
}

interface InfraResult {
  resolve(value: unknown): Promise<unknown>;
  waitForHealthy(
    containers: Array<{ name: string; urn: string }>,
    onStatus?: (
      urn: string,
      status: "starting" | "healthy" | "unhealthy",
    ) => void,
  ): Promise<void>;
}

async function applyInfra(
  cwd: string,
  project: string,
  infraEntries: Awaited<ReturnType<typeof loadConfig>>["entries"],
  loadedProviders: Record<string, Provider<unknown>>,
  onEvent: (event: ApplyEvent) => void,
): Promise<InfraResult> {
  const stateDir = resolveLocalStateDir(cwd, project);
  const providers: Record<string, Provider<unknown>> = {
    ...loadedProviders,
    [RUNTIME_PROVIDER_NAME]: docker({
      project,
      stage: "local",
      publishPorts: true,
    }),
  };
  const store = await openStore(stateDir);
  const salt = await loadSalt(stateDir);
  const passphrase = await resolvePassphrase(project, "local");
  const cipher = createCipher(passphrase, salt);
  const ctx = buildContext(store, cipher, providers, stateDir);
  await reconcile(ctx);
  const current = buildCurrentState(store);
  const desired = toState(infraEntries);
  await apply(desired, current, ctx, { onEvent });
  // Collect outputs and container hostnames before closing the store
  const outputs: Record<string, unknown> = {};
  const containerHosts = new Set<string>();
  for (const [key, value] of store.entries()) {
    const data = value as Record<string, unknown> | undefined;
    if (data?.["output"]) {
      outputs[key] = data["output"];
      const out = data["output"] as Record<string, unknown>;
      if (typeof out["host"] === "string") {
        containerHosts.add(out["host"]);
      }
    }
  }
  await store.dispose();
  const dockerClient = createClient();
  return {
    async resolve(value: unknown): Promise<unknown> {
      const resolved = await resolveValue(value, outputs, cipher);
      // Rewrite Docker container hostnames to localhost for native dev
      if (typeof resolved === "string") {
        let result = resolved;
        for (const host of containerHosts) {
          result = result.replaceAll(host, "localhost");
        }
        return result;
      }
      return resolved;
    },
    async waitForHealthy(
      containers: Array<{ name: string; urn: string }>,
      onStatus?: (
        urnValue: string,
        status: "starting" | "healthy" | "unhealthy",
      ) => void,
    ): Promise<void> {
      return waitForHealthyContainers(dockerClient, containers, onStatus);
    },
  };
}

const PORT_MIN = 3000;
const PORT_MAX = 9999;
const PORT_RANGE = PORT_MAX - PORT_MIN + 1;

function hashPort(id: string): number {
  const hash = createHash("sha256").update(id).digest();
  const n = hash.readUInt32BE(0);
  return PORT_MIN + (n % PORT_RANGE);
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function allocatePorts(ids: string[]): Promise<Map<string, number>> {
  const sorted = [...ids].sort();
  const assigned = new Map<string, number>();
  const used = new Set<number>();

  for (const id of sorted) {
    let port = hashPort(id);
    while (used.has(port) || !(await isPortFree(port))) {
      port = port + 1 > PORT_MAX ? PORT_MIN : port + 1;
    }
    assigned.set(id, port);
    used.add(port);
  }

  return assigned;
}

export default new Command("dev")
  .description("Start local development environment with native execution")
  .option("--stage <name>", "Deployment stage", "development")
  .option("--name <name>", "Project name")
  .action(async (opts: { stage: string; name?: string }) => {
    const cwd = process.cwd();
    const project = await resolveName(cwd, opts.name);

    const nativeServices: NativeService[] = [];

    async function startAll(): Promise<void> {
      const { entries, providers } = await loadConfig(cwd, project, {
        noCache: true,
      });

      const infraEntries: Awaited<ReturnType<typeof loadConfig>>["entries"] =
        [];
      const appEntries: Awaited<ReturnType<typeof loadConfig>>["entries"] = [];

      // First pass: identify native service ids
      const nativeServiceIds = new Set<string>();
      for (const entry of entries) {
        const parsed = urn.parse(entry.urn);
        if (
          parsed.provider === RUNTIME_PROVIDER_NAME &&
          parsed.resource === "service" &&
          !configHasImage(entry.config)
        ) {
          nativeServiceIds.add(parsed.id);
        }
      }

      // Second pass: classify entries
      for (const entry of entries) {
        const parsed = urn.parse(entry.urn);
        const isNativeService =
          parsed.provider === RUNTIME_PROVIDER_NAME &&
          parsed.resource === "service" &&
          nativeServiceIds.has(parsed.id);
        const isNativeBuild =
          parsed.provider === RUNTIME_PROVIDER_NAME &&
          parsed.resource === "build" &&
          nativeServiceIds.has(parsed.id);
        if (isNativeService) {
          appEntries.push(entry);
        } else if (!isNativeBuild) {
          infraEntries.push(entry);
        }
      }

      // Build tree entries: infra + app entries (excluding internal build resources)
      const treeEntries: TreeEntry[] = entries
        .filter((e) => {
          const parsed = urn.parse(e.urn);
          return !(
            parsed.resource === "build" && nativeServiceIds.has(parsed.id)
          );
        })
        .map((e) => ({
          urn: e.urn,
          dependsOn: e.dependsOn,
          value: e.value,
        }));

      const tree = createTreeRenderer({ entries: treeEntries });
      tree.start();

      // Start infra containers
      let infra: InfraResult | undefined;
      if (infraEntries.length > 0) {
        infra = await applyInfra(
          cwd,
          project,
          infraEntries,
          providers,
          tree.onEvent,
        );

        // Wait for containers with health checks to become healthy
        const healthContainers: Array<{ name: string; urn: string }> = [];
        for (const entry of infraEntries) {
          if (entry.value["health"] != null && entry.value["image"] != null) {
            const name = `vyft-${project}-local-${String(entry.value["name"])}`;
            healthContainers.push({ name, urn: entry.urn });
          }
        }
        if (healthContainers.length > 0) {
          await infra.waitForHealthy(healthContainers, tree.onHealthStatus);
        }
      }

      // Allocate ports for native services
      const serviceIds = appEntries.map((e) =>
        String(e.value["name"] ?? e.urn.split(":").pop() ?? e.urn),
      );
      const ports = await allocatePorts(serviceIds);

      // Resolve and start native services
      for (const entry of appEntries) {
        const config =
          typeof entry.config === "object" && entry.config !== null
            ? (entry.config as ServiceConfig)
            : undefined;
        const serviceName = String(
          entry.value["name"] ?? entry.urn.split(":").pop() ?? entry.urn,
        );
        const servicePort = ports.get(serviceName) ?? 3000;
        const envValue = entry.value["env"];
        const rawEnv =
          typeof envValue === "object" && envValue !== null
            ? (envValue as Record<string, unknown>)
            : {};
        // Seal Output refs into serialized envelopes, then resolve to strings
        const sealedEnv = sealInput(rawEnv);
        const serviceEnv: Record<string, string> = {};
        for (const [k, v] of Object.entries(sealedEnv)) {
          const resolved = infra ? await infra.resolve(v) : v;
          serviceEnv[k] = String(resolved ?? "");
        }

        let command: string[];
        let nativeCwd: string;
        let include: string[];
        let exclude = DEFAULT_EXCLUDE;
        let extraEnv: Record<string, string> = {};

        if (config?.dev != null) {
          const resolved = parseDevConfig(config.dev, {
            include: ["**/*.{ts,js,json}"],
            cwd: config.cwd ? path.resolve(cwd, config.cwd) : cwd,
          });
          command = resolved.command;
          nativeCwd = resolved.cwd;
          include = resolved.include;
          exclude = resolved.exclude;
          extraEnv = resolved.env;
        } else {
          const pathValue = entry.value["path"];
          const servicePath =
            config?.path ??
            (typeof pathValue === "string" ? pathValue : undefined);
          if (!servicePath) {
            tree.setStatus(entry.urn, "failed");
            tree.stop();
            console.error(
              `\nCould not detect how to run service "${serviceName}" — no path or dev key.\n\nAdd a \`dev\` key to your service config:\n\n  service("${serviceName}", { path: "./path/to/service", dev: "npm run dev" })\n`,
            );
            continue;
          }

          const detected = await detectDev(servicePath, cwd);
          if (!detected) {
            tree.setStatus(entry.urn, "failed");
            tree.stop();
            console.error(
              `\nCould not detect how to run ${servicePath}\n\nAdd a \`dev\` key to your service config:\n\n  service("${serviceName}", { path: "${servicePath}", dev: "npm run dev" })\n`,
            );
            continue;
          }

          command = detected.command;
          nativeCwd = detected.cwd;
          include = detected.include;
        }

        const env: Record<string, string> = {
          ...serviceEnv,
          NODE_ENV: "development",
          PORT: String(servicePort),
          ...extraEnv,
        };

        const svc: NativeService = {
          name: serviceName,
          command,
          cwd: nativeCwd,
          env,
          include,
          exclude,
          proc: null,
          watcher: null,
          debounce: null,
        };

        nativeServices.push(svc);
        tree.setSuffix(entry.urn, `localhost:${servicePort}`);
        tree.setStatus(entry.urn, "done");
      }

      // Stop tree before starting processes — their stdout would corrupt cursor positioning
      tree.stop();

      for (const svc of nativeServices) {
        startProcess(svc);
        watchService(svc);
      }
    }

    async function stopNative(): Promise<void> {
      for (const svc of nativeServices) {
        if (svc.debounce) clearTimeout(svc.debounce);
        if (svc.watcher) svc.watcher.close();
        killProcess(svc);
      }
      nativeServices.length = 0;
    }

    // Initial start
    try {
      await startAll();
    } catch (err) {
      console.error(red("Failed to start:"), err);
    }

    console.log(
      `\n${dim("Watching for changes...")} ${dim("(Ctrl+C to stop)")}\n`,
    );

    // Watch config file for full reload
    let configDebounce: ReturnType<typeof setTimeout> | null = null;
    const configWatcher = fs.watch(
      cwd,
      { recursive: false },
      (_event, filename) => {
        if (!filename || !CONFIG_FILES.includes(filename)) return;

        if (configDebounce) clearTimeout(configDebounce);
        configDebounce = setTimeout(async () => {
          console.log(
            `\n${yellow(`Config changed: ${filename}`)} ${dim("— reloading...")}\n`,
          );
          await stopNative();
          try {
            await startAll();
          } catch (err) {
            console.error(red("Reload failed:"), err);
          }
        }, 300);
      },
    );

    const cleanup = async () => {
      console.log(`\n${dim("Shutting down...")}`);
      configWatcher.close();
      if (configDebounce) clearTimeout(configDebounce);
      await stopNative();
      process.exit(0);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
  });
