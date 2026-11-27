// Watch-list companies into Research review (25.11.2026). Each chosen company becomes a card for the person who sends
// it, built from the company-card columns its file carried (shared/cardColumns.js – e.g. this CRM's own full export);
// a plain list (name, website, country) gives a card that only says where it came from. No AI runs here: "Run agent"
// on the card researches the company afterwards. A company that already has a card keeps it (the entry links to it).
// Progress columns put the card where it got to elsewhere: the decision, the deal and its stage, messages already sent
// (logged as sent – nothing is sent now), meetings and the next step as a task. Without them the card starts at review.

import { parseBody } from '../validate.js';
import { badRequest } from '../http.js';
import { insert, update, findById, nowIso, transaction } from '../db.js';
import { findExistingCompany, normalizeName } from './classification.js';
import { upsertSource } from './runner.js';
import { findVersion } from './mandates.js';
import { openDefaultDeal } from './deals.js';
import {
  CARD_COLUMNS, CARD_COLUMN_NAMES, CONTACTS_COLUMN, MESSAGES_COLUMN, MEETINGS_COLUMN, LIST_SEPARATOR,
} from '../../../shared/cardColumns.js';
import { DEPARTMENTS, LANGUAGES, PREFERRED_CHANNELS, OUTREACH_CHANNELS } from '../../../shared/enums.js';

export const MAX_SEND_TO_REVIEW = 200;
const MAX_JSON_ROWS = 50;
// A card imported as "draft" or "waiting for an owner" is the importer's card to review.
const REVIEW_ON_IMPORT = ['draft', 'needs_review', 'manual_assignment'];

const CARD_DATA_SPEC = Object.fromEntries(Object.entries(CARD_COLUMNS).map(([header, { to, column, ...spec }]) => [header, spec]));
const CONTACT_SPEC = {
  full_name: { type: 'string', required: true, max: 200 },
  job_title: { type: 'string', max: 200 },
  department: { type: 'string', required: true, enum: DEPARTMENTS },
  email: { type: 'email' },
  phone: { type: 'string', max: 50 },
  linkedin_url: { type: 'url' },
  country: { type: 'string', max: 100 },
  preferred_language: { type: 'string', required: true, enum: LANGUAGES },
  preferred_channel: { type: 'string', enum: PREFERRED_CHANNELS },
  whatsapp_consent: { type: 'bool' },
  verified: { type: 'bool' },
  verified_source: { type: 'text', max: 2000 },
  verified_at: { type: 'datetime' },
  opted_out_at: { type: 'datetime' },
};

/** Cell text in the type the spec expects (lists split, whole numbers as numbers); anything else is left for parseBody to reject. */
function typedCell(spec, value) {
  if (spec.type === 'list') return value.split(LIST_SEPARATOR).map((item) => item.trim()).filter((item) => item !== '');
  if (spec.type === 'int' && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return value;
}

const MESSAGE_SPEC = {
  kind: { type: 'string', required: true, enum: ['first_approach', 'approach_followup'] },
  channel: { type: 'string', required: true, enum: OUTREACH_CHANNELS },
  sent_at: { type: 'datetime', required: true },
  contact_name: { type: 'string', max: 200 },
  subject: { type: 'string', max: 300 },
  content: { type: 'text', max: 20000 },
};
const MEETING_SPEC = {
  title: { type: 'string', required: true, max: 200 },
  scheduled_at: { type: 'datetime', required: true },
  status: { type: 'string', required: true, enum: ['scheduled', 'done', 'cancelled'] },
  contact_name: { type: 'string', max: 200 },
  summary: { type: 'text', max: 20000 },
};

/** A "(data)" column: a JSON list whose items each match `spec`. */
function parseJsonList(text, column, spec) {
  let rows;
  try {
    rows = JSON.parse(text);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw badRequest(`${column} is not valid JSON`);
  }
  if (!Array.isArray(rows)) throw badRequest(`${column} must be a JSON list`);
  if (rows.length > MAX_JSON_ROWS) throw badRequest(`${column}: at most ${MAX_JSON_ROWS} items`);
  return rows.map((row, index) => {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) throw badRequest(`${column}: item ${index + 1} must be an object`);
    return parseBody(spec, row);
  });
}

