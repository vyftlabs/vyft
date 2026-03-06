import { initProvider } from "@vyft/provider";
import type { Context } from "./context";

export const t = initProvider.context<Context>().create();

// middleware support
t.resource.use((opts) => {
  opts.ctx;

  return opts.next();
});
