# Platform Provisioning & `context add`

## Vision

A user runs `vyft context add`, picks a platform (Hetzner or remote), and vyft provisions the infrastructure for them. Once the context is ready, `vyft deploy` applies their app resources onto that infrastructure. No manual server setup, no SSH, no Terraform.

The flow:

```
vyft context add production
  → Platform: hetzner / remote
  → Encryption passphrase: ****
  → Runtime: Docker
  → (hetzner) API token: ****
  → (hetzner) Monthly budget: $10
  → (hetzner) Region: fsn1
  → (remote) Host: root@1.2.3.4
  → (hetzner) Provisioning server... ✓
  → Setting up Docker runtime... ✓
  → Context "production" created.

vyft deploy
  → User resources (services, volumes, jobs)
```

## Current State

### What exists
- `@vyft/platform` — SDK with `definePlatform(config)` that takes `PlatformConfig<TOpts, TCtx>` (name, context fn, handlers map) and returns `(opts) => Provider<TCtx>`. Defines input schemas (`ServerInput`, `VolumeInput`, `NetworkInput`, `BucketInput`, `PostgresInput`, `QueueInput`, `SecretInput`) and output types (`ServerOutput { id, host, privateKey }`, etc.)
- `@vyft/local` — stub platform using `definePlatform`. Returns `{ id: "local", host: "localhost", privateKey: "" }` for servers. Implements server, volume, network, bucket, queue handlers — all no-ops with hardcoded outputs.
- `@vyft/runtime` — `createRuntime(name, contextFn)` builder with identity methods (`.service()`, `.volume()`, `.job()`, etc.) for type inference, `.resource()` for custom resources, and `.define()` to produce a provider factory. Uses ambient binding (module-level state) during `init()` to track the active provider.
- `@vyft/docker` — Docker runtime built on `createRuntime("docker", createContext)`. Context: `{ client, project, stage, networkName, publishPorts }`. Client connects via Unix socket (`/var/run/docker.sock`) using `http.request({ socketPath })` against Docker API v1.47. Init creates per-project-stage network (`vyft-{project}-{stage}`) and Caddy reverse proxy. Resources: service, volume, job, cronjob, build (registered via `docker.service()`, `docker.volume()`, etc. identity helpers), network, proxy (registered via `docker.resource()`).
- `context add` — interactive CLI (uses `@clack/prompts`) that prompts for name, platform (remote/hetzner/aws/gcp), runtime (docker/k8s/ecs), and optionally connection host/endpoint. Stores `{ platform, runtime, connection? }` in `.vyft/vyft.json`. No provisioning, no passphrase prompt.
- `providers.ts` — `runtimes` map: only `docker` implemented. `platforms` map: only `remote` implemented (wraps `local({})`). `hetzner`, `aws`, `gcp` appear in the context add prompts but have no provider entries.
- Keyring — `packages/vyft/src/keyring.ts` wraps `@napi-rs/keyring`. `getPassphrase(project)` / `setPassphrase(project, value)` using service="vyft", account=project. Lazy-loaded, graceful fallback if unavailable.
- Passphrase resolution — `resolvePassphrase(project, mode)` in `runtime.ts`. Checks `VYFT_PASSPHRASE` env → keyring → prompt (or auto-generate in "local" mode). Used during deploy/destroy, not during `context add`.
- Encryption — `Cipher` class in `@vyft/core/src/secret.ts`. Key derivation: scrypt(passphrase, salt, 32 bytes, N=32768, r=8, p=1). Encryption: AES-256-GCM with random 12-byte IV. Output: `{ kind: "secret", ciphertext, alg, iv, tag }` (all base64). Salt: 16 random bytes, persisted in `salt` file per store.
- Store — `Store.open(backend)` acquires file lock, reads `state.json`, replays `wal.jsonl`, compacts on open. `append()` writes WAL + updates in-memory state. `dispose()` compacts + releases lock. `LocalBackend` uses atomic temp-file+rename writes.
- Engine — `plan()` generates topologically-sorted steps (ASAP→ALAP scheduling). `execute()` runs steps in parallel within each step, sequentially across steps. Dispatcher calls `resolve()` which expands URN refs, calls create/update/delete handlers, encrypts outputs. `reconcile()` recovers pending entries from crashes.
- Deploy — two phases: (1) runtime init — opens store at `~/.vyft/context/{ctx}/runtime/`, calls `provider.config.init()`, applies init entries; (2) user resources — opens store at `~/.vyft/context/{ctx}/project/{project}/stage/{stage}/`, loads `vyft.config.ts`, applies user resources. Health check polling after apply.
- Destroy — single-phase, project resources only. Opens project store, confirms with user, calls `destroy()` from `@vyft/core`. No `--all` flag yet.
- Context remove — `removeContext(cwd, name)` in `contexts.ts`. File operation only — deletes entry from `.vyft/vyft.json`, switches current if needed. No infrastructure teardown.

