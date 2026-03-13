# Implementation Plan

Concrete steps with exact file changes. Each step is independently testable.

---

## Step 1: Update `@vyft/platform`

No new builder needed. Use the existing `createProvider` + `defineResource` pattern (same as current `bucket`, `postgres`, etc.) to add infrastructure constructors. Update `definePlatform` for new handler types.

### 1a. New resource files in `packages/platform/src/resources/`

Follow the exact pattern of `bucket.ts`:

```ts
// server.ts
import { defineResource } from "@vyft/provider";
import type { ServerInput } from "../schemas.ts";

export const serverResource = defineResource<ServerInput>("server", {});
```

```ts
// network.ts
import { defineResource } from "@vyft/provider";
import type { NetworkInput } from "../schemas.ts";

export const networkResource = defineResource<NetworkInput>("network", {});
```

```ts
// volume.ts
import { defineResource } from "@vyft/provider";
import type { VolumeInput } from "../schemas.ts";

export const volumeResource = defineResource<VolumeInput>("volume", {});
```

```ts
// firewall.ts
import { defineResource } from "@vyft/provider";
import type { FirewallInput } from "../schemas.ts";

export const firewallResource = defineResource<FirewallInput>("firewall", {});
```

### 1b. Update `packages/platform/src/resources/platform.ts`

Replace application-level resources with infrastructure resources:

```ts
// Before:
// bucket, postgres, queue, redis, site

// After:
import { createProvider } from "@vyft/provider";
import { firewallResource } from "./firewall.ts";
import { networkResource } from "./network.ts";
import { serverResource } from "./server.ts";
import { volumeResource } from "./volume.ts";

const platform = createProvider({
  name: "platform",
  context: () => ({}),
  resources: {
    server: serverResource,
    network: networkResource,
    volume: volumeResource,
    firewall: firewallResource,
  },
});

export const { server, network, volume, firewall } = platform;
```

These constructors are pre-bound to the "platform" provider name. When called, they register entries via `registry.register()` with URNs like `urn:vyft:resource:platform:server:default`. During `apply()`, dispatch resolves handlers from the real provider (hetzner/local) in `ctx.providers["platform"]` — not from the constructor's placeholder provider.

SSH key management is internal to each provider's server handler. `ServerInput.publicKeys` is the platform-agnostic interface — the provider decides how to handle them (Hetzner registers API keys, others might use cloud-init `authorized_keys`, etc.).

### 1c. Update `packages/platform/src/schemas.ts`

Add new input types, update `ServerInput`:

```ts
export interface ServerInput {
  type: string;
  image: string;
  publicKeys?: string[];    // NEW — SSH public keys to authorize on the server
  network?: string;         // NEW — reference to network resource
  firewalls?: string[];     // NEW — reference to firewall resources
  userData?: string;         // already exists
}

export interface VolumeInput {
  size?: string;
}

export interface NetworkInput {
  cidr?: string;
}

// NEW:
export interface FirewallRule {
  direction: "in" | "out";
  port: string;
  protocol: "tcp" | "udp" | "icmp";
  sourceIps: string[];
}

export interface FirewallInput {
  rules: FirewallRule[];
}
```

Remove `BucketInput`, `PostgresInput`, `QueueInput`, `SecretInput` (moved to runtime).

### 1d. Add catalog types to `packages/platform/src/catalog.ts`

```ts
export interface ServerOption {
  id: string;
  type: "shared" | "dedicated";
  cpu: number;
  memory: number;
  cost: number;
  bench: { cpu: number; disk: number; network: number };
}

export interface ServerSpec {
  id: string;
  server: string; // references ServerOption.id
  userData?: string;
}
```

### 1e. Update `packages/platform/src/outputs.ts`

Remove `BucketOutput`, `PostgresOutput`, `QueueOutput`, `SecretOutput`. Keep `ServerOutput`, `VolumeOutput`, `NetworkOutput`.

### 1f. Update `packages/platform/src/define.ts`

Replace `definePlatform` with `createPlatform` — mirroring `createRuntime`:

```ts
export function createPlatform<TOpts, TCtx>(
  name: string,
  context: (opts: TOpts) => TCtx | Promise<TCtx>,
) {
  return {
    // Identity functions — return handlers unchanged, exist for TS type inference
    server(handlers: Handlers<ServerInput, TCtx>): Handlers<ServerInput, TCtx> { return handlers; },
    network(handlers: Handlers<NetworkInput, TCtx>): Handlers<NetworkInput, TCtx> { return handlers; },
    volume(handlers: Handlers<VolumeInput, TCtx>): Handlers<VolumeInput, TCtx> { return handlers; },
    firewall(handlers: Handlers<FirewallInput, TCtx>): Handlers<FirewallInput, TCtx> { return handlers; },
    // Custom resources (ambient binding, same as createRuntime)
    resource<TInput>(name: string, handlers: Handlers<TInput, TCtx>): RuntimeResourceCallable<TInput> { ... },
    // Produce final provider factory — handlers passed explicitly
    define(config: {
      server: Handlers<ServerInput, TCtx>;
      network: Handlers<NetworkInput, TCtx>;
      volume: Handlers<VolumeInput, TCtx>;
      firewall: Handlers<FirewallInput, TCtx>;
      init?: (opts: TOpts) => void;
    }): (opts: TOpts) => Provider<TCtx> { ... },
  };
}
```

Same pattern as `createRuntime`: identity methods for type inference, explicit handler config in `define()`. No chaining — handlers are returned, not stored.

