import { z } from "zod";
import { BaseFields } from "./common.ts";

// =============================================================================
// Project variables (one row per definition)
//
// Live at /projects/{pid}/variables. Always have a literal value (or
// encrypted bytes for secrets). Identified by `id`.
//
// `resourceId` discriminates ownership:
//   null      — shared (project-level), available to any resource via import.
//   <uuid>    — owned by that resource. Other resources can import it.
// =============================================================================

export const ResourceRef = z
  .object({ id: z.uuid(), name: z.string() })
  .meta({ id: "ResourceRef" });

export const Variable = BaseFields.extend({
  projectId: z.uuid(),
  resourceId: z.uuid().nullable(),
  key: z.string().min(1).max(255),
  value: z.string().nullable(),
  secret: z.boolean(),
  // Resources currently importing this variable (populated on list/get).
  usedBy: z.array(ResourceRef).optional(),
}).meta({ id: "Variable" });

export const VariableCreate = z
  .object({
    key: z.string().min(1).max(255),
    value: z.string().nullable(),
    secret: z.boolean().optional(),
  })
  .meta({ id: "VariableCreate" });

export const VariableUpdate = VariableCreate.partial().meta({
  id: "VariableUpdate",
});

// =============================================================================
// Resource variables (resource-scoped: owned + imported, unified)
//
// Live at /projects/{pid}/resources/{rid}/variables. Identified by `key` —
// keys are unique per resource and that is what env-var consumers care about.
//
// Discriminator: `kind`.
//   owned    — value lives on this row (or encrypted bytes if secret).
//   imported — points at another variable (shared or another resource's owned)
//              via sourceVariableId. value is the source's value at apply time.
// =============================================================================

// Owned has a uuid id (variables table PK). Imported has no surrogate id —
// identity is the composite (resourceId, key) and that's what URLs use.
const ResourceVariableBase = z.object({
  projectId: z.uuid(),
  resourceId: z.uuid(),
  key: z.string().min(1).max(255),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const OwnedResourceVariable = ResourceVariableBase.extend({
  kind: z.literal("owned"),
  id: z.uuid(),
  value: z.string().nullable(),
  secret: z.boolean(),
}).meta({ id: "OwnedResourceVariable" });

export const ImportSource = z
  .object({
    id: z.uuid(),
    key: z.string(),
    secret: z.boolean(),
    resource: ResourceRef.nullable(),
  })
  .meta({ id: "ImportSource" });

export const ImportedResourceVariable = ResourceVariableBase.extend({
  kind: z.literal("imported"),
  sourceVariableId: z.uuid(),
  // Populated source metadata (read-only convenience for UI).
  source: ImportSource.optional(),
}).meta({ id: "ImportedResourceVariable" });

export const ResourceVariable = z
  .discriminatedUnion("kind", [OwnedResourceVariable, ImportedResourceVariable])
  .meta({ id: "ResourceVariable" });

export const ResourceVariableCreate = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("owned"),
      key: z.string().min(1).max(255),
      value: z.string().nullable(),
      secret: z.boolean().optional(),
    }),
    z.object({
      kind: z.literal("imported"),
      key: z.string().min(1).max(255),
      sourceVariableId: z.uuid(),
    }),
  ])
  .meta({ id: "ResourceVariableCreate" });

export const ResourceVariableUpdate = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("owned"),
      key: z.string().min(1).max(255).optional(),
      value: z.string().nullable().optional(),
      secret: z.boolean().optional(),
    }),
    z.object({
      kind: z.literal("imported"),
      key: z.string().min(1).max(255).optional(),
      sourceVariableId: z.uuid().optional(),
    }),
  ])
  .meta({ id: "ResourceVariableUpdate" });

export type ResourceRef = z.infer<typeof ResourceRef>;
export type ImportSource = z.infer<typeof ImportSource>;
export type Variable = z.infer<typeof Variable>;
export type VariableCreate = z.infer<typeof VariableCreate>;
export type VariableUpdate = z.infer<typeof VariableUpdate>;
export type OwnedResourceVariable = z.infer<typeof OwnedResourceVariable>;
export type ImportedResourceVariable = z.infer<typeof ImportedResourceVariable>;
export type ResourceVariable = z.infer<typeof ResourceVariable>;
export type ResourceVariableCreate = z.infer<typeof ResourceVariableCreate>;
export type ResourceVariableUpdate = z.infer<typeof ResourceVariableUpdate>;