### What's missing
1. No real platform implementation (Hetzner) — only `@vyft/local` stub exists
2. `context add` doesn't provision anything — just stores config to `.vyft/vyft.json`
3. No way to pass platform-specific credentials (API tokens) during `context add`
4. No encryption passphrase prompt during `context add` — `resolvePassphrase` only runs during deploy
5. No connection between platform server output and runtime context (e.g. server host → Docker SSH target)
6. Docker client only supports Unix socket — no SSH/remote transport
7. Runtime init is per-project-stage scoped (network: `vyft-{project}-{stage}`), not context-scoped as the plan requires
8. `context remove` has no infrastructure teardown — just removes the JSON entry
9. `platforms` map in `providers.ts` only has `remote` — no `hetzner` entry

## Design

### Platforms: hetzner and remote

Only two platforms are supported:

- **hetzner** — fully managed. `context add` provisions a Hetzner cloud server, network, firewall, and SSH key. The server host is stored in the context entry.
- **remote** — bring your own server. User provides a host/IP during `context add`. No provisioning.

### `context add` flow

```
1. Name         → context name (e.g. "production")
2. Platform     → hetzner | remote
3. Passphrase   → encryption passphrase (stored in OS keyring)
4. Runtime      → docker (only option for now)
5. If hetzner:
   a. API token   → stored in keyring
   b. Budget      → passed to runtime.topology() with platform catalog
   c. Region      → default: fsn1
   d. Provision   → create SSH key, network, firewall, server
   e. Wait        → poll until server is ready + Docker available
6. If remote:
   a. Host        → SSH host (e.g. root@1.2.3.4)
   b. Verify      → check SSH connectivity + Docker installed
7. Runtime init → setup Docker network, proxy on server
8. Save context → write to .vyft/vyft.json
```

Both platform provisioning and runtime init happen inline during `context add` — the user waits for everything to be ready. For Hetzner this is ~30-60s for provisioning + a few seconds for runtime init.

### Context entry

```ts
interface ContextEntry {
  platform: string;        // "hetzner" | "remote"
  runtime: string;         // "docker"
  status?: "provisioning"; // set during context add, removed on success
  connection?: {
    hosts?: Record<string, string>;  // server ID → SSH host
    // Docker: { "default": "root@1.2.3.4" }
    // Swarm:  { "manager": "root@1.2.3.4", "worker-1": "root@5.6.7.8" }
  };
  platformConfig?: {
    budget?: number;       // monthly budget in USD
    region?: string;       // e.g. "fsn1"
  };
}
```

The API token is NOT stored in the context entry — it goes to the OS keyring via `@napi-rs/keyring` (keyed by context name). The passphrase also goes to the keyring.

### Credential storage

- **Encryption passphrase** → OS keyring via existing `keyring.setPassphrase(context, passphrase)` (service: `"vyft"`, account: context name). Re-keyed from project to context — all three stores (platform, runtime, project) within a context share the same passphrase (each has its own salt, so different derived keys). `resolvePassphrase` changes from `resolvePassphrase(project, mode)` to `resolvePassphrase(context, mode)`. Local dev commands are unaffected — they use `~/.vyft/local/{project}/` with auto-generated passphrases, separate from the context system.
- **Hetzner API token** → OS keyring (new entry, key: `vyft:{context}:hetzner-token`) — requires adding a generic `keyring.set(key, value)` / `keyring.get(key)` API alongside the existing passphrase-specific functions
- **SSH private key** → encrypted via existing `Cipher` class (AES-256-GCM, scrypt-derived key from passphrase + salt) and stored in platform state store (`~/.vyft/context/{ctx}/platform/`)

No plaintext credentials on disk. The keyring is the source of truth for tokens and passphrases. The SSH key pair is generated during provisioning — the public key is uploaded to Hetzner, the private key is encrypted in the platform store using the same `Cipher` + `Store` infrastructure that deploy uses for secrets.

