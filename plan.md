# Platform Provisioning & `vyft init`

## Vision

A user runs `vyft context add`, picks a cloud provider (Hetzner, AWS, GCP), and vyft provisions the infrastructure for them — servers, networks, firewalls. Once the context is ready, `vyft deploy` applies their app resources onto that infrastructure. No manual server setup, no SSH, no Terraform.

The flow:

```
vyft context add production
  → Platform: Hetzner Cloud
  → API token: ****
  → Monthly budget: $10
  → Runtime: Docker
  → ✓ Context "production" created.

vyft deploy
  → Phase 1: Platform init (provision server, network, firewall)
  → Phase 2: Runtime init (setup Docker, network, proxy on server)
  → Phase 3: User resources (services, volumes, jobs)
```

## Current State

### What exists
- `@vyft/platform` — abstract SDK with `definePlatform()`, input/output types for server, volume, network, bucket, postgres, queue, secret
- `@vyft/local` — stub platform returning `{ host: "localhost" }` (for dev)
- `context add` — interactive CLI that stores `{ platform, runtime, connection? }` in `.vyft/vyft.json`
- `vyft init` — project scaffolding (templates, git, deps). Not infrastructure init.
- Two-phase deploy: runtime init → user resources
- `providers.ts` — maps platform/runtime names to provider factories

### What's missing
1. No real platform implementations (Hetzner, AWS, GCP)
2. No platform init phase in deploy
3. `context add` doesn't provision anything — it just stores config
4. No way to pass platform-specific credentials (API tokens)
5. `vyft init` is project scaffolding, not infrastructure init
6. No connection between platform server output and runtime context (e.g. server host → Docker SSH target)

## Design

### Three-phase deploy

```
Phase 1 — Platform init (platform store)
  Open platform store (~/.vyft/context/{ctx}/platform/)
  registry.begin()
  platformProvider.config.init?.()
  initEntries = registry.collect()
  apply(initEntries → platform store)

Phase 2 — Runtime init (runtime store)
  Open runtime store (~/.vyft/context/{ctx}/runtime/)
  Resolve runtime context using platform outputs (server host, etc.)
  registry.begin()
  runtimeProvider.config.init?.()
  initEntries = registry.collect()
  apply(initEntries → runtime store)

Phase 3 — User resources (project store)
  Open project store (~/.vyft/context/{ctx}/project/{project}/stage/{stage}/)
  loadConfig(cwd)
  apply(entries → project store)
```

### Platform provider with init

`@vyft/platform` gets `createPlatform` mirroring the `createRuntime` pattern — typed handler factories, `.resource()` for custom resources (firewall, ssh_key, credential), and `.define()` to produce the Provider.

```ts
// packages/hetzner/src/runtime.ts
export const hetzner = createPlatform("hetzner", createContext);

// packages/hetzner/src/resource/credential.ts
export default hetzner.resource<CredentialInput>("credential", { ... });

// packages/hetzner/src/resource/firewall.ts
export default hetzner.resource<FirewallInput>("firewall", { ... });

// packages/hetzner/src/provider.ts
export default hetzner.define({
  server: serverHandlers,
  volume: volumeHandlers,
  network: networkHandlers,
  init: (opts) => {
    const serverType = resolveServerType(opts.budget ?? 10);
    credential("api-token", { value: opts.apiToken });
    sshKey("default", { publicKey: opts.sshPublicKey });
    network("default", { cidr: "10.0.0.0/16" });
    firewall("default", { rules: [...] });
    server("default", { type: serverType, image: "ubuntu-24.04", ... });
  },
});
```

Platform init resources are infra-level: servers, networks, firewalls, credentials. They're provisioned once per context and shared across projects.

### Context entry expansion

The `ContextEntry` gains platform-specific config:

```ts
interface ContextEntry {
  platform: string;
  runtime: string;
  connection?: { host?: string; endpoint?: string };
  // New: platform-specific configuration
  platformConfig?: Record<string, unknown>;
}
```

For Hetzner, `platformConfig` might be `{ budget: 10, region: "fsn1" }`.
For AWS, `{ budget: 20, region: "us-east-1" }`.

