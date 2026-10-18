export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export const badRequest = (m: string, code?: string) => new HttpError(400, m, code);
export const forbidden = (m = "Forbidden", code?: string) => new HttpError(403, m, code);
export const notFound = (m = "Not found") => new HttpError(404, m);
export const conflict = (m: string, code?: string) => new HttpError(409, m, code);
