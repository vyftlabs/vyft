import { z } from "zod";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import { errorResponses, Uuid } from "../models/common.ts";
import { Registry, RegistryCreate } from "../models/registry.ts";

export const registryPaths: ZodOpenApiPathsObject = {
  "/registries": {
    get: {
      operationId: "listRegistries",
      summary: "List registries",
      tags: ["Registries"],
      responses: {
        200: {
          description: "Registries",
          content: { "application/json": { schema: z.array(Registry) } },
        },
        ...errorResponses,
      },
    },
    post: {
      operationId: "createRegistry",
      summary: "Create registry",
      tags: ["Registries"],
      requestBody: {
        content: { "application/json": { schema: RegistryCreate } },
      },
      responses: {
        201: {
          description: "Created",
          content: { "application/json": { schema: Registry } },
        },
        ...errorResponses,
      },
    },
  },
  "/registries/{id}": {
    delete: {
      operationId: "deleteRegistry",
      summary: "Delete registry",
      tags: ["Registries"],
      requestParams: { path: z.object({ id: Uuid }) },
      responses: {
        204: { description: "Deleted" },
        ...errorResponses,
      },
    },
  },
};
