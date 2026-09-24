/** Typed domain error for session operations — surfaced to the UI via ack. */
export class SessionError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SessionError";
    this.code = code;
  }
}

export function isSessionError(error: unknown): error is SessionError {
  return error instanceof SessionError;
}

export function errorMessage(error: unknown): string {
  if (error instanceof SessionError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}
