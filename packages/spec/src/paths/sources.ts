import { z } from "zod";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import { collectionErrors, itemErrors } from "../models/common.ts";
import { Source, SourceCreate } from "../models/source.ts";

const SourceTestResult = z
  .object({
    ok: z.boolean(),
    error: z.string().optional(),
  })
  .meta({ id: "SourceTestResult" });

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
  "/sources/{id}/default": {
    put: {
      operationId: "promoteSourceDefault",
      summary: "Promote this source to default for its domain",
      tags: ["Sources"],
      requestParams: { path: z.object({ id: z.uuid() }) },
      responses: {
        200: {
          description: "Promoted",
          content: { "application/json": { schema: Source } },
        },
        ...itemErrors,
      },
    },
  },
  "/sources/test": {
    post: {
      operationId: "testSource",
      summary: "Probe pending source config for reachability",
      tags: ["Sources"],
      requestBody: {
        content: { "application/json": { schema: SourceCreate } },
      },
      responses: {
        200: {
          description: "Probe result",
          content: { "application/json": { schema: SourceTestResult } },
        },
        ...collectionErrors,
      },
    },
  },
};