The platform implementation maps budget to the best server type at that price point. Users don't need to know what `cx22` or `t3.micro` means — they know their budget. Each platform maintains a price-sorted table and picks the largest server that fits.

Credentials (API tokens) are stored as encrypted resources in the platform store (`~/.vyft/context/{ctx}/platform/state.json`). No separate credentials file — they flow through the existing encrypted WAL/state system like any other resource. The platform `init` registers a `credential` resource, and the context factory reads the token from state.

### `context add` with provisioning

When a user selects a cloud platform (not "remote"), `context add` prompts for:
1. API credentials → stored in `platformConfig` (encrypted in platform store on first deploy)
2. Monthly budget and region → stored in `platformConfig`
3. Runtime selection (docker, k8s)

It does NOT provision infrastructure yet — that happens on first `vyft deploy`.

### Connecting platform output to runtime context

The key bridge: platform init creates a server with host/IP. The runtime needs that host to create a Docker context (SSH to remote Docker daemon).

This is solved by making the runtime context factory receive platform outputs:

```ts
// In deploy phase 2, after platform init:
const platformState = buildCurrentState(platformStore);
// Well-known URN — platform init always registers server as "default"
const serverUrn = urn.build("resource", "platform", "server", "default");
const serverOutput = platformState.entries[serverUrn]?.output;
const serverHost = serverOutput?.host as string | undefined;

// Runtime provider factory receives connection info
const runtimeProvider = resolveRuntimeProvider(
  context.entry.runtime,
  { project, stage, host: serverHost },
);
```

For `remote` platform (no platform init), the host comes from `context.entry.connection.host`.
For managed platforms (Hetzner, AWS), the host comes from the platform init server output at the well-known URN `urn:vyft:resource:platform:server:default`.

### State directory layout (complete)

