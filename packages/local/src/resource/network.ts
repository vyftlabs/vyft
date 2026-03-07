import type { Handlers } from "@vyft/core";
import type { NetworkInput } from "@vyft/platform";

export const networkHandlers: Handlers<NetworkInput, void> = {
  async create() {
    return { output: { id: "local" } };
  },

  async read() {
    return { id: "local" };
  },

  async update() {
    return { id: "local" };
  },

  async delete() {},

  async diff() {
    return { action: "none" };
  },
};