### Three state scopes

State is split into three scopes, each with its own store:

| Scope | Path | Lifecycle | Contains |
|-------|------|-----------|----------|
| **Platform** | `~/.vyft/context/{ctx}/platform/` | Written by `context add`, read by `context remove` | Server ID/host, network ID, firewall ID, SSH key ID |
| **Runtime** | `~/.vyft/context/{ctx}/runtime/` | Written by `context add`, idempotent on re-run | Docker network, reverse proxy — shared across all projects |
| **Project** | `~/.vyft/context/{ctx}/project/{project}/stage/{stage}/` | Written by `vyft deploy` | User resources — services, volumes, jobs |

Platform and runtime are **context-scoped** — they exist once per context and are shared across all projects deployed to that context. Project state is **project/stage-scoped**.

Both platform and runtime state are created during `context add`. `vyft deploy` only touches project state.

### Runtime owns topology, platform owns catalog

The runtime decides the topology (how many servers, what roles). The platform exposes what it offers (standardized server catalog). `context add` coordinates between them.

**Standardized server catalog** — platform-specific IDs with standardized metadata:
```ts
interface ServerOption {
  id: string;                      // platform-specific: "cx32", "ccx23", "t3.medium"
  type: "shared" | "dedicated";   // CPU allocation model
  cpu: number;                     // vCPUs
  memory: number;                  // GB
  cost: number;                    // monthly USD
  bench: {
    cpu: number;                   // multi-core score (normalized)
    disk: number;                  // sequential I/O MB/s
    network: number;               // bandwidth Gbps
  };
}

// Platform exposes catalog for a region
platform.serverOptions(region?: string) → ServerOption[]

// Hetzner returns:
// [
//   { id: "cx22",  type: "shared",    cpu: 2, memory: 4,  cost: 5,  bench: { cpu: 1600, disk: 400, network: 1 } },
//   { id: "cx32",  type: "shared",    cpu: 4, memory: 8,  cost: 10, bench: { cpu: 3200, disk: 400, network: 1 } },
//   { id: "cx42",  type: "shared",    cpu: 8, memory: 16, cost: 20, bench: { cpu: 6400, disk: 400, network: 1 } },
//   { id: "ccx13", type: "dedicated", cpu: 2, memory: 8,  cost: 12, bench: { cpu: 2900, disk: 600, network: 1 } },
//   { id: "ccx23", type: "dedicated", cpu: 4, memory: 16, cost: 17, bench: { cpu: 5800, disk: 600, network: 1 } },
//   { id: "ccx33", type: "dedicated", cpu: 8, memory: 32, cost: 30, bench: { cpu: 11600, disk: 600, network: 1 } },
// ]
```

**Runtime topology function** — receives budget + full catalog, returns server specs:
```ts
interface ServerSpec {
  id: string;       // role: "default", "manager", "worker-1"
  server: string;   // references ServerOption.id: "cx32", "ccx23"
}

// Docker — pick the biggest single server within budget (respecting type preference)
topology: (budget, catalog) => {
  const best = catalog.filter(s => s.cost <= budget).at(-1);
  return [{ id: "default", server: best.id }];
}

// Swarm (future) — manager on shared + workers on user's preferred type
topology: (budget, catalog) => {
  const manager = catalog.filter(s => s.type === "shared")[0];
  const remaining = budget - manager.cost;
  const workerType = catalog.filter(s => s.cost <= remaining).at(-1);
  const workerCount = Math.floor(remaining / workerType.cost);
  return [
    { id: "manager", server: manager.id },
    ...Array.from({ length: workerCount }, (_, i) =>
      ({ id: `worker-${i + 1}`, server: workerType.id })),
  ];
}
```

The runtime sees the full catalog with `type` on each entry and makes its own decisions — it can filter by shared/dedicated per role. The user's type preference (shared vs dedicated) is passed during `context add` as a prompt choice, and the runtime uses it however it wants.

**The flow during `context add`**:
1. `platform.serverOptions(region)` → standardized catalog (platform exposes)
2. `runtime.topology(budget, catalog)` → server specs (runtime decides)
3. `platform.init({ servers: specs, ... })` → provisions servers (platform executes)
4. Read server outputs from platform store → hosts per server ID
5. `runtime.init({ hosts })` → sets up Docker/Swarm/k8s on those hosts (runtime configures)