const JSON_LIST_SPECS = { contacts: [CONTACTS_COLUMN, CONTACT_SPEC], messages: [MESSAGES_COLUMN, MESSAGE_SPEC], meetings: [MEETINGS_COLUMN, MEETING_SPEC] };

/** Combinations that cannot be a real card: fail with the reason instead of importing something half-true. */
function assertProgress(progress) {
  const status = progress.status ?? 'needs_review';
  if (status === 'rejected' && progress.decision_reason === null) throw badRequest('Card status "rejected" needs a Decision reason');
  if (status === 'deferred' && progress.defer_until === null) throw badRequest('Card status "deferred" needs a Come back on date');
  const dealGiven = progress.deal_stage !== null || progress.deal_status !== null;
  if (dealGiven && status !== 'accepted') throw badRequest('A deal stage or status needs Card status "accepted"');
  if (progress.next_step === null && progress.next_step_date !== null) throw badRequest('Next step date needs a Next step');
}

/**
 * Validate the card columns of one imported row ({ header: cell text }). Throws a 400 naming the column.
 * @returns {{ card: object, company: object, progress: object, aliases: string[], contacts: object[] }}
 */
export function parseCardData(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw badRequest('card_data must be an object');
  const unknown = Object.keys(raw).filter((header) => !CARD_COLUMN_NAMES.includes(header));
  if (unknown.length > 0) throw badRequest(`Unknown card column(s): ${unknown.join(', ')}`);
  for (const [header, value] of Object.entries(raw)) {
    if (typeof value !== 'string') throw badRequest(`${header} must be text`);
  }
  const typed = Object.fromEntries(Object.entries(raw).map(([header, value]) => [header, typedCell(CARD_DATA_SPEC[header], value)]));
  const values = parseBody(CARD_DATA_SPEC, typed);
  const result = { card: {}, company: {}, progress: {}, aliases: [], contacts: [] };
  for (const [header, { to, column }] of Object.entries(CARD_COLUMNS)) {
    const value = values[header];
    if (to === 'aliases') result.aliases = value ?? [];
    else if (column in JSON_LIST_SPECS) {
      const parsed = value === null ? [] : parseJsonList(value, ...JSON_LIST_SPECS[column]);
      if (to === 'contacts') result.contacts = parsed;
      else result[to][column] = parsed;
    } else result[to][column] = value;
  }
  assertProgress(result.progress);
  return result;
}

/** Only the non-empty card columns of a row, as stored with the watch-list entry (null when the file had none). */
export function cardDataJson(raw) {
  if (raw === null) return null;
  parseCardData(raw);
  const kept = Object.fromEntries(Object.entries(raw).filter(([, value]) => value.trim() !== ''));
  return Object.keys(kept).length === 0 ? null : JSON.stringify(kept);
}

const JSON_COLUMNS = ['customer_types', 'customer_markets'];

/** The company for an entry: the existing one (empty columns filled from the file), or a new one. */
function saveCompany(db, entry, data, found) {
  const fromFile = Object.fromEntries(Object.entries(data.company).filter(([, value]) => value !== null)
    .map(([column, value]) => [column, JSON_COLUMNS.includes(column) ? JSON.stringify(value) : value]));
  if (!found) {
    return insert(db, 'companies', {
      ...fromFile,
      name: entry.name,
      website: entry.website,
      country: entry.country ?? data.company.hq_country ?? 'unknown',
      industry: fromFile.industry ?? 'unknown',
      origin: 'manual',
    });
  }
  const current = findById(db, 'companies', found.company.id);
  const fill = Object.fromEntries(Object.entries(fromFile).filter(([column]) => current[column] === null || current[column] === '[]'));
  if (Object.keys(fill).length > 0) update(db, 'companies', current.id, { ...fill, updated_at: nowIso() });
  return current.id;
}

function saveAliases(db, companyId, names) {
  const add = db.prepare('INSERT OR IGNORE INTO company_aliases (company_id, name, name_key, source_url) VALUES (?, ?, ?, NULL)');
  for (const name of names) {
    const key = normalizeName(name);
    if (key) add.run(companyId, name, key);
  }
}

