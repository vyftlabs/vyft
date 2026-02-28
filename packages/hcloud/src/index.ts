import { Platform } from "@vyft/platform";
import { defineModule, defineProvider } from "@vyft/provider";

import { context } from "./context.ts";
import { network } from "./platform/network.ts";
import { server } from "./platform/server.ts";

const platform = defineModule(Platform, { network, server });

export default defineProvider({
  context,
  modules: [platform],
});
