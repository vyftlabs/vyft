import { z } from "zod"
import { Uuid } from "./common.ts"

export const Registry = z.object({
  id: Uuid,
  name: z.string().min(1).max(100),
  url: z.string().min(1).max(500),
  username: z.string().min(1).max(255),
  createdAt: z.iso.datetime(),
}).meta({ id: "Registry" })

export const RegistryCreate = Registry
  .pick({ name: true, url: true, username: true })
  .extend({ password: z.string().min(1) })
  .meta({ id: "RegistryCreate" })

export type Registry = z.infer<typeof Registry>
export type RegistryCreate = z.infer<typeof RegistryCreate>
