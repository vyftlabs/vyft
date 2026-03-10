import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  type ApplyEvent,
  apply,
  destroy,
  reconcile,
  toState,
  urn,
} from "@vyft/core";
import docker from "@vyft/docker";
import { type DevConfig, type ServiceConfig, RUNTIME_PROVIDER_NAME } from "@vyft/runtime";
import { Command } from "commander";
import { loadConfig, resolveProjectName } from "../../config.ts";
import {
  buildContext,
  buildCurrentState,
  createCipher,
  loadSalt,
  openStore,
  resolveLocalStateDir,
  resolvePassphrase,
} from "../../runtime.ts";
import { detectDev } from "./detect.ts";

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
      typeof dev.command === "string"
        ? dev.command.split(" ")
        : dev.command,
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
    .replace(/\{([^}]+)\}/g, (_m, group: string) =>
      `(?:${group.split(",").join("|")})`,
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
  const prefix = `[${name}] `;
  for (const line of data.toString().split("\n")) {
    if (line) {
      if (isErr) {
        process.stderr.write(`${prefix}${line}\n`);
      } else {
        process.stdout.write(`${prefix}${line}\n`);
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
      console.error(`[${svc.name}] exited with code ${code}`);
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
          console.log(`[${svc.name}] change detected, restarting...`);
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

async function applyInfra(
  cwd: string,
  project: string,
  infraEntries: Awaited<ReturnType<typeof loadConfig>>["entries"],
): Promise<void> {
  const stateDir = resolveLocalStateDir(cwd, project);
  const providers = {
    [RUNTIME_PROVIDER_NAME]: docker({ project, stage: "local" }),
  };
  const store = await openStore(stateDir);
  const salt = await loadSalt(stateDir);
  const passphrase = await resolvePassphrase(project, "local");
  const cipher = createCipher(passphrase, salt);
  const ctx = buildContext(store, cipher, providers, stateDir);
  await reconcile(ctx);
  const current = buildCurrentState(store);
  const desired = toState(infraEntries);
  try {
    await apply(desired, current, ctx, {
      onEvent(event: ApplyEvent) {
        const status = event.status === "pending" ? "..." : "done";
        console.log(`  ${event.action} ${event.urn} ${status}`);
      },
    });
  } finally {
    await store.dispose();
  }
}

async function destroyInfra(cwd: string, project: string): Promise<void> {
  const stateDir = resolveLocalStateDir(cwd, project);
  const providers = {
    [RUNTIME_PROVIDER_NAME]: docker({ project, stage: "local" }),
  };
  const store = await openStore(stateDir);
  const salt = await loadSalt(stateDir);
  const passphrase = await resolvePassphrase(project, "local");
  const cipher = createCipher(passphrase, salt);
  const ctx = buildContext(store, cipher, providers, stateDir);
  await reconcile(ctx);
  const current = buildCurrentState(store);
  if (Object.keys(current.entries).length === 0) {
    await store.dispose();
    return;
  }
  try {
    await destroy(current, ctx, {
      onEvent(event: ApplyEvent) {
        const status = event.status === "pending" ? "..." : "done";
        console.log(`  ${event.action} ${event.urn} ${status}`);
      },
    });
  } finally {
    await store.dispose();
  }
}

export default new Command("dev")
  .description("Start local development environment with native execution")
  .option("--stage <name>", "Deployment stage", "development")
  .option("--project <name>", "Project name")
  .action(async (opts: { stage: string; project?: string }) => {
    const cwd = process.cwd();
    const project = await resolveProjectName(cwd, opts.project);

    const nativeServices: NativeService[] = [];
    let infraRunning = false;

    async function startAll(): Promise<void> {
      const { entries } = await loadConfig(cwd);

      const infraEntries: Awaited<ReturnType<typeof loadConfig>>["entries"] =
        [];
      const appEntries: Awaited<ReturnType<typeof loadConfig>>["entries"] = [];

      for (const entry of entries) {
        const parsed = urn.parse(entry.urn);
        if (
          parsed.provider !== RUNTIME_PROVIDER_NAME ||
          parsed.resource !== "service"
        )
          continue;
        const value = entry.value as Record<string, unknown>;
        if (value["image"] != null) {
          infraEntries.push(entry);
        } else {
          appEntries.push(entry);
        }
      }

      // Start infra containers
      if (infraEntries.length > 0) {
        console.log("Starting infra containers...");
        await applyInfra(cwd, project, infraEntries);
        infraRunning = true;
      }

      // Resolve and start native services
      for (const entry of appEntries) {
        const config = entry.config as ServiceConfig | undefined;
        const value = entry.value as Record<string, unknown>;
        const serviceName = String(
          value["name"] ?? entry.urn.split(":").pop() ?? entry.urn,
        );
        const servicePort = Number(value["port"] ?? 3000);
        const serviceEnv =
          (value["env"] as Record<string, string> | undefined) ?? {};

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
          const servicePath =
            config?.path ?? (value["path"] as string | undefined);
          if (!servicePath) {
            console.error(
              `\nCould not detect how to run service "${serviceName}" — no path or dev key.\n\nAdd a \`dev\` key to your service config:\n\n  service("${serviceName}", { path: "./path/to/service", dev: "npm run dev" })\n`,
            );
            continue;
          }

          const detected = await detectDev(servicePath, cwd);
          if (!detected) {
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
        console.log(`Starting [${serviceName}]: ${command.join(" ")}`);
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
      console.error("Failed to start:", err);
    }

    console.log("\nWatching for changes... (Ctrl+C to stop)\n");

    // Watch config file for full reload
    let configDebounce: ReturnType<typeof setTimeout> | null = null;
    const configWatcher = fs.watch(
      cwd,
      { recursive: false },
      (_event, filename) => {
        if (!filename || !CONFIG_FILES.includes(filename)) return;

        if (configDebounce) clearTimeout(configDebounce);
        configDebounce = setTimeout(async () => {
          console.log(`\nConfig changed: ${filename} — reloading...\n`);
          await stopNative();
          try {
            await startAll();
          } catch (err) {
            console.error("Reload failed:", err);
          }
        }, 300);
      },
    );

    const cleanup = async () => {
      console.log("\nShutting down...");
      configWatcher.close();
      if (configDebounce) clearTimeout(configDebounce);
      await stopNative();
      if (infraRunning) {
        console.log("Stopping infra containers...");
        try {
          await destroyInfra(cwd, project);
        } catch (err) {
          console.error("Failed to stop infra:", err);
        }
      }
      process.exit(0);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
  });
