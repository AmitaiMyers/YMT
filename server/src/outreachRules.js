// Release 3 legal gate for messages to outside people. Every check runs on the server:
//   - the do-not-contact list and a person's opt-out block every channel, for every message kind;
//   - cold first contacts (COLD_KINDS) only go to countries an admin cleared, always carry the opt-out sentence,
//     and to recipients in Israel start with "פרסומת" (email subject / WhatsApp text), per the Communications Law;
//   - WhatsApp only to people who agreed to WhatsApp messages, at an international phone number.
// Problems are returned as codes so screens can translate them; the server's error text spells them out.

import { findById, getSettings } from './db.js';
import { badRequest, conflict } from './http.js';
import { normalizeUrl } from './research/classification.js';
import { COLD_KINDS, MESSAGE_KINDS, LANGUAGES } from './constants.js';

export const ADVERTISEMENT_MARK = 'פרסומת';
const MARKED_CHANNELS = { email: 'subject', whatsapp: 'content' };
const ISRAEL = 'israel';
export const RECIPIENT_FIELDS = { email: 'recipient_email', linkedin: 'recipient_linkedin', whatsapp: 'recipient_phone' };
const INTERNATIONAL_PHONE_RE = /^\+[\d\s()-]+$/;
const PHONE_DIGITS = { min: 8, max: 15 }; // E.164 numbers incl. country code
const MIN_LISTED_PHONE_DIGITS = 7;          // any number, local or international, on the do-not-contact list
const ROLE_CHECK_DAYS = 30;                 // decision 19 (24.11): a first approach needs the role checked in the last 30 days
const DAY_MS = 86_400_000;

const PROBLEM_TEXT = {
  opted_out: 'This person asked not to be contacted',
  opt_out_pending: 'A reply from this person may be an opt-out. Confirm or dismiss it in the conversation first.',
  suppressed: 'This recipient is on the do-not-contact list',
  no_country: "Set the person's country first (the company has no HQ country)",
  country_not_cleared: 'Outreach to this country is not cleared. An admin can clear it under Settings → Outreach rules.',
  role_unchecked: "Check the person's current role on LinkedIn or the company website first (a first approach needs a check from the last 30 days)",
  no_email: 'This person has no email address',
  no_linkedin: 'This person has no LinkedIn profile link',
  no_phone: 'This person has no phone number',
  phone_format: 'WhatsApp needs the phone number in international format, starting with + and the country code',
  no_whatsapp_consent: 'This person has not agreed to WhatsApp messages',
  missing_opt_out: 'The opt-out sentence must stay in the message',
  missing_mark: `For recipients in Israel the message must start with "${ADVERTISEMENT_MARK}"`,
};

export function problemText(code) {
  return PROBLEM_TEXT[code];
}

// ------------------------------------------------------------------ settings

export function outreachRules(db) {
  const settings = getSettings(db);
  return {
    cleared_countries: JSON.parse(settings.outreach_cleared_countries),
    opt_out: Object.fromEntries(LANGUAGES.map((language) => [language, settings[`outreach_optout_${language}`]])),
  };
}

// ------------------------------------------------------------------ do-not-contact list

function phoneDigits(value) {
  const digits = value.replace(/\D/g, '');
  return digits.startsWith('00') ? digits.slice(2) : digits;
}

function emailDomain(email) {
  return email.split('@')[1];
}

/** Normalise a do-not-contact value so the same person always matches. Invalid values fail fast. */
export function normalizeSuppression(kind, raw) {
  const value = raw.trim().toLowerCase();
  if (kind === 'email') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw badRequest('Enter a valid email address');
    return value;
  }
  if (kind === 'domain') {
    const host = value.replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0].replace(/^www\./, '');
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) throw badRequest('Enter a domain such as example.co.il');
    return host;
  }
  if (kind === 'phone') {
    const digits = phoneDigits(value);
    if (digits.length < MIN_LISTED_PHONE_DIGITS) throw badRequest('Enter a phone number');
    return digits;
  }
  if (kind === 'linkedin') {
    if (!URL.canParse(value)) throw badRequest('Enter the LinkedIn profile URL');
    const url = new URL(value);
    url.search = '';
    return normalizeUrl(url.toString()).replace(/\/\/(www\.|[a-z]{2}\.)linkedin\.com/, '//linkedin.com');
  }
  throw badRequest(`Unknown do-not-contact kind: ${kind}`);
}

/** The do-not-contact entries a person's details would produce (used to check and to opt a person out). */
export function suppressionKeys({ email = null, phone = null, linkedin = null }) {
  return [
    ...(email ? [['email', normalizeSuppression('email', email)], ['domain', emailDomain(email.trim().toLowerCase())]] : []),
    ...(phone && phoneDigits(phone).length >= MIN_LISTED_PHONE_DIGITS ? [['phone', normalizeSuppression('phone', phone)]] : []),
    ...(linkedin && URL.canParse(linkedin) ? [['linkedin', normalizeSuppression('linkedin', linkedin)]] : []),
  ];
}

function isSuppressed(db, details) {
  const lookup = db.prepare('SELECT 1 FROM suppressions WHERE kind = ? AND value = ?');
  return suppressionKeys(details).some(([kind, value]) => lookup.get(kind, value) !== undefined);
}

// ------------------------------------------------------------------ who may be contacted

