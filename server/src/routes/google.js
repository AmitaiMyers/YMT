// Google Calendar connection: connect (OAuth), callback, status, disconnect.

import { Router } from 'express';
import { insert, audit, nowIso } from '../db.js';
import { randomToken } from '../auth.js';
import { badRequest } from '../http.js';
import { googleAccount, saveGoogleAccount } from '../calendarSync.js';
import { GoogleError } from '../google.js';

const STATE_TTL_MS = 10 * 60_000;

/** Signed-in routes. */
export function googleRoutes(db, { google }) {
  const router = Router();

  router.get('/google/status', (req, res) => {
    const account = google ? googleAccount(db, req.user.id) : null;
    res.json({ configured: Boolean(google), connected: Boolean(account), email: account ? account.google_email : null });
  });

  /** Top-level navigation from the app: same-site, so the session cookie is present here. */
  router.get('/google/connect', (req, res) => {
    if (!google) throw badRequest('Google Calendar is not set up on this server');
    db.prepare('DELETE FROM oauth_states WHERE expires_at < ?').run(nowIso());
    const state = randomToken();
    insert(db, 'oauth_states', { state, user_id: req.user.id, expires_at: new Date(Date.now() + STATE_TTL_MS).toISOString() });
    res.redirect(google.authorizationUrl(state));
  });

  router.post('/google/disconnect', async (req, res) => {
    if (!google) throw badRequest('Google Calendar is not set up on this server');
    const account = googleAccount(db, req.user.id);
    if (!account) {
      res.json({ ok: true, revoke_error: null });
      return;
    }
    // Revoke at Google first; the local tokens are deleted either way, and a failed revoke is reported.
    const revokeError = await google.revoke(google.cipher.decrypt(account.refresh_token_enc)).then(
      () => null,
      (error) => {
        if (error instanceof GoogleError) return error.message;
        throw error;
      },
    );
    db.prepare('DELETE FROM google_accounts WHERE user_id = ?').run(req.user.id);
    audit(db, req.user.id, 'google.disconnected', 'users', req.user.id, revokeError);
    res.json({ ok: true, revoke_error: revokeError });
  });

  return router;
}

/**
 * Public callback: Google redirects the browser here cross-site, so the SameSite=Strict session cookie is
 * NOT sent. The user is identified by the one-time, 10-minute `state` created in /google/connect.
 */
export function googleCallbackRoutes(db, { google }) {
  const router = Router();
  const back = (res, outcome, reason) => res.redirect(`/calendar?google=${outcome}${reason ? `&reason=${encodeURIComponent(reason)}` : ''}`);

  router.get('/google/callback', async (req, res) => {
    if (!google) throw badRequest('Google Calendar is not set up on this server');
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const pending = db.prepare('SELECT * FROM oauth_states WHERE state = ?').get(state);
    db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state); // one-time use
    if (!pending || Date.parse(pending.expires_at) < Date.now()) {
      back(res, 'error', 'The connection link expired. Please try again.');
      return;
    }
    if (req.query.error) {
      back(res, 'denied', null);
      return;
    }
    if (typeof req.query.code !== 'string') {
      back(res, 'error', 'Google did not return an authorization code');
      return;
    }
    const outcome = await google.exchangeCode(req.query.code).then(
      (tokens) => ({ tokens }),
      (error) => {
        if (error instanceof GoogleError) return { error: error.message };
        throw error;
      },
    );
    if (outcome.error) {
      back(res, 'error', outcome.error);
      return;
    }
    saveGoogleAccount(db, google, pending.user_id, outcome.tokens);
    audit(db, pending.user_id, 'google.connected', 'users', pending.user_id, outcome.tokens.email);
    back(res, 'connected', null);
  });

  return router;
}
