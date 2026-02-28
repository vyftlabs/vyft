/** Docker secret operations — no-op. Secrets are injected as env vars by the CLI. */
export function createSecret(): void {
  // No-op: secrets are resolved in the CLI and passed as container env vars.
}

export function removeSecret(): void {
  // No-op
}