/** A reply that looks like an opt-out blocks every message to the person until the owner confirms or dismisses it. */
export function hasPendingOptOut(db, contactId) {
  return db.prepare("SELECT 1 FROM replies WHERE contact_id = ? AND opt_out_state = 'pending'").get(contactId) !== undefined;
}

const UNKNOWN_COUNTRY = 'unknown'; // what research stores in companies.country when no source states the HQ country

/**
 * Where the person sits: their own country, else the company's HQ country (a cited "headquartered in Israel" counts),
 * else the company's main country. Null when nothing is known: the owner must set the person's country.
 */
export function recipientCountry(db, contact) {
  if (contact.country) return contact.country;
  if (!contact.company_id) return null;
  const company = findById(db, 'companies', contact.company_id);
  if (company.hq_country) return company.hq_country;
  if (company.israel_connection === 'hq_israel') return 'Israel';
  return company.country === UNKNOWN_COUNTRY ? null : company.country;
}

function isCleared(db, country) {
  return outreachRules(db).cleared_countries.some((cleared) => cleared.trim().toLowerCase() === country.trim().toLowerCase());
}

/** The person's role was confirmed against a public source (LinkedIn or the company website) in the last 30 days. */
export function roleCheckedRecently(contact, now = new Date()) {
  if (contact.verified !== 1 || contact.verified_at === null) return false;
  return now.getTime() - Date.parse(contact.verified_at) <= ROLE_CHECK_DAYS * DAY_MS;
}

function channelDetailProblem(channel, { email, phone, linkedin, whatsappConsent }) {
  if (channel === 'email') return email ? null : 'no_email';
  if (channel === 'linkedin') return linkedin ? null : 'no_linkedin';
  if (!phone) return 'no_phone';
  const digits = phoneDigits(phone).length;
  if (!INTERNATIONAL_PHONE_RE.test(phone.trim()) || digits < PHONE_DIGITS.min || digits > PHONE_DIGITS.max) return 'phone_format';
  return whatsappConsent ? null : 'no_whatsapp_consent';
}

function recipientProblem(db, contact, channel, details, { cold }) {
  if (contact && contact.opted_out_at) return 'opted_out';
  if (contact && hasPendingOptOut(db, contact.id)) return 'opt_out_pending';
  const contactDetails = contact ? { email: contact.email, phone: contact.phone, linkedin: contact.linkedin_url } : {};
  if (isSuppressed(db, details) || isSuppressed(db, contactDetails)) return 'suppressed';
  if (cold) {
    const country = recipientCountry(db, contact);
    if (!country) return 'no_country';
    if (!isCleared(db, country)) return 'country_not_cleared';
    if (contact && !roleCheckedRecently(contact)) return 'role_unchecked';
  }
  return channelDetailProblem(channel, { ...details, whatsappConsent: contact ? contact.whatsapp_consent === 1 : false });
}

/** Why a first approach to this contact on this channel is not allowed, as a code, or null when it is. */
export function contactChannelProblem(db, contact, channel) {
  return recipientProblem(db, contact, channel, { email: contact.email, phone: contact.phone, linkedin: contact.linkedin_url }, { cold: true });
}

export function assertMayContact(db, contact, channel) {
  const code = contactChannelProblem(db, contact, channel);
  if (code) throw conflict(problemText(code));
}

// ------------------------------------------------------------------ the message itself

function markedField(db, contact, channel) {
  const country = recipientCountry(db, contact);
  return country && country.trim().toLowerCase() === ISRAEL ? MARKED_CHANNELS[channel] ?? null : null;
}

/** Add the opt-out sentence and, where the law needs it, the "פרסומת" marking to a drafted first message. */
export function composeMessage(db, { contact, channel, language, subject, body }) {
  const optOut = outreachRules(db).opt_out[language];
  const message = { subject: channel === 'email' ? subject : null, content: `${body.trim()}\n\n${optOut}` };
  const field = markedField(db, contact, channel);
  if (field === 'subject' && !message.subject.startsWith(ADVERTISEMENT_MARK)) message.subject = `${ADVERTISEMENT_MARK}: ${message.subject}`;
  if (field === 'content') message.content = `${ADVERTISEMENT_MARK}\n${message.content}`;
  return message;
}

function approvalContact(db, approval) {
  return approval.contact_id ? findById(db, 'contacts', approval.contact_id) : null;
}

/** The recipient may (still) receive this message: checked when approving and again when marking it sent. */
export function assertRecipientAllowed(db, approval) {
  if (!MESSAGE_KINDS.includes(approval.kind)) return;
  const contact = approvalContact(db, approval);
  const cold = COLD_KINDS.includes(approval.kind);
  if (cold && !contact) throw badRequest('A first approach needs a contact');
  const details = { email: approval.recipient_email, phone: approval.recipient_phone, linkedin: approval.recipient_linkedin };
  const code = recipientProblem(db, contact, approval.channel, details, { cold });
  if (code) throw conflict(problemText(code));
}

/** The approved text keeps the opt-out sentence and the marking (cold first contacts only). */
export function assertMessageCompliant(db, approval) {
  if (!COLD_KINDS.includes(approval.kind)) return;
  const optOut = outreachRules(db).opt_out[approval.language];
  if (!approval.content.includes(optOut)) throw badRequest(`${problemText('missing_opt_out')}: "${optOut}"`);
  const field = markedField(db, approvalContact(db, approval), approval.channel);
  if (field && !(approval[field] ?? '').trim().startsWith(ADVERTISEMENT_MARK)) throw badRequest(problemText('missing_mark'));
}