/** Contacts from the file that the company does not have yet (same email, or same name). Opt-outs come along. */
function saveContacts(db, companyId, contacts) {
  const existing = db.prepare('SELECT full_name, email FROM contacts WHERE company_id = ?').all(companyId);
  const emails = new Set(existing.filter((row) => row.email).map((row) => row.email.toLowerCase()));
  const names = new Set(existing.map((row) => normalizeName(row.full_name)));
  for (const contact of contacts) {
    if ((contact.email && emails.has(contact.email.toLowerCase())) || names.has(normalizeName(contact.full_name))) continue;
    // Consent and role check are "no" unless the file says yes.
    insert(db, 'contacts', { ...contact, whatsapp_consent: contact.whatsapp_consent ?? 0, verified: contact.verified ?? 0, company_id: companyId });
    names.add(normalizeName(contact.full_name));
    if (contact.email) emails.add(contact.email.toLowerCase());
  }
}

/** The card a company already has (any status), or null. */
function existingCard(db, companyId) {
  const row = db.prepare('SELECT id FROM opportunities WHERE company_id = ? ORDER BY id DESC LIMIT 1').get(companyId);
  return row ? row.id : null;
}

function mandateByCode(db, code) {
  return code === null ? null : db.prepare('SELECT * FROM mandates WHERE code = ?').get(code) ?? null;
}

/** One entry → its card id ({ created: true } when new). Throws a 400 naming the company when it cannot become a card. */
function sendEntry(db, { entry, list, chosenMandate, user, today }) {
  const data = parseCardData(entry.card_data === null ? {} : JSON.parse(entry.card_data));
  const found = findExistingCompany(db, { website: entry.website, name: entry.name, hqCountry: entry.country ?? data.company.hq_country ?? 'Israel', registryNumber: data.company.registry_number ?? null });
  const cardId = found ? existingCard(db, found.company.id) : null;
  if (cardId !== null) return { cardId, created: false };

  const evidenceUrl = data.card.evidence_url ?? entry.website;
  if (evidenceUrl === null) throw badRequest(`${entry.name}: needs a website (or an evidence link) to become a card`);
  const mandate = mandateByCode(db, data.card.mandate_code) ?? chosenMandate;
  if (mandate.current_version_id === null) throw badRequest(`Agent ${mandate.code} has no criteria yet`);
  const version = findVersion(db, mandate.current_version_id);

  const companyId = saveCompany(db, entry, data, found);
  saveAliases(db, companyId, data.aliases);
  saveContacts(db, companyId, data.contacts);
  const evidenceSourceId = upsertSource(db, {
    url: evidenceUrl, title: data.card.evidence_title, publishedOn: data.card.evidence_date, kind: data.card.evidence_url ? 'web' : 'list',
  });
  const { card, progress } = data;
  const id = insert(db, 'opportunities', {
    company_id: companyId, mandate_id: mandate.id, mandate_version_id: version.id, owner_id: user.id,
    relationship_role: card.relationship_role ?? 'client',
    target_country: card.target_country ?? version.target_countries[0],
    need_type: card.need_type ?? version.need_types[0],
    business_need: card.business_need ?? `Imported from the watch list "${list.name}" – not researched yet.`,
    evidence_source_id: evidenceSourceId,
    evidence_date: card.evidence_date ?? today,
    evidence_quote: card.evidence_quote ?? `Listed in "${list.name}".`,
    verdict: card.verdict, verdict_reason: card.verdict_reason, reason_to_act: card.reason_to_act,
    trigger_kind: card.trigger_kind, trigger_strength: card.trigger_strength, subsector_fit: card.subsector_fit,
    service_code: card.service_code, proposed_service: card.proposed_service ?? version.proposed_service,
    originator: card.originator ?? `staff:${user.username}`,
    flags: JSON.stringify(card.flags ?? []),
    unknowns: JSON.stringify(card.unknowns ?? []),
    status: 'needs_review',
  });
  applyProgress(db, { opportunityId: id, companyName: entry.name, progress, user });
  return { cardId: id, created: true };
}

/** The contact a message or meeting was with: by name, else the company's only contact. */
function contactFor(db, companyId, contactName, what, companyName) {
  const contacts = db.prepare('SELECT * FROM contacts WHERE company_id = ? ORDER BY id').all(companyId);
  if (contactName !== null) {
    const named = contacts.find((contact) => normalizeName(contact.full_name) === normalizeName(contactName));
    if (!named) throw badRequest(`${companyName}: ${what} is with "${contactName}", who is not among its contacts`);
    return named;
  }
  if (contacts.length === 1) return contacts[0];
  if (what === 'a meeting') return null;
  throw badRequest(`${companyName}: ${what} needs ${contacts.length === 0 ? 'a contact' : 'a contact_name (the company has several contacts)'}`);
}

