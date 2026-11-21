// Person-first meetings, calendar feed and Google Calendar sync (against an in-process fake of Google's APIs).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db.js';
import { createApp } from '../src/app.js';
import { createUser } from '../src/auth.js';
import { createGoogleClient } from '../src/google.js';

/** Minimal fake of accounts.google.com / oauth2.googleapis.com / Calendar v3. Records every call. */
function createFakeGoogle() {
  const fake = { calls: [], events: new Map(), failNextInsert: false, accessTokenTtl: 3600, nextId: 1 };
  const json = (status, body) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const idToken = `x.${Buffer.from(JSON.stringify({ email: 'founder@ymt.example' })).toString('base64url')}.y`;
  fake.fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    const body = options.body && options.headers && options.headers['Content-Type'] === 'application/json' ? JSON.parse(options.body) : options.body;
    fake.calls.push({ method: options.method ?? 'GET', path: parsed.pathname, query: Object.fromEntries(parsed.searchParams), body, auth: options.headers && options.headers.Authorization });
    if (parsed.hostname === 'oauth2.googleapis.com' && parsed.pathname === '/token') {
      const form = new URLSearchParams(options.body);
      if (form.get('grant_type') === 'authorization_code') {
        return json(200, { access_token: 'access-1', refresh_token: 'refresh-1', expires_in: fake.accessTokenTtl, id_token: idToken, scope: 'openid email https://www.googleapis.com/auth/calendar.events' });
      }
      return json(200, { access_token: 'access-2', expires_in: 3600 });
    }
    if (parsed.pathname === '/revoke') return json(200, {});
    const eventsPath = '/calendar/v3/calendars/primary/events';
    if (parsed.pathname === eventsPath && options.method === 'POST') {
      if (fake.failNextInsert) {
        fake.failNextInsert = false;
        return json(500, { error: { message: 'Backend Error' } });
      }
      const id = `evt${fake.nextId++}`;
      fake.events.set(id, { ...body, id, htmlLink: `https://calendar.google.com/event?eid=${id}` });
      return json(200, fake.events.get(id));
    }
    if (parsed.pathname === eventsPath) {
      return json(200, { items: [...fake.events.values(), {
        id: 'personal', summary: 'Dentist', start: { dateTime: '2030-03-04T08:00:00Z' }, end: { dateTime: '2030-03-04T09:00:00Z' },
      }] });
    }
    const id = decodeURIComponent(parsed.pathname.slice(eventsPath.length + 1));
    if (options.method === 'PATCH') {
      fake.events.set(id, { ...fake.events.get(id), ...body });
      return json(200, fake.events.get(id));
    }
    if (options.method === 'DELETE') {
      fake.events.delete(id);
      return new Response(null, { status: 204 });
    }
    throw new Error(`Fake Google: unexpected ${options.method} ${url}`);
  };
  return fake;
}

