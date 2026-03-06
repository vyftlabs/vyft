import { Command } from "commander";
import dev from "./dev.ts";
import down from "./down.ts";
import reset from "./reset.ts";
import up from "./up.ts";

export default new Command("local")
  .description("Local environment commands")
  .addCommand(reset)
  .addCommand(dev)
  .addCommand(up)
  .addCommand(down);