Three clean boundaries:
- **Platform**: "here's what I offer" (catalog) + "provision these servers" (init)
- **Runtime**: "given this catalog and budget, here's what I need" (topology) + "set up the cluster" (init)
- **`context add`**: passes catalog from platform to runtime, passes specs from runtime to platform

### Deploy is single-phase (remote contexts)

For remote contexts (with `connection.hosts`), `vyft deploy` only applies user resources — services, volumes, jobs from `vyft.config.ts`. Both platform provisioning and runtime init already happened during `context add`. The server hosts are known from `context.entry.connection.hosts`, and the Docker network/proxy are already running. Deploy just deploys.

For local contexts (no `connection.hosts`), deploy keeps the existing two-phase behavior: Phase 1 runs runtime init (per-project-stage network + proxy via local Docker socket), Phase 2 applies user resources. This preserves the current local dev flow without requiring `context add` for local development.

### State directory layout

```
~/.vyft/
├── context/
│   └── {context}/
│       ├── platform/          # What was provisioned (written by context add)
│       │   ├── state.json
│       │   ├── wal.jsonl
│       │   └── salt
│       ├── runtime/           # Runtime init resources (docker network, proxy)
│       │   ├── state.json
│       │   ├── wal.jsonl
│       │   └── salt
│       └── project/
│           └── {project}/
│               └── stage/
│                   └── {stage}/  # User resources (services, volumes)
│                       ├── state.json
│                       ├── wal.jsonl
│                       └── salt
```

### `vyft destroy` behavior

`vyft destroy` only destroys project resources — same as today. No `--all` flag. Runtime and platform teardown is done exclusively through `vyft context remove`.

- `vyft destroy` — destroys project resources only (user resources store) — already works
- `vyft context remove` — destroys runtime + platform infrastructure (see Step 6)
- Runtime and platform infra persist across projects by design

## Implementation Steps

### 1. Implement `createPlatform` in `@vyft/platform`

Mirror `createRuntime` (in `packages/runtime/src/define.ts`). Replace `definePlatform` with `createPlatform(name, contextFn)`:

```ts
export function createPlatform<TOpts, TCtx>(
  name: string,
  context: (opts: TOpts) => TCtx | Promise<TCtx>,
) {
  return {
    server: (handlers) => handlers,     // identity for TS inference (same pattern as createRuntime)
    volume: (handlers) => handlers,
    network: (handlers) => handlers,
    resource: (name, handlers) => { ... },  // custom resources (firewall, ssh_key)
    define: (config) => (opts) => Provider,
  };
}
```

The identity functions (`server: (handlers) => handlers`) match `createRuntime`'s pattern — they exist for TypeScript handler type inference via the `Handlers<TInput, TCtx, TOutput>` generic. The `.resource()` method registers custom resources using ambient binding (same as `createRuntime`). The `.define()` method produces the final `(opts) => Provider<TCtx>` factory.

