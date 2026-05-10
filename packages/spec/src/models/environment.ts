import { z } from "zod";

export const EnvironmentSlug = z
  .string()
  .min(1)
  .max(31)
  .regex(/^[a-z][a-z0-9-]{0,30}$/);

export const Environment = z
  .object({
    id: z.uuid(),
    projectId: z.uuid(),
    slug: EnvironmentSlug,
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "Environment" });

export const EnvironmentCreate = z
  .object({ slug: EnvironmentSlug })
  .meta({ id: "EnvironmentCreate" });

export type Environment = z.infer<typeof Environment>;
export type EnvironmentCreate = z.infer<typeof EnvironmentCreate>;
