import { mutationOptions, queryOptions } from "@tanstack/react-query";
import type {
  SuggestionBuiltin,
  SuggestionService,
  SuggestionShared,
  Variable,
  VariableCreate,
  VariableReference,
  VariableSuggestions,
  VariableUpdate,
} from "@vyft/spec";
import { delay } from "../mock/latency";
import { now, store, uuid } from "../mock/store";
import { queryClient as qc } from "../reactquery";
import { getAppSpec } from "../resource";
import { badRequest, conflict, notFound } from "./errors";

const ROOT = ["variables"] as const;

export type {
  SuggestionBuiltin,
  SuggestionService,
  SuggestionShared,
  VariableReference,
  VariableSuggestions,
};

// ─── Service fns ─────────────────────────────────────────────────────────

function withRedaction(v: Variable): Variable {
  if (!v.secret) return v;
  return { ...v, value: null };
}

function withSourceMeta(v: Variable): Variable {
  if (!v.sourceVariableId) return v;
  const source = store
    .read("variables")
    .find((s) => s.id === v.sourceVariableId);
  if (!source) return v;
  const sourceResource = source.resourceId
    ? store.read("resources").find((r) => r.id === source.resourceId)
    : null;
  return {
    ...v,
    source: {
      id: source.id,
      key: source.key,
      resource: sourceResource
        ? { id: sourceResource.id, name: sourceResource.name }
        : null,
    },
  };
}

async function listVariables(
  projectId: string,
  opts: { resourceId?: string } = {},
): Promise<Variable[]> {
  await delay();
  const all = store.read("variables").filter((v) => v.projectId === projectId);
  if (opts.resourceId) {
    const scoped = all.filter(
      (v) => v.scope === "resource" && v.resourceId === opts.resourceId,
    );
    return scoped.map((v) => withRedaction(withSourceMeta(v)));
  }
  return all
    .filter((v) => v.scope === "shared")
    .map((v) => {
      const usedBy = all
        .filter((other) => other.sourceVariableId === v.id && other.resourceId)
        .map((other) => {
          const r = store
            .read("resources")
            .find((r) => r.id === other.resourceId);
          return r ? { id: r.id, name: r.name } : null;
        })
        .filter(Boolean) as { id: string; name: string }[];
      return { ...withRedaction(v), usedBy };
    });
}

async function listReferences(projectId: string): Promise<VariableReference[]> {
  await delay();
  const all = store.read("variables").filter((v) => v.projectId === projectId);
  return all
    .filter((v) => v.sourceVariableId && v.resourceId)
    .map((v) => {
      const source = all.find((s) => s.id === v.sourceVariableId);
      const targetId = v.resourceId;
      if (!source?.resourceId || !targetId || source.resourceId === targetId)
        return null;
      return {
        sourceResourceId: source.resourceId,
        targetResourceId: targetId,
      };
    })
    .filter(Boolean) as VariableReference[];
}

async function listSuggestions(
  projectId: string,
  opts: { excludeResourceId?: string } = {},
): Promise<VariableSuggestions> {
  await delay();
  const allVars = store
    .read("variables")
    .filter((v) => v.projectId === projectId);
  const allResources = store
    .read("resources")
    .filter((r) => r.projectId === projectId);

  const shared: SuggestionShared[] = allVars
    .filter((v) => v.scope === "shared")
    .map((v) => ({ id: v.id, key: v.key, secret: v.secret }));

  const service: SuggestionService[] = allVars
    .filter(
      (v) =>
        v.scope === "resource" &&
        !v.sourceVariableId &&
        v.resourceId !== opts.excludeResourceId,
    )
    .map((v) => {
      const r = allResources.find((r) => r.id === v.resourceId);
      return {
        id: v.id,
        key: v.key,
        secret: v.secret,
        resourceName: r?.name,
        resourceImage: r ? getAppSpec(r)?.source.image : undefined,
      };
    });

  const builtin: SuggestionBuiltin[] = [];
  for (const r of allResources) {
    if (r.id === opts.excludeResourceId) continue;
    const spec = getAppSpec(r);
    const image = spec?.source.image;
    builtin.push({
      id: `\${${r.name}.HOST}`,
      key: "HOST",
      token: `\${${r.name}.HOST}`,
      secret: false,
      resourceName: r.name,
      resourceImage: image,
    });
    if (spec?.port != null) {
      builtin.push({
        id: `\${${r.name}.PORT}`,
        key: "PORT",
        token: `\${${r.name}.PORT}`,
        secret: false,
        resourceName: r.name,
        resourceImage: image,
      });
    }
  }

  return { shared, service, builtin };
}

async function getVariable(projectId: string, id: string): Promise<Variable> {
  await delay();
  const v = store
    .read("variables")
    .find((v) => v.id === id && v.projectId === projectId);
  if (!v) throw notFound("Variable not found");
  return withRedaction(withSourceMeta(v));
}

