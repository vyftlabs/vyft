# Backend Architecture Migration Plan

## Goal

Restructure `apps/backend` into a lightweight resource-based layout. One folder per entity. Two standard files per entity (`service.go`, `handler.go`). Mapping is inlined at the call site — each handler method constructs `openapi.X` literals directly from sqlc rows. No `toWire`/`fromWire` helpers. Domain methods on the type when invariants are real. No DDD quadrant ceremony. Add structure later only when complexity earns it.

## Why this shape

Vyft is a PaaS control plane in early stages. Real pain points today are small and local:

1. Dual `internal/api/<plural>.go` + `internal/api/<singular>/` split for 6 of 7 entities (observability is flat-only at `internal/api/observability.go`) — same entity across two packages.
2. `internal/api/errors.go` re-exports: only `badRequest` has callers (in `api/projects.go`, `api/variables.go`, `api/resources.go`, `api/routes.go`, `api/registries.go`); `notFound` and `conflict` are dead.
3. `internal/db/wire.go` misnamed (not google/wire — pgtype + error helpers).
4. `*db.Queries, *pgxpool.Pool` threaded as separate args at `internal/api/api.go:29`.
5. Frontend embed buried at `internal/server/static/` inside the server package (build artifacts sit directly under `static/`, no `dist/` subdir today).

None of these warrant a hexagonal + DDD overhaul. They warrant a flatten + rename pass plus a couple of earned extension points.

## Final tree

```
apps/backend/
├── cmd/backend/main.go
└── internal/
    ├── platform/
    │   ├── httpx/        # request decode, response encode helpers
    │   ├── apierr/       # APIError + BadRequest, NotFound, Conflict, Internal
    │   ├── pgerr/        # IsUniqueViolation, IsForeignKeyViolation
    │   └── pgxid/        # PgUUID, UUIDStr, TsStr
    │
    ├── db/
    │   ├── sqlc/         # GENERATED. package sqlc. never hand-edit.
    │   ├── migrations/
    │   ├── queries/
    │   ├── db.go         # type DB{Pool, Q *sqlc.Queries}; New(); WithTx()
    │   ├── migrate.go
    │   └── embed.go
    │
    ├── openapi/
    │   └── api.gen.go
    │
    ├── project/
    │   ├── service.go    # type Service{db *db.DB}; CRUD use cases
    │   └── handler.go    # oapi-codegen slice; mapping inlined at call sites
    │
    ├── resource/         # rich entity — extra files
    │   ├── resource.go   # type Resource + AddDisk/RemoveDisk (invariants)
    │   ├── spec.go       # Spec parse / validate / encode
    │   ├── service.go    # uses db.WithTx for atomic create
    │   └── handler.go    # oapi-codegen slice; mapping inlined at call sites
    │
    ├── route/
    │   ├── service.go
    │   └── handler.go
    │
    ├── variable/
    │   ├── variable.go   # discriminator: Plain | Secret | Imported
    │   ├── service.go
    │   └── handler.go
    │
    ├── registry/
    │   ├── service.go
    │   └── handler.go
    │
    ├── deployment/
    │   ├── deployment.go # type Deployment + State enum + Transition()
    │   ├── snapshot.go   # Snapshot value type + builder
    │   ├── runtime.go    # type Runtime interface (k8s/stub swap point)
    │   ├── stubrt.go     # in-memory Runtime impl for tests + dev
    │   ├── service.go    # Trigger, Latest, Checksum
    │   └── handler.go
    │
    ├── observability/
    │   ├── service.go
    │   └── handler.go
    │
    ├── server/
    │   ├── server.go     # http.Server lifecycle
    │   ├── aggregate.go  # type API struct embeds every entity Handler
    │   ├── middleware.go # basicAuth (moved from server/auth.go)
    │   ├── healthz.go    # absorbs current handlers.go
    │   └── config.go
    │
    └── web/
        ├── embed.go      # //go:embed dist
        ├── handler.go    # newStaticHandler (moved from server/static.go)
        └── dist/         # frontend build artifact (NEW subdir — current static/* files relocate here; .gitkeep checked in)
```

Final file count: ~25-30 Go files. Same shape every entity. New entity = new folder with 2 files.

## File-per-folder convention

