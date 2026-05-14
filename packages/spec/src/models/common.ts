import { z } from "zod";

export const BaseFields = z.object({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const ResourceName = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/);

export const Instances = z.number().int().min(0).max(100);
export const Port = z.number().int().min(1).max(65535);
export const Command = z.string().max(2000);

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

const err = (description: string) => ({
  description,
  content: { "application/json": { schema: ErrorBody } },
});

export const itemErrors = {
  400: err("Bad request"),
  401: err("Unauthorized"),
  403: err("Forbidden"),
  404: err("Not found"),
  409: err("Conflict"),
} as const;

const { 404: _, ...rest } = itemErrors;
export const collectionErrors = rest;

export const ProjectScope = z.object({ projectId: z.uuid() });
export const ProjectAndIdScope = z.object({
  projectId: z.uuid(),
  id: z.uuid(),
});
export const ResourceScope = z.object({
  projectId: z.uuid(),
  resourceId: z.uuid(),
});
export const ResourceAndIdScope = z.object({
  projectId: z.uuid(),
  resourceId: z.uuid(),
  id: z.uuid(),
});
