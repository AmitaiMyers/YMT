// HTTP error type and Express error handler. Route code throws; this middleware answers.

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const badRequest = (message) => new HttpError(400, message);
export const notFound = (message) => new HttpError(404, message);
export const forbidden = (message) => new HttpError(403, message);
export const conflict = (message) => new HttpError(409, message);

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  // Domain errors outside the HTTP layer (AI budget/config, unusable AI answer) declare their own status.
  if (Number.isInteger(err.httpStatus)) {
    res.status(err.httpStatus).json({ error: err.message });
    return;
  }
  if (err.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Malformed JSON body' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}
