import { z } from "zod";
import { BaseFields } from "./common.ts";

export const DataSourceKind = z
  .enum(["prometheus", "metricsServer"])
  .meta({ id: "DataSourceKind" });

const DataSourceName = z.string().min(1).max(100);

export const DataSourceAuth = z
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
  .meta({ id: "DataSourceAuth" });

export const DataSourceAuthSafe = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("none") }),
    z.object({
      type: z.literal("basic"),
      username: z.string().min(1).max(255),
    }),
    z.object({ type: z.literal("bearer") }),
  ])
  .meta({ id: "DataSourceAuthSafe" });

export const PrometheusConfig = z
  .object({
    url: z.url().max(500),
    auth: DataSourceAuth,
  })
  .meta({ id: "PrometheusConfig" });

export const PrometheusConfigSafe = z
  .object({
    url: z.url().max(500),
    auth: DataSourceAuthSafe,
  })
  .meta({ id: "PrometheusConfigSafe" });

export const MetricsServerConfig = z
  .object({})
  .meta({ id: "MetricsServerConfig" });

export const DataSource = z
  .discriminatedUnion("kind", [
    BaseFields.extend({
      name: DataSourceName,
      kind: z.literal("prometheus"),
      config: PrometheusConfigSafe,
    }),
    BaseFields.extend({
      name: DataSourceName,
      kind: z.literal("metricsServer"),
      config: MetricsServerConfig,
    }),
  ])
  .meta({ id: "DataSource" });

export const DataSourceCreate = z
  .discriminatedUnion("kind", [
    z.object({
      name: DataSourceName,
      kind: z.literal("prometheus"),
      config: PrometheusConfig,
    }),
    z.object({
      name: DataSourceName,
      kind: z.literal("metricsServer"),
      config: MetricsServerConfig,
    }),
  ])
  .meta({ id: "DataSourceCreate" });

export const DataSourceDefaults = z
  .object({
    metrics: z.uuid().nullable(),
  })
  .meta({ id: "DataSourceDefaults" });

export const SetDataSourceDefault = z
  .object({
    dataSourceId: z.uuid(),
  })
  .meta({ id: "SetDataSourceDefault" });

export type DataSourceKind = z.infer<typeof DataSourceKind>;
export type DataSourceAuth = z.infer<typeof DataSourceAuth>;
export type DataSourceAuthSafe = z.infer<typeof DataSourceAuthSafe>;
export type PrometheusConfig = z.infer<typeof PrometheusConfig>;
export type PrometheusConfigSafe = z.infer<typeof PrometheusConfigSafe>;
export type MetricsServerConfig = z.infer<typeof MetricsServerConfig>;
export type DataSource = z.infer<typeof DataSource>;
export type DataSourceCreate = z.infer<typeof DataSourceCreate>;
export type DataSourceDefaults = z.infer<typeof DataSourceDefaults>;
export type SetDataSourceDefault = z.infer<typeof SetDataSourceDefault>;
