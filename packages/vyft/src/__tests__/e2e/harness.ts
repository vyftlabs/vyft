import { randomBytes } from "node:crypto";
import type { RuntimeName } from "@vyft/core";
import { collect, deploy } from "@vyft/engine";
import type { DockerClient } from "@vyft/runtime/docker/client";
import { createDockerClient } from "@vyft/runtime/docker/client";
import type { K8sClient } from "@vyft/runtime/kubernetes/client";
import { loadK8sClient } from "@vyft/runtime/kubernetes/client";
import type { ResourceState } from "@vyft/store";
import { createRuntime } from "../../runtime-factory.ts";
import {
  DockerTestContext,
  K8sTestContext,
  SwarmTestContext,
  type TestContext,
} from "./context.ts";

export type { TestContext };

export interface TestCase {
  config: unknown;
  check: (t: TestContext) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Availability checks
// ---------------------------------------------------------------------------

async function dockerAvailable(): Promise<boolean> {
  try {
    const client = createDockerClient();
    await client.get("/info");
    return true;
  } catch {
    return false;
  }
}

async function swarmAvailable(): Promise<boolean> {
  try {
    const client = createDockerClient();
    await client.get("/swarm");
    return true;
  } catch {
    return false;
  }
}

async function k8sAvailable(): Promise<boolean> {
  try {
    const client = await loadK8sClient();
    await client.readNamespace({ name: "default" });
    return true;
  } catch {
    return false;
  }
}

const availabilityChecks: Record<RuntimeName, () => Promise<boolean>> = {
  docker: dockerAvailable,
  swarm: swarmAvailable,
  k8s: k8sAvailable,
};

export async function checkAvailability(name: RuntimeName): Promise<boolean> {
  return availabilityChecks[name]();
}

// ---------------------------------------------------------------------------
// Context factory
// ---------------------------------------------------------------------------

function createTestContext(
  runtime: RuntimeName,
  state: ResourceState[],
  project: string,
  docker: DockerClient | null,
  k8s: K8sClient | null,
): TestContext {
  switch (runtime) {
    case "docker": {
      if (!docker) throw new Error("docker client required for docker runtime");
      return new DockerTestContext(state, project, docker);
    }
    case "swarm": {
      if (!docker) throw new Error("docker client required for swarm runtime");
      return new SwarmTestContext(state, project, docker);
    }
    case "k8s": {
      if (!k8s) throw new Error("k8s client required for k8s runtime");
      return new K8sTestContext(state, project, k8s);
    }
  }
}

// ---------------------------------------------------------------------------
// Run a single test case: deploy → check → teardown
// ---------------------------------------------------------------------------

export async function runCase(
  runtime: RuntimeName,
  caseName: string,
  mod: TestCase,
): Promise<void> {
  const suffix = randomBytes(3).toString("hex");
  const project = `e2e-${caseName}-${suffix}`;
  const stage = "test";
  const secrets = autoSecrets(mod.config);

  const rt = createRuntime(runtime, { project, stage, secrets });

  // Eagerly create clients for context building + cleanup
  const docker =
    runtime === "docker" || runtime === "swarm" ? createDockerClient() : null;
  const k8s = runtime === "k8s" ? await loadK8sClient() : null;

  let state: ResourceState[] = [];

  try {
    const result = await deploy(mod.config, [], rt);
    state = result.state;

    const ctx = createTestContext(runtime, state, project, docker, k8s);
    await mod.check(ctx);
  } finally {
    // Destroy all resources
    try {
      await deploy({}, state, rt);
    } catch {
      // Best-effort destroy
    }

    // Teardown runtime infrastructure (network, proxy, namespace)
    try {
      await rt.teardown();
    } catch {
      // Best-effort teardown
    }

    // Force-cleanup strays
    if (docker) await forceDockerCleanup(docker, project, runtime === "swarm");
    if (k8s) await forceK8sCleanup(k8s, project);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function autoSecrets(config: unknown): Map<string, string> {
  const secrets = new Map<string, string>();
  for (const r of collect(config)) {
    if (r.kind === "config") {
      secrets.set(r.id, `test-${r.id}`);
    }
  }
  return secrets;
}

// ---------------------------------------------------------------------------
// Force cleanup — Docker / Swarm
// ---------------------------------------------------------------------------

async function forceDockerCleanup(
  client: DockerClient,
  project: string,
  swarm: boolean,
): Promise<void> {
  const prefix = `vyft-${project}`;

  // Remove swarm services first (they recreate containers)
  if (swarm) {
    try {
      const services = (await client.get(
        `/services?filters=${encodeURIComponent(JSON.stringify({ name: [prefix] }))}`,
      )) as { ID: string }[];
      for (const svc of services) {
        try {
          await client.del(`/services/${svc.ID}`);
        } catch {
          /* already removed */
        }
      }
    } catch {
      /* no services */
    }
  }

  // Remove containers
  try {
    const containers = (await client.get(
      `/containers/json?all=true&filters=${encodeURIComponent(JSON.stringify({ name: [`^/${prefix}`] }))}`,
    )) as { Id: string }[];
    for (const c of containers) {
      try {
        await client.post(`/containers/${c.Id}/stop?t=2`);
      } catch {
        /* already stopped */
      }
      await client.del(`/containers/${c.Id}?force=true`);
    }
  } catch {
    /* no containers */
  }

  // Remove volumes
  try {
    const volumes = (await client.get("/volumes")) as {
      Volumes: { Name: string }[] | null;
    };
    for (const v of volumes.Volumes ?? []) {
      if (v.Name.startsWith(prefix)) {
        try {
          await client.del(`/volumes/${v.Name}`);
        } catch {
          /* in use */
        }
      }
    }
  } catch {
    /* no volumes */
  }

  // Remove networks
  try {
    await client.del(`/networks/${prefix}`);
  } catch {
    /* no network */
  }
}

// ---------------------------------------------------------------------------
// Force cleanup — K8s (cascading namespace delete)
// ---------------------------------------------------------------------------

async function forceK8sCleanup(
  client: K8sClient,
  project: string,
): Promise<void> {
  const namespace = `vyft-${project}`;
  try {
    await client.deleteNamespace({ name: namespace });
  } catch {
    // Namespace may not exist
  }
}
