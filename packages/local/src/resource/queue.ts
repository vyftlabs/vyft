import type { Handlers } from "@vyft/core";
import type { QueueInput } from "@vyft/platform";

export const queueHandlers: Handlers<QueueInput, void> = {
  async create() {
    return { output: { name: "local", url: "memory://local" } };
  },

  async read() {
    return { name: "local", url: "memory://local" };
  },

  async update() {
    return { name: "local", url: "memory://local" };
  },

  async delete() {},

  async diff() {
    return { action: "none" };
  },
};
