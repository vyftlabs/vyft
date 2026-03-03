import path from "node:path";
import type { BindValue } from "@vyft/core";
import { findConfig, loadConfig, projectInfo, resolve } from "@vyft/core";
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
      const store = createFileStore(root);

      const previous = await store.load(context, project, stage);
      if (!previous || previous.resources.length === 0) {
        log.info("nothing to reset");
        await store.delete(context, project, stage);
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

      await engineDeploy([], previous.resources, runtime);
      await runtime.finalize([]);
      await runtime.teardown();

      await store.delete(context, project, stage);
      log.info(
        "reset complete: destroyed %d resources",
        previous.resources.length,
      );
    });

  local
    .command("up")
    .description("Start infra containers")
    .action(async () => {
      const { root, context, project, runtimeName } = await projectInfo();
      const stage = DEV_STAGE;
      const secretsPath = path.join(root, "dev-secrets.json");
      const configPath = await findConfig(process.cwd());
      const store = createFileStore(root);

      const config = await loadConfig(configPath);
      log.debug("loaded config from %s", configPath);

      const resources = collect(config);
      const { infra } = classifyServices(resources);

      if (infra.length === 0) {
        log.info("no infra services to start");
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

      log.info("started %d infra service(s)", infra.length);
      for (const svc of infra) {
        log.info("  %s → localhost:%d", svc.id, svc.port);
      }
    });

  local
    .command("down")
    .description("Stop infra containers")
    .action(async () => {
      const { root, context, project, runtimeName } = await projectInfo();
      const stage = DEV_STAGE;
      const store = createFileStore(root);

      const previous = await store.load(context, project, stage);
      if (!previous || previous.resources.length === 0) {
        log.info("no containers running");
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

      await engineDeploy([], previous.resources, runtime);
      await runtime.finalize([]);
      await runtime.teardown();

      // Save empty state (don't delete like reset does)
      await store.save(context, project, stage, {
        version: 1,
        manifest: { timestamp: new Date().toISOString(), tool: "vyft" },
        resources: [],
        secrets: null,
        secretOutputs: null,
      });

      log.info("stopped %d resource(s)", previous.resources.length);
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
        log.error('service "%s" not found', serviceId);
        log.info(
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
