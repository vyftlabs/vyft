import { z } from "zod"
import { Uuid } from "./common.ts"

export const PathType = z.enum(["prefix", "exact"]).meta({ id: "PathType" })

export const RouteConfig = z.object({
  redirect: z.object({
    scheme: z.string().min(1),
    statusCode: z.number().int().min(300).max(399),
  }).optional(),
  rewrite: z.object({
    path: z.string().optional(),
    stripPrefix: z.string().optional(),
  }).optional(),
  rateLimit: z.number().int().min(1).optional(),
  timeout: z.number().int().min(1).max(300).optional(),
  retries: z.number().int().min(0).max(10).optional(),
  cors: z.object({
    origins: z.string().min(1),
    methods: z.string().min(1),
    headers: z.string().optional(),
    maxAge: z.number().int().min(0).optional(),
  }).optional(),
}).meta({ id: "RouteConfig" })

export const Route = z.object({
  id: Uuid,
  serviceId: Uuid,
  domain: z.string().min(1).max(255),
  path: z.string().min(1).max(500).regex(/^\//),
  pathType: PathType.default("prefix"),
  port: z.number().int().min(1).max(65535),
  tls: z.boolean().default(true),
  config: RouteConfig.optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).meta({ id: "Route" })

export const RouteCreate = Route
  .pick({ domain: true, path: true, port: true, pathType: true, tls: true, config: true })
  .meta({ id: "RouteCreate" })

export const RouteUpdate = Route
  .pick({ domain: true, path: true, pathType: true, port: true, tls: true, config: true })
  .partial()
  .meta({ id: "RouteUpdate" })

export type PathType = z.infer<typeof PathType>
export type RouteConfig = z.infer<typeof RouteConfig>
export type Route = z.infer<typeof Route>
export type RouteCreate = z.infer<typeof RouteCreate>
export type RouteUpdate = z.infer<typeof RouteUpdate>
