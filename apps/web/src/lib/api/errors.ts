import type { ErrorBody } from "@vyft/spec";

export class ApiError extends Error {
  code: ErrorBody["code"];

  constructor(code: ErrorBody["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "ApiError";
  }
}

export const notFound = (msg: string) => new ApiError("NOT_FOUND", msg);
export const conflict = (msg: string) => new ApiError("CONFLICT", msg);
export const badRequest = (msg: string) => new ApiError("BAD_REQUEST", msg);