| File | Owns | May import |
|------|------|------------|
| `<entity>.go` | Domain type + methods. Optional for plain CRUD entities. | stdlib, uuid |
| `service.go` | Use cases. Holds `*db.DB`. Returns sqlc rows or domain types. | platform, db, sqlc, `<entity>.go` |
| `handler.go` | oapi-codegen slice. Decodes request, calls service, encodes response. Mapping inlined at call sites — direct `openapi.X{...}` struct literals from sqlc rows. | service, openapi, sqlc, `<entity>.go` |

## Layer rules

| Package | Allowed imports | Forbidden |
|---------|-----------------|-----------|
| `platform/*` | stdlib, third-party | other `internal/*` |
| `db` | platform, sqlc-gen | openapi, entity packages, server |
| `openapi` | (generated; leaf) | anything internal |
| entity packages | platform, db, openapi, sibling entity packages (sparingly, only for shared types) | server |
| `web` | stdlib (`embed`, `io/fs`, `net/http`) | every internal package — leaf, no business logic |
| `server` | every entity package, platform, db, web | nothing imports server |

DAG direction: `cmd → server → entity → {db, platform, openapi}`. Same as today, just cleaner.

## Code shapes

### Small entity — `internal/project/`

```go
// service.go
package project

type Service struct{ db *db.DB }

func New(d *db.DB) *Service { return &Service{db: d} }

func (s *Service) Get(ctx context.Context, id uuid.UUID) (sqlc.Project, error) {
    p, err := s.db.Q.GetProject(ctx, pgxid.PgUUID(id))
    if errors.Is(err, pgx.ErrNoRows) {
        return sqlc.Project{}, apierr.NotFound("project not found")
    }
    return p, err
}

func (s *Service) Create(ctx context.Context, in CreateInput) (sqlc.Project, error) {
    if in.Name == "" || in.Slug == "" {
        return sqlc.Project{}, apierr.BadRequest("name and slug required")
    }
    p, err := s.db.Q.CreateProject(ctx, sqlc.CreateProjectParams{...})
    if err != nil {
        if pgerr.IsUniqueViolation(err) {
            return sqlc.Project{}, apierr.Conflict("slug taken")
        }
        return sqlc.Project{}, apierr.Internal(err) // wrap, never leak raw pg text
    }
    return p, nil
}
```

```go
// handler.go
type Handler struct{ svc *Service }

func NewHandler(s *Service) *Handler { return &Handler{svc: s} }

func (h *Handler) GetProject(ctx context.Context, req openapi.GetProjectRequestObject) (openapi.GetProjectResponseObject, error) {
    p, err := h.svc.Get(ctx, uuid.UUID(req.Id))
    if err != nil {
        return nil, err
    }
    return openapi.GetProject200JSONResponse(openapi.Project{
        Id:        openapi_types.UUID(uuid.UUID(p.ID.Bytes)),
        Slug:      p.Slug,
        Name:      p.Name,
        CreatedAt: p.Created.Time,
        UpdatedAt: p.Updated.Time,
    }), nil
}

func (h *Handler) CreateProject(ctx context.Context, req openapi.CreateProjectRequestObject) (openapi.CreateProjectResponseObject, error) {
    if req.Body == nil {
        return nil, apierr.BadRequest("body required")
    }
    p, err := h.svc.Create(ctx, CreateInput{
        Name: req.Body.Name, Slug: req.Body.Slug, Description: req.Body.Description,
    })
    if err != nil {
        return nil, err
    }
    return openapi.CreateProject201JSONResponse(openapi.Project{
        Id:        openapi_types.UUID(uuid.UUID(p.ID.Bytes)),
        Slug:      p.Slug,
        Name:      p.Name,
        CreatedAt: p.Created.Time,
        UpdatedAt: p.Updated.Time,
    }), nil
}
```

Mapping struct literal repeats once per handler method. Trivial duplication for small entities; reads top-to-bottom without file-hopping.

### Rich entity — `internal/resource/`

```go
// resource.go — invariants live with the type
type Resource struct {
    ID, ProjectID uuid.UUID
    Name, Kind    string
    Disks         []Disk
    Spec          json.RawMessage
}

func (r *Resource) AddDisk(d Disk) error {
    for _, existing := range r.Disks {
        if existing.MountPath == d.MountPath {
            return apierr.Conflict("disk mount path taken")
        }
    }
    r.Disks = append(r.Disks, d)
    return nil
}
```

