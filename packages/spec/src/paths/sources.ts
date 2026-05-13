import { z } from "zod";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import { collectionErrors, itemErrors } from "../models/common.ts";
import { SetSourceDefault, Source, SourceCreate } from "../models/source.ts";

export const sourcePaths: ZodOpenApiPathsObject = {
  "/sources": {
    get: {
      operationId: "listSources",
      summary: "List sources",
      tags: ["Sources"],
      responses: {
        200: {
          description: "Sources",
          content: { "application/json": { schema: z.array(Source) } },
        },
        ...collectionErrors,
      },
    },
    post: {
      operationId: "createSource",
      summary: "Create source",
      tags: ["Sources"],
      requestBody: {
        content: { "application/json": { schema: SourceCreate } },
      },
      responses: {
        201: {
          description: "Created",
          content: { "application/json": { schema: Source } },
        },
        ...collectionErrors,
      },
    },
  },
  "/sources/{id}": {
    patch: {
      operationId: "updateSource",
      summary: "Update source",
      tags: ["Sources"],
      requestParams: { path: z.object({ id: z.uuid() }) },
      requestBody: {
        content: { "application/json": { schema: SourceCreate } },
      },
      responses: {
        200: {
          description: "Updated",
          content: { "application/json": { schema: Source } },
        },
        ...itemErrors,
      },
    },
    delete: {
      operationId: "deleteSource",
      summary: "Delete source",
      tags: ["Sources"],
      requestParams: { path: z.object({ id: z.uuid() }) },
      responses: {
        204: { description: "Deleted" },
        ...itemErrors,
      },
    },
  },
  "/source-defaults/metrics": {
    get: {
      operationId: "getMetricsSourceDefault",
      summary: "Get the metrics-domain default source",
      tags: ["Sources"],
      responses: {
        200: {
          description: "Active metrics source, or null when unset",
          content: { "application/json": { schema: Source.nullable() } },
        },
        ...collectionErrors,
      },
    },
    put: {
      operationId: "setMetricsSourceDefault",
      summary: "Set the metrics-domain default source",
      tags: ["Sources"],
      requestBody: {
        content: { "application/json": { schema: SetSourceDefault } },
      },
      responses: {
        200: {
          description: "Updated default",
          content: { "application/json": { schema: Source } },
        },
        ...itemErrors,
      },
    },
  },
};
