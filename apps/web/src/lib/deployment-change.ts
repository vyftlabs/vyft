import type { Deployment } from "@vyft/spec";

// describeDeploymentChange infers a short, human label for what a deployment
// actually changed, by diffing its snapshot against the previous one.
//
// Every deployment row carries a `snapshot` (canonical reduced state at
// create time — see backend internal/deployment/snapshot.go). It's typed
// `unknown` on the wire (it exists to hash-gate the deploy button), so we
// parse it structurally. The per-resource deployments list is already
// filtered to deployments whose slice for this resource changed, so a
// neighbouring pair always differs somewhere — we just classify where.
//
// Single-axis changes get a specific label ("Scaled to 3", "Deployed
// :v2", "Updated variables"); multi-axis collapses to "N changes".

interface SnapSpec {
  source?: { image?: string };
  instances?: number;
  resources?: { cpu?: number; memory?: number };
  port?: number | null;
  startCommand?: string | null;
  healthCheck?: unknown;
  disks?: unknown;
}

interface SnapResource {
  id: string;
  spec?: SnapSpec;
}

interface SnapRoute {
  resourceId: string;
}

interface SnapVariable {
  resourceId?: string | null;
}

interface Snapshot {
  resources?: SnapResource[];
  routes?: SnapRoute[];
  variables?: SnapVariable[];
}

function parse(d?: Deployment): Snapshot {
  const s = d?.snapshot;
  return s && typeof s === "object" ? (s as Snapshot) : {};
}

const json = (v: unknown) => JSON.stringify(v ?? null);

// Snapshot arrays are server-sorted, so filter preserves a stable order and
// a plain stringify compares the slice faithfully.
const routesFor = (s: Snapshot, rid: string) =>
  (s.routes ?? []).filter((r) => r.resourceId === rid);
const varsFor = (s: Snapshot, rid: string) =>
  (s.variables ?? []).filter((v) => v.resourceId === rid);

function imageLabel(curr?: string, prev?: string): string {
  // Same repo, new tag → lead with the tag (the useful bit). Repo change or
  // untagged → generic.
  const [cRepo, cTag] = splitImage(curr);
  const [pRepo] = splitImage(prev);
  if (cTag && cRepo === pRepo) return `Deployed :${cTag}`;
  return "Updated image";
}

function splitImage(image?: string): [string, string | undefined] {
  if (!image) return ["", undefined];
  // Ignore a registry-port colon (host:5000/repo) — tag is after the last
  // colon only if it's past the final slash.
  const slash = image.lastIndexOf("/");
  const colon = image.lastIndexOf(":");
  if (colon > slash) return [image.slice(0, colon), image.slice(colon + 1)];
  return [image, undefined];
}

function scaleLabel(curr?: number, prev?: number): string {
  if (curr === 0) return "Scaled to 0";
  if (curr == null) return "Updated scale";
  if (prev != null && curr < prev) return `Scaled down to ${curr}`;
  return `Scaled to ${curr}`;
}

export function describeDeploymentChange(
  curr: Deployment,
  prev: Deployment | undefined,
  resourceId: string,
): string {
  const c = parse(curr);
  const p = parse(prev);
  const cr = c.resources?.find((r) => r.id === resourceId);
  const pr = p.resources?.find((r) => r.id === resourceId);

  if (!pr) return "Initial deployment";
  if (!cr) return "Removed";

  const cs = cr.spec ?? {};
  const ps = pr.spec ?? {};
  const changed: string[] = [];

  const cImg = cs.source?.image;
  const pImg = ps.source?.image;
  if (cImg !== pImg) changed.push("image");
  if ((cs.instances ?? null) !== (ps.instances ?? null)) changed.push("scale");
  if (json(cs.resources) !== json(ps.resources)) changed.push("resources");
  if (
    (cs.port ?? null) !== (ps.port ?? null) ||
    (cs.startCommand ?? null) !== (ps.startCommand ?? null) ||
    json(cs.healthCheck) !== json(ps.healthCheck) ||
    json(cs.disks) !== json(ps.disks)
  )
    changed.push("config");
  if (json(routesFor(c, resourceId)) !== json(routesFor(p, resourceId)))
    changed.push("routes");
  if (json(varsFor(c, resourceId)) !== json(varsFor(p, resourceId)))
    changed.push("variables");

  if (changed.length === 0) return "Redeployed";
  if (changed.length > 1) return `${changed.length} changes`;

  switch (changed[0]) {
    case "image":
      return imageLabel(cImg, pImg);
    case "scale":
      return scaleLabel(cs.instances, ps.instances);
    case "resources":
      return "Updated resources";
    case "config":
      return "Updated config";
    case "routes":
      return "Updated routes";
    case "variables":
      return "Updated variables";
    default:
      return "Redeployed";
  }
}