Service uses `Resource.AddDisk` and persists via sqlc. Resource mapping today (`internal/api/resource/mapper.go:16-74`) is ~60 LOC including routes-join + spec-envelope logic, called by 4 handler methods (Get, List, Create, Update). 4 × 60 = 240 LOC of repeated literal construction is past the point where inlining helps readability — and drift across Get/List/Create/Update (e.g. Update forgets a new field added to Get) is the exact bug class mappers prevent. **Resource is the documented exception to the inline-default rule: ship a single `func resourceToWire(...)` helper at the bottom of `handler.go` from day one.** All other entities default to inline; revisit only if a similar 4-caller × 50+ LOC pattern emerges.

### Deployment with state machine + runtime port

```go
// deployment.go
type State string

const (
    StatePending  State = "pending"
    StateBuilding State = "building"
    StateRunning  State = "running"
    StateFailed   State = "failed"
    StateStopped  State = "stopped"
)

var allowed = map[State][]State{
    StatePending:  {StateBuilding, StateFailed},
    StateBuilding: {StateRunning, StateFailed},
    StateRunning:  {StateStopped, StateFailed},
}

type Deployment struct {
    ID       uuid.UUID
    State    State
    Snapshot Snapshot
}

func (d *Deployment) Transition(to State) error {
    for _, ok := range allowed[d.State] {
        if ok == to {
            d.State = to
            return nil
        }
    }
    return apierr.BadRequest("invalid transition")
}
```

```go
// runtime.go
type Runtime interface {
    Apply(ctx context.Context, snap Snapshot) (Handle, error)
    Status(ctx context.Context, h Handle) (State, error)
    Stop(ctx context.Context, h Handle) error
}

type Handle struct {
    DeploymentID uuid.UUID
    ExternalID   string
}
```

State + Runtime live in the deployment package. Single interface. No separate `port/`.

### Aggregator — `internal/server/aggregate.go`

Embedding `*project.Handler` and `*resource.Handler` directly would produce two struct fields both named `Handler` — duplicate field name, compile error. Type aliases rename the embedded field while preserving promoted methods:

```go
package server

// Aliases rename embedded fields; method promotion is unaffected.
type (
    projectAPI       = project.Handler
    resourceAPI      = resource.Handler
    routeAPI         = route.Handler
    variableAPI      = variable.Handler
    registryAPI      = registry.Handler
    deploymentAPI    = deployment.Handler
    observabilityAPI = observability.Handler
)

type API struct {
    *projectAPI
    *resourceAPI
    *routeAPI
    *variableAPI
    *registryAPI
    *deploymentAPI
    *observabilityAPI
}

// Compile-time guard: missing method on any embedded handler fails build,
// not at first request. Pairs with NewAPI below to prevent nil-handler panics.
var _ openapi.StrictServerInterface = (*API)(nil)

// NewAPI requires every handler — forgotten init = compile error, not runtime panic.
func NewAPI(
    project *project.Handler,
    resource *resource.Handler,
    route *route.Handler,
    variable *variable.Handler,
    registry *registry.Handler,
    deployment *deployment.Handler,
    observability *observability.Handler,
) *API {
    return &API{
        projectAPI: project, resourceAPI: resource, routeAPI: route,
        variableAPI: variable, registryAPI: registry,
        deploymentAPI: deployment, observabilityAPI: observability,
    }
}
```

Wired in `server.go`:
```go
func New(cfg Config, pool *pgxpool.Pool) *http.Server {
    database := db.New(pool)

    api := NewAPI(
        project.NewHandler(project.New(database)),
        resource.NewHandler(resource.New(database)),
        route.NewHandler(route.New(database)),
        variable.NewHandler(variable.New(database)),
        registry.NewHandler(registry.New(database)),
        deployment.NewHandler(deployment.New(database, deployment.NewStubRuntime())),
        observability.NewHandler(observability.New()),
    )

    opts := openapi.StdHTTPServerOptions{
        ErrorHandlerFunc: func(w http.ResponseWriter, r *http.Request, err error) {
            var ae *apierr.APIError
            if !errors.As(err, &ae) {
                ae = apierr.Internal(err)
            }
            if ae.Status >= 500 {
                cause := errors.Unwrap(ae)
                if cause == nil {
                    cause = ae
                }
                slog.ErrorContext(r.Context(), "handler error",
                    "status", ae.Status, "code", ae.Code, "error", cause)
            }
            httpx.WriteJSON(w, ae.Status, ae)
        },
    }
    strict := openapi.NewStrictHandler(api, nil)
    apiHandler := openapi.HandlerWithOptions(strict, opts)

    mux := http.NewServeMux()
    mux.HandleFunc("/healthz", handleHealthz)
    mux.Handle("/api/", http.StripPrefix("/api", apiHandler))
    mux.Handle("/", web.NewStaticHandler())

    return &http.Server{
        Addr:              cfg.Addr,
        Handler:           basicAuth(cfg.BasicAuthUser, cfg.BasicAuthPass, mux),
        ReadHeaderTimeout: 5 * time.Second,
    }
}
```

