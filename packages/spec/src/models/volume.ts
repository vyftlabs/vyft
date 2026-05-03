import { z } from "zod";
import { BaseFields } from "./common.ts";

export const Volume = BaseFields.extend({
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/),
  size: z.number().int().positive(),
  mountPath: z.string().min(1).max(500).regex(/^\//),
}).meta({
  id: "Volume",
  description: "Persistent volume. `size` is bytes.",
});

export const VolumeCreate = Volume.pick({
  name: true,
  size: true,
  mountPath: true,
}).meta({ id: "VolumeCreate" });

export type Volume = z.infer<typeof Volume>;
export type VolumeCreate = z.infer<typeof VolumeCreate>;