### 1g. Update `packages/platform/src/index.ts`

```ts
export { createPlatform, PLATFORM_PROVIDER_NAME } from "./define.ts";
export { server, network, volume, firewall } from "./resources/platform.ts";
export type { ServerOption, ServerSpec } from "./catalog.ts";
export type {
  FirewallInput,
  FirewallRule,
  NetworkInput,
  ServerInput,
  VolumeInput,
} from "./schemas.ts";
export type { NetworkOutput, ServerOutput, VolumeOutput } from "./outputs.ts";
```

Remove old resource exports (bucket, postgres, queue, redis, site, BucketArgs, etc.).

### 1h. Update `packages/local/src/provider.ts`

Update to use `createPlatform` builder pattern. Remove bucket/queue handlers — they belong to the runtime.

### 1i. Application resources (postgres, redis, site)

`postgres`, `redis`, and `site` resource handlers have been **removed from `@vyft/docker`** (along with the unused `client/network.ts` helper). `bucket`, `postgres`, `queue`, `redis`, `site` input types will also be removed from `@vyft/platform` schemas (see 1c).

These are runtime-level resources backed by Docker containers, not platform infrastructure. They will be re-implemented in `@vyft/std` or `@vyft/runtime` as custom resources via `docker.resource()` when needed. This is a separate migration step — not blocking the platform provisioning work.

---

## Step 2: Docker client connection factory

### 2a. Update `packages/docker/src/client/index.ts`

Change `createClient` to accept a connection factory:

```ts
import type stream from "node:stream";

export type ConnectFactory = () => stream.Duplex | Promise<stream.Duplex>;

export function createClient(connect?: ConnectFactory | string): DockerClient {
  const factory: ConnectFactory = typeof connect === "string" || connect === undefined
    ? () => net.createConnection({ path: connect ?? process.env["DOCKER_HOST"] ?? "/var/run/docker.sock" })
    : connect;

  return {
    get<T>(path: string) { return request<T>(factory, "GET", path); },
    post<T>(path: string, body?: unknown) { return request<T>(factory, "POST", path, body); },
    del<T>(path: string) { return request<T>(factory, "DELETE", path); },
  };
}
```

Change `request` to resolve connection first, then pass to `createConnection`:

```ts
function request<T>(
  connect: ConnectFactory,
  method: string,
  path: string,
  body?: unknown,
): Promise<DockerResponse<T>> {
  return new Promise(async (resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    let socket: stream.Duplex;
    try {
      socket = await connect();
    } catch (err) {
      return reject(err);
    }

    const req = http.request(
      {
        createConnection: () => socket,
        path: `${API_VERSION}${path}`,
        method,
        headers: { ... },
      },
      (res) => { /* same response handling */ },
    );
    // ... rest unchanged
  });
}
```

### 2b. New file: `packages/docker/src/ssh.ts`

```ts
import type stream from "node:stream";
import { Client as SSHClient } from "ssh2";
import type { ConnectFactory } from "./client/index.ts";

export interface SSHConnectOptions {
  host: string;           // e.g. "root@1.2.3.4"
  privateKey?: Buffer;
}

export function createSSHConnection(opts: SSHConnectOptions): {
  connect: ConnectFactory;
  close: () => void;
} {
  const [username, hostname] = parseHost(opts.host);
  const ssh = new SSHClient();
  let ready = false;

  const connectPromise = new Promise<void>((resolve, reject) => {
    ssh.on("ready", () => { ready = true; resolve(); });
    ssh.on("error", reject);
    ssh.connect({
      host: hostname,
      username,
      privateKey: opts.privateKey,
      agent: opts.privateKey ? undefined : process.env["SSH_AUTH_SOCK"],
    });
  });

  return {
    connect: async (): Promise<stream.Duplex> => {
      if (!ready) await connectPromise;
      return new Promise((resolve, reject) => {
        ssh.openssh_forwardOutStreamLocal(
          "/var/run/docker.sock",
          (err, channel) => err ? reject(err) : resolve(channel),
        );
      });
    },
    close: () => ssh.end(),
  };
}

function parseHost(host: string): [string, string] {
  const at = host.indexOf("@");
  return at === -1 ? ["root", host] : [host.slice(0, at), host.slice(at + 1)];
}
```

### 2c. Update `packages/docker/src/context.ts`

Add init and deploy context factories:

```ts
import { createClient, type ConnectFactory } from "./client/index.ts";
import { createSSHConnection } from "./ssh.ts";
import net from "node:net";

// Init context — context-scoped, no project/stage (used by context add)
export function createInitContext(opts: {
  hosts?: Record<string, string>;
  privateKey?: Buffer;
}) {
  const host = opts.hosts?.default;
  let sshConn: ReturnType<typeof createSSHConnection> | undefined;
  let connect: ConnectFactory;

  if (host) {
    sshConn = createSSHConnection({ host, privateKey: opts.privateKey });
    connect = sshConn.connect;
  } else {
    connect = () => net.createConnection({ path: "/var/run/docker.sock" });
  }

  return {
    client: createClient(connect),
    networkName: "vyft",
    dispose: () => sshConn?.close(),
  };
}

export type InitDockerContext = ReturnType<typeof createInitContext>;

// Deploy context — project-scoped, SSH-capable (used by vyft deploy)
export function createDeployContext(opts: {
  project: string;
  stage: string;
  hosts?: Record<string, string>;
  privateKey?: Buffer;
  publishPorts?: boolean;
}) {
  const host = opts.hosts?.default;
  let sshConn: ReturnType<typeof createSSHConnection> | undefined;
  let connect: ConnectFactory;

  if (host) {
    sshConn = createSSHConnection({ host, privateKey: opts.privateKey });
    connect = sshConn.connect;
  } else {
    connect = () => net.createConnection({ path: "/var/run/docker.sock" });
  }

  return {
    client: createClient(connect),
    project: opts.project,
    stage: opts.stage,
    networkName: "vyft",
    publishPorts: opts.publishPorts ?? false,
    dispose: () => sshConn?.close(),
  };
}

export type DeployDockerContext = ReturnType<typeof createDeployContext>;

// Legacy context — local dev (unchanged)
export function createContext(opts: {
  project: string;
  stage: string;
  socketPath?: string;
  publishPorts?: boolean;
}) {
  return {
    client: createClient(opts.socketPath),
    project: opts.project,
    stage: opts.stage,
    networkName: `vyft-${opts.project}-${opts.stage}`,
    publishPorts: opts.publishPorts ?? false,
  };
}

export type DockerContext = ReturnType<typeof createContext>;
```