## Composition root — `cmd/backend/main.go`

The plan deliberately drops `internal/app/`; main.go is the composition root and carries that weight. Shape:

```go
func main() {
    cfg := config.Load() // env + flags
    logger := slog.New(slog.NewJSONHandler(os.Stderr, nil))
    slog.SetDefault(logger)

    ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
    defer stop()

    pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
    if err != nil { slog.Error("pgxpool", "error", err); os.Exit(1) }
    defer pool.Close()

    if err := db.Migrate(ctx, pool); err != nil { /* fatal */ }

    srv := server.New(cfg, pool)
    go func() {
        if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
            slog.Error("http serve", "error", err)
            stop()
        }
    }()
    <-ctx.Done()

    shutCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
    defer cancel()
    _ = srv.Shutdown(shutCtx)
}
```

In-flight `go runtime.Apply(...)` goroutines are best-effort across SIGTERM today; durable queueing is a Phase 5+ trigger (see escalation table).

## Observability conventions

- Structured logging via `slog` (JSON handler in prod). `slog.SetDefault` in `main.go` only.
- Request-scoped logger: middleware in `server/middleware.go` injects a child logger with `request_id` (generate ULID per request) and `method` / `path` into `context.Context` via `slog.NewContext` (or a custom key — pick one and document). All handler/service code uses `slog.InfoContext(ctx, ...)` so request_id propagates without threading it manually.
- 5xx errors logged once at the strict-mode boundary (see `ErrorHandlerFunc` above). 4xx not logged by default — they're client errors, not server bugs.
- Tracing/metrics deferred until a concrete need lands (see escalation table).

## Multi-tenancy seam

Auth is BasicAuth today (line 549 escalation note covers replacement). Even though full multi-tenancy is deferred, **reserve the `context.Context` key now** in `internal/platform/authctx/` (one file, ~10 LOC):

```go
package authctx

type ctxKey struct{}

type Identity struct {
    UserID, OrgID string // empty until auth replaces BasicAuth
}

func With(ctx context.Context, id Identity) context.Context { return context.WithValue(ctx, ctxKey{}, id) }
func From(ctx context.Context) Identity                     { id, _ := ctx.Value(ctxKey{}).(Identity); return id }
```

Cost is trivial; retrofitting `OrgID`-scoping to every entity query later means touching every call site if the seam doesn't exist. Until real auth lands, the middleware injects an empty `Identity{}` so `authctx.From(ctx)` is always safe.

## Testing strategy

The new shape is more testable than the old (`Service` takes `*db.DB`, `Handler` takes `*Service`). Two test seams:

| Seam | What it tests | Tooling |
|------|---------------|---------|
| `internal/<entity>/service_test.go` | Use cases against a real DB. Hit `*db.DB` constructed from a testcontainers-go Postgres + migrations. No mocks. | `testcontainers-go`, `pgxpool` |
| `internal/apitest/` (new in Phase 1) | HTTP-level golden-fixture tests against `httptest.NewServer(server.New(cfg, pool))`. ~30 fixtures (entity × verb). | `net/http/httptest`, golden files |

Handler-level unit tests bypassing oapi-codegen are possible but redundant once apitest exists. Mocking sqlc is a future-trigger escalation, not a default.

## Cross-cutting code

### `internal/db/db.go`

```go
package db

type DB struct {
    Pool *pgxpool.Pool
    Q    *sqlc.Queries
}

func New(pool *pgxpool.Pool) *DB { return &DB{Pool: pool, Q: sqlc.New(pool)} }

func (d *DB) WithTx(ctx context.Context, fn func(*sqlc.Queries) error) (err error) {
    tx, err := d.Pool.BeginTx(ctx, pgx.TxOptions{})
    if err != nil {
        return err
    }
    defer func() {
        if p := recover(); p != nil {
            _ = tx.Rollback(ctx)
            panic(p)
        }
        if err != nil {
            _ = tx.Rollback(ctx)
            return
        }
        err = tx.Commit(ctx)
    }()
    return fn(sqlc.New(tx))
}
```

