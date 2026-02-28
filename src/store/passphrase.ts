import { createInterface } from "node:readline";

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Resolve the passphrase for the current session.
 *
 * 1. Returns `VYFT_PASSPHRASE` env var if set.
 * 2. Otherwise prompts the user interactively.
 *
 * The passphrase is never persisted to disk.
 */
export async function resolvePassphrase(): Promise<string> {
  const env = process.env["VYFT_PASSPHRASE"];
  if (env) return env;

  const input = await prompt("Enter passphrase: ");
  if (!input) {
    throw new Error(
      "Passphrase is required. Set VYFT_PASSPHRASE or enter it when prompted.",
    );
  }
  return input;
}
