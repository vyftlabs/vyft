import { z } from "zod";

export const platformSchemas = {
  server: z.object({
    name: z.string(),
    size: z.string(),
  }),
  volume: z.object({
    size: z.number(),
    zone: z.string(),
  }),
  network: z.object({
    cidr: z.string(),
  }),
} as const;

export type PlatformSchemas = typeof platformSchemas;

export type PlatformResourceName = keyof PlatformSchemas;