async function createVariable(
  projectId: string,
  body: VariableCreate,
): Promise<Variable> {
  await delay();
  const scope: "shared" | "resource" = body.resourceId ? "resource" : "shared";
  const conflictKey =
    scope === "shared"
      ? store
          .read("variables")
          .find(
            (v) =>
              v.projectId === projectId &&
              v.scope === "shared" &&
              v.key === body.key,
          )
      : store
          .read("variables")
          .find(
            (v) =>
              v.scope === "resource" &&
              v.resourceId === body.resourceId &&
              v.key === body.key,
          );
  if (conflictKey) throw conflict(`Variable "${body.key}" already exists`);

  const v: Variable = {
    id: uuid(),
    key: body.key,
    value: body.sourceVariableId ? null : (body.value ?? null),
    secret: body.secret ?? false,
    scope,
    projectId,
    resourceId: body.resourceId ?? null,
    sourceVariableId: body.sourceVariableId ?? null,
    createdAt: now(),
    updatedAt: now(),
  };
  store.write("variables", [...store.read("variables"), v]);
  return withRedaction(v);
}

async function updateVariable(
  projectId: string,
  id: string,
  body: VariableUpdate,
): Promise<Variable> {
  await delay();
  const list = store.read("variables");
  const idx = list.findIndex((v) => v.id === id && v.projectId === projectId);
  if (idx === -1) throw notFound("Variable not found");
  const v = list[idx];
  if (v === undefined) throw notFound("Variable not found");
  if (body.key && body.key !== v.key) {
    const conflictKey =
      v.scope === "shared"
        ? list.find(
            (o) =>
              o.projectId === projectId &&
              o.scope === "shared" &&
              o.key === body.key,
          )
        : list.find(
            (o) =>
              o.scope === "resource" &&
              o.resourceId === v.resourceId &&
              o.key === body.key,
          );
    if (conflictKey) throw conflict("A variable with this key already exists");
  }
  const updated: Variable = {
    ...v,
    key: body.key ?? v.key,
    value: body.value !== undefined ? (body.value ?? null) : v.value,
    secret: body.secret ?? v.secret,
    sourceVariableId:
      body.sourceVariableId !== undefined
        ? (body.sourceVariableId ?? null)
        : v.sourceVariableId,
    updatedAt: now(),
  };
  const next = [...list];
  next[idx] = updated;
  store.write("variables", next);
  return withRedaction(updated);
}

async function deleteVariable(projectId: string, id: string): Promise<void> {
  await delay();
  const v = store
    .read("variables")
    .find((v) => v.id === id && v.projectId === projectId);
  if (!v) throw notFound("Variable not found");
  if (v.scope === "shared") {
    const refs = store
      .read("variables")
      .filter((o) => o.sourceVariableId === id);
    if (refs.length > 0) {
      const names = refs
        .map(
          (r) =>
            store.read("resources").find((res) => res.id === r.resourceId)
              ?.name,
        )
        .filter(Boolean);
      throw badRequest(`Cannot delete: referenced by ${names.join(", ")}`);
    }
  }
  store.write(
    "variables",
    store.read("variables").filter((v) => v.id !== id),
  );
}

// ─── Queries ─────────────────────────────────────────────────────────────

export const list = (projectId: string, opts: { resourceId?: string } = {}) =>
  queryOptions({
    queryKey: [...ROOT, projectId, "list", opts.resourceId ?? "shared"],
    queryFn: () => listVariables(projectId, opts),
  });

export const references = (projectId: string) =>
  queryOptions({
    queryKey: [...ROOT, projectId, "references"],
    queryFn: () => listReferences(projectId),
  });

export const suggestions = (
  projectId: string,
  opts: { excludeResourceId?: string } = {},
) =>
  queryOptions({
    queryKey: [
      ...ROOT,
      projectId,
      "suggestions",
      opts.excludeResourceId ?? null,
    ],
    queryFn: () => listSuggestions(projectId, opts),
  });

export const byId = (projectId: string, id: string) =>
  queryOptions({
    queryKey: [...ROOT, projectId, id],
    queryFn: () => getVariable(projectId, id),
  });

// ─── Mutations ───────────────────────────────────────────────────────────

export const create = mutationOptions({
  mutationFn: ({
    projectId,
    body,
  }: {
    projectId: string;
    body: VariableCreate;
  }) => createVariable(projectId, body),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ROOT });
    qc.invalidateQueries({ queryKey: ["deployments"] });
  },
});

export const update = mutationOptions({
  mutationFn: ({
    projectId,
    id,
    body,
  }: {
    projectId: string;
    id: string;
    body: VariableUpdate;
  }) => updateVariable(projectId, id, body),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ROOT });
    qc.invalidateQueries({ queryKey: ["deployments"] });
  },
});

export const remove = mutationOptions({
  mutationFn: ({ projectId, id }: { projectId: string; id: string }) =>
    deleteVariable(projectId, id),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ROOT });
    qc.invalidateQueries({ queryKey: ["deployments"] });
  },
});
