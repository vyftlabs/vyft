export class VyftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ValidationError extends VyftError {}
export class TimeoutError extends VyftError {}
export class NotFoundError extends VyftError {}

export function isVyftError(e: unknown): e is VyftError {
  return e instanceof VyftError;
}

export function isValidationError(e: unknown): e is ValidationError {
  return e instanceof ValidationError;
}

export function isTimeoutError(e: unknown): e is TimeoutError {
  return e instanceof TimeoutError;
}

export function isNotFoundError(e: unknown): e is NotFoundError {
  return e instanceof NotFoundError;
}
