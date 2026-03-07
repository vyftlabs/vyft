import type { Handlers } from "@vyft/core";
import type { VolumeInput } from "@vyft/platform";

export const volumeHandlers: Handlers<VolumeInput, void> = {
  async create({ input }) {
    return { output: { name: input.size ?? "local" } };
  },

  async read() {
    return { name: "local" };
  },

  async update({ input }) {
    return { name: input.size ?? "local" };
  },

  async delete() {},

  async diff() {
    return { action: "none" };
  },
};
