// Password hashing (scrypt) and cookie sessions stored in SQLite.

import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpError, forbidden } from './http.js';
import { insert } from './db.js';

export const SESSION_COOKIE = 'ymt_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // one working day
const MIN_PASSWORD_LENGTH = 10;

export function hashPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt') throw new Error('Unsupported password hash scheme');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(expected, actual);
}

export function createUser(db, { username, display_name, password, role }) {
  return insert(db, 'users', { username, display_name, role, password_hash: hashPassword(password) });
}

export function randomToken() {
  return randomBytes(32).toString('base64url');
}

export function createSession(db, userId) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  insert(db, 'sessions', { token, user_id: userId, expires_at: expiresAt });
  return { token, expiresAt };
}

export function deleteSession(db, token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_MS,
    path: '/',
  };
}

export const SESSION_USER_SQL = `
  SELECT u.id, u.username, u.display_name, u.role
  FROM sessions s JOIN users u ON u.id = s.user_id
  WHERE s.token = ? AND s.expires_at > ? AND u.active = 1`;

/** Express middleware: attaches req.user or answers 401. */
export function requireAuth(db) {
  const findSession = db.prepare(SESSION_USER_SQL);
  return (req, res, next) => {
    const token = req.cookies[SESSION_COOKIE];
    const user = token ? findSession.get(token, new Date().toISOString()) : undefined;
    if (!user) throw new HttpError(401, 'Not signed in');
    req.user = user;
    next();
  };
}

export function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') throw forbidden('Admin role required');
  next();
}

/** Tiny in-memory brute-force guard for the login endpoint (per IP). */
export function createLoginLimiter({ maxAttempts = 10, windowMs = 15 * 60 * 1000 } = {}) {
  const attempts = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const entry = attempts.get(req.ip);
    const fresh = !entry || now - entry.start > windowMs;
    const current = fresh ? { start: now, count: 0 } : entry;
    current.count += 1;
    attempts.set(req.ip, current);
    if (current.count > maxAttempts) throw new HttpError(429, 'Too many login attempts, try again later');
    next();
  };
}
