import { z } from "zod";

export const Deployment = z
  .object({
    id: z.uuid(),
    projectId: z.uuid(),
    checksum: z.string(),
    status: z.enum(["created", "pending", "applying", "applied", "failed"]),
    statusMessage: z.string().nullable(),
    triggeredBy: z.uuid().nullable(),
    createdAt: z.iso.datetime(),
    appliedAt: z.iso.datetime().nullable(),
  })
  .meta({ id: "Deployment" });

export const DeploymentChecksum = Deployment.pick({ checksum: true })
  .extend({ checksum: Deployment.shape.checksum.nullable() })
  .meta({ id: "DeploymentChecksum" });

export const DeploymentLatest = Deployment.pick({
  checksum: true,
  status: true,
  createdAt: true,
})
  .nullable()
  .meta({ id: "DeploymentLatest" });

export type Deployment = z.infer<typeof Deployment>;
export type DeploymentChecksum = z.infer<typeof DeploymentChecksum>;
export type DeploymentLatest = z.infer<typeof DeploymentLatest>;
