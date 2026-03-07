import { defineResource } from "@vyft/provider";

export interface PostgresArgs {
  version?: string;
}

export const postgresResource = defineResource<PostgresArgs>("postgres", {});