async function startApp({ withGoogle }) {
  const db = openDatabase(':memory:');
  createUser(db, { username: 'boss', display_name: 'Boss', password: 'correct-horse', role: 'admin' });
  const fake = createFakeGoogle();
  const google = withGoogle
    ? createGoogleClient({ clientId: 'client-123', clientSecret: 'secret', publicUrl: 'https://ymt.example', encryptionKey: 'k'.repeat(40) }, fake.fetch)
    : null;
  const server = createApp(db, { dbPath: ':memory:', hostingLocation: 'test', google }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'boss', password: 'correct-horse' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  async function call(method, path, body, { redirect = 'follow', auth = true } = {}) {
    const response = await fetch(`${base}${path}`, {
      method, redirect,
      headers: { 'Content-Type': 'application/json', ...(auth ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, data: text && response.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text, headers: response.headers };
  }
  const stop = () => {
    server.closeAllConnections();
    server.close();
  };
  return { db, call, fake, stop };
}

const SLOT = '2030-03-04T10:00:00.000Z';

// ---------------------------------------------------------------------------------- person-first, no Google
let plain;
before(async () => { plain = await startApp({ withGoogle: false }); });
after(() => plain.stop());

test('a meeting can be scheduled with a new person and no company', async () => {
  const created = await plain.call('POST', '/meetings', {
    title: 'Intro call', scheduled_at: SLOT, duration_minutes: 30, new_contact: { full_name: 'Ravi Kumar', email: 'ravi@example.in' },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.company_id, null);
  assert.equal(created.data.google.status, 'skipped');
  const feed = await plain.call('GET', `/calendar/events?from=2030-03-01T00:00:00Z&to=2030-03-08T00:00:00Z`);
  const meeting = feed.data.meetings.find((m) => m.id === created.data.id);
  assert.equal(meeting.contact_name, 'Ravi Kumar');
  assert.equal(meeting.company_name, null);
  assert.equal(meeting.duration_minutes, 30);
  assert.deepEqual(feed.data.google_events, []);
  const prep = await plain.call('GET', `/meetings/${created.data.id}/prep`);
  assert.equal(prep.status, 200);
  assert.equal(prep.data.person.full_name, 'Ravi Kumar');
  assert.equal(prep.data.company, null);
});

test('a typed organization is created once and then reused (case-insensitive)', async () => {
  const first = await plain.call('POST', '/meetings', { title: 'A', scheduled_at: SLOT, organization: 'Pune Castings', new_contact: { full_name: 'Asha' } });
  const second = await plain.call('POST', '/meetings', { title: 'B', scheduled_at: SLOT, organization: 'pune castings', new_contact: { full_name: 'Vik' } });
  assert.ok(first.data.company_id);
  assert.equal(second.data.company_id, first.data.company_id);
  const people = await plain.call('GET', '/contacts?q=pune');
  assert.deepEqual(people.data.map((p) => p.full_name).sort(), ['Asha', 'Vik']);
});

test('an existing person without a company is linked when an organization is given', async () => {
  const lonely = await plain.call('POST', '/meetings', { title: 'C', scheduled_at: SLOT, new_contact: { full_name: 'Noa Lev' } });
  const linked = await plain.call('POST', '/meetings', { title: 'D', scheduled_at: SLOT, contact_id: lonely.data.contact_id, organization: 'Lev Industries' });
  assert.equal(linked.status, 201);
  const person = (await plain.call('GET', '/contacts?q=Noa')).data[0];
  assert.equal(person.company_name, 'Lev Industries');
  // ...and a later meeting with that person picks the company up automatically
  const later = await plain.call('POST', '/meetings', { title: 'E', scheduled_at: SLOT, contact_id: person.id });
  assert.equal(later.data.company_id, linked.data.company_id);
  // a different organization for a person who already has one is rejected
  const clash = await plain.call('POST', '/meetings', { title: 'F', scheduled_at: SLOT, contact_id: person.id, organization: 'Other Ltd' });
  assert.equal(clash.status, 400);
});

test('a meeting needs a person or an organization', async () => {
  const response = await plain.call('POST', '/meetings', { title: 'Nobody', scheduled_at: SLOT });
  assert.equal(response.status, 400);
  assert.match(response.data.error, /person or an organization/);
});

test('a meeting without a company can be summarised; its follow-up waits for approval', async () => {
  const created = await plain.call('POST', '/meetings', { title: 'Coffee', scheduled_at: '2020-01-01T08:00:00Z', new_contact: { full_name: 'Maya', email: 'maya@example.com' } });
  const withDocument = await plain.call('POST', `/meetings/${created.data.id}/complete`, { summary: 'Good', language: 'en', create_summary_document: true });
  assert.equal(withDocument.status, 400, 'a summary document needs a company');
  const done = await plain.call('POST', `/meetings/${created.data.id}/complete`, {
    summary: 'Good talk', decisions: 'Send deck', language: 'en', followup_contact_id: created.data.contact_id,
    tasks: [{ description: 'Send deck', assignee: 'YMT' }],
  });
  assert.equal(done.status, 200);
  const approval = await plain.call('GET', `/approvals/${done.data.approval_id}`);
  assert.equal(approval.data.status, 'pending');
  assert.equal(approval.data.company_name, null);
  assert.equal(approval.data.recipient_email, 'maya@example.com');
  const inbox = await plain.call('GET', '/inbox');
  assert.ok(inbox.data.approvals.some((a) => a.id === done.data.approval_id), 'company-less drafts still reach the inbox');
});

test('Google options are refused when Google is not set up', async () => {
  const status = await plain.call('GET', '/google/status');
  assert.deepEqual(status.data, { configured: false, connected: false, email: null, gmail_read: false, gmail_checked_at: null, gmail_error: null });
  const response = await plain.call('POST', '/meetings', { title: 'G', scheduled_at: SLOT, new_contact: { full_name: 'X' }, add_to_google: true });
  assert.equal(response.status, 400);
});

test('the calendar feed rejects ranges that are too long or reversed', async () => {
  assert.equal((await plain.call('GET', '/calendar/events?from=2030-01-01T00:00:00Z&to=2030-06-01T00:00:00Z')).status, 400);
  assert.equal((await plain.call('GET', '/calendar/events?from=2030-02-01T00:00:00Z&to=2030-01-01T00:00:00Z')).status, 400);
});

// ---------------------------------------------------------------------------------- with (fake) Google
test('Google Calendar: connect, sync, invite only on request, reschedule, cancel, disconnect', async (t) => {
  const app = await startApp({ withGoogle: true });
  t.after(app.stop);
  const { call, fake, db } = app;

  // connect → redirect to Google with our client id and a one-time state
  const connect = await call('GET', '/google/connect', undefined, { redirect: 'manual' });
  assert.equal(connect.status, 302);
  const consent = new URL(connect.headers.get('location'));
  assert.equal(consent.hostname, 'accounts.google.com');
  assert.equal(consent.searchParams.get('client_id'), 'client-123');
  assert.equal(consent.searchParams.get('redirect_uri'), 'https://ymt.example/api/google/callback');
  assert.match(consent.searchParams.get('scope'), /calendar\.events/);
  const state = consent.searchParams.get('state');

  // an unknown state is refused; the real one works once, without the session cookie (cross-site redirect)
  const forged = await call('GET', '/google/callback?state=forged&code=abc', undefined, { redirect: 'manual', auth: false });
  assert.match(forged.headers.get('location'), /google=error/);
  const callback = await call('GET', `/google/callback?state=${state}&code=abc`, undefined, { redirect: 'manual', auth: false });
  assert.equal(callback.headers.get('location'), '/calendar?google=connected');
  const replay = await call('GET', `/google/callback?state=${state}&code=abc`, undefined, { redirect: 'manual', auth: false });
  assert.match(replay.headers.get('location'), /google=error/, 'state is single-use');
  assert.deepEqual((await call('GET', '/google/status')).data, { configured: true, connected: true, email: 'founder@ymt.example', gmail_read: false, gmail_checked_at: null, gmail_error: null });
  const stored = db.prepare('SELECT refresh_token_enc, access_token_enc FROM google_accounts').get();
  assert.ok(!stored.refresh_token_enc.includes('refresh-1') && !stored.access_token_enc.includes('access-1'), 'tokens are encrypted at rest');

  // add to my calendar, no invitation → sendUpdates=none and no attendees
  const own = await call('POST', '/meetings', { title: 'Prep call', scheduled_at: SLOT, new_contact: { full_name: 'Dana', email: 'dana@example.com' }, add_to_google: true });
  assert.equal(own.data.google.status, 'added');
  const insertCall = fake.calls.find((c) => c.method === 'POST' && c.path.endsWith('/events'));
  assert.equal(insertCall.query.sendUpdates, 'none');
  assert.equal(insertCall.body.attendees, undefined);
  assert.equal(insertCall.body.extendedProperties.private.ymtMeetingId, String(own.data.id));
  assert.equal(insertCall.auth, 'Bearer access-1');

  // invitation only when explicitly requested
  const invited = await call('POST', '/meetings', {
    title: 'Partner meeting', scheduled_at: SLOT, new_contact: { full_name: 'Ravi', email: 'ravi@example.in' }, add_to_google: true, send_invite: true,
  });
  assert.equal(invited.data.google.status, 'invited');
  const inviteCall = fake.calls.filter((c) => c.method === 'POST' && c.path.endsWith('/events')).at(-1);
  assert.equal(inviteCall.query.sendUpdates, 'all');
  assert.deepEqual(inviteCall.body.attendees.map((a) => a.email), ['ravi@example.in']);
  assert.ok(db.prepare("SELECT 1 FROM audit_log WHERE action = 'meeting.invite_sent' AND detail = 'ravi@example.in'").get());

  // an impossible invitation (no e-mail) is refused before anything is saved
  const meetingsBefore = db.prepare('SELECT COUNT(*) AS n FROM meetings').get().n;
  const noEmail = await call('POST', '/meetings', { title: 'X', scheduled_at: SLOT, new_contact: { full_name: 'No Mail' }, add_to_google: true, send_invite: true });
  assert.equal(noEmail.status, 400);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM meetings').get().n, meetingsBefore);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM contacts WHERE full_name = 'No Mail'").get().n, 0, 'nothing half-created');

  // the feed shows personal Google events, but not the copies YMT created
  const feed = await call('GET', '/calendar/events?from=2030-03-01T00:00:00Z&to=2030-03-08T00:00:00Z');
  assert.deepEqual(feed.data.google_events.map((e) => e.title), ['Dentist']);
  assert.equal(feed.data.google_error, null);

  // reschedule: invited people are told (all); own-only events stay silent (none)
  await call('PATCH', `/meetings/${invited.data.id}`, { scheduled_at: '2030-03-05T10:00:00Z' });
  await call('PATCH', `/meetings/${own.data.id}`, { title: 'Prep call (moved)' });
  const patches = fake.calls.filter((c) => c.method === 'PATCH');
  assert.equal(patches[0].query.sendUpdates, 'all');
  assert.equal(patches[0].body.start.dateTime, '2030-03-05T10:00:00.000Z');
  assert.equal(patches[1].query.sendUpdates, 'none');

  // cancel removes the Google event
  await call('PATCH', `/meetings/${own.data.id}`, { status: 'cancelled' });
  assert.equal(fake.calls.at(-1).method, 'DELETE');
  assert.equal(db.prepare('SELECT google_event_id FROM meetings WHERE id = ?').get(own.data.id).google_event_id, null);

  // a Google outage never loses the YMT meeting, and is reported, not hidden
  fake.failNextInsert = true;
  const outage = await call('POST', '/meetings', { title: 'During outage', scheduled_at: SLOT, new_contact: { full_name: 'Z' }, add_to_google: true });
  assert.equal(outage.status, 201);
  assert.equal(outage.data.google.status, 'failed');
  assert.match(outage.data.google.message, /Backend Error/);

  // expired access token → refreshed automatically
  db.prepare("UPDATE google_accounts SET access_expires_at = '2000-01-01T00:00:00Z'").run();
  await call('GET', '/calendar/events?from=2030-03-01T00:00:00Z&to=2030-03-08T00:00:00Z');
  assert.ok(fake.calls.some((c) => c.path === '/token' && new URLSearchParams(c.body).get('grant_type') === 'refresh_token'));
  assert.equal(fake.calls.at(-1).auth, 'Bearer access-2');

  // disconnect revokes at Google and forgets the tokens
  const disconnected = await call('POST', '/google/disconnect', {});
  assert.equal(disconnected.data.revoke_error, null);
  assert.equal(fake.calls.at(-1).path, '/revoke');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM google_accounts').get().n, 0);
});
