import { z } from "zod";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import {
  collectionErrors,
  itemErrors,
  ProjectAndIdScope,
  ServiceScope,
} from "../models/common.ts";
import { Volume, VolumeCreate } from "../models/volume.ts";

export const volumePaths: ZodOpenApiPathsObject = {
  "/projects/{projectId}/services/{serviceId}/volumes": {
    get: {
      operationId: "listVolumes",
      summary: "List volumes mounted on service",
      tags: ["Volumes"],
      requestParams: { path: ServiceScope },
      responses: {
        200: {
          description: "Volumes",
          content: { "application/json": { schema: z.array(Volume) } },
        },
        ...collectionErrors,
      },
    },
    post: {
      operationId: "createVolume",
      summary: "Create + mount volume",
      tags: ["Volumes"],
      requestParams: { path: ServiceScope },
      requestBody: {
        content: { "application/json": { schema: VolumeCreate } },
      },
      responses: {
        201: {
          description: "Created",
          content: { "application/json": { schema: Volume } },
        },
        ...collectionErrors,
      },
    },
  },
  "/projects/{projectId}/volumes/{id}": {
    delete: {
      operationId: "deleteVolume",
      summary: "Delete volume",
      tags: ["Volumes"],
      requestParams: { path: ProjectAndIdScope },
      responses: {
        204: { description: "Deleted" },
        ...itemErrors,
      },
    },
  },
};
