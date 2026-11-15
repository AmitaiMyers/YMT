import { Router } from 'express';
import { parseBody, parseId } from '../validate.js';
import { HttpError } from '../http.js';
import {
  SESSION_COOKIE, createSession, deleteSession, verifyPassword, sessionCookieOptions,
  createLoginLimiter, requireAdmin, createUser, hashPassword, SESSION_USER_SQL,
} from '../auth.js';
import { audit, update } from '../db.js';

const LOGIN_SPEC = {
  username: { type: 'string', required: true, max: 60 },
  password: { type: 'string', required: true, max: 200 },
};

/** Public routes: login / logout. */
export function authPublicRoutes(db) {
  const router = Router();
  const findUser = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1');
  const findSessionUser = db.prepare(SESSION_USER_SQL);

  router.post('/login', createLoginLimiter(), (req, res) => {
    const { username, password } = parseBody(LOGIN_SPEC, req.body);
    const user = findUser.get(username);
    if (!user || !verifyPassword(password, user.password_hash)) {
      throw new HttpError(401, 'Invalid username or password');
    }
    const session = createSession(db, user.id);
    audit(db, user.id, 'auth.login', 'users', user.id);
    res.cookie(SESSION_COOKIE, session.token, sessionCookieOptions());
    res.json({ id: user.id, username: user.username, display_name: user.display_name, role: user.role });
  });

  /** Who is signed in (200 with user: null when nobody is), used by the app on start-up. */
  router.get('/session', (req, res) => {
    const token = req.cookies[SESSION_COOKIE];
    res.json({ user: token ? findSessionUser.get(token, new Date().toISOString()) ?? null : null });
  });

  router.post('/logout', (req, res) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) deleteSession(db, token);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  return router;
}

const USER_CREATE_SPEC = {
  username: { type: 'string', required: true, max: 60 },
  display_name: { type: 'string', required: true, max: 120 },
  password: { type: 'string', required: true, max: 200 },
  role: { type: 'string', required: true, enum: ['admin', 'member'] },
};

const USER_UPDATE_SPEC = {
  display_name: { type: 'string', max: 120 },
  password: { type: 'string', max: 200 },
  role: { type: 'string', enum: ['admin', 'member'] },
  active: { type: 'bool' },
};

/** Authenticated routes: current user + admin user management. */
export function userRoutes(db) {
  const router = Router();

  router.get('/me', (req, res) => res.json(req.user));

  router.get('/users', requireAdmin, (req, res) => {
    res.json(db.prepare('SELECT id, username, display_name, role, active, created_at FROM users ORDER BY id').all());
  });

  router.post('/users', requireAdmin, (req, res) => {
    const id = createUser(db, parseBody(USER_CREATE_SPEC, req.body));
    audit(db, req.user.id, 'user.created', 'users', id);
    res.status(201).json({ id });
  });

  router.patch('/users/:id', requireAdmin, (req, res) => {
    const id = parseId(req.params.id);
    const { password, ...changes } = parseBody(USER_UPDATE_SPEC, req.body, { partial: true });
    if (id === req.user.id && (changes.active === 0 || changes.role === 'member')) {
      throw new HttpError(400, 'You cannot deactivate or demote your own account');
    }
    const values = password ? { ...changes, password_hash: hashPassword(password) } : changes;
    update(db, 'users', id, values);
    if (changes.active === 0 || password) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    audit(db, req.user.id, 'user.updated', 'users', id, Object.keys(values).join(','));
    res.json({ ok: true });
  });

  return router;
}
