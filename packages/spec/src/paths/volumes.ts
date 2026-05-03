import { z } from "zod"
import type { ZodOpenApiPathsObject } from "zod-openapi"
import { errorResponses, Uuid } from "../models/common.ts"
import { Volume, VolumeCreate } from "../models/volume.ts"

const ServiceScope = z.object({ projectId: Uuid, serviceId: Uuid })
const VolumeScope = z.object({ projectId: Uuid, id: Uuid })

export const volumePaths: ZodOpenApiPathsObject = {
  "/projects/{projectId}/services/{serviceId}/volumes": {
    get: {
      operationId: "listVolumes",
      summary: "List volumes mounted on service",
      tags: ["Volumes"],
      requestParams: { path: ServiceScope },
      responses: {
        200: { description: "Volumes", content: { "application/json": { schema: z.array(Volume) } } },
        ...errorResponses,
      },
    },
    post: {
      operationId: "createVolume",
      summary: "Create + mount volume",
      tags: ["Volumes"],
      requestParams: { path: ServiceScope },
      requestBody: { content: { "application/json": { schema: VolumeCreate } } },
      responses: {
        201: { description: "Created", content: { "application/json": { schema: Volume } } },
        ...errorResponses,
      },
    },
  },
  "/projects/{projectId}/volumes/{id}": {
    delete: {
      operationId: "deleteVolume",
      summary: "Delete volume",
      tags: ["Volumes"],
      requestParams: { path: VolumeScope },
      responses: {
        204: { description: "Deleted" },
        ...errorResponses,
      },
    },
  },
}
