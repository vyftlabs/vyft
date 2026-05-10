import { z } from "zod";

export const DeploymentStatus = z.enum([
  "pending",
  "applying",
  "applied",
  "failed",
]);

export const Deployment = z
  .object({
    id: z.uuid(),
    projectId: z.uuid(),
    environment: z.string(),
    status: DeploymentStatus,
    error: z.string().nullable(),
    createdAt: z.iso.datetime(),
    appliedAt: z.iso.datetime().nullable(),
    // Canonical reduced shape of the env-scoped state at the time the
    // deployment was created. Frontend hashes this together with its own
    // current view (built from the list endpoints) to gate the deploy button.
    snapshot: z.unknown(),
  })
  .meta({ id: "Deployment" });

export const DeploymentCreate = z
  .object({
    environment: z.string().optional(),
  })
  .meta({ id: "DeploymentCreate" });

export type Deployment = z.infer<typeof Deployment>;
export type DeploymentCreate = z.infer<typeof DeploymentCreate>;