const RECIPIENT = { email: ['recipient_email', 'email'], linkedin: ['recipient_linkedin', 'linkedin_url'], whatsapp: ['recipient_phone', 'phone'] };

/** Put a new card at the step the file says it reached. Nothing is sent: messages are logged as already sent. */
function applyProgress(db, { opportunityId, companyName, progress, user }) {
  const status = progress.status === null || REVIEW_ON_IMPORT.includes(progress.status) ? 'needs_review' : progress.status;
  const decidedAt = progress.decided_at ?? nowIso();
  if (status !== 'needs_review') {
    update(db, 'opportunities', opportunityId, {
      status, decision_reason: progress.decision_reason, decision_note: progress.decision_note, defer_until: progress.defer_until,
      decided_by: user.id, decided_at: decidedAt,
    });
  }
  const opportunity = findById(db, 'opportunities', opportunityId);
  const dealId = status === 'accepted' ? openDefaultDeal(db, opportunity, user.id) : null;
  if (dealId !== null && progress.deal_stage !== null) {
    const deal = findById(db, 'deals', dealId);
    const stages = JSON.parse(findById(db, 'workflows', deal.workflow_id).stages);
    if (!stages.includes(progress.deal_stage)) throw badRequest(`${companyName}: Deal stage must be one of: ${stages.join(', ')}`);
    update(db, 'deals', dealId, { stage: progress.deal_stage, stage_changed_at: decidedAt });
  }
  if (dealId !== null && progress.deal_status !== null && progress.deal_status !== 'open') {
    update(db, 'deals', dealId, { status: progress.deal_status, closed_at: decidedAt });
  }
  for (const message of progress.messages) {
    const contact = contactFor(db, opportunity.company_id, message.contact_name, 'a sent message', companyName);
    const [recipientColumn, contactColumn] = RECIPIENT[message.channel];
    insert(db, 'approvals', {
      kind: message.kind, channel: message.channel, opportunity_id: opportunityId, company_id: opportunity.company_id, deal_id: dealId,
      contact_id: contact.id, language: contact.preferred_language, subject: message.subject,
      content: message.content ?? `Sent outside the CRM (${message.channel}) on ${message.sent_at.slice(0, 10)}; logged on import.`,
      [recipientColumn]: contact[contactColumn], status: 'sent', created_by: user.id, created_at: message.sent_at,
      reviewed_by: user.id, reviewed_at: message.sent_at, sent_by: user.id, sent_at: message.sent_at,
    });
  }
  for (const meeting of progress.meetings) {
    const contact = contactFor(db, opportunity.company_id, meeting.contact_name, 'a meeting', companyName);
    insert(db, 'meetings', {
      company_id: opportunity.company_id, deal_id: dealId, title: meeting.title, scheduled_at: meeting.scheduled_at, status: meeting.status,
      summary: meeting.summary, contact_id: contact ? contact.id : null, organizer_id: user.id,
    });
  }
  if (progress.next_step !== null) {
    insert(db, 'tasks', { company_id: opportunity.company_id, description: progress.next_step, assignee: user.display_name, due_date: progress.next_step_date });
  }
}

/**
 * Send chosen entries of a watch list to Research review. All or nothing: one company that cannot become a card stops
 * the batch with its name, so nothing is half-imported. Returns { created, existing } with the entry and card ids.
 */
export function sendToReview(db, { list, entryIds, mandateId, user, now = new Date() }) {
  const chosenMandate = findById(db, 'mandates', mandateId);
  const entryById = db.prepare('SELECT * FROM watch_list_entries WHERE id = ? AND list_id = ?');
  const entries = entryIds.map((id) => {
    const entry = entryById.get(id, list.id);
    if (!entry) throw badRequest(`Company #${id} is not in this list`);
    return entry;
  });
  const today = now.toISOString().slice(0, 10);
  return transaction(db, () => {
    const result = { created: [], existing: [] };
    for (const entry of entries) {
      const { cardId, created } = sendEntry(db, { entry, list, chosenMandate, user, today });
      update(db, 'watch_list_entries', entry.id, { opportunity_id: cardId });
      result[created ? 'created' : 'existing'].push({ entry_id: entry.id, card_id: cardId });
    }
    return result;
  });
}
