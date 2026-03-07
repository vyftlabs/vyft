import { log } from "@clack/prompts";

export function cancel(msg = "Cancelled."): never {
  log.warn(msg);
  process.exit(0);
}
