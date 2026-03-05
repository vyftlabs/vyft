# Recipe & Platform Resolution Architecture

## Current Flow (as-is)

```mermaid
graph TD
    subgraph CLI["vyft CLI"]
        CMD["vyft deploy"]
        PI["projectInfo()<br/>resolve context, stage, runtime"]
        LC["loadConfig()<br/>jiti imports vyft.config.ts"]
        RF["createRuntime()<br/>docker / k8s / swarm"]
    end

    subgraph Config["vyft.config.ts (user code)"]
        IMPORTS["import { postgres, service } from 'vyft'"]
        CALLS["postgres('db')<br/>bucket('uploads')<br/>service('api', { ... })"]
    end

    subgraph Platform["@vyft/platform"]
        PRIMS["Primitives<br/>service() / volume() / config() / job()"]
        RECIPE["resource() composite builder"]
        DEFAULTS["defaults/<br/>postgres / bucket / queue"]
    end

    subgraph Core["@vyft/core"]
        COLLECTOR["Collector stack<br/>captures all resources"]
        TYPES["Resource types<br/>Service / Volume / Config / Job"]
    end

    subgraph Engine["@vyft/engine"]
        COLLECT["collect(config)<br/>walk exports, gather resources"]
        GRAPH["buildGraph()<br/>dependency resolution"]
        VALIDATE["validate()<br/>duplicates, cycles, dangling refs"]
        PLAN["plan()<br/>diff desired vs current state"]
    end

    subgraph Store["@vyft/store"]
        STATE["Load previous state"]
        SECRETS["Decrypt secrets"]
    end

    subgraph Runtime["@vyft/runtime"]
        REXEC["plan() → operations<br/>execute() → apply"]
        DOCKER["Docker"]
        K8S["Kubernetes"]
    end

    CMD --> PI --> LC
    LC -->|"imports trigger execution"| Config
    IMPORTS --> CALLS
    CALLS --> DEFAULTS
    CALLS --> PRIMS
    DEFAULTS -->|"internally uses"| PRIMS
    DEFAULTS -->|"uses resource()"| RECIPE
    PRIMS --> COLLECTOR
    COLLECTOR --> TYPES

    CMD --> STATE
    CMD --> SECRETS
    CMD --> RF

    LC -->|"config module returned"| COLLECT
    COLLECT --> GRAPH --> VALIDATE --> PLAN
    STATE -->|"previous resources"| PLAN
    PLAN -->|"changes"| REXEC
    RF --> REXEC
    REXEC --> DOCKER
    REXEC --> K8S
```

## Proposed Flow (with platform resolution)

```mermaid
graph TD
    subgraph CLI["vyft CLI"]
        CMD["vyft deploy"]
        PI["projectInfo()<br/>resolve context, stage, runtime"]
        LC["loadConfig()<br/>jiti imports vyft.config.ts"]
        RF["createRuntime()<br/>docker / k8s / swarm"]
    end

    subgraph Config["vyft.config.ts (user code)"]
        TARGET["export target = {<br/>  platform: hcloud,<br/>  runtime: docker<br/>}"]
        CALLS["postgres('db')<br/>bucket('uploads')<br/>service('api', { ... })"]
    end

    subgraph Platform["@vyft/platform (Resolver)"]
        REG["Registry<br/>(capabilities from active platform)"]
        RES{Has native<br/>implementation?}
        PRIMS["Primitives<br/>service() / volume() / config() / job()"]
    end

    subgraph Recipes["Recipes (portable fallbacks)"]
        RP["postgres<br/>(container + volume)"]
        RB["bucket<br/>(MinIO + init job)"]
        RQ["queue<br/>(RabbitMQ container)"]
    end

    subgraph Providers["Platform Providers"]
        HC["@vyft/hcloud"]
        HCP["managed postgres"]
        HCB["managed bucket"]
    end

    subgraph Core["@vyft/core"]
        COLLECTOR["Collector stack"]
        TYPES["Resource types<br/>Service / Volume / Config / ProviderResource"]
    end

    subgraph Engine["@vyft/engine"]
        COLLECT["collect() → buildGraph() → plan()"]
    end

    subgraph Runtime["@vyft/runtime"]
        REXEC["execute()"]
    end

    CMD --> PI --> LC
    LC -->|"imports trigger execution"| Config
    TARGET -.->|"registers capabilities"| REG
    HC --> HCP & HCB
    HC -.->|"provides"| REG

    CALLS --> REG
    REG --> RES
    RES -->|"Yes (native)"| Providers
    RES -->|"No (fallback)"| Recipes

    Providers --> COLLECTOR
    Recipes -->|"uses primitives"| PRIMS
    PRIMS --> COLLECTOR
    CALLS -->|"direct primitives"| PRIMS

    COLLECTOR --> TYPES
    LC -->|"config module"| COLLECT
    COLLECT --> REXEC
    CMD --> RF --> REXEC
```

## Resolution Sequence

```mermaid
sequenceDiagram
    participant CLI as vyft CLI
    participant CFG as vyft.config.ts
    participant PLT as Platform Registry
    participant PRV as Provider (e.g. hcloud)
    participant RCP as Recipe (fallback)
    participant COL as Collector
    participant ENG as Engine
    participant RT as Runtime

    CLI->>CLI: projectInfo() → context, stage, runtime
    CLI->>CFG: loadConfig() (jiti import)

    Note over CFG: Config evaluation begins

    CFG->>PLT: target = { platform: hcloud }
    PLT->>PRV: Register hcloud capabilities
    PRV-->>PLT: { postgres: native, volume: native }

    CFG->>PLT: postgres("db")
    PLT->>PLT: lookup("postgres")

    alt Provider has postgres
        PLT->>PRV: hcloud.postgres("db", opts)
        PRV->>COL: emit ProviderResource
        PRV-->>CFG: { url, host, port }
    else No provider implementation
        PLT->>RCP: recipe.postgres("db", opts)
        RCP->>COL: emit Service + Volume + Config
        RCP-->>CFG: { url, host, port }
    end

    CFG->>PLT: service("api", { ... })
    PLT->>COL: emit Service (always primitive, no resolution needed)

    Note over CFG: Config evaluation ends

    CFG-->>CLI: config module

    CLI->>ENG: collect(config) → buildGraph() → plan()
    ENG-->>CLI: changes[]
    CLI->>RT: execute(changes)
```

## Key Design Points

1. **CLI orchestrates everything** - it's the entry point that loads config, resolves state, and drives the engine
2. **Config evaluation is where resolution happens** - when `vyft.config.ts` is imported via jiti, all `postgres()` / `bucket()` calls execute immediately
3. **Platform registry is populated by the target declaration** - the user's config specifies which platform is active
4. **Same output interface regardless of path** - user code gets `{ url, host, port }` whether it's a managed DB or a container
5. **Primitives bypass resolution** - `service()`, `volume()`, `config()`, `job()` go straight to the collector, no platform lookup needed
6. **Recipes are the default** - if no platform is set, or the platform doesn't implement a capability, the portable recipe always works
