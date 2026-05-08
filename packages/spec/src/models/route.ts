import { z } from "zod";
import { BaseFields, Port } from "./common.ts";

export const PathType = z.enum(["prefix", "exact"]).meta({ id: "PathType" });

export const RouteConfig = z
  .object({
    redirect: z
      .object({
        scheme: z.enum(["http", "https"]),
        statusCode: z.number().int().min(300).max(399),
        location: z.url().optional(),
      })
      .optional(),
    rewrite: z
      .object({
        path: z.string().optional(),
        stripPrefix: z.string().optional(),
      })
      .optional(),
    rateLimit: z.number().int().min(1).optional(),
    timeout: z.number().int().min(1).max(300_000).optional(),
    retries: z.number().int().min(0).max(10).optional(),
    cors: z
      .object({
        origins: z.array(z.string().min(1)).min(1),
        methods: z.array(z.string().min(1)).min(1),
        headers: z.array(z.string().min(1)).optional(),
        maxAge: z.number().int().min(0).optional(),
      })
      .optional(),
  })
  .meta({
    id: "RouteConfig",
    description:
      "`redirect.location` omitted = scheme-only redirect (preserves path/host). `timeout` is milliseconds. `cors.maxAge` is seconds (HTTP spec).",
  });

export const Route = BaseFields.extend({
  resourceId: z.uuid(),
  domain: z.string().min(1).max(255),
  path: z.string().min(1).max(500).regex(/^\//),
  pathType: PathType.default("prefix"),
  port: Port,
  tls: z.boolean().default(true),
  config: RouteConfig.optional(),
}).meta({ id: "Route" });

export const RouteCreate = Route.pick({
  domain: true,
  path: true,
  port: true,
  pathType: true,
  tls: true,
  config: true,
}).meta({ id: "RouteCreate" });

export const RouteUpdate = RouteCreate.partial().meta({ id: "RouteUpdate" });

export type PathType = z.infer<typeof PathType>;
export type RouteConfig = z.infer<typeof RouteConfig>;
export type Route = z.infer<typeof Route>;
export type RouteCreate = z.infer<typeof RouteCreate>;
export type RouteUpdate = z.infer<typeof RouteUpdate>;
