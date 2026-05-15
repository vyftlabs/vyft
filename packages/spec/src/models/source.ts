import { z } from "zod";
import { BaseFields } from "./common.ts";

export const SourceKind = z
  .enum(["prometheus", "metricsServer", "loki", "kubeLogs"])
  .meta({ id: "SourceKind" });

export const SourceDomain = z
  .enum(["metrics", "logs"])
  .meta({ id: "SourceDomain" });

const SourceName = z.string().min(1).max(100);

export const SourceAuth = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("none") }),
    z.object({
      type: z.literal("basic"),
      username: z.string().min(1).max(255),
      password: z.string().min(1),
    }),
    z.object({
      type: z.literal("bearer"),
      token: z.string().min(1),
    }),
  ])
  .meta({ id: "SourceAuth" });

export const SourceAuthSafe = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("none") }),
    z.object({
      type: z.literal("basic"),
      username: z.string().min(1).max(255),
    }),
    z.object({ type: z.literal("bearer") }),
  ])
  .meta({ id: "SourceAuthSafe" });

export const PrometheusConfig = z
  .object({
    url: z.url().max(500),
    auth: SourceAuth,
  })
  .meta({ id: "PrometheusConfig" });

export const PrometheusConfigSafe = z
  .object({
    url: z.url().max(500),
    auth: SourceAuthSafe,
  })
  .meta({ id: "PrometheusConfigSafe" });

export const MetricsServerConfig = z
  .object({})
  .meta({ id: "MetricsServerConfig" });

export const LokiConfig = z
  .object({
    url: z.url().max(500),
    auth: SourceAuth,
  })
  .meta({ id: "LokiConfig" });

export const LokiConfigSafe = z
  .object({
    url: z.url().max(500),
    auth: SourceAuthSafe,
  })
  .meta({ id: "LokiConfigSafe" });

export const KubeLogsConfig = z.object({}).meta({ id: "KubeLogsConfig" });

export const Source = z
  .discriminatedUnion("kind", [
    BaseFields.extend({
      name: SourceName,
      domain: SourceDomain,
      isDefault: z.boolean(),
      provisioned: z.boolean(),
      editable: z.boolean(),
      kind: z.literal("prometheus"),
      config: PrometheusConfigSafe,
    }),
    BaseFields.extend({
      name: SourceName,
      domain: SourceDomain,
      isDefault: z.boolean(),
      provisioned: z.boolean(),
      editable: z.boolean(),
      kind: z.literal("metricsServer"),
      config: MetricsServerConfig,
    }),
    BaseFields.extend({
      name: SourceName,
      domain: SourceDomain,
      isDefault: z.boolean(),
      provisioned: z.boolean(),
      editable: z.boolean(),
      kind: z.literal("loki"),
      config: LokiConfigSafe,
    }),
    BaseFields.extend({
      name: SourceName,
      domain: SourceDomain,
      isDefault: z.boolean(),
      provisioned: z.boolean(),
      editable: z.boolean(),
      kind: z.literal("kubeLogs"),
      config: KubeLogsConfig,
    }),
  ])
  .meta({ id: "Source" });

export const SourceCreate = z
  .discriminatedUnion("kind", [
    z.object({
      name: SourceName,
      domain: SourceDomain,
      kind: z.literal("prometheus"),
      config: PrometheusConfig,
    }),
    z.object({
      name: SourceName,
      domain: SourceDomain,
      kind: z.literal("metricsServer"),
      config: MetricsServerConfig,
    }),
    z.object({
      name: SourceName,
      domain: SourceDomain,
      kind: z.literal("loki"),
      config: LokiConfig,
    }),
    z.object({
      name: SourceName,
      domain: SourceDomain,
      kind: z.literal("kubeLogs"),
      config: KubeLogsConfig,
    }),
  ])
  .meta({ id: "SourceCreate" });

export type SourceKind = z.infer<typeof SourceKind>;
export type SourceDomain = z.infer<typeof SourceDomain>;
export type SourceAuth = z.infer<typeof SourceAuth>;
export type SourceAuthSafe = z.infer<typeof SourceAuthSafe>;
export type PrometheusConfig = z.infer<typeof PrometheusConfig>;
export type PrometheusConfigSafe = z.infer<typeof PrometheusConfigSafe>;
export type MetricsServerConfig = z.infer<typeof MetricsServerConfig>;
export type LokiConfig = z.infer<typeof LokiConfig>;
export type LokiConfigSafe = z.infer<typeof LokiConfigSafe>;
export type KubeLogsConfig = z.infer<typeof KubeLogsConfig>;
export type Source = z.infer<typeof Source>;
export type SourceCreate = z.infer<typeof SourceCreate>;
