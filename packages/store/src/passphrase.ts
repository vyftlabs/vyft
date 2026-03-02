const DEFAULT_PASSPHRASE = "vyft-local-dev";

/**
 * Resolve the passphrase for the current session.
 *
 * 1. Returns `VYFT_PASSPHRASE` env var if set.
 * 2. Falls back to a built-in default for local development.
 *
 * The passphrase is never persisted to disk.
 */
export async function resolvePassphrase(): Promise<string> {
  return process.env["VYFT_PASSPHRASE"] ?? DEFAULT_PASSPHRASE;
}
