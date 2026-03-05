import { z } from "zod";

export const walEntrySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("set"),
    key: z.string(),
    data: z.unknown(),
  }),
  z.object({
    type: z.literal("remove"),
    key: z.string(),
  }),
]);

export const stateFileSchema = z.record(z.string(), z.unknown());

export const lockPayloadSchema = z.object({
  pid: z.number(),
  timestamp: z.string(),
});