### 2d. Refactor `packages/docker/src/resource/*.ts` to use builder pattern — DONE

**Completed.** Each built-in resource file now uses the runtime's identity helper instead of manually typing `Handlers<Input, DockerContext>`. The handlers are exported as named constants for reuse by `define()` and potential deploy-specific providers.

```ts
// resource/service.ts — actual current state
import { docker } from "../runtime.ts";

export const serviceHandlers = docker.service({
  async create({ input, ctx }) { /* ... */ },
  async read({ input, ctx }) { /* ... */ },
  async update({ input, ctx }) { /* ... */ },
  async delete({ input, ctx }) { /* ... */ },
});
```

Same pattern applied to `volume.ts` (`docker.volume()`), `job.ts` (`docker.job()`), `build.ts` (`docker.build()`), `cronjob.ts` (`docker.cronjob()`).

**Network and proxy** need to export their raw handlers separately from the resource callable, since `initRuntime()` in `provision.ts` constructs a manual Provider and needs the handler objects directly:

```ts
// resource/network.ts — updated
export const networkHandlers = {
  async create({ input, ctx }) { /* ... */ },
  async read({ input, ctx }) { /* ... */ },
  async delete({ input, ctx }) { /* ... */ },
  diff() { return { action: "none" }; },
};

const network = docker.resource<NetworkInput>("network", networkHandlers);
export default network;
```

```ts
// resource/proxy.ts — updated
export const proxyHandlers = {
  async create({ input, ctx }) { /* ... */ },
  async read({ input, ctx }) { /* ... */ },
  async update({ input, ctx }) { /* ... */ },
  async delete({ input, ctx }) { /* ... */ },
  diff() { return { action: "none" }; },
};

const proxy = docker.resource<ProxyInput>("proxy", proxyHandlers);
export default proxy;
```

This separates the handler objects (needed for manual Provider construction in `initRuntime`) from the resource callables (used in `provider.ts` init via ambient binding).

**Key detail:** The identity methods (`docker.service()`, etc.) are pure pass-through functions — they return the handlers object unchanged. They do NOT store handlers on the builder. Registration still happens explicitly via `define({ service: serviceHandlers, ... })`. This means the deploy provider can import the same handler constants and pass them to its own `define()` call — no `register()` pattern needed.

### 2e. Update `packages/docker/src/provider.ts`

