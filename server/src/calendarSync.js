// Keeps YMT meetings and each organizer's Google Calendar in step.
// Invitations to outside people are sent ONLY when the caller passes invite=true, which the API accepts
// only after the staff member confirmed it in the app (human-in-the-loop).

import { insert, update, findById, nowIso, audit } from './db.js';
import { badRequest } from './http.js';
import { GoogleError } from './google.js';

const REFRESH_MARGIN_MS = 60_000;

export function googleAccount(db, userId) {
  return db.prepare('SELECT * FROM google_accounts WHERE user_id = ?').get(userId);
}

export function saveGoogleAccount(db, google, userId, { email, accessToken, refreshToken, expiresAt }) {
  db.prepare('DELETE FROM google_accounts WHERE user_id = ?').run(userId);
  insert(db, 'google_accounts', {
    user_id: userId,
    google_email: email,
    refresh_token_enc: google.cipher.encrypt(refreshToken),
    access_token_enc: google.cipher.encrypt(accessToken),
    access_expires_at: expiresAt,
  });
}

/** A valid access token for this user, refreshing it when needed. A revoked grant disconnects the account. */
export async function accessTokenFor(db, google, userId) {
  const account = googleAccount(db, userId);
  // A GoogleError (not an HTTP error): callers report it next to the saved YMT change instead of failing it.
  if (!account) throw new GoogleError(409, 'Google Calendar is not connected for this person (organizer). Connect it on the Calendar page.');
  if (account.access_token_enc && Date.parse(account.access_expires_at) - REFRESH_MARGIN_MS > Date.now()) {
    return google.cipher.decrypt(account.access_token_enc);
  }
  const refreshed = await google.refreshAccessToken(google.cipher.decrypt(account.refresh_token_enc)).catch((error) => {
    if (error instanceof GoogleError && error.status === 400) {
      // invalid_grant: the user removed YMT's access in their Google account. Reflect that truthfully.
      db.prepare('DELETE FROM google_accounts WHERE user_id = ?').run(userId);
      throw new GoogleError(401, 'Google access was removed. Connect Google Calendar again in the Calendar page.');
    }
    throw error;
  });
  db.prepare('UPDATE google_accounts SET access_token_enc = ?, access_expires_at = ? WHERE user_id = ?')
    .run(google.cipher.encrypt(refreshed.accessToken), refreshed.expiresAt, userId);
  return refreshed.accessToken;
}

function endOf(meeting) {
  return new Date(Date.parse(meeting.scheduled_at) + meeting.duration_minutes * 60_000).toISOString();
}

/**
 * Google event body. Deliberately minimal: title, time, place, the organisation name and a link back to YMT.
 * Notes, decisions and contacts' details stay in YMT.
 */
function eventBody(db, google, meeting, { attendeeEmail }) {
  const company = meeting.company_id ? findById(db, 'companies', meeting.company_id) : null;
  const contact = meeting.contact_id ? findById(db, 'contacts', meeting.contact_id) : null;
  const description = [
    'YMT Group meeting',
    company ? `Organisation: ${company.name}` : null,
    contact ? `With: ${contact.full_name}` : null,
    `Open in YMT: ${google.publicUrl}/meetings/${meeting.id}/prep`,
  ].filter(Boolean).join('\n');
  return {
    summary: meeting.title,
    location: meeting.location ?? undefined,
    description,
    start: { dateTime: meeting.scheduled_at },
    end: { dateTime: endOf(meeting) },
    ...(attendeeEmail ? { attendees: [{ email: attendeeEmail, displayName: contact ? contact.full_name : undefined }] } : {}),
    extendedProperties: { private: { ymtMeetingId: String(meeting.id) } },
  };
}

/** Validate an invite request BEFORE anything is created, so a bad request never half-succeeds. */
export function assertInvitePossible(db, { addToGoogle, sendInvite, contactEmail, userId, googleEnabled }) {
  if (!addToGoogle && !sendInvite) return;
  if (!googleEnabled) throw badRequest('Google Calendar is not set up on this server');
  if (!googleAccount(db, userId)) throw badRequest('Connect your Google Calendar first (Calendar page)');
  if (sendInvite && !addToGoogle) throw badRequest('send_invite requires add_to_google');
  if (sendInvite && !contactEmail) throw badRequest('The person has no e-mail address, so no invitation can be sent');
}

/** Create the Google event for a new meeting. Returns the updated meeting fields. */
export async function pushNewMeeting(db, google, meetingId, userId, { inviteEmail }) {
  const meeting = findById(db, 'meetings', meetingId);
  const token = await accessTokenFor(db, google, userId);
  const event = await google.insertEvent(token, eventBody(db, google, meeting, { attendeeEmail: inviteEmail }), inviteEmail ? 'all' : 'none');
  const fields = { google_event_id: event.id, google_owner_id: userId, google_event_link: event.htmlLink ?? null };
  if (inviteEmail) Object.assign(fields, { invite_sent_to: inviteEmail, invite_sent_at: nowIso() });
  update(db, 'meetings', meetingId, fields);
  if (inviteEmail) audit(db, userId, 'meeting.invite_sent', 'meetings', meetingId, inviteEmail);
  return fields;
}

/** Mirror a change (time/title/place) or a cancellation to the organizer's calendar. */
export async function pushMeetingChange(db, google, meetingId, actingUserId) {
  const meeting = findById(db, 'meetings', meetingId);
  if (!meeting.google_event_id) return null;
  const token = await accessTokenFor(db, google, meeting.google_owner_id);
  // Anyone already invited is told about the change by Google; nobody new is invited here.
  const sendUpdates = meeting.invite_sent_to ? 'all' : 'none';
  if (meeting.status === 'cancelled') {
    await google.deleteEvent(token, meeting.google_event_id, sendUpdates);
    update(db, 'meetings', meetingId, { google_event_id: null, google_event_link: null });
    audit(db, actingUserId, 'meeting.google_deleted', 'meetings', meetingId, sendUpdates === 'all' ? meeting.invite_sent_to : null);
    return { google_event_id: null };
  }
  const body = eventBody(db, google, meeting, { attendeeEmail: meeting.invite_sent_to });
  await google.patchEvent(token, meeting.google_event_id, body, sendUpdates);
  return { google_event_id: meeting.google_event_id };
}

/** The current user's Google events in a range, without the ones YMT created (those are shown as YMT meetings). */
export async function googleEventsFor(db, google, userId, from, to) {
  const token = await accessTokenFor(db, google, userId);
  const result = await google.listEvents(token, from, to);
  return result.items
    .filter((event) => event.status !== 'cancelled')
    .filter((event) => !(event.extendedProperties && event.extendedProperties.private && event.extendedProperties.private.ymtMeetingId))
    .map((event) => ({
      id: event.id,
      title: event.summary ?? '(no title)',
      start: event.start.dateTime ?? event.start.date,
      end: event.end.dateTime ?? event.end.date,
      all_day: Boolean(event.start.date),
      location: event.location ?? null,
      link: event.htmlLink ?? null,
    }));
}

/** Run a Google step after the YMT change is saved; a failure is returned as a message, never hidden. */
export async function tryGoogle(step) {
  return step().then(
    (value) => ({ ok: true, value }),
    (error) => {
      if (error instanceof GoogleError) return { ok: false, message: error.message };
      throw error; // programming errors still crash loudly
    },
  );
}
