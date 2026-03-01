import { defineProvider } from "@vyft/provider";

import { context } from "./context.ts";
import { file } from "./resources/file.ts";
import { glob } from "./resources/glob.ts";
import { template } from "./resources/template.ts";

export default defineProvider({
  context,
  resources: [file, template, glob],
});