`define()` requires explicit handler keys (`service`, `volume`, `job`, `cronjob`, `build`). Since the identity methods are pure pass-through (they don't store state on the builder), handlers must still be passed explicitly. The current provider already works this way:

```ts
// provider.ts — current state (local dev provider)
import { buildHandlers } from "./resource/build.ts";
import { cronjobHandlers } from "./resource/cronjob.ts";
import { jobHandlers } from "./resource/job.ts";
import network from "./resource/network.ts";
import proxy from "./resource/proxy.ts";
import { serviceHandlers } from "./resource/service.ts";
import { volumeHandlers } from "./resource/volume.ts";
import { docker } from "./runtime.ts";

export default docker.define({
  service: serviceHandlers,
  volume: volumeHandlers,
  job: jobHandlers,
  build: buildHandlers,
  cronjob: cronjobHandlers,
  init: (opts) => {
    const networkName = `vyft-${opts.project}-${opts.stage}`;
    network("default", { name: networkName });
    proxy("default", { name: `${opts.project}-${opts.stage}`, networkName });
  },
});
```

**Deploy provider:** For deploy (remote contexts), create a second runtime with a different context factory but the same handlers. Since handlers are exported as named constants, no `register()` pattern is needed — just import and reuse:

```ts
// deploy-provider.ts
import { createRuntime } from "@vyft/runtime";
import { createDeployContext } from "./context.ts";
import { buildHandlers } from "./resource/build.ts";
import { cronjobHandlers } from "./resource/cronjob.ts";
import { jobHandlers } from "./resource/job.ts";
import network from "./resource/network.ts";
import proxy from "./resource/proxy.ts";
import { serviceHandlers } from "./resource/service.ts";
import { volumeHandlers } from "./resource/volume.ts";

const dockerDeploy = createRuntime("docker", createDeployContext);

export const dockerDeployProvider = dockerDeploy.define({
  service: serviceHandlers,
  volume: volumeHandlers,
  job: jobHandlers,
  build: buildHandlers,
  cronjob: cronjobHandlers,
  // No init — runtime init runs during context add, not deploy
});
```

This works because `DockerContext` and `DeployDockerContext` share the same shape for the fields that handlers use (`client`, `project`, `stage`, `networkName`, `publishPorts`). The deploy context adds `hosts`, `privateKey`, and `dispose()` which are consumed by the context factory, not by handlers.

### 2f. New file: `packages/docker/src/setup.ts`

Runtime setup — responsible for defining ALL platform infrastructure and post-boot orchestration. Replaces the old `topology` concept. Uses standard platform constructors from `@vyft/platform` (pre-bound to the "platform" provider name — no ambient binding needed).

```ts
import { server, network, firewall } from "@vyft/platform";
import type { ServerOption } from "@vyft/platform";

const DOCKER_CLOUD_INIT = `#!/bin/bash
curl -fsSL https://get.docker.com | sh
systemctl enable docker
`;

/**
 * Sync phase — registers platform resources via pre-bound constructors.
 * The runtime decides everything: what servers, what sizes, what cloud-init.
 */
export function init(opts: {
  budget: number;
  catalog: ServerOption[];
  sshPublicKey: string;
}): void {
  const sorted = [...opts.catalog].sort((a, b) => a.cost - b.cost);
  const eligible = sorted.filter((s) => s.cost <= opts.budget);
  if (eligible.length === 0) {
    throw new Error(`No server available within $${opts.budget} budget`);
  }
  const best = eligible[eligible.length - 1]!;

  network("default", { cidr: "10.0.0.0/16" });
  firewall("default", {
    rules: [
      { direction: "in", port: "22", protocol: "tcp", sourceIps: ["0.0.0.0/0"] },
      { direction: "in", port: "80", protocol: "tcp", sourceIps: ["0.0.0.0/0"] },
      { direction: "in", port: "443", protocol: "tcp", sourceIps: ["0.0.0.0/0"] },
    ],
  });
  server("default", {
    type: best.id,
    image: "ubuntu-24.04",
    publicKeys: [opts.sshPublicKey],
    network: "default",
    firewalls: ["default"],
    userData: DOCKER_CLOUD_INIT,
  });
}

/**
 * Async phase — called after servers are provisioned.
 * Polls for SSH + Docker readiness, then orchestrates (swarm init, etc.).
 *
 * Polling: 5s interval, 120s timeout, 10s SSH connect timeout per attempt.
 * Throws with server ID + IP on timeout for manual debugging.
 */
export async function install(opts: {
  hosts: Record<string, string>;
  privateKey: Buffer;
}): Promise<void> {
  const POLL_INTERVAL = 5_000;
  const TIMEOUT = 120_000;
  const SSH_TIMEOUT = 10_000;

  for (const [id, host] of Object.entries(opts.hosts)) {
    const [username, hostname] = parseHost(host);
    const start = Date.now();

    // Phase 1: Poll SSH until accessible (server booted)
    while (true) {
      if (Date.now() - start > TIMEOUT) {
        throw new Error(
          `Timed out waiting for SSH on server "${id}" (${host}). ` +
          `Server may still be booting — re-run \`vyft context add\` to retry.`,
        );
      }
      try {
        await connectSSH({ host: hostname, username, privateKey: opts.privateKey, timeout: SSH_TIMEOUT });
        break;
      } catch {
        await sleep(POLL_INTERVAL);
      }
    }

    // Phase 2: Poll `docker info` until success (cloud-init finished)
    while (true) {
      if (Date.now() - start > TIMEOUT) {
        throw new Error(
          `SSH accessible but Docker not ready on server "${id}" (${host}). ` +
          `Cloud-init may still be running — re-run \`vyft context add\` to retry.`,
        );
      }
      try {
        await execSSH(host, opts.privateKey, "docker info");
        break;
      } catch {
        await sleep(POLL_INTERVAL);
      }
    }
  }
  // For swarm (future): swarm init on manager, join on workers
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

### 2g. Update `packages/docker/src/index.ts`

Current state (after postgres/redis/site removal):
```ts
export { createClient } from "./client/index.ts";
export { inspectContainer } from "./client/inspect.ts";
export { createContext as createDockerContext } from "./context.ts";
export { default } from "./provider.ts";
```

After SSH + deploy context changes:
```ts
export { createClient, type ConnectFactory } from "./client/index.ts";
export { inspectContainer } from "./client/inspect.ts";
export {
  createContext as createDockerContext,
  createInitContext,
  createDeployContext,
  type DockerContext,
  type InitDockerContext,
  type DeployDockerContext,
} from "./context.ts";
export { default } from "./provider.ts";
export { dockerDeployProvider } from "./deploy-provider.ts";
export { createSSHConnection } from "./ssh.ts";
export { init as setupInit, install as setupInstall } from "./setup.ts";
export { networkHandlers } from "./resource/network.ts";
export { proxyHandlers } from "./resource/proxy.ts";
```

---

## Step 3: Keyring and passphrase changes

### 3a. Update `packages/vyft/src/keyring.ts`

Add generic get/set alongside existing passphrase functions:

```ts
export async function get(key: string): Promise<string | null> {
  const Entry = await loadEntry();
  if (!Entry) return null;
  try {
    return new Entry(SERVICE, key).getPassword();
  } catch { return null; }
}

export async function set(key: string, value: string): Promise<boolean> {
  const Entry = await loadEntry();
  if (!Entry) return false;
  try {
    new Entry(SERVICE, key).setPassword(value);
    return true;
  } catch { return false; }
}

export async function del(key: string): Promise<boolean> {
  const Entry = await loadEntry();
  if (!Entry) return false;
  try {
    new Entry(SERVICE, key).deletePassword();
    return true;
  } catch { return false; }
}
```

