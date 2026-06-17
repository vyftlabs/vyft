import { z } from "zod";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import { collectionErrors, ResourceScope } from "../models/common.ts";
import { Backup } from "../models/resource.ts";

export const backupPaths: ZodOpenApiPathsObject = {
  "/projects/{projectId}/resources/{resourceId}/backups": {
    get: {
      operationId: "listResourceBackups",
      summary: "List Postgres backups for a resource",
      tags: ["Backups"],
      requestParams: { path: ResourceScope },
      responses: {
        200: {
          description: "Backups",
          content: { "application/json": { schema: z.array(Backup) } },
        },
        ...collectionErrors,
      },
    },
    post: {
      operationId: "createResourceBackup",
      summary: "Trigger an on-demand backup",
      tags: ["Backups"],
      requestParams: { path: ResourceScope },
      responses: {
        202: {
          description: "Backup started",
          content: { "application/json": { schema: Backup } },
        },
        ...collectionErrors,
      },
    },
  },
};
