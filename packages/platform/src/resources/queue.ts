import { defineResource } from "@vyft/provider";

export interface QueueArgs {
  durable?: boolean;
}

export const queueResource = defineResource<QueueArgs>("queue", {});
