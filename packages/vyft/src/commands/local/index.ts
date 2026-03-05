import { Command } from "commander";
import { dev } from "./dev.ts";
import { down } from "./down.ts";
import { reset } from "./reset.ts";
import { up } from "./up.ts";

export const local = new Command("local").description(
  "Local environment commands",
);

local.addCommand(reset);
local.addCommand(dev);
local.addCommand(up);
local.addCommand(down);
