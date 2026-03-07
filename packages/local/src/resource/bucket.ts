import type { Handlers } from "@vyft/core";
import type { BucketInput } from "@vyft/platform";

export const bucketHandlers: Handlers<BucketInput, void> = {
  async create({ input }) {
    return {
      output: {
        name: "local",
        url: `file://.vyft/buckets/${input.acl ?? "private"}`,
      },
    };
  },

  async read() {
    return { name: "local", url: "file://.vyft/buckets" };
  },

  async update({ input }) {
    return {
      name: "local",
      url: `file://.vyft/buckets/${input.acl ?? "private"}`,
    };
  },

  async delete() {},

  async diff() {
    return { action: "none" };
  },
};