### `internal/platform/apierr/apierr.go`

```go
package apierr

type APIError struct {
    Status  int    `json:"-"`
    Code    string `json:"code"`
    Message string `json:"message"`
    cause   error  // unwrapped via Unwrap; never JSON-encoded
}

func (e *APIError) Error() string { return e.Message }
func (e *APIError) Unwrap() error { return e.cause }

func BadRequest(msg string) *APIError { return &APIError{Status: 400, Code: "bad_request", Message: msg} }
func NotFound(msg string) *APIError   { return &APIError{Status: 404, Code: "not_found", Message: msg} }
func Conflict(msg string) *APIError   { return &APIError{Status: 409, Code: "conflict", Message: msg} }

// Internal takes an error (not a string) so the wrap chain survives — log the cause,
// return a generic message to the client.
func Internal(cause error) *APIError {
    return &APIError{Status: 500, Code: "internal", Message: "internal error", cause: cause}
}
```

The `ErrorHandlerFunc` in `server.go` logs `ae.Unwrap()` (or the original error if not wrapped) before writing the JSON body — so client responses stay generic but the cause chain reaches `slog`. Strict-mode error translation lives in `server/server.go` — see the `opts` block in the wired example above. Replaces the current `writeError` at `internal/api/api.go:42-49`.

## Migration phases

Each phase compiles + tests independently. One PR per phase.

### Phase 1 — platform extraction + db wrapper + test harness (~1.5 days)

Goal: foundation pieces and the regression-detection net. No behavior change. `internal/api/` packages stay alive; Phase 2 deletes them.

**Compile-per-step caveat.** Several steps below break the tree if landed in isolation — e.g. step 5 renames the `db` package to `sqlc` while `internal/api/**` still references `db.Queries`. Group atomic commits as marked. Mid-PR commit boundaries matter for `git bisect`.

1. **[atomic group A]** Create `internal/platform/{httpx,apierr,pgerr,pgxid}/`. Land all four with content but no call-site sweep yet.
2. **[group A]** Split `internal/httpx/httpx.go`:
   - `APIError` + `BadRequest`, `NotFound`, `Conflict`, `Internal` → `platform/apierr/apierr.go` (note: `Internal` takes `error`, not `string` — see "Cross-cutting code" below)
   - `WriteJSON` + request decode helpers → `platform/httpx/httpx.go`
3. **[group A]** Split `internal/db/wire.go`:
   - `IsUniqueViolation`, `IsForeignKeyViolation` → `platform/pgerr/pgerr.go`
   - `PgUUID`, `UUIDStr`, `TsStr` → `platform/pgxid/pgxid.go` (carry verbatim)
4. **[atomic group B — single commit]** Sweep call sites then delete the originals:
   - `httpx.NotFound` / `Conflict` / `BadRequest` / `Internal` → `apierr.*`; `httpx.WriteJSON` keeps name, new import path.
   - `db.PgUUID` / `UUIDStr` / `TsStr` → `pgxid.*`; `db.IsUniqueViolation` / `IsForeignKeyViolation` → `pgerr.*`.
   - Delete `internal/httpx/` directory and `internal/db/wire.go`.
5. **[atomic group C — single commit]** sqlc relocation + DB wrapper + call-site sweep, all together:
   - Move sqlc-generated files (`models.go`, `querier.go`, `*.sql.go`, generated `db.go`) into `internal/db/sqlc/`. Update `sqlc.yaml`: `out: internal/db/sqlc`, `package: sqlc`. Run `sqlc generate` to verify diff is import-path-only.
   - Replace `internal/db/db.go` with new `DB` wrapper (shape above). Move `tx.go` body into `DB.WithTx`. Delete `tx.go`.
   - Update every `*db.Queries` → `*sqlc.Queries` across `internal/api/**` and `internal/server/**`.
   - Update `internal/api/api.go` to take `*db.DB` instead of `(q *db.Queries, pool *pgxpool.Pool)`. Update `internal/server/server.go:71` accordingly.