### 3b. Update `packages/vyft/src/runtime.ts`

Change `resolvePassphrase` parameter from project to context name:

```ts
export async function resolvePassphrase(
  context: string,  // renamed from project — passphrase is per-context
  mode: "local" | "deploy" | "read",
  store: PassphraseStore = defaultStore,
): Promise<string>
```

Add `resolvePlatformStateDir`:

```ts
export function resolvePlatformStateDir(context: string): string {
  return path.join(VYFT_HOME, "context", context, "platform");
}
```

Update `resolveRuntimeDeployProvider` (init is built manually, no separate function):

```ts
export function resolveRuntimeDeployProvider(
  runtime: string,
  opts: {
    project: string;
    stage: string;
    hosts?: Record<string, string>;
    privateKey?: Buffer;
  },
): Provider<unknown> {
  // Returns dockerDeployProvider(opts) from providers.ts
}
```

---

## Step 4: Update `context add` command

### 4a. Rewrite `packages/vyft/src/commands/context/add.ts`

Major rewrite — current file is ~121 lines, new will be ~200 lines.

Key changes:
- Remove aws/gcp/k8s/ecs from select options
- Add passphrase prompt → `keyring.setPassphrase(name, passphrase)`
- Add hetzner branch: API token → fetch catalog → runtime setup → provision → install → runtime init
- Add remote branch: host prompt → verify SSH + docker info → runtime init
- Write context entry early with `status: "provisioning"` before provisioning starts
- On success, update entry to remove `status` and add final `hosts` map
- On re-run with same name: detect `status: "provisioning"`, resume from last incomplete phase

### 4b. New file: `packages/vyft/src/commands/context/provision.ts`

Coordinates platform provisioning and runtime initialization.

**SSH key generation and storage:**
- Generate Ed25519 keypair via `crypto.generateKeyPairSync("ed25519")`
- Public key needs conversion from PEM to OpenSSH format (`ssh-ed25519 AAAA...`) for Hetzner — use `ssh2`'s `utils.parseKey(pem).getPublicSSH()` + base64 encode to build the OpenSSH string. This avoids adding `sshpk` as a dependency since `ssh2` is already required by `@vyft/docker`.
- Private key stored as PEM (ssh2 accepts PEM format) → encrypted via Cipher and stored in platform store under key `meta:ssh_private_key`

