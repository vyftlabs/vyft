import { z } from "zod";

export const Uuid = z
  .uuid()
  .meta({ id: "Uuid", example: "01950000-0000-7000-8000-000000000000" });

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

export const errorResponses = {
  400: {
    description: "Bad request",
    content: { "application/json": { schema: ErrorBody } },
  },
  401: {
    description: "Unauthorized",
    content: { "application/json": { schema: ErrorBody } },
  },
  403: {
    description: "Forbidden",
    content: { "application/json": { schema: ErrorBody } },
  },
  404: {
    description: "Not found",
    content: { "application/json": { schema: ErrorBody } },
  },
  409: {
    description: "Conflict",
    content: { "application/json": { schema: ErrorBody } },
  },
} as const;

export const ProjectIdParam = z
  .object({
    projectId: Uuid,
  })
  .meta({ id: "ProjectIdParam" });

export const Empty = z.object({}).meta({ id: "Empty" });
