import path from "node:path";
import type { BindValue } from "@vyft/core";
import { findConfig, loadConfig, projectInfo, resolve } from "@vyft/core";
import { collect } from "@vyft/engine";
import { logger } from "@vyft/logger";
import type { DockerRuntimeOptions } from "@vyft/runtime";
import { Store } from "@vyft/store";
import type { Command } from "commander";
import { engineDeploy } from "../engine-compat.ts";
import {
  collectLinkables,
  linkEnvVarName,
  resolveClientDir,
  writeEnv,
} from "../generate.ts";
import { createRuntime } from "../runtime-factory.ts";
import {
  assignDevPorts,
  classifyServices,
  DEV_STAGE,
  loadDevSecrets,
  registerDev,
  replaceInfraHosts,
  resolveBindValue,
} from "./dev.ts";

export function registerLocal(program: Command): void {
  const local = program
    .command("local")
    .description("Local development commands");

  registerDev(local);

  local
    .command("reset")
    .description("Reset local containers and data")
    .action(async () => {
      const { root, context, project, runtimeName } = await projectInfo();
      const stage = DEV_STAGE;
      const dir = path.join(root, context, project, stage);
      const store = await Store.open(dir);

      if (store.state.size === 0) {
        logger.info("nothing to reset");
        await store.delete();
        await store.dispose();
        return;
      }

      // Local dev uses plain JSON secrets — no passphrase needed
      const secretsPath = path.join(root, "dev-secrets.json");
      const secretMap = await loadDevSecrets(secretsPath);

      const runtime = createRuntime(runtimeName, {
        project,
        stage,
        secrets: secretMap,
      });

      const previousCount = store.state.size;
      await engineDeploy([], store, runtime);
      await runtime.finalize([]);
      await runtime.teardown();

      await store.delete();
      await store.dispose();
      logger.info("reset complete: destroyed %d resources", previousCount);
    });

  local
    .command("up")
    .description("Start infra containers")
    .action(async () => {
      const { root, context, project, runtimeName } = await projectInfo();
      const stage = DEV_STAGE;
      const secretsPath = path.join(root, "dev-secrets.json");
      const configPath = await findConfig(process.cwd());

      const config = await loadConfig(configPath);
      logger.debug("loaded config from %s", configPath);

      const resources = collect(config);
      const { infra } = classifyServices(resources);

      if (infra.length === 0) {
        logger.info("no infra services to start");
        return;
      }

      // Load secrets
      const secretMap = await loadDevSecrets(secretsPath);

      // Generate resource bindings files
      const clientDir = resolveClientDir(process.cwd());
      await writeEnv(config, clientDir);

      // Build port bindings
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

      const dir = path.join(root, context, project, stage);
      const store = await Store.open(dir);
      await engineDeploy(infraResources, store, runtime);
      await store.dispose();

      logger.info("started %d infra service(s)", infra.length);
      for (const svc of infra) {
        logger.info("  %s → localhost:%d", svc.id, svc.port);
      }
    });

  local
    .command("down")
    .description("Stop infra containers")
    .action(async () => {
      const { root, context, project, runtimeName } = await projectInfo();
      const stage = DEV_STAGE;
      const dir = path.join(root, context, project, stage);
      const store = await Store.open(dir);

      if (store.state.size === 0) {
        logger.info("no containers running");
        await store.dispose();
        return;
      }

      // Local dev uses plain JSON secrets — no passphrase needed
      const secretsPath = path.join(root, "dev-secrets.json");
      const secretMap = await loadDevSecrets(secretsPath);

      const runtime = createRuntime(runtimeName, {
        project,
        stage,
        secrets: secretMap,
      });

      const previousCount = store.state.size;
      await engineDeploy([], store, runtime);
      await runtime.finalize([]);
      await runtime.teardown();

      await store.dispose();
      logger.info("stopped %d resource(s)", previousCount);
    });

  local
    .command("env <service>")
    .description("Generate .env output for a service")
    .action(async (serviceId: string) => {
      const { root } = await projectInfo();
      const secretsPath = path.join(root, "dev-secrets.json");
      const configPath = await findConfig(process.cwd());

      const config = await loadConfig(configPath);
      const resources = collect(config);
      const { infra, dev, buildOnly } = classifyServices(resources);
      const infraIds = new Set(infra.map((s) => s.id));

      // Find the service
      const allServices = [...infra, ...dev, ...buildOnly];
      const service = allServices.find((s) => s.id === serviceId);
      if (!service) {
        logger.error('service "%s" not found', serviceId);
        logger.info(
          "available services: %s",
          allServices.map((s) => s.id).join(", "),
        );
        process.exitCode = 1;
        return;
      }

      // Load secrets
      const secretMap = await loadDevSecrets(secretsPath);

      // Assign dev ports for all dev services
      const devPorts = assignDevPorts(dev);
      const servicePort = devPorts.get(serviceId);

      // Build env vars
      const envVars: Record<string, string> = {};

      // PORT (if it's a dev service with a port)
      if (servicePort) {
        envVars["PORT"] = String(servicePort);
      }

      // NODE_ENV
      envVars["NODE_ENV"] = "development";

      // Service's own env vars (with host replacement)
      if (service.config.env) {
        for (const [key, val] of Object.entries(service.config.env)) {
          envVars[key] = replaceInfraHosts(resolve(val, secretMap), infraIds);
        }
      }

      // Binding env vars from linked services
      const linkables = collectLinkables(config);
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
          envVars[envVar] = resolved;
        }
      }

      // Output in .env format
      for (const [key, value] of Object.entries(envVars)) {
        // Quote values that contain special characters
        if (/[\s"'$`\\]/.test(value)) {
          console.log(`${key}="${value.replace(/"/g, '\\"')}"`);
        } else {
          console.log(`${key}=${value}`);
        }
      }
    });
}