6. **[atomic group D]** Move `writeError` body from `internal/api/api.go:42-49` into `internal/server/server.go` as the `ErrorHandlerFunc` in `openapi.StdHTTPServerOptions`. Error currency is now `*apierr.APIError`.
7. **[group D]** Delete `internal/api/errors.go`. Replace its `badRequest` callers across **`api/projects.go`, `api/variables.go`, `api/resources.go`, `api/routes.go`, `api/registries.go`** (5 files, ~11 sites) with direct `apierr.BadRequest`. Note: `notFound` and `conflict` in `errors.go` are dead code — delete with the file.
8. **[group E — REQUIRED before Phase 2]** Land HTTP-level golden-fixture test harness at `internal/apitest/` (or similar):
   - `httptest.NewServer` wrapping the assembled handler.
   - One golden-response fixture per endpoint × CRUD verb (~30 fixtures total).
   - Fixtures captured against the **pre-Phase-2** behavior — these become the Phase 2 regression tripwire.
   - Use a containerized Postgres (testcontainers-go) or shared dev DB; document choice in test README.
   - This is the safety net for Phase 2's big-bang. Do not skip.

**Done when:** `go build ./...` green at every group boundary, `go test ./internal/apitest/...` green, no references to `httpx.APIError` / `db.PgUUID` / `db.Queries` outside `db/sqlc/` and `platform/`.

### Phase 2 — flatten entity packages (1.5-2 days)

Goal: collapse `internal/api/<plural>.go` + `internal/api/<entity>/` into `internal/<entity>/`.

**Strategy: single big-bang PR.** All 7 entities migrate together. Reason: oapi-codegen's `NewStrictHandler` takes ONE implementation — you can't run an old `*api.Server` and a new `*API` side-by-side. A per-route `http.ServeMux` shim could in principle bypass `NewStrictHandler` for in-flight entities, but the scaffolding cost exceeds the value across only 7 entities migrated in 2-3 days. The Phase 1 golden-fixture harness is the rollback signal, not a side-by-side runtime.

**Order within the PR (validate hard patterns early, finish trivial last):**
1. **project** — smallest entity that exercises the new `*db.DB` wiring; validates the basic per-entity shape end-to-end before any propagation.
2. **resource** — touches `db.WithTx`, joins, spec parsing, and `ResourceWithRoutes`. If the WithTx ergonomics or the inline-mapper-vs-helper split are wrong, you discover it on entity #2, not #6. The Phase 2 PR's hardest case validates the pattern early.
3. route (small CRUD)
4. variable (polymorphic but bounded)
5. registry (thin CRUD)
6. deployment (state machine + runtime port — most new code, but isolated from sibling entities)
7. observability (trivial stub — finishes the sweep)

Mechanical pattern per entity:

1. `mkdir internal/<entity>/`
2. Move `internal/api/<entity>/service.go` → `internal/<entity>/service.go`. Constructor takes `*db.DB`. Service signatures keep returning `sqlc.X` rows for simple entities (project, route, registry, variable). **Resource is the exception** — see below.
3. Convert `internal/api/<entity>.go` (handler thunks) into `internal/<entity>/handler.go`:
   - Change from `func (s *Server) GetProject(...)` to `type Handler struct{ svc *Service }; func (h *Handler) GetProject(...)`.
   - `s.q` references become `h.svc` calls.
   - Inline mapping at each handler call site — the body of `toWire(...)` from `internal/api/<entity>/mapper.go` becomes the `openapi.X{...}` struct literal directly inside the handler method's return. Delete the source mapper file.
   - **Resource exception:** keep a single `resourceToWire(...)` helper at the bottom of `resource/handler.go` from day one. 4 callers × ~60 LOC mapping crosses the duplication threshold today; see §"Rich entity" above.
4. After all 7 entities done in same PR: delete `internal/api/` directory entirely. **Land the final `internal/server/aggregate.go` (aliases + `NewAPI` + interface assertion) and the production `server.go` wiring (`openapi.NewStrictHandler` + `ErrorHandlerFunc`) in this same PR.** Aggregator ownership lives entirely in Phase 2; Phase 3 only handles middleware/healthz reshuffling.

Per-entity special handling:

