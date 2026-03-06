import { createProvider } from "@vyft/provider";
import { createContext } from "./context.ts";
import { glob } from "./glob.ts";

export default createProvider({
  context: createContext,
  resources: { glob },
});
