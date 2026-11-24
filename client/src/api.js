// Thin fetch wrapper for the YMT API. Non-2xx responses become ApiError with the server's message.

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const UNAUTHORIZED_EVENT = 'ymt:unauthorized';

export async function api(method, path, body) {
  const hasBody = body !== undefined;
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: hasBody ? { 'Content-Type': 'application/json' } : {},
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError(response.status, data.error);
  }
  return data;
}

export const get = (path) => api('GET', path);
export const post = (path, body = {}) => api('POST', path, body);
export const patch = (path, body) => api('PATCH', path, body);
export const put = (path, body = {}) => api('PUT', path, body);
export const del = (path) => api('DELETE', path);

/** Build a query string from an object, skipping empty values. */
export function toQuery(params) {
  const entries = Object.entries(params).filter(([, value]) => value !== '' && value !== null && value !== undefined);
  return entries.length === 0 ? '' : `?${new URLSearchParams(entries).toString()}`;
}