```
~/.vyft/
├── context/
│   └── {context}/
│       ├── platform/          # Platform init resources (servers, networks)
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

- `vyft destroy` — destroys project resources only (phase 3 store)
- `vyft destroy --all` — destroys project + runtime + platform (future)
- Runtime and platform infra persist across projects by design

## Implementation Steps

### 1. Implement `createPlatform` in `@vyft/platform`

Mirror `createRuntime`. Replace `definePlatform` with `createPlatform(name, contextFn)`:

```ts
export function createPlatform<TOpts, TCtx>(
  name: string,
  context: (opts: TOpts) => TCtx | Promise<TCtx>,
) {
  return {
    server: (handlers) => handlers,     // identity for TS inference
    volume: (handlers) => handlers,
    network: (handlers) => handlers,
    bucket: (handlers) => handlers,
    postgres: (handlers) => handlers,
    queue: (handlers) => handlers,
    resource: (name, handlers) => { ... },  // custom resources (firewall, ssh_key, credential)
    define: (config) => (opts) => Provider,
  };
}
```

Reuse `setAmbientProvider`/`clearAmbientProvider` from `@vyft/runtime` (move to `@vyft/core` or share via import). Keep `definePlatform` as a legacy wrapper.

### 2. Add platform init phase to deploy

Extend the deploy command from two-phase to three-phase:
- Add `resolvePlatformStateDir(context)` → `~/.vyft/context/{ctx}/platform/`
- Run platform init before runtime init
- Pass platform outputs to runtime context resolution

### 3. Credential management

Credentials are resources in the platform store — no separate files. The `credential` resource stores encrypted values via the existing WAL/state system.

- `context add` prompts for API token → stored in `platformConfig` temporarily
- First `vyft deploy` runs platform init → `credential("api-token", ...)` encrypts it into the platform store
- Subsequent deploys read the credential from state to build the platform context
- Support `VYFT_HETZNER_TOKEN`, `VYFT_AWS_ACCESS_KEY_ID` env vars as overrides

### 4. Expand `context add` prompts

For managed platforms (hetzner, aws, gcp):
- Prompt for API credentials
- Prompt for monthly budget (e.g. "$5", "$10", "$20") — platform maps to best server type
- Prompt for region (with sensible default)
- Store in `platformConfig` and credentials file

### 5. First platform implementation: Hetzner

**Why Hetzner first**: Simple REST API, fast provisioning (~30s), cheap, popular for self-hosted. Good proving ground before AWS/GCP complexity.

**Package**: `@vyft/hetzner`

**Resources**:
- `server` — create/read/update/delete Hetzner cloud servers
- `network` — private network
- `firewall` — firewall rules (SSH, HTTP/HTTPS, Docker)
- `ssh_key` — upload SSH key to Hetzner

**Init function**:
```ts
init: (opts) => {
  const serverType = resolveServerType(opts.budget ?? 10); // maps $10 → "cx22"
  credential("api-token", { value: opts.apiToken });
  sshKey("default", { publicKey: opts.sshPublicKey });
  network("default", { cidr: "10.0.0.0/16" });
  firewall("default", { rules: [
    { direction: "in", port: "22", protocol: "tcp", sourceIps: ["0.0.0.0/0"] },
    { direction: "in", port: "80", protocol: "tcp", sourceIps: ["0.0.0.0/0"] },
    { direction: "in", port: "443", protocol: "tcp", sourceIps: ["0.0.0.0/0"] },
  ]});
  server("default", {
    type: serverType,
    image: "ubuntu-24.04",
    sshKeys: ["default"],
    network: "default",
    firewalls: ["default"],
    userData: DOCKER_CLOUD_INIT,  // cloud-init script to install Docker Engine
  });
}
```

**SSH key**: Generated during `context add` (ed25519 keypair), stored in `platformConfig`. The public key is uploaded to Hetzner via the `sshKey` resource; the private key is stored as a `credential` resource. This way vyft owns the key — no dependency on the user's `~/.ssh/`.

**Server bootstrapping**: The server's `userData` field passes a cloud-init script that installs Docker Engine. Hetzner (and AWS/GCP) support cloud-init natively. The script runs on first boot — by the time runtime init connects via SSH, Docker is ready.

**Context function**:
```ts
function createContext(opts: { apiToken: string }) {
  return { client: new HetznerClient(opts.apiToken) };
}
```

### 6. Docker runtime: remote host support

Currently, the Docker runtime always connects to the local Docker socket. For remote deployment, it needs to connect via SSH:

```ts
function createContext(opts: {
  project: string;
  stage: string;
  socketPath?: string;     // local socket
  host?: string;           // SSH host (e.g. root@1.2.3.4)
  publishPorts?: boolean;
}) {
  const socket = opts.host
    ? `ssh://${opts.host}`   // Docker over SSH
    : opts.socketPath;

  return {
    client: createClient(socket),
    project: opts.project,
    stage: opts.stage,
    networkName: `vyft-${opts.project}-${opts.stage}`,
    publishPorts: opts.publishPorts ?? false,
  };
}
```

Docker Engine supports `DOCKER_HOST=ssh://user@host` natively. The Docker HTTP client just needs to connect through the SSH tunnel.

### 7. Wire platform outputs → runtime context

After platform init, read the server output and pass the host to the runtime factory:

```ts
// deploy.ts — between phase 1 and phase 2
const serverHost = getServerHostFromPlatformState(platformStore);
const runtimeOpts = {
  project,
  stage,
  host: serverHost ?? context.entry.connection?.host,
};
const runtimeProvider = resolveRuntimeProvider(context.entry.runtime, runtimeOpts);
```

For "remote" platform (no platform init), the host comes from `connection.host` in the context entry.

## Open Questions

1. **Docker over SSH**: The current HTTP client connects via Unix socket. For remote deployment it needs SSH tunnel support. Options: (a) use Node's `ssh2` library to tunnel the Docker socket, (b) shell out to `docker -H ssh://...`, (c) use Docker's native SSH transport. Need to investigate which works with our HTTP client.

2. **Multiple servers**: The plan assumes one server per context. Multi-server topologies (app server + DB server) are a future concern.

3. **Platform user-facing resources**: Should users be able to call `platform.server("worker", { type: "cx42" })` in their config to add more servers beyond what init provisions? Or is platform init the only way to manage infra?

4. **Budget-based scaling**: If the user changes their budget in `platformConfig`, should the next `vyft deploy` automatically resize the server? The `diff` handler would detect the type change and return `"recreate"`, which would destroy and reprovision. This is destructive — might want a confirmation prompt or separate `vyft scale` command.
