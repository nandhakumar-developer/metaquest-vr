import type { ApiErrorBody } from '@vrcc/shared-types';

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  toBody(): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details === undefined ? {} : { details: this.details }),
      },
    };
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Authentication required') =>
  new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'Not permitted') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Not found') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (message: string, details?: unknown) =>
  new AppError(409, 'CONFLICT', message, details);
export const payloadTooLarge = (message = 'Payload too large') =>
  new AppError(413, 'PAYLOAD_TOO_LARGE', message);
export const tooManyRequests = (message = 'Too many attempts') =>
  new AppError(429, 'RATE_LIMITED', message);
export const unavailable = (message: string) => new AppError(503, 'UNAVAILABLE', message);
export const notImplemented = (message: string) => new AppError(501, 'NOT_IMPLEMENTED', message);
