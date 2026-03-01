import { defineModuleShape } from "@vyft/provider";
import { z } from "zod";

export const Platform = defineModuleShape("platform", {
  network: {
    config: z.object({
      name: z.string(),
      ipRange: z.string(),
      zone: z.string(),
    }),
    outputs: z.object({
      networkId: z.number(),
    }),
  },
  server: {
    config: z.object({
      name: z.string(),
      serverType: z.string(),
      image: z.string(),
      location: z.string().optional(),
      sshKeys: z.array(z.string()).optional(),
      userData: z.string().optional(),
    }),
    outputs: z.object({
      serverId: z.number(),
      ipv4: z.string(),
    }),
  },
  volume: {
    config: z.object({
      name: z.string(),
      size: z.number(),
      location: z.string(),
      format: z.string().optional(),
    }),
    outputs: z.object({
      volumeId: z.number(),
      linuxDevice: z.string(),
    }),
  },
});
