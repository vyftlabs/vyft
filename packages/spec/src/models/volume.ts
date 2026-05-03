import { z } from "zod";
import { Uuid } from "./common.ts";

export const Volume = z
  .object({
    id: Uuid,
    name: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/),
    size: z
      .string()
      .min(1)
      .regex(/^\d+(Mi|Gi|Ti)$/),
    mountPath: z.string().min(1).max(500).regex(/^\//),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "Volume" });

export const VolumeCreate = Volume.pick({
  name: true,
  size: true,
  mountPath: true,
}).meta({ id: "VolumeCreate" });

export type Volume = z.infer<typeof Volume>;
export type VolumeCreate = z.infer<typeof VolumeCreate>;
