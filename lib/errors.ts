// Centralized error taxonomy — single source of truth for API error codes
// Maps domain errors → HTTP status + stable code + user message
// Best practice: never throw raw strings, always typed errors.

export type ErrorCode =
  | "BAD_REQUEST"
  | "PARENT_NOT_FOUND"
  | "STUDENT_NOT_FOUND"
  | "CLASS_NOT_FOUND"
  | "BOOKING_NOT_FOUND"
  | "FORBIDDEN"
  | "DUPLICATE_BOOKING"
  | "CLASS_FULL"
  | "INVALID_STATUS"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 400,
  FORBIDDEN: 403,
  PARENT_NOT_FOUND: 404,
  STUDENT_NOT_FOUND: 404,
  CLASS_NOT_FOUND: 404,
  BOOKING_NOT_FOUND: 404,
  DUPLICATE_BOOKING: 409,
  CLASS_FULL: 409,
  INVALID_STATUS: 409,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

export function toErrorResponse(err: unknown): { error: string; code: ErrorCode; details?: unknown; status: number } {
  if (err instanceof AppError) {
    return { error: err.message, code: err.code, details: err.details, status: err.status };
  }
  // Zod validation
  if (err && typeof err === "object" && "issues" in (err as Record<string, unknown>)) {
    return { error: "Validation failed", code: "VALIDATION_ERROR", details: err, status: 400 };
  }
  return { error: err instanceof Error ? err.message : "Internal error", code: "INTERNAL_ERROR", status: 500 };
}
