import { z } from "zod"
import { Uuid } from "./common.ts"

export const DeploymentStatus = z.enum([
  "created",
  "pending",
  "applying",
  "applied",
  "failed",
]).meta({ id: "DeploymentStatus" })

export const Deployment = z.object({
  id: Uuid,
  projectId: Uuid,
  checksum: z.string(),
  status: DeploymentStatus,
  statusMessage: z.string().nullable(),
  triggeredBy: Uuid.nullable(),
  createdAt: z.iso.datetime(),
  appliedAt: z.iso.datetime().nullable(),
}).meta({ id: "Deployment" })

export const DeploymentChecksum = z.object({
  checksum: z.string().nullable(),
}).meta({ id: "DeploymentChecksum" })

export const DeploymentLatest = z.object({
  checksum: z.string(),
  status: DeploymentStatus,
  createdAt: z.iso.datetime(),
}).nullable().meta({ id: "DeploymentLatest" })

export type DeploymentStatus = z.infer<typeof DeploymentStatus>
export type Deployment = z.infer<typeof Deployment>
export type DeploymentChecksum = z.infer<typeof DeploymentChecksum>
export type DeploymentLatest = z.infer<typeof DeploymentLatest>
