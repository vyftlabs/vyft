import { z } from "zod";
import { BaseFields, Uuid } from "./common.ts";

export const VariableScope = z
  .enum(["shared", "resource"])
  .meta({ id: "VariableScope" });

export const Variable = BaseFields.extend({
  key: z.string().min(1).max(255),
  value: z.string().nullable(),
  sensitive: z.boolean().default(false),
  scope: VariableScope,
  projectId: Uuid,
  resourceId: Uuid.nullable(),
  sourceVariableId: Uuid.nullable(),
  source: z
    .object({
      id: Uuid,
      key: z.string(),
      resource: z.object({ id: Uuid, name: z.string() }).nullable(),
    })
    .nullable()
    .optional(),
  usedBy: z.array(z.object({ id: Uuid, name: z.string() })).optional(),
}).meta({ id: "Variable" });

export const VariableCreate = Variable.pick({
  key: true,
  value: true,
  sensitive: true,
  resourceId: true,
  sourceVariableId: true,
})
  .extend({
    value: Variable.shape.value.optional(),
    sensitive: Variable.shape.sensitive.optional(),
    resourceId: Variable.shape.resourceId.optional(),
    sourceVariableId: Variable.shape.sourceVariableId.optional(),
  })
  .meta({ id: "VariableCreate" });

export const VariableUpdate = Variable.pick({
  key: true,
  value: true,
  sensitive: true,
  sourceVariableId: true,
})
  .partial()
  .meta({ id: "VariableUpdate" });

export const VariableReference = z
  .object({
    sourceResourceId: Uuid,
    targetResourceId: Uuid,
  })
  .meta({ id: "VariableReference" });

export const SuggestionShared = z
  .object({
    id: Uuid,
    key: z.string(),
    secret: z.boolean(),
  })
  .meta({ id: "SuggestionShared" });

export const SuggestionService = z
  .object({
    id: Uuid,
    key: z.string(),
    secret: z.boolean(),
    resourceName: z.string().optional(),
    resourceImage: z.string().optional(),
  })
  .meta({ id: "SuggestionService" });

export const SuggestionBuiltin = z
  .object({
    id: z.string(),
    key: z.string(),
    token: z.string(),
    secret: z.boolean(),
    resourceName: z.string(),
    resourceImage: z.string().optional(),
  })
  .meta({ id: "SuggestionBuiltin" });

export const VariableSuggestions = z
  .object({
    shared: z.array(SuggestionShared),
    service: z.array(SuggestionService),
    builtin: z.array(SuggestionBuiltin),
  })
  .meta({ id: "VariableSuggestions" });

export type VariableScope = z.infer<typeof VariableScope>;
export type Variable = z.infer<typeof Variable>;
export type VariableCreate = z.infer<typeof VariableCreate>;
export type VariableUpdate = z.infer<typeof VariableUpdate>;
export type VariableReference = z.infer<typeof VariableReference>;
export type SuggestionShared = z.infer<typeof SuggestionShared>;
export type SuggestionService = z.infer<typeof SuggestionService>;
export type SuggestionBuiltin = z.infer<typeof SuggestionBuiltin>;
export type VariableSuggestions = z.infer<typeof VariableSuggestions>;
