import { BaseFields } from "./common.ts";
import { z } from "zod";

export const Project = BaseFields.extend({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).nullable(),
}).meta({ id: "Project" });

export const ProjectCreate = Project.pick({
  name: true,
  slug: true,
  description: true,
})
  .partial({ description: true })
  .meta({ id: "ProjectCreate" });

export const ProjectUpdate = Project.pick({ name: true, description: true })
  .partial()
  .meta({ id: "ProjectUpdate" });

export const ProjectListQuery = z
  .object({
    sort: z.enum(["createdAt", "updatedAt"]).default("createdAt"),
    order: z.enum(["asc", "desc"]).default("desc"),
  })
  .meta({ id: "ProjectListQuery" });

export type Project = z.infer<typeof Project>;
export type ProjectCreate = z.infer<typeof ProjectCreate>;
export type ProjectUpdate = z.infer<typeof ProjectUpdate>;
