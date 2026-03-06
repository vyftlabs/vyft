import { z } from "zod";

export const serviceInput = z.object({
  name: z.string(),
  image: z.string().optional(),
  path: z.string().optional(),
  cwd: z.string().optional(),
  port: z.number().default(3000),
  route: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
  command: z.array(z.string()).optional(),
  mounts: z
    .array(z.object({ source: z.string(), target: z.string() }))
    .optional(),
  health: z
    .object({
      path: z.string(),
      interval: z.string().optional(),
      timeout: z.string().optional(),
      retries: z.number().optional(),
    })
    .optional(),
  restart: z
    .enum(["always", "on-failure", "unless-stopped", "no"])
    .default("always"),
  expose: z.boolean().optional(),
});

export type ServiceInput = z.infer<typeof serviceInput>;

export const volumeInput = z.object({
  name: z.string(),
  size: z.string().optional(),
});

export type VolumeInput = z.infer<typeof volumeInput>;

export const cronJobInput = z.object({
  name: z.string(),
  schedule: z.string(),
  image: z.string().optional(),
  path: z.string().optional(),
  cwd: z.string().optional(),
  command: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  mounts: z
    .array(z.object({ source: z.string(), target: z.string() }))
    .optional(),
  health: z
    .object({
      path: z.string(),
      interval: z.string().optional(),
      timeout: z.string().optional(),
      retries: z.number().optional(),
    })
    .optional(),
  restart: z
    .enum(["always", "on-failure", "unless-stopped", "no"])
    .default("on-failure"),
});

export type CronJobInput = z.infer<typeof cronJobInput>;
