import { VyftError } from "@vyft/errors";

export class LockError extends VyftError {}
export class StateCorruptedError extends VyftError {}
export class WALCorruptedError extends VyftError {}