- **resource** — the rich entity:
  - Extract spec parsing helpers (`extractRoutes`, embedded `embeddedRoute` struct, JSON envelope logic) from current `service.go:195-304` into `resource/spec.go`.
  - Service `Get` / `List` returns a richer struct: `type ResourceWithRoutes struct { R sqlc.Resource; Routes []sqlc.Route }`. Handler builds the wire `openapi.Resource` via the `resourceToWire(ResourceWithRoutes) openapi.Resource` helper. This is the documented exception to both "service returns sqlc rows" and "inline mapping at handler call site."
  - Cross-entity invocation in `Create`: persist embedded routes + variables by calling sqlc directly inside `db.WithTx` — do NOT inject `route.Service` / `variable.Service` into `resource.Service`. Slight insert-logic duplication is acceptable and avoids cross-entity import edges. **Tripwire:** if a third caller of route-insert logic appears, extract to a shared helper at that point.
  - Add `resource.go` only if invariants like duplicate-mount-path check are added now (otherwise defer).
- **variable**: keep polymorphic dispatch (Plain/Secret/Imported) in `service.go` for now. Add `variable.go` if/when type discriminator gains methods.
- **deployment**: pull state machine setup into `deployment.go` (State enum, Transition method, allowed transitions table). Pull snapshot building from current `service.go:77-188` into `snapshot.go`. Add `runtime.go` with `Runtime` interface + `Handle` type. Add `stubrt.go` with in-memory implementation. Service stays roughly current shape (`Trigger`, `Latest`, `Checksum`); replaces TODO at `service.go:69` with `go runtime.Apply(...)` against the stub for now.
- **observability**: trivial. `service.go` + `handler.go`. Returns empty data (current behavior).
- **registry**: thin. Two files (`service.go` + `handler.go`).

**Done when:** every entity has its own folder, `internal/api/` deleted, `go build ./...` green, manual smoke test of each endpoint passes (no automated test suite exists today).

### Phase 3 — server file reshuffling (~2 hours)

Goal: rename a few files inside `internal/server/`. Aggregator + wiring already landed in Phase 2.

1. Confirm `internal/server/aggregate.go` (landed in Phase 2) uses the **aliased** form from §"Aggregator" above, and that `var _ openapi.StrictServerInterface = (*API)(nil)` and `NewAPI(...)` are present. If Phase 2 left an inline aggregator inside `server.go`, lift it out now.
2. `git mv internal/server/auth.go internal/server/middleware.go` (basicAuth only — rename for clarity).
3. Fold `server/handlers.go` (healthz only) into `server/healthz.go`.
4. Add graceful shutdown to `cmd/backend/main.go` if absent — `signal.NotifyContext` for SIGINT/SIGTERM, `srv.Shutdown(ctx)` with bounded timeout. Stub deploy goroutines (`go runtime.Apply(...)`) survive on best-effort; durable queueing is a future-trigger escalation (see table below).

**Done when:** `internal/api/` does not exist, golden-fixture tests still green, error responses carry correct status codes via central middleware, SIGTERM shuts the server down without a panic.

### Phase 4 — web move + cleanup (½ day)

Goal: separate frontend embed concerns from server package.

Note: today's tree has build artifacts directly under `internal/server/static/` (no `dist/` subdir). The new layout introduces `internal/web/dist/` to clearly separate the package from its embedded artifact.

1. **Commit ordering matters** — land in this sequence to keep `go build` green:
   - Commit A: create `internal/web/dist/.gitkeep` (placeholder so the next commit's `//go:embed` doesn't fail).
   - Commit B: `git mv internal/server/static/* internal/web/dist/` (relocate current files into the new subdir, not into `internal/web/` directly).
   - Commit C: add `internal/web/embed.go`, `internal/web/handler.go`, swap `server/server.go` to call `web.NewStaticHandler()`, delete old `server/static.go`.
2. `internal/web/embed.go`:
   ```go
   package web

   import "embed"

   //go:embed dist
   var Dist embed.FS
   ```
3. `internal/web/handler.go`: move `newStaticHandler` from `server/static.go`, export as `NewStaticHandler`. The real switch for "frontend present" is `index.html` existence (not `.gitkeep` count) — branch on `fs.Stat(dist, "index.html")`. If absent: return a handler that 404s every `/` path. If present: serve via `fs.Sub(Dist, "dist")` with SPA fallback (unknown routes → `index.html`, except `/api/*` and `/healthz/*` which are mounted before this handler).
4. Document in `apps/backend/README.md`: frontend build at `apps/web` produces `dist/` which must be copied to `apps/backend/internal/web/dist/` before `go build`. Add Nx target if not already present.

