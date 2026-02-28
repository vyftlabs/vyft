export { decrypt, encrypt } from "./encrypt.ts";

export { createFileStore, LockError } from "./file.ts";
export { resolvePassphrase } from "./passphrase.ts";
export type {
  EncryptedPayload,
  PersistedState,
  ResourceState,
  Store,
  WALEntry,
} from "./types.ts";
