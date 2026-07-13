// src/http/errors.ts — typed HTTP errors. Throw these from services/routes and
// the central error handler turns them into { error: message } with the right
// status. Anything else becomes a 500.

export class AppError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
  }
}

export const badRequest = (message: string) => new AppError(400, message);
export const unauthorized = (message = 'Authentication required') => new AppError(401, message);
export const forbidden = (message = 'Forbidden') => new AppError(403, message);
export const notFound = (message = 'Not found') => new AppError(404, message);
export const conflict = (message: string) => new AppError(409, message);