**Done when:** `internal/server/static*` does not exist, frontend serves from `/`, `go build ./...` succeeds on a fresh clone with `internal/web/dist/` containing only `.gitkeep`, and unknown `/`-paths return 404 (not panic) when no `index.html` is present.

## Total effort

| Phase | Effort |
|-------|--------|
| 1 — platform + db wrapper + golden-fixture harness | ~1.5 days |
| 2 — flatten entity packages + final aggregator wiring | 2.5-3 days |
| 3 — server file reshuffling + graceful shutdown | ~2 hours |
| 4 — web move + cleanup | ½ day |
| **Total** | **~5-6 days** |

Earlier estimate (3.5-4 days) underweighted: (a) Phase 1's call-site sweeps (~7 service files × multiple references each), (b) Phase 2's resource entity (state machine adjacent + spec parsing extraction + WithTx cross-entity inserts), (c) deployment's brand-new Runtime interface + stub, (d) the golden-fixture harness — non-negotiable for Phase 2 safety.

## What we keep from heavier plans

- One folder per entity (bounded module).
- DAG enforced (server → entity → {db, platform, openapi}). No cycles.
- Domain methods on the type when invariants exist (`Resource.AddDisk`, `Deployment.Transition`).
- Aggregator via struct embedding (zero glue code).
- `platform/` leaf utilities.
- One earned port: `deployment.Runtime` (k8s/stub/nomad swap is a real future need).
- `db.WithTx` for cross-aggregate atomicity.

## What we drop (add only when earned)

- `domain/port/app/adapter` quadrant per entity.
- Per-entity repository interfaces (sqlc is already the abstraction).
- Anti-corruption layer between entities.
- Event bus / pub-sub.
- Durable async job queue.
- Reconciler loop.
- Bounded-context grouping (`configuration/`, `deployment/` umbrella folders).
- ADR docs.
- `internal/app/` composition root.

## When to escalate

Add the deferred pieces only when a concrete pain shows up:

| Trigger | Add |
|---------|-----|
| Goroutine-based deploys lose work on restart | Postgres-backed `jobs/` queue |
| Deploy lifecycle drifts between DB and runtime | `reconciler/` periodic loop |
| Web wants live deploy logs | `events/` package + SSE handler |
| sqlc mocking becomes painful in tests | Per-entity repository interfaces |
| Cross-entity coupling becomes a bug source | Group entities under bounded-context folders |
| Second binary appears (worker, CLI) | `internal/app/` composition root |
| Second runtime adapter actually lands | More implementations of existing `Runtime` interface (free) |
| Real users / multi-tenant onboarding | Replace BasicAuth with session+token middleware in `server/middleware.go`; thread identity via `context.Context`; scope every entity query by `OrgID` |
| Layer rules drift on review pressure | Add `depguard` config to `.golangci.yml` enforcing the layer-rules table |

## Conventions to enforce going forward

- New entity = new folder + `service.go` + `handler.go`. Add `<entity>.go` only when invariants exist.
- sqlc types may flow service → handler within the same entity package. Handlers construct `openapi.X` literals from sqlc fields directly, inline at the call site. **sqlc types must NOT cross out of `internal/<entity>/` into other entity packages or `server/`.** That boundary is what keeps the wire contract independent of the schema.
- `apierr` is the only error currency between layers. Services and handlers return `*apierr.APIError` for everything that's not a raw infra failure; the strict-mode error middleware translates to HTTP status. Service code wraps unexpected pg errors in `apierr.Internal(err)` — never returns the raw pgx error to a layer above (that would leak DB internals through the strict-mode `ErrorHandlerFunc`).
- Generated code stays in `db/sqlc/` or `openapi/`. Never co-mingle with hand-written.
- Cross-entity imports kept minimal. If two entities need a shared ID type, define it in the importing package or extract to `internal/ids/` (added only when needed). Never inject one entity's `Service` into another's; if cross-entity logic needs to share a transaction, use `db.WithTx` and call sqlc directly inside.
- **`db.WithTx` discipline:** use it for any operation that writes more than one row across tables. **Inside a `WithTx` callback, use only the `*sqlc.Queries` parameter — never `s.db.Q`.** The pool-scoped `s.db.Q` silently bypasses the transaction. Code review should reject any `s.db.Q.*` call inside a `WithTx` closure body.
- Layer rules (table above) enforced by code review for now. Add `depguard` config to `.golangci.yml` once the migration is done and the shape is stable.
