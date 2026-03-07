import type { Handlers } from "@vyft/core";
import type { ServerInput } from "@vyft/platform";

export const serverHandlers: Handlers<ServerInput, void> = {
  async create() {
    return { output: { id: "local", host: "localhost", privateKey: "" } };
  },

  async read() {
    return { id: "local", host: "localhost", privateKey: "" };
  },

  async update() {
    return { id: "local", host: "localhost", privateKey: "" };
  },

  async delete() {},

  async diff() {
    return { action: "none" };
  },
};
