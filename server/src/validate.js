// Declarative request-body validation. Every route declares a spec; invalid input fails fast with 400.
//
// Field spec shape: { type, required?, enum?, max?, min? }
//   type: 'string' | 'text' | 'email' | 'url' | 'int' | 'bool' | 'date' | 'datetime' | 'id'
// Output: a clean object ready for SQL (booleans become 0/1, absent optional fields become null).

import { badRequest } from './http.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

const STRING_DEFAULT_MAX = 300;
const TEXT_DEFAULT_MAX = 20000;

function isUrl(value) {
  return URL.canParse(value) && ['http:', 'https:'].includes(new URL(value).protocol);
}

function convertString(name, value, field, defaultMax) {
  if (typeof value !== 'string') throw badRequest(`${name} must be a string`);
  const trimmed = value.trim();
  const max = field.max ?? defaultMax;
  if (trimmed.length > max) throw badRequest(`${name} must be at most ${max} characters`);
  if (field.enum && !field.enum.includes(trimmed)) {
    throw badRequest(`${name} must be one of: ${field.enum.join(', ')}`);
  }
  return trimmed;
}

function convertInt(name, value, field) {
  if (!Number.isInteger(value)) throw badRequest(`${name} must be an integer`);
  if (field.min !== undefined && value < field.min) throw badRequest(`${name} must be >= ${field.min}`);
  if (field.max !== undefined && value > field.max) throw badRequest(`${name} must be <= ${field.max}`);
  return value;
}

function requirePattern(name, value, ok, description) {
  if (!ok) throw badRequest(`${name} must be ${description}`);
  return value;
}

const CONVERTERS = {
  string: (name, value, field) => convertString(name, value, field, STRING_DEFAULT_MAX),
  text: (name, value, field) => convertString(name, value, field, TEXT_DEFAULT_MAX),
  email: (name, value, field) => {
    const text = convertString(name, value, field, STRING_DEFAULT_MAX);
    return requirePattern(name, text, EMAIL_RE.test(text), 'a valid email address');
  },
  url: (name, value, field) => {
    const text = convertString(name, value, field, 2000);
    return requirePattern(name, text, isUrl(text), 'a valid http(s) URL');
  },
  int: (name, value, field) => convertInt(name, value, field),
  id: (name, value) => convertInt(name, value, { min: 1 }),
  bool: (name, value) => {
    if (typeof value !== 'boolean') throw badRequest(`${name} must be true or false`);
    return value ? 1 : 0;
  },
  date: (name, value, field) => {
    const text = convertString(name, value, field, 10);
    return requirePattern(name, text, DATE_RE.test(text), 'a date in YYYY-MM-DD format');
  },
  datetime: (name, value, field) => {
    const text = convertString(name, value, field, 40);
    requirePattern(name, text, DATETIME_RE.test(text) && !Number.isNaN(Date.parse(text)), 'an ISO date-time (YYYY-MM-DDTHH:MM)');
    return new Date(text).toISOString(); // normalize to UTC so string comparison in SQL is chronological
  },
};

function isEmpty(value) {
  return value === undefined || value === null || value === '';
}

/**
 * Validate `body` against `spec`.
 * @param {Record<string, object>} spec
 * @param {unknown} body
 * @param {{ partial?: boolean }} options partial=true for PATCH: only provided keys are validated/returned.
 */
export function parseBody(spec, body, { partial = false } = {}) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw badRequest('Request body must be a JSON object');
  }
  const unknownKeys = Object.keys(body).filter((key) => !(key in spec));
  if (unknownKeys.length > 0) throw badRequest(`Unknown field(s): ${unknownKeys.join(', ')}`);

  const result = {};
  for (const [name, field] of Object.entries(spec)) {
    const provided = name in body;
    if (partial && !provided) continue;

    const value = body[name];
    if (isEmpty(value)) {
      if (field.required) throw badRequest(`${name} is required`);
      result[name] = null;
      continue;
    }
    const convert = CONVERTERS[field.type];
    if (!convert) throw new Error(`Unknown field type "${field.type}" in spec for ${name}`);
    result[name] = convert(name, value, field);
  }
  if (partial && Object.keys(result).length === 0) throw badRequest('No fields to update');
  return result;
}

/** Parse a positive integer route/query parameter. */
export function parseId(value, name = 'id') {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw badRequest(`${name} must be a positive integer`);
  return id;
}

/** Parse an optional integer query-string value (undefined/'' → null). */
export function parseOptionalInt(value, name) {
  if (value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number)) throw badRequest(`${name} must be an integer`);
  return number;
}

/** Parse an optional enum query-string value (undefined/'' → null). */
export function parseOptionalEnum(value, name, allowed) {
  if (value === undefined || value === '') return null;
  if (!allowed.includes(value)) throw badRequest(`${name} must be one of: ${allowed.join(', ')}`);
  return value;
}
