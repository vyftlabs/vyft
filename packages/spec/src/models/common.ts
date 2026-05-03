import { z } from "zod";

export const Uuid = z
  .uuid()
  .meta({ id: "Uuid", example: "01950000-0000-7000-8000-000000000000" });

export const BaseFields = z.object({
  id: Uuid,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const ErrorCode = z
  .enum([
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL",
  ])
  .meta({ id: "ErrorCode" });

export const ErrorBody = z
  .object({
    code: ErrorCode,
    message: z.string(),
  })
  .meta({ id: "Error" });

export type ErrorBody = z.infer<typeof ErrorBody>;

const errorContent = { "application/json": { schema: ErrorBody } };

export const errorResponses = {
  400: { description: "Bad request", content: errorContent },
  401: { description: "Unauthorized", content: errorContent },
  403: { description: "Forbidden", content: errorContent },
  404: { description: "Not found", content: errorContent },
  409: { description: "Conflict", content: errorContent },
} as const;

export const collectionErrors = {
  400: errorResponses[400],
  401: errorResponses[401],
  403: errorResponses[403],
  409: errorResponses[409],
} as const;

export const itemErrors = {
  400: errorResponses[400],
  401: errorResponses[401],
  403: errorResponses[403],
  404: errorResponses[404],
  409: errorResponses[409],
} as const;

export const ProjectScope = z.object({ projectId: Uuid });
export const ProjectAndIdScope = z.object({ projectId: Uuid, id: Uuid });
export const ServiceScope = z.object({ projectId: Uuid, serviceId: Uuid });
export const ResourceScope = z.object({ projectId: Uuid, resourceId: Uuid });

export const ProjectIdParam = ProjectScope.meta({ id: "ProjectIdParam" });