```ts
import crypto from "node:crypto";
import {
  DEPENDABLE,
  RESOURCE,
  apply,
  reconcile,
  registry,
  toState,
  urn,
} from "@vyft/core";
import type { Provider, ResourceDefinition } from "@vyft/core";
import { PLATFORM_PROVIDER_NAME } from "@vyft/platform";
import { RUNTIME_PROVIDER_NAME } from "@vyft/runtime";
import {
  createInitContext,
  networkHandlers,
  proxyHandlers,
  setupInit,
  setupInstall,
} from "@vyft/docker";
import {
  buildContext,
  buildCurrentState,
  createCipher,
  loadSalt,
  openStore,
  resolvePlatformStateDir,
  resolveRuntimeStateDir,
} from "../../runtime.ts";

// ── SSH Key Generation ──────────────────────────────────────────

export function generateSSHKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey: pubPem, privateKey } = crypto.generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  // Convert PEM → OpenSSH format using ssh2 (already a dependency of @vyft/docker)
  const { utils } = require("ssh2") as typeof import("ssh2");
  const parsed = utils.parseKey(pubPem);
  if (parsed instanceof Error) throw parsed;
  const pubBlob = parsed.getPublicSSH();
  if (!pubBlob) throw new Error("Failed to convert public key to SSH format");
  const publicKey = `ssh-ed25519 ${pubBlob.toString("base64")}`;
  return { publicKey, privateKey };
}

// ── Platform Provisioning ───────────────────────────────────────

export async function provisionPlatform(opts: {
  contextName: string;
  passphrase: string;
  apiToken: string;
  budget: number;
  region: string;
  sshPublicKey: string;
  sshPrivateKey: string;
}): Promise<Record<string, string>> {
  const stateDir = resolvePlatformStateDir(opts.contextName);
  const store = await openStore(stateDir);
  const salt = await loadSalt(stateDir);
  const cipher = createCipher(opts.passphrase, salt);

  // Store SSH private key encrypted in platform store
  const encrypted = await cipher.encrypt(opts.sshPrivateKey);
  await store.append({ type: "set", key: "meta:ssh_private_key", data: encrypted });

  // Create hetzner provider (provides handlers for platform resources)
  const hetzner = await import("@vyft/hetzner");
  const platformProvider = hetzner.default({ apiToken: opts.apiToken });

  // Fetch server catalog from Hetzner API
  const catalog = await hetzner.serverOptions({ apiToken: opts.apiToken });

  // Runtime setup.init() — registers platform resources via constructors.
  // Constructors (server, network, firewall) are pre-bound to "platform" provider name.
  // SSH key management is internal to the Hetzner server handler.
  registry.begin();
  setupInit({ budget: opts.budget, catalog, sshPublicKey: opts.sshPublicKey });
  const platformEntries = registry.collect();

  // Build context with hetzner as the real platform provider.
  // Dispatch resolves handlers from ctx.providers["platform"],
  // not from the constructor's placeholder provider.
  const ctx = buildContext(
    store,
    cipher,
    { [PLATFORM_PROVIDER_NAME]: platformProvider },
    stateDir,
  );
  await reconcile(ctx);
  const current = buildCurrentState(store);
  const desired = toState(platformEntries);

  let hosts: Record<string, string> = {};
  try {
    await apply(desired, current, ctx);

    // Read server outputs from store BEFORE dispose.
    // After apply(), server outputs (including IP) are in the store state.
    for (const [key, entry] of Object.entries(store.state)) {
      const parsed = urn.parse(key);
      if (parsed.provider === "platform" && parsed.resource === "server") {
        const output = entry.output as { ipv4?: string };
        if (output.ipv4) {
          hosts[parsed.id] = `root@${output.ipv4}`;
        }
      }
    }
  } finally {
    await store.dispose();
  }

  return hosts;
}

// ── Runtime Post-Boot ───────────────────────────────────────────

export async function installRuntime(opts: {
  hosts: Record<string, string>;
  privateKey: Buffer;
}): Promise<void> {
  // Delegates to Docker setup.install()
  // Polls SSH + docker info, orchestrates if needed
  await setupInstall(opts);
}

// ── Runtime Init (Docker network + proxy) ───────────────────────

export async function initRuntime(opts: {
  contextName: string;
  passphrase: string;
  hosts: Record<string, string>;
  privateKey?: Buffer;
}): Promise<void> {
  const stateDir = resolveRuntimeStateDir(opts.contextName);
  const store = await openStore(stateDir);
  const salt = await loadSalt(stateDir);
  const cipher = createCipher(opts.passphrase, salt);

  // Build init provider manually — only network + proxy resources.
  // Network and proxy handlers only use ctx.client and ctx.networkName,
  // so InitDockerContext (which lacks project/stage) is safe at runtime.
  const initCtx = createInitContext({
    hosts: opts.hosts,
    privateKey: opts.privateKey,
  });

  const resources: Record<string, ResourceDefinition> = {
    network: { [RESOURCE]: true, name: "network", handlers: networkHandlers },
    proxy: { [RESOURCE]: true, name: "proxy", handlers: proxyHandlers },
  };

  const provider: Provider<unknown> = {
    config: {
      context: () => initCtx,
      resources,
    },
  };

  // Register init entries manually (no ambient binding needed)
  registry.begin();
  registry.register({
    [DEPENDABLE]: true,
    urn: urn.build("resource", RUNTIME_PROVIDER_NAME, "network", "default"),
    value: { name: "vyft" },
    provider,
  });
  registry.register({
    [DEPENDABLE]: true,
    urn: urn.build("resource", RUNTIME_PROVIDER_NAME, "proxy", "default"),
    value: { name: "vyft", networkName: "vyft" },
    provider,
  });
  const initEntries = registry.collect();

  const runtimeCtx = buildContext(
    store,
    cipher,
    { [RUNTIME_PROVIDER_NAME]: provider },
    stateDir,
  );
  await reconcile(runtimeCtx);
  const current = buildCurrentState(store);
  const desired = toState(initEntries);

  try {
    await apply(desired, current, runtimeCtx);
  } finally {
    initCtx.dispose();
    await store.dispose();
  }
}

// ── Remote Host Verification ────────────────────────────────────

export async function verifyRemoteHost(host: string): Promise<void> {
  // SSH connect + run `docker info`
  // Throw if fails
}
```

**Full `context add` flow for hetzner:**

```
1. Prompt: context name, passphrase, platform (hetzner), API token, budget, region
2. addContext(status: "provisioning") — early write for resumability
3. generateSSHKeyPair()
4. provisionPlatform()  — registers platform resources, applies (creates servers)
5. installRuntime()     — polls SSH + docker info (5s interval, 120s timeout)
6. initRuntime()        — creates Docker network + proxy on remote host
7. updateContext()      — removes status, adds final hosts map
```

**On re-run** (same context name with `status: "provisioning"`):
- Skip prompts — read platform/runtime from existing entry, passphrase/token from keyring
- Check platform state dir — if exists, skip step 4, read hosts from store
- Check runtime state dir — if exists, skip step 6
- Resume from first incomplete phase

---

## Step 5: Hetzner platform — `@vyft/hetzner`

Uses the new `createPlatform` builder pattern (from Step 1f). The hetzner package provides handlers for the standard platform resources. Server catalog is a separate async export.

### 5a. New package: `packages/hetzner/`

```
packages/hetzner/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts          # exports
    ├── provider.ts       # createPlatform builder with inline handlers
    ├── catalog.ts        # serverOptions — async, fetches from API
    └── client.ts         # Hetzner API HTTP client (generic request method)
```

### 5b. `packages/hetzner/src/client.ts`

Generic HTTP client — handlers call `request()` directly with Hetzner API paths.

```ts
const BASE = "https://api.hetzner.cloud/v1";

export class HetznerClient {
  token: string;
  constructor(token: string) { this.token = token; }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`Hetzner API ${method} ${path}: ${res.status}`);
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }
}
```

### 5c. `packages/hetzner/src/provider.ts`

Uses `createPlatform` with identity methods + explicit `define()` config (same pattern as Docker runtime). Handlers are inline — no separate resource files.