**What changes**:
- Remove `definePlatform` in `packages/platform/src/define.ts` — used only by `@vyft/local`
- Remove `PlatformConfig` interface (replaced by builder pattern)
- Update `@vyft/local` to use `createPlatform("local", () => {})` instead
- Remove resource types that belong to runtime, not platform: `BucketInput`, `PostgresInput`, `QueueInput`, `SecretInput` (and their outputs). Postgres, redis, and site resource handlers have been removed from `@vyft/docker` — they will be re-implemented as runtime-level resources in `@vyft/std` or `@vyft/runtime` when needed.
- Keep: `ServerInput`, `VolumeInput`, `NetworkInput` + add `FirewallInput`, `SSHKeyInput` for Hetzner
- Add `init` support to the platform define (same as runtime's `init` — called during `context add`)
- Add `serverOptions(region?)` to the platform interface — returns standardized `ServerOption[]` catalog. Called by `context add` before `runtime.topology()`. The `remote` platform returns an empty catalog (no provisioning).

### 2. Hetzner platform implementation: `@vyft/hetzner`

**Resources**:
- `server` — create/read/update/delete Hetzner cloud servers
- `network` — private network + subnet
- `firewall` — firewall rules (SSH, HTTP/HTTPS)
- `ssh_key` — upload SSH public key to Hetzner

**Init function** (called by `context add`, not deploy):

The platform does NOT interpret the budget — it receives server specs from the runtime's `topology()` function and provisions them. `context add` coordinates this (see Step 3).

```ts
init: (opts) => {
  // opts.servers comes from runtime.topology(budget) — platform doesn't know about budget
  sshKey("default", { publicKey: opts.sshPublicKey });
  network("default", { cidr: "10.0.0.0/16" });
  firewall("default", { rules: [
    { direction: "in", port: "22", protocol: "tcp", sourceIps: ["0.0.0.0/0"] },
    { direction: "in", port: "80", protocol: "tcp", sourceIps: ["0.0.0.0/0"] },
    { direction: "in", port: "443", protocol: "tcp", sourceIps: ["0.0.0.0/0"] },
  ]});
  for (const spec of opts.servers) {
    server(spec.id, {
      type: spec.server,       // ServerOption.id — e.g. "cx32"
      image: "ubuntu-24.04",
      sshKeys: ["default"],
      network: "default",
      firewalls: ["default"],
      userData: DOCKER_CLOUD_INIT,
    });
  }
}
```

**Server catalog**:
```ts
serverOptions: (region) => [
  { id: "cx22",  type: "shared",    cpu: 2,  memory: 4,  cost: 5,  bench: { cpu: 1600, disk: 400, network: 1 } },
  { id: "cx32",  type: "shared",    cpu: 4,  memory: 8,  cost: 10, bench: { cpu: 3200, disk: 400, network: 1 } },
  { id: "cx42",  type: "shared",    cpu: 8,  memory: 16, cost: 20, bench: { cpu: 6400, disk: 400, network: 1 } },
  { id: "cx52",  type: "shared",    cpu: 16, memory: 32, cost: 40, bench: { cpu: 12800, disk: 400, network: 1 } },
  { id: "ccx13", type: "dedicated", cpu: 2,  memory: 8,  cost: 12, bench: { cpu: 2900, disk: 600, network: 1 } },
  { id: "ccx23", type: "dedicated", cpu: 4,  memory: 16, cost: 17, bench: { cpu: 5800, disk: 600, network: 1 } },
  { id: "ccx33", type: "dedicated", cpu: 8,  memory: 32, cost: 30, bench: { cpu: 11600, disk: 600, network: 1 } },
  { id: "ccx53", type: "dedicated", cpu: 16, memory: 64, cost: 55, bench: { cpu: 23200, disk: 600, network: 1 } },
]
```
Static for now — Hetzner prices don't change often. Could query the API later.

**SSH key**: Generated during `context add` (ed25519 keypair). Public key uploaded to Hetzner via `sshKey` resource. Private key encrypted in platform state store.

**Server bootstrapping**: `userData` passes a cloud-init script that installs Docker Engine and configures sshd. This is OS-level setup only — Docker network and reverse proxy are created later by runtime init. Hetzner supports cloud-init natively; the script runs on first boot.

**Server readiness**: After provisioning, `context add` polls until:
1. Server status is `running`
2. SSH connection succeeds
3. `docker info` responds (cloud-init finished)

Polling uses 5-second intervals with a 120-second timeout. SSH attempts use a 10-second connect timeout per attempt. If the timeout is exceeded, `context add` fails with an actionable error (server ID + IP for manual debugging). The server is NOT torn down on timeout — the user can re-run `context add` which will resume from the provisioning state.

**Context function**:
```ts
function createContext(opts: { apiToken: string }) {
  return { client: new HetznerClient(opts.apiToken) };
}
```

### 3. Update `context add` command

Current implementation (`packages/vyft/src/commands/context/add.ts`) uses `@clack/prompts` and supports name, platform, runtime, and connection prompts. It writes to `.vyft/vyft.json` via `addContext()` from `contexts.ts`. No provisioning, no passphrase, no keyring writes beyond what deploy does.

**Changes needed**:
- Remove aws/gcp/k8s/ecs from the prompt options (currently hardcoded in the select choices)
- Add passphrase prompt (reuse `resolvePassphrase` or inline — but mode must be "deploy" since we need user input, not auto-generate)
- Add platform-specific prompts (API token, budget, region for hetzner)
- Add provisioning phase: open platform store, run platform provider's `init()`, apply via engine
- Add runtime init phase: open runtime store, run runtime provider's `init()`, apply via engine
- Add readiness polling for hetzner (SSH + docker info)
- Wire the passphrase to keyring via existing `keyring.setPassphrase()`

Rewritten flow:

```ts
// 1. Name
const name = args[0] ?? await prompt("Context name:");

// 2. Platform
const platform = await select("Platform:", ["hetzner", "remote"]);

// 3. Passphrase
const passphrase = await password("Encryption passphrase:");
await keyring.setPassphrase(name, passphrase);
// Uses existing keyring.setPassphrase() — service: "vyft", account: context name (not project)

// 4. Runtime
const runtime = await select("Runtime:", ["docker"]);

// 5. Platform-specific prompts + provisioning
if (platform === "hetzner") {
  const apiToken = await password("Hetzner API token:");
  await keyring.set(`vyft:${name}:hetzner-token`, apiToken);
  // Needs new keyring.set(key, value) — existing API only has setPassphrase(project, value)

  const budget = await select("Monthly budget:", ["$5", "$10", "$20", "$40"]);
  const region = await input("Region:", { default: "fsn1" });

  // Generate SSH keypair (node:crypto — crypto.generateKeyPairSync("ed25519"))
  const { publicKey, privateKey } = generateEd25519Keypair();

  // Platform exposes catalog, runtime decides topology
  const catalog = platformProvider.serverOptions(region);
  const servers = runtimeProvider.topology(parseBudget(budget), catalog);
  // e.g. Docker: [{ id: "default", server: "cx32" }]
  // e.g. Swarm:  [{ id: "manager", server: "cx22" }, { id: "worker-1", server: "cx32" }]

  // Platform provisions what runtime asked for:
  // 1. Open Store at ~/.vyft/context/{name}/platform/
  // 2. Create platform provider: hetzner({ apiToken })
  // 3. Call provider.config.init({ servers, region, sshPublicKey: publicKey })
  // 4. Apply via apply() from @vyft/core
  // 5. Read server outputs from store — map of server ID → host
  // 6. Poll readiness per server: SSH connect + `docker info` over SSH
  const serverHosts = readServerOutputs(platformStore);
  // e.g. { "default": "1.2.3.4" } or { "manager": "1.2.3.4", "worker-1": "5.6.7.8" }

  entry = { platform, runtime: "docker", connection: { hosts: serverHosts }, platformConfig: { budget, region } };
} else {
  const host = await input("SSH host (e.g. root@1.2.3.4):");
  // Verify: SSH connect + `docker info` over SSH
  await verifyRemoteHost(host);
  entry = { platform, runtime: "docker", connection: { hosts: { default: host } } };
}

// 6. Runtime init — receives server hosts, sets up the runtime
// Docker: connect to single server, create network + Caddy proxy
// Swarm (future): docker swarm init on manager, docker swarm join on workers, overlay network
// Open Store at ~/.vyft/context/{name}/runtime/
// Runtime init receives the server hosts map from platform provisioning
const runtimeProvider = resolveRuntimeProvider(runtime, {
  hosts: entry.connection.hosts,
});
await runRuntimeInit(runtimeProvider, name, passphrase);

// 7. Save
await addContext(cwd, name, entry);
```

### 4. Docker runtime: remote host support

**Current state**: `createContext` in `packages/docker/src/context.ts` creates `{ client, project, stage, networkName, publishPorts }`. The `DockerClient` in `packages/docker/src/client/index.ts` uses `http.request({ socketPath })` — Unix socket only. Network is named `vyft-{project}-{stage}` (per-project-stage). Init creates this network + a Caddy proxy per project-stage.

**Three changes needed**:

#### a. Add `topology` to runtime interface

`createRuntime` gains a `topology` method. Each runtime implements it to decide how to split budget across servers from the platform's catalog.

```ts
// Added to createRuntime builder
topology: (budget: number, catalog: ServerOption[]) => ServerSpec[]
```

Docker implementation — single server, pick the biggest that fits:
```ts
topology: (budget, catalog) => {
  const best = catalog.filter(s => s.cost <= budget).at(-1);
  return [{ id: "default", server: best.id }];
}
```

Called by `context add` before platform provisioning. The `remote` platform has no catalog (empty array) — topology is skipped since servers are user-provided.

#### b. SSH transport for Docker client

The current client (`packages/docker/src/client/index.ts`) uses `http.request({ socketPath: "/var/run/docker.sock" })`. This only works with local Unix sockets.

**Change**: `createClient` accepts a connection factory `() => Stream | Promise<Stream>` instead of a socket path. `http.request` supports `{ createConnection: factory }` natively. The client doesn't need to know how the connection is made — it just calls the factory per request.

```ts
// Local — same behavior as today
const client = createClient(() => net.createConnection({ path: "/var/run/docker.sock" }));

// Remote — ssh2 opens a channel to the remote Docker socket per request
const client = createClient(() => {
  return new Promise((resolve, reject) => {
    ssh.openssh_forwardOutStreamLocal("/var/run/docker.sock", (err, channel) => {
      err ? reject(err) : resolve(channel);
    });
  });
});
```

Uses `ssh2` npm package (pure JS, system-agnostic). One SSH connection is opened per context, channels are multiplexed over it. The SSH connection lifecycle is managed by whoever creates the context (context add or deploy) and closed on dispose.

For the SSH connection itself, the private key comes from the platform state store (decrypted via `Cipher`). For the `remote` platform, `ssh2` can read the user's keys from `~/.ssh/` or use an SSH agent via `ssh2`'s built-in agent support.

#### c. Context-scoped init (shared network + proxy)

The Docker runtime context factory needs two modes:

- **Init mode** (during `context add`): context-scoped, no project/stage — creates shared Docker network and reverse proxy.
- **Deploy mode** (during `vyft deploy`): project/stage-scoped — deploys user containers into the shared network.

```ts
// Init context — used by context add for runtime init
function createInitContext(opts: {
  hosts?: Record<string, string>;  // server ID → SSH host (from context entry)
  privateKey?: Buffer;              // decrypted SSH private key (hetzner)
}) {
  const host = opts.hosts?.default;  // Docker uses single server
  const connect = host
    ? createSSHConnectFactory(host, opts.privateKey)  // returns () => Promise<Channel>
    : () => net.createConnection({ path: "/var/run/docker.sock" });
  return {
    client: createClient(connect),
    networkName: "vyft",   // shared across all projects — NOT per-project-stage
  };
}

// Deploy context — used by vyft deploy for user resources
function createDeployContext(opts: {
  project: string;
  stage: string;
  hosts?: Record<string, string>;
  privateKey?: Buffer;
  publishPorts?: boolean;
}) {
  const host = opts.hosts?.default;  // Docker uses single server
  const connect = host
    ? createSSHConnectFactory(host, opts.privateKey)
    : () => net.createConnection({ path: "/var/run/docker.sock" });
  return {
    client: createClient(connect),
    project: opts.project,
    stage: opts.stage,
    networkName: "vyft",   // same shared network
    publishPorts: opts.publishPorts ?? false,
  };
}

// Swarm (future) would iterate over all hosts:
// const manager = opts.hosts?.manager;
// const workers = Object.entries(opts.hosts).filter(([id]) => id.startsWith("worker-"));
```

**Impact on existing init**: Currently `packages/docker/src/provider.ts` lines 16-20 create network `vyft-{project}-{stage}` and proxy `{project}-{stage}`. This changes to network `vyft` and proxy `vyft` (context-scoped). Service container labels for Caddy proxy routing remain the same — Caddy discovers them by label, not by network name.

**Impact on local dev**: `local dev`/`local up` commands still create per-project-stage resources — they don't go through `context add`. The local path continues using the Unix socket directly.

### 5. Simplify deploy command

Currently `packages/vyft/src/commands/deploy.ts` has two phases:
1. Runtime init — opens store at `~/.vyft/context/{ctx}/runtime/`, calls `provider.config.init()`, applies init entries (network + proxy)
2. User resources — opens store at project/stage path, loads config, applies

Deploy becomes single-phase — just user resources. Remove phase 1 since runtime init now runs during `context add`.

```ts
// deploy.ts — simplified
const hosts = context.entry.connection?.hosts;

// Decrypt SSH key from platform state if needed (hetzner platform)
const privateKey = platform === "hetzner" ? await decryptSSHKey(name, passphrase) : undefined;

const runtimeProvider = resolveRuntimeProvider(context.entry.runtime, {
  project,
  stage,
  hosts,       // runtime knows which host(s) to deploy to
  privateKey,
});

// No runtime init — already done during context add
// Just load config and apply user resources
// The runtime provider's init function should be removed or guarded
```

**Already done**: The `withFallbackResources` pattern and Docker-based postgres/redis/site handlers have been removed. `providers.ts` now directly maps `"remote"` to `local({})` with no fallback wrapping.

### 6. Implement `context remove` command

Currently `context remove` (`packages/vyft/src/commands/context/remove.ts`) just calls `removeContext(cwd, name)` which deletes the entry from `.vyft/vyft.json`. No infrastructure teardown.

**New behavior**: Run the engine's `destroy()` against each state scope in reverse order. The engine already handles reading state, calling provider delete handlers via `resolve()`, and cleaning up — same pattern as `packages/vyft/src/commands/destroy.ts` uses for project state.

```ts
// 1. Warn if any project states exist under ~/.vyft/context/{name}/project/
//    (user should run `vyft destroy` per project first, or we destroy them here)
// 2. If hetzner: open platform store (read-only) → decrypt SSH key → close store
//    (needed for SSH connection in step 3; remote platform skips this — uses user's own keys)
// 3. destroy(runtimeStore)  — removes Docker network + Caddy proxy from server
//    Needs runtime provider with init-mode context (host, networkName: "vyft")
//    Uses SSH key from step 2 (hetzner) or user's SSH agent (remote)
// 4. destroy(platformStore) — deletes Hetzner server, firewall, network, ssh_key
//    Uses Hetzner HTTP API (API token from keyring) — no SSH needed
//    For remote platform: no-op (nothing was provisioned)
// 5. Delete state directories (~/.vyft/context/{name}/)
// 6. Clean up keyring entries:
//    - keyring.deletePassphrase(contextName) — existing API, now keyed by context name
//    - keyring.delete(`vyft:${name}:hetzner-token`) — new API needed
// 7. Remove context from .vyft/vyft.json via existing removeContext()
```

**Error handling**: If runtime destroy fails (e.g. SSH unreachable), prompt the user: retry, skip (force-continue to platform teardown), or abort. Don't leave partial state silently.

### 7. Simplify `providers.ts`

**Partially done.** `providers.ts` has been cleaned up:
- `withFallbackResources` removed
- `postgresHandlers`/`redisHandlers`/`siteHandlers` imports removed
- `platforms` map simplified: `"remote"` maps directly to `local({})`

**Still needed:**
- Add `"hetzner"` entry to `platforms` map (depends on Step 2)
- Remove AWS, GCP, k8s, ECS from the `context add` prompt options
- Update `runtimes` map to use deploy-specific provider (depends on Step 4)

## Open Questions

1. **Docker over SSH transport**: Resolved — see Step 4. `createClient` takes a connection factory `() => Stream`. Local uses `net.createConnection`, remote uses `ssh2`'s `openssh_forwardOutStreamLocal` to get a channel per request. One parameter change on the client, no abstraction layer.

2. **Multiple servers**: The architecture supports multiple servers per context via `hosts: Record<string, string>` and `runtime.topology()` returning multiple `ServerSpec` entries. Docker uses a single server (`hosts.default`). Swarm/k8s would use multiple. The plumbing is in place — only Docker's topology implementation exists for now.

3. **Budget-based scaling**: Changing budget requires `context remove` + `context add`. A future `vyft scale` command could re-run `runtime.topology(newBudget, catalog)` and diff against current servers, but that's out of scope.

4. **Resumability**: Resolved. `context add` writes the context entry to `.vyft/vyft.json` early with `status: "provisioning"`. If `context add` fails mid-way and the user re-runs it with the same name, it detects the provisioning status and resumes from where it left off — the engine's `reconcile()` handles partial applies within each store, and the multi-store coordination checks which stores already have state. On success, the status field is removed (or set to `"ready"`). `context remove` works on contexts in any status.

5. **Local dev commands**: Resolved. Deploy conditionally keeps the runtime init phase (Phase 1) for local contexts — i.e. when `context.entry.connection?.hosts` is absent. Remote contexts (with hosts) skip Phase 1 since runtime init already ran during `context add`. This means the existing local dev provider (`provider.ts` with per-project-stage init) continues working unchanged. No special "local" context needed.

6. **SSH key for deploy**: Deploy needs to connect to the remote Docker host via SSH. For hetzner, the SSH private key is encrypted in platform state. Deploy must: open platform store → decrypt SSH key → pass as `Buffer` to the connection factory. No temp files needed — `ssh2` accepts `privateKey: Buffer` directly. This cross-store read (deploy reads platform store to get SSH key) needs to be designed explicitly.
