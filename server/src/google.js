// Google OAuth + Calendar API + Gmail (read-only, opt-in) client (no SDK: plain HTTPS calls, so every request is visible here).
// Enabled only when GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, PUBLIC_URL and TOKEN_ENCRYPTION_KEY are all set.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
// Least privilege: read/write events only (no calendar settings, no other Google data) + the account e-mail.
const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events'];
// Release 4, opt-in per person: read-only Gmail, used only to find replies from people YMT approached.
export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const GMAIL_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages';
const GMAIL_PAGE = 20;
const MIN_KEY_LENGTH = 32;
const ENV_NAMES = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'PUBLIC_URL', 'TOKEN_ENCRYPTION_KEY'];

export class GoogleError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** AES-256-GCM token encryption. The key is derived from TOKEN_ENCRYPTION_KEY (any string of 32+ characters). */
export function createTokenCipher(secret) {
  if (typeof secret !== 'string' || secret.length < MIN_KEY_LENGTH) {
    throw new Error(`TOKEN_ENCRYPTION_KEY must be at least ${MIN_KEY_LENGTH} characters`);
  }
  const key = createHash('sha256').update(secret, 'utf8').digest();
  return {
    encrypt(plain) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
    },
    decrypt(encoded) {
      const raw = Buffer.from(encoded, 'base64');
      const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
      decipher.setAuthTag(raw.subarray(12, 28));
      return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
    },
  };
}

/** Read the four variables; all or none must be set (a half configuration fails fast at start-up). */
export function googleConfigFromEnv(env) {
  const present = ENV_NAMES.filter((name) => env[name]);
  if (present.length === 0) return null;
  if (present.length !== ENV_NAMES.length) {
    const missing = ENV_NAMES.filter((name) => !env[name]);
    throw new Error(`Google Calendar is partly configured. Also set: ${missing.join(', ')}`);
  }
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    publicUrl: env.PUBLIC_URL.replace(/\/+$/, ''),
    encryptionKey: env.TOKEN_ENCRYPTION_KEY,
  };
}

function decodeJwtPayload(token) {
  const [, payload] = token.split('.');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

/**
 * @param {{ clientId: string, clientSecret: string, publicUrl: string, encryptionKey: string }} config
 * @param {typeof fetch} fetchImpl injectable for tests
 */
export function createGoogleClient(config, fetchImpl = fetch) {
  const redirectUri = `${config.publicUrl}/api/google/callback`;

  async function request(url, options, action) {
    const response = await fetchImpl(url, options);
    if (response.status === 204) return null;
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const detail = body && (body.error_description || (body.error && body.error.message) || body.error);
      throw new GoogleError(response.status, `Google ${action} failed (${response.status}): ${detail ?? 'no details'}`);
    }
    return body;
  }

  function tokenRequest(params, action) {
    return request(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...params }).toString(),
    }, action);
  }

  function gmailRequest(accessToken, path, query) {
    return request(`${GMAIL_URL}${path}?${new URLSearchParams(query).toString()}`, { headers: { Authorization: `Bearer ${accessToken}` } }, 'Gmail read');
  }

  function calendarRequest(accessToken, method, path, { query, body } = {}) {
    const url = `${EVENTS_URL}${path}${query ? `?${new URLSearchParams(query).toString()}` : ''}`;
    return request(url, {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }, `Calendar ${method}`);
  }

  return {
    cipher: createTokenCipher(config.encryptionKey),
    publicUrl: config.publicUrl,
    redirectUri,

    /** `gmail: true` also asks for read-only Gmail; Google adds it to the scopes already granted. */
    authorizationUrl(state, { gmail = false } = {}) {
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: [...SCOPES, ...(gmail ? [GMAIL_SCOPE] : [])].join(' '),
        access_type: 'offline', // we need a refresh token to keep working after the first hour
        prompt: 'consent',      // always returns a refresh token, also on reconnect
        include_granted_scopes: 'true',
        state,
      });
      return `${AUTH_URL}?${params.toString()}`;
    },

    /** Exchange the one-time code. The id_token comes straight from Google's token endpoint over TLS. */
    async exchangeCode(code) {
      const tokens = await tokenRequest({ code, redirect_uri: redirectUri, grant_type: 'authorization_code' }, 'sign-in');
      if (!tokens.refresh_token) throw new GoogleError(400, 'Google did not return a refresh token; please try connecting again');
      return {
        email: decodeJwtPayload(tokens.id_token).email,
        scopes: tokens.scope.split(' '),
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      };
    },

    async refreshAccessToken(refreshToken) {
      const tokens = await tokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' }, 'token refresh');
      return { accessToken: tokens.access_token, expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString() };
    },

    revoke(token) {
      return request(`${REVOKE_URL}?${new URLSearchParams({ token }).toString()}`, { method: 'POST' }, 'revoke');
    },

    /** Ids of messages matching a Gmail search (Gmail leaves out `messages` when nothing matches). */
    async searchMessages(accessToken, query) {
      const result = await gmailRequest(accessToken, '', { q: query, maxResults: String(GMAIL_PAGE) });
      return 'messages' in result ? result.messages.map((message) => message.id) : [];
    },

    getMessage(accessToken, id) {
      return gmailRequest(accessToken, `/${encodeURIComponent(id)}`, { format: 'full' });
    },

    listEvents(accessToken, timeMin, timeMax) {
      return calendarRequest(accessToken, 'GET', '', {
        query: { timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '250' },
      });
    },

    insertEvent(accessToken, event, sendUpdates) {
      return calendarRequest(accessToken, 'POST', '', { query: { sendUpdates }, body: event });
    },

    patchEvent(accessToken, eventId, event, sendUpdates) {
      return calendarRequest(accessToken, 'PATCH', `/${encodeURIComponent(eventId)}`, { query: { sendUpdates }, body: event });
    },

    async deleteEvent(accessToken, eventId, sendUpdates) {
      const result = await calendarRequest(accessToken, 'DELETE', `/${encodeURIComponent(eventId)}`, { query: { sendUpdates } })
        .then(() => 'deleted', (error) => {
          // 404/410: already removed in Google (e.g. deleted by hand) – the goal is reached, anything else is a real error.
          if (error instanceof GoogleError && [404, 410].includes(error.status)) return 'already-gone';
          throw error;
        });
      return result;
    },
  };
}
