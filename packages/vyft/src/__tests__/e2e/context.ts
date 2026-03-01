import { strict as assert } from "node:assert";
import type { DockerClient } from "@vyft/runtime/docker/client";
import type { K8sClient } from "@vyft/runtime/kubernetes/client";
import type { ResourceState } from "@vyft/store";

interface ContainerInspect {
  State: { Status: string; Health?: { Status: string } };
  Config: { Image: string; Env: string[] };
  Mounts: { Name?: string; Destination: string }[];
}

// ---------------------------------------------------------------------------
// Base — sync state assertions + one abstract infra check
// ---------------------------------------------------------------------------

export abstract class TestContext {
  readonly state: ResourceState[];
  protected readonly project: string;

  constructor(state: ResourceState[], project: string) {
    this.state = state;
    this.project = project;
  }

  resourceCount(n: number): void {
    assert.strictEqual(
      this.state.length,
      n,
      `Expected ${n} resources, got ${this.state.length}`,
    );
  }

  resource(id: string): ResourceState {
    const r = this.state.find((s) => s.id === id);
    assert.ok(r, `Resource "${id}" not found in state`);
    return r;
  }

  resourceKind(id: string, kind: string): void {
    assert.strictEqual(this.resource(id).kind, kind);
  }

  serviceOutputs(
    id: string,
    expected: { host?: string; port?: number; url?: string },
  ): void {
    const outputs = this.resource(id).outputs as Record<string, unknown>;
    if (expected.host !== undefined)
      assert.strictEqual(outputs["host"], expected.host);
    if (expected.port !== undefined)
      assert.strictEqual(outputs["port"], expected.port);
    if (expected.url !== undefined)
      assert.strictEqual(outputs["url"], expected.url);
  }

  /** Wait for the service to be healthy/ready. The only infra assertion that matters. */
  abstract serviceReady(id: string, timeoutMs?: number): Promise<void>;

  /** Wait for a cronjob scheduler container to be running. */
  abstract cronjobReady(id: string, timeoutMs?: number): Promise<void>;
}

// ---------------------------------------------------------------------------
// Docker — inspect by deterministic container name
// ---------------------------------------------------------------------------

export class DockerTestContext extends TestContext {
  readonly docker: DockerClient;

  constructor(state: ResourceState[], project: string, docker: DockerClient) {
    super(state, project);
    this.docker = docker;
  }

  protected containerName(id: string): string {
    return `vyft-${this.project}-${id}`;
  }

  protected async inspect(id: string): Promise<ContainerInspect> {
    const name = this.containerName(id);
    return (await this.docker.get(
      `/containers/${name}/json`,
    )) as ContainerInspect;
  }

  async serviceReady(id: string, timeoutMs = 60_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown;
    while (Date.now() < deadline) {
      try {
        const info = await this.inspect(id);
        if (!info.State.Health) {
          assert.strictEqual(
            info.State.Status,
            "running",
            `Container "${id}" not running: ${info.State.Status}`,
          );
          return;
        }
        if (info.State.Health.Status === "healthy") return;
      } catch (err) {
        lastError = err;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    assert.fail(`Service "${id}" not ready after ${timeoutMs}ms: ${lastError}`);
  }

  async cronjobReady(id: string, timeoutMs = 60_000): Promise<void> {
    await this.serviceReady(id, timeoutMs);
  }

  /** Verify an env var was set on the container. */
  async serviceEnv(id: string, key: string, value: string): Promise<void> {
    const info = await this.inspect(id);
    const entry = info.Config.Env.find((e) => e.startsWith(`${key}=`));
    assert.ok(entry, `Container "${id}" missing env "${key}"`);
    assert.strictEqual(
      entry,
      `${key}=${value}`,
      `Container "${id}" env "${key}" mismatch`,
    );
  }

  /** Verify a volume is mounted at the expected path. */
  async serviceMount(
    id: string,
    volumeId: string,
    destination: string,
  ): Promise<void> {
    const info = await this.inspect(id);
    const volName = `vyft-${this.project}-${volumeId}`;
    const mount = info.Mounts.find((m) => m.Name === volName);
    assert.ok(
      mount,
      `Container "${id}" missing mount for volume "${volumeId}"`,
    );
    assert.strictEqual(mount.Destination, destination);
  }
}

// ---------------------------------------------------------------------------
// Swarm — find containers via task filters instead of deterministic names
// ---------------------------------------------------------------------------

interface SwarmTask {
  Status: { ContainerStatus?: { ContainerID: string } };
}

export class SwarmTestContext extends DockerTestContext {
  protected override async inspect(id: string): Promise<ContainerInspect> {
    const svcName = this.containerName(id);
    const filters = encodeURIComponent(
      JSON.stringify({ service: [svcName], "desired-state": ["running"] }),
    );
    const tasks = (await this.docker.get(
      `/tasks?filters=${filters}`,
    )) as SwarmTask[];
    assert.ok(
      tasks.length > 0,
      `Swarm service "${svcName}" has no running tasks`,
    );
    const task = tasks[0];
    assert.ok(task, `Swarm service "${svcName}" returned empty task list`);
    const containerId = task.Status.ContainerStatus?.ContainerID;
    assert.ok(containerId, `Swarm task for "${svcName}" has no container ID`);
    return (await this.docker.get(
      `/containers/${containerId}/json`,
    )) as ContainerInspect;
  }
}

// ---------------------------------------------------------------------------
// K8s — poll Pod readiness via K8sClient
// ---------------------------------------------------------------------------

export class K8sTestContext extends TestContext {
  readonly k8s: K8sClient;
  private readonly namespace: string;

  constructor(state: ResourceState[], project: string, k8s: K8sClient) {
    super(state, project);
    this.k8s = k8s;
    this.namespace = `vyft-${project}`;
  }

  async serviceReady(id: string, timeoutMs = 60_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const pods = await this.k8s.listPods({
        namespace: this.namespace,
        labelSelector: `app.kubernetes.io/name=${id}`,
      });
      const pod = pods.items[0];
      const status = pod?.["status"] as
        | { phase?: string; conditions?: { type: string; status: string }[] }
        | undefined;
      if (status?.phase === "Running") {
        const ready = status.conditions?.find((c) => c.type === "Ready");
        if (ready?.status === "True") return;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    assert.fail(`Service "${id}" not ready after ${timeoutMs}ms`);
  }

  async cronjobReady(id: string, timeoutMs = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        await this.k8s.readCronJob({
          namespace: this.namespace,
          name: id,
        });
        return;
      } catch {
        // CronJob may not exist yet
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    assert.fail(`CronJob "${id}" not found after ${timeoutMs}ms`);
  }
}
