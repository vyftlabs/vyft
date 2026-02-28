import { defineProviderContext } from "@vyft/provider";

import { createClient } from "./client.ts";

export const context = defineProviderContext({
  name: "hcloud",
  secrets: ["apiToken"],
  setup: ({ secrets }) => ({
    client: createClient(secrets.apiToken),
  }),
});
