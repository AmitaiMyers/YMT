// Release 4: find replies in the owner's Gmail (read-only, opt-in). Data minimisation: the only searches are
// "from:<address> after:<first message date>" for addresses YMT emailed a first approach or follow-up to, and only
// messages from exactly that address are stored. Nothing is ever sent or changed in Gmail.

import { nowIso } from './db.js';
import { conflict } from './http.js';
import { accessTokenFor, googleAccount } from './calendarSync.js';
import { GoogleError } from './google.js';
import { saveReply, analyzeReply } from './conversations.js';
import { CONVERSATION_KINDS } from './constants.js';

const LOOKBACK_DAYS = 120;
const DAY_MS = 86_400_000;
const QUOTE_MARKERS = [/^On .+ wrote:$/, /^ב.+(כתב|כתבה)\s?.*:$/, /^-{2,}\s*Original Message\s*-{2,}$/i, /^From: .+/, /^מאת: .+/];

function header(message, name) {
  const found = message.payload.headers.find((item) => item.name.toLowerCase() === name.toLowerCase());
  return found ? found.value : null;
}

function decode(data) {
  return Buffer.from(data, 'base64url').toString('utf8');
}

function partsOf(payload) {
  return [payload, ...('parts' in payload ? payload.parts.flatMap(partsOf) : [])];
}

function htmlToText(html) {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}

/** Keep only the new text of a reply: stop at the first quoted line or "On … wrote:" marker. */
export function stripQuoted(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const end = lines.findIndex((line) => line.trim().startsWith('>') || QUOTE_MARKERS.some((marker) => marker.test(line.trim())));
  return (end === -1 ? lines : lines.slice(0, end)).join('\n').trim();
}

function senderAddress(from) {
  const angle = /<([^>]+)>/.exec(from);
  return (angle ? angle[1] : from).trim().toLowerCase();
}

/** The parts of a Gmail message YMT keeps. */
export function parseGmailMessage(message) {
  const parts = partsOf(message.payload).filter((part) => part.body && part.body.data);
  const plain = parts.find((part) => part.mimeType === 'text/plain');
  const html = parts.find((part) => part.mimeType === 'text/html');
  const raw = plain ? decode(plain.body.data) : html ? htmlToText(decode(html.body.data)) : '';
  return {
    id: message.id,
    from: senderAddress(header(message, 'From') ?? ''),
    subject: header(message, 'Subject'),
    receivedAt: new Date(Number(message.internalDate)).toISOString(),
    body: stripQuoted(raw),
  };
}

/** Email addresses this owner wrote to in a conversation, with the first date (the search starts there). */
function emailTargets(db, userId, now) {
  const since = new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS).toISOString();
  return db.prepare(`SELECT a.contact_id, lower(a.recipient_email) AS email, MIN(a.sent_at) AS first_sent_at
    FROM approvals a JOIN opportunities o ON o.id = a.opportunity_id
    WHERE a.status = 'sent' AND a.channel = 'email' AND a.recipient_email IS NOT NULL AND o.owner_id = ? AND a.sent_at >= ?
      AND a.kind IN (${CONVERSATION_KINDS.map(() => '?').join(', ')})
    GROUP BY a.contact_id, lower(a.recipient_email)`).all(userId, since, ...CONVERSATION_KINDS);
}

/** Read new replies for one owner and analyse each. Returns how many addresses were checked and replies added. */
export async function syncGmailReplies(db, google, ai, userId, now = new Date()) {
  const account = googleAccount(db, userId);
  if (!account || !account.gmail_read) throw conflict('Gmail reading is not connected for this person');
  const token = await accessTokenFor(db, google, userId);
  const known = db.prepare('SELECT 1 FROM replies WHERE gmail_message_id = ?');
  const added = [];
  const targets = emailTargets(db, userId, now);
  for (const target of targets) {
    const after = Math.floor(Date.parse(target.first_sent_at) / 1000);
    const ids = await google.searchMessages(token, `from:${target.email} after:${after}`);
    for (const id of ids.filter((messageId) => !known.get(messageId))) {
      const message = parseGmailMessage(await google.getMessage(token, id));
      if (message.from !== target.email || message.body === '') continue;
      added.push(saveReply(db, null, target.contact_id, {
        channel: 'email', body: message.body, subject: message.subject, receivedAt: message.receivedAt, source: 'gmail', gmailMessageId: message.id,
      }));
    }
  }
  for (const replyId of added) await analyzeReply(db, ai, replyId);
  db.prepare('UPDATE google_accounts SET gmail_checked_at = ?, gmail_error = NULL WHERE user_id = ?').run(nowIso(), userId);
  return { checked: targets.length, added: added.length };
}

/** Background check for everyone who connected Gmail; a Google problem is stored and shown, never hidden. */
export async function syncAllGmail(db, google, ai, now = new Date()) {
  const users = db.prepare('SELECT user_id FROM google_accounts WHERE gmail_read = 1').all();
  for (const { user_id: userId } of users) {
    await syncGmailReplies(db, google, ai, userId, now).catch((error) => {
      if (!(error instanceof GoogleError)) throw error;
      db.prepare('UPDATE google_accounts SET gmail_error = ? WHERE user_id = ?').run(error.message, userId);
    });
  }
}
