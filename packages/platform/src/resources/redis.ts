import { defineResource } from "@vyft/provider";

export interface RedisArgs {
  version?: string;
}

export const redisResource = defineResource<RedisArgs>("redis", {});