```ts
import { createPlatform } from "@vyft/platform";
import { HetznerClient } from "./client.ts";

const hetzner = createPlatform("hetzner", (opts: { apiToken: string }) => ({
  client: new HetznerClient(opts.apiToken),
}));

const serverHandlers = hetzner.server({
  async create({ input, ctx }) {
    // Create SSH keys from publicKeys (Hetzner-internal)
    const sshKeyIds: number[] = [];
    for (const key of input.publicKeys ?? []) {
      const res = await ctx.client.request<{ ssh_key: { id: number } }>(
        "POST", "/ssh_keys", { name: `vyft-${Date.now()}`, public_key: key },
      );
      sshKeyIds.push(res.ssh_key.id);
    }

    const res = await ctx.client.request<{ server: { id: number; public_net: { ipv4: { ip: string } } } }>(
      "POST", "/servers", {
        name: `vyft-server-${input.type}`,
        server_type: input.type,
        image: input.image,
        ssh_keys: sshKeyIds,
        user_data: input.userData,
      },
    );

    return {
      externalId: String(res.server.id),
      output: { ipv4: res.server.public_net.ipv4.ip, sshKeyIds },
    };
  },
  async read({ externalId, ctx }) {
    const res = await ctx.client.request<{ server: { id: number; public_net: { ipv4: { ip: string } } } }>(
      "GET", `/servers/${externalId}`,
    );
    return { ipv4: res.server.public_net.ipv4.ip };
  },
  async delete({ externalId, output, ctx }) {
    for (const id of (output as { sshKeyIds?: number[] }).sshKeyIds ?? []) {
      await ctx.client.request("DELETE", `/ssh_keys/${id}`);
    }
    await ctx.client.request("DELETE", `/servers/${externalId}`);
  },
});

const networkHandlers = hetzner.network({
  async create({ input, ctx }) {
    const res = await ctx.client.request<{ network: { id: number } }>(
      "POST", "/networks", { name: "vyft", ip_range: input.cidr ?? "10.0.0.0/16" },
    );
    return { externalId: String(res.network.id), output: { id: res.network.id } };
  },
  async read({ externalId, ctx }) {
    const res = await ctx.client.request<{ network: { id: number } }>("GET", `/networks/${externalId}`);
    return { id: res.network.id };
  },
  async delete({ externalId, ctx }) {
    await ctx.client.request("DELETE", `/networks/${externalId}`);
  },
});

const firewallHandlers = hetzner.firewall({
  async create({ input, ctx }) {
    const res = await ctx.client.request<{ firewall: { id: number } }>(
      "POST", "/firewalls", {
        name: "vyft",
        rules: input.rules.map((r) => ({
          direction: r.direction,
          port: r.port,
          protocol: r.protocol,
          source_ips: r.sourceIps,
        })),
      },
    );
    return { externalId: String(res.firewall.id), output: { id: res.firewall.id } };
  },
  async delete({ externalId, ctx }) {
    await ctx.client.request("DELETE", `/firewalls/${externalId}`);
  },
});

const volumeHandlers = hetzner.volume({
  async create({ input, ctx }) {
    const res = await ctx.client.request<{ volume: { id: number } }>(
      "POST", "/volumes", { name: "vyft", size: Number(input.size ?? "10") },
    );
    return { externalId: String(res.volume.id), output: { name: `vyft-${res.volume.id}` } };
  },
  async delete({ externalId, ctx }) {
    await ctx.client.request("DELETE", `/volumes/${externalId}`);
  },
});

export default hetzner.define({
  server: serverHandlers,
  network: networkHandlers,
  firewall: firewallHandlers,
  volume: volumeHandlers,
});
```

This keeps SSH key lifecycle tied to the server — no orphaned keys, no separate state tracking.

### 5d. `packages/hetzner/src/catalog.ts`

Separate async function — needs API access to fetch server types:

```ts
import type { ServerOption } from "@vyft/platform";
import { HetznerClient } from "./client.ts";

export async function serverOptions(opts: {
  apiToken: string;
}): Promise<ServerOption[]> {
  const client = new HetznerClient(opts.apiToken);
  const types = await client.listServerTypes();
  return types.map((t) => ({
    id: t.name,
    type: t.cpu_type === "shared" ? "shared" as const : "dedicated" as const,
    cpu: t.cores,
    memory: t.memory,
    cost: t.prices[0].price_monthly.gross,
    bench: { cpu: t.benchmark, disk: 0, network: 0 },
  }));
}
```

### 5e. `packages/hetzner/src/index.ts`

```ts
export { default } from "./provider.ts";
export { serverOptions } from "./catalog.ts";
```

---

## Step 6: Simplify deploy command

### 6a. Update `packages/vyft/src/commands/deploy.ts`

Deploy becomes single-phase for **remote contexts** (with `connection.hosts`). For **local contexts** (no hosts), keep the existing two-phase behavior so local dev continues working without `context add`.

**Remote contexts — skip Phase 1, add SSH key retrieval:**

```ts
const hosts = context.entry.connection?.hosts;
let privateKey: Buffer | undefined;

if (hosts) {
  // Remote context — runtime init already ran during context add.
  // Retrieve SSH key if hetzner platform.
  if (context.entry.platform === "hetzner") {
    const platformDir = resolvePlatformStateDir(context.name);
    const platformStore = await openStore(platformDir);
    const platformSalt = await loadSalt(platformDir);
    const passphrase = await resolvePassphrase(context.name, "deploy");
    const platformCipher = createCipher(passphrase, platformSalt);

    const encryptedKey = platformStore.get("meta:ssh_private_key");
    if (encryptedKey) {
      const keyPem = await platformCipher.decrypt(encryptedKey);
      privateKey = Buffer.from(keyPem);
    }
    await platformStore.dispose();
  }

  const runtimeProvider = resolveRuntimeDeployProvider(
    context.entry.runtime,
    { project, stage: opts.stage, hosts, privateKey },
  );

  // Skip Phase 1 — go straight to user resources (Phase 2)
  // ...
} else {
  // Local context — keep existing two-phase behavior (Phase 1: runtime init, Phase 2: user resources)
  // Uses the local dev provider with per-project-stage network + proxy
  // ...
}
```

