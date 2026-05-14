// Mirror of the canonical snapshot the backend stores on every Deployment row
// (see apps/backend/internal/deployment/snapshot.go). Both sides serialise
// the same shape with sorted keys; SHA-256 over the bytes is the gating
// signal for whether a deploy is needed.
//
// Shape rules — must match backend exactly:
//   - arrays sorted by id
//   - secret values omitted (frontend never sees plaintext)
//   - timestamps as int64 milliseconds since epoch — avoids tz/precision
//     mismatches between Go's RFC3339Nano and JS Date.toISOString
//   - resources.spec is the raw shape with `routes` stripped (routes live as
//     a top-level array)

import type { Resource, Route, Variable } from "@vyft/spec";

export interface Snapshot {
  resources: SnapResource[];
  routes: SnapRoute[];
  variables: SnapVariable[];
}

interface SnapResource {
  id: string;
  name: string;
  slug: string;
  kind: string;
  spec: unknown;
  updatedAt: number;
}

interface SnapRoute {
  id: string;
  resourceId: string;
  domain: string;
  path: string;
  pathType: string;
  port: number;
  tls: boolean;
  config: unknown;
  updatedAt: number;
}

// Discriminated by `kind`:
//   owned     — variable definition (project-wide if resourceId null, else
//               resource-scoped). Carries id + value/secret + updatedAt.
//   reference — env-binding of another variable into a resource under a
//               local key. Carries resourceId + key + sourceVariableId.
// Backend mirror: snapshotVariable in snapshot.go.
type SnapVariable = SnapOwnedVariable | SnapReferenceVariable;

interface SnapOwnedVariable {
  kind: "owned";
  id: string;
  resourceId: string | null;
  key: string;
  secret: boolean;
  value: string;
  updatedAt: number;
}

interface SnapReferenceVariable {
  kind: "reference";
  resourceId: string;
  key: string;
  sourceVariableId: string;
}

export function buildSnapshot(input: {
  resources: Resource[];
  routes: Route[];
  variables: Variable[];
}): Snapshot {
  const resources: SnapResource[] = input.resources
    .map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      kind: r.config.kind,
      spec: stripRoutes(r.config.spec),
      updatedAt: toMillis(r.updatedAt),
    }))
    .sort(byId);

  const routes: SnapRoute[] = input.routes
    .map((r) => ({
      id: r.id,
      resourceId: r.resourceId,
      domain: r.domain,
      path: r.path,
      pathType: r.pathType,
      port: r.port,
      tls: r.tls,
      config: r.config ?? {},
      updatedAt: toMillis(r.updatedAt),
    }))
    .sort(byId);

  const owned: SnapOwnedVariable[] = input.variables.map((v) => ({
    kind: "owned" as const,
    id: v.id,
    resourceId: v.resourceId,
    key: v.key,
    secret: v.secret,
    value: v.secret ? "" : (v.value ?? ""),
    updatedAt: toMillis(v.updatedAt),
  }));

  // References: each Variable carries `usedBy` — resources that import it
  // under some local key. Expand to per-reference rows so adding/removing
  // an import flips the snapshot hash.
  const references: SnapReferenceVariable[] = input.variables.flatMap((v) =>
    (v.usedBy ?? []).map((u) => ({
      kind: "reference" as const,
      resourceId: u.id,
      key: u.key,
      sourceVariableId: v.id,
    })),
  );

  // Sort matches backend: owned by id; reference by (resourceId, key).
  // Kind groups separately ("owned" < "reference" lexicographically).
  owned.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  references.sort((a, b) => {
    if (a.resourceId !== b.resourceId)
      return a.resourceId < b.resourceId ? -1 : 1;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
  const variables: SnapVariable[] = [...owned, ...references];

  return { resources, routes, variables };
}

function toMillis(s: string): number {
  return new Date(s).getTime();
}

function byId(a: { id: string }, b: { id: string }) {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// stripRoutes removes the embedded `routes` array from a resource's spec —
// matches the raw DB column shape used by the backend snapshot.
function stripRoutes(spec: unknown): unknown {
  if (spec == null || typeof spec !== "object") return spec ?? {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(spec as Record<string, unknown>)) {
    if (k === "routes") continue;
    out[k] = v;
  }
  return out;
}

// canonicalStringify produces sorted-key JSON so snapshots from either side
// hash byte-identically. Recursive: arrays preserve order (already sorted at
// build time), objects key-sorted at every level.
export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalStringify).join(",") + "]";
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const entries = keys.map(
    (k) =>
      JSON.stringify(k) +
      ":" +
      canonicalStringify((value as Record<string, unknown>)[k]),
  );
  return "{" + entries.join(",") + "}";
}

// stripVolatile removes fields that mutate without changing deployable content
// (currently `updatedAt`). Restore bumps the resource row's `updated` column
// even though the spec matches a prior deployment — keeping updatedAt in the
// hash would mark a restored project as "has changes" against its own
// snapshot. Recurses into arrays + objects.
function stripVolatile(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(stripVolatile);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k === "updatedAt") continue;
    out[k] = stripVolatile(v);
  }
  return out;
}

export async function snapshotHash(snapshot: unknown): Promise<string> {
  const text = canonicalStringify(stripVolatile(snapshot));
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
