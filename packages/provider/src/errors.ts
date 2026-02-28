/** Known error codes for resource operations. */
export type ResourceErrorCode =
  | "NOT_FOUND"
  | "CONFLICT"
  | "ALREADY_EXISTS"
  | "INVALID_CONFIG"
  | "PROVIDER_ERROR"
  | "TIMEOUT";

/**
 * Thrown when a provider encounters a resource-level error
 * (e.g. conflict, not found, or a failed operation).
 */
export class VyftResourceError extends Error {
  override readonly name = "VyftResourceError";
  readonly resourceId: string | undefined;
  readonly code: ResourceErrorCode;

  constructor(
    resourceId: string | undefined,
    code: ResourceErrorCode,
    message: string,
  ) {
    super(message);
    this.resourceId = resourceId;
    this.code = code;
  }
}
