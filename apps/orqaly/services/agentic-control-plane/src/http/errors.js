export class HttpError extends Error {
  constructor(status, code, details = undefined) {
    super(code);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function notFound(code = 'resource_not_found') {
  return new HttpError(404, code);
}