Change `resolvePassphrase(project, "deploy")` → `resolvePassphrase(context.name, "deploy")`.

Note: If Docker network/proxy gets deleted between deploys on a remote context, re-run `context add` to re-provision.

### 6b. Update `packages/vyft/src/commands/destroy.ts`

Same passphrase change and SSH key retrieval pattern.

---

## Step 7: Update `context remove` command

### 7a. Rewrite `packages/vyft/src/commands/context/remove.ts`

Current: ~40 lines, just deletes JSON entry.
New: ~100 lines with infrastructure teardown.

```
1. Read context entry
2. Confirm with user
3. Resolve passphrase from keyring
4. If hetzner: open platform store → read + decrypt SSH private key
   (stored at "meta:ssh_private_key")
5. Destroy runtime store (Docker network + proxy via SSH)
6. Destroy platform store — apply(empty) deletes all platform resources
   (servers + their SSH keys, network, firewall) via normal resource lifecycle
7. Delete state dirs (rm -rf ~/.vyft/context/{name}/)
8. Clean keyring entries (keyring.del(name))
9. Remove from vyft.json
```

---

## Step 8: Simplify `providers.ts` — PARTIALLY DONE

### 8a. Update `packages/vyft/src/providers.ts`

**Completed:**
- Removed `withFallbackResources` function
- Removed `postgresHandlers`/`redisHandlers`/`siteHandlers` imports from `@vyft/docker`
- Removed `createDockerContext` import
- Simplified `platforms` map: `"remote"` maps directly to `local({})`

**Current state:**
```ts
import type { Provider } from "@vyft/core";
import docker from "@vyft/docker";
import local from "@vyft/local";

type ProviderFactory = (opts: { project: string; stage: string }) => Provider<unknown>;

export const runtimes = new Map<string, ProviderFactory>([
  ["docker", ({ project, stage }) => docker({ project, stage })],
]);

export const platforms = new Map<string, ProviderFactory>([
  ["remote", () => local({})],
]);
```

**Still needed** (depends on Steps 2, 5):
- Switch `runtimes` to use `dockerDeployProvider` (from deploy-provider.ts)
- Add `"hetzner"` entry to `platforms` map
- Add `platformModules` map for lazy-loading platform packages during `context add`

**Target state:**
```ts
import { dockerDeployProvider } from "@vyft/docker";
import type { Provider } from "@vyft/core";
import type { ServerOption } from "@vyft/platform";

interface RuntimeProviderFactory {
  (opts: {
    project: string;
    stage: string;
    hosts?: Record<string, string>;
    privateKey?: Buffer;
  }): Provider<unknown>;
}

export const runtimes = new Map<string, RuntimeProviderFactory>([
  ["docker", (opts) => dockerDeployProvider(opts)],
]);

interface PlatformModule {
  default: (opts: { apiToken: string }) => Provider<unknown>;
  serverOptions: (opts: { apiToken: string }) => Promise<ServerOption[]>;
}

export const platformModules = new Map<string, () => Promise<PlatformModule>>([
  ["hetzner", () => import("@vyft/hetzner")],
]);
```

---

## Step 9: Update `contexts.ts` types

### 9a. Update `packages/vyft/src/contexts.ts`

```ts
export interface ContextEntry {
  platform: string;
  runtime: string;
  status?: "provisioning";  // set early during context add, removed on success
  connection?: {
    hosts?: Record<string, string>;
  };
  platformConfig?: {
    budget?: number;
    region?: string;
  };
}
```

**Resumability**: `context add` writes the entry with `status: "provisioning"` before starting any provisioning work. On re-run with the same name:
1. Detect `status: "provisioning"` on the existing entry
2. Check which stores already have state (platform dir exists? runtime dir exists?)
3. Skip completed phases, resume from the first incomplete one
4. The engine's `reconcile()` handles partial applies within each store (pending → committed or removed)
5. On success, update the entry to remove `status`

---

## Step 10: Add dependencies

```bash
# SSH transport for Docker client + PEM → OpenSSH key format conversion
# ssh2 is used for both SSH transport and key parsing (utils.parseKey),
# avoiding the need for a separate sshpk dependency.
pnpm add ssh2 --filter @vyft/docker
pnpm add -D @types/ssh2 --filter @vyft/docker
```

---

## Execution Order

```
Step 10 (ssh2 dep)         ── prerequisite for step 2
         │
Step 1 (platform update)  ──┐
Step 2 (Docker client)    ──┤── independent, can run in parallel
Step 3 (keyring/passphrase)┘
         │
Step 9 (contexts.ts types) ── prerequisite for steps 4, 6, 7
         │
Step 5 (hetzner)        ──── depends on 1
Step 4 (context add)    ──── depends on 1, 2, 3, 5, 9
Step 6 (deploy)         ──── depends on 2, 3, 9
Step 7 (context remove) ──── depends on 2, 3, 5, 9
Step 8 (providers.ts)   ──── depends on 2, 5
```

Critical path: **10 → 2 → 4** (ssh2 → Docker client → context add)
