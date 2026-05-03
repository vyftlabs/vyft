import { z } from "zod"
import { Uuid } from "./common.ts"

export const VariableScope = z.enum(["shared", "resource"]).meta({ id: "VariableScope" })

export const Variable = z.object({
  id: Uuid,
  key: z.string().min(1).max(255),
  value: z.string().nullable().optional(),
  sensitive: z.boolean().default(false),
  scope: VariableScope,
  projectId: Uuid,
  resourceId: Uuid.nullable().optional(),
  sourceVariableId: Uuid.nullable().optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  source: z.object({
    id: Uuid,
    key: z.string(),
    resource: z.object({ id: Uuid, name: z.string() }).nullable(),
  }).nullable().optional(),
  usedBy: z.array(z.object({ id: Uuid, name: z.string() })).optional(),
}).meta({ id: "Variable" })

export const VariableCreate = Variable
  .pick({ key: true, value: true, sensitive: true, resourceId: true, sourceVariableId: true })
  .meta({ id: "VariableCreate" })

export const VariableUpdate = VariableCreate
  .pick({ key: true, value: true, sensitive: true, sourceVariableId: true })
  .partial()
  .meta({ id: "VariableUpdate" })

export type Variable = z.infer<typeof Variable>
export type VariableCreate = z.infer<typeof VariableCreate>
export type VariableUpdate = z.infer<typeof VariableUpdate>
