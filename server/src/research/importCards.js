// Watch-list companies into Research review (25.11.2026). Each chosen company becomes a card for the person who sends
// it, built from the company-card columns its file carried (shared/cardColumns.js – e.g. this CRM's own full export);
// a plain list (name, website, country) gives a card that only says where it came from. No AI runs here: "Run agent"
// on the card researches the company afterwards. A company that already has a card keeps it (the entry links to it).

import { parseBody } from '../validate.js';
import { badRequest } from '../http.js';
import { insert, update, findById, nowIso, transaction } from '../db.js';
import { findExistingCompany, normalizeName } from './classification.js';
import { upsertSource } from './runner.js';
import { findVersion } from './mandates.js';
import { CARD_COLUMNS, CARD_COLUMN_NAMES, CONTACTS_COLUMN, LIST_SEPARATOR } from '../../../shared/cardColumns.js';
import { DEPARTMENTS, LANGUAGES, PREFERRED_CHANNELS } from '../../../shared/enums.js';

export const MAX_SEND_TO_REVIEW = 200;
const MAX_CONTACTS_PER_COMPANY = 50;

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

function parseContactsJson(text) {
  let rows;
  try {
    rows = JSON.parse(text);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw badRequest(`${CONTACTS_COLUMN} is not valid JSON`);
  }
  if (!Array.isArray(rows)) throw badRequest(`${CONTACTS_COLUMN} must be a JSON list`);
  if (rows.length > MAX_CONTACTS_PER_COMPANY) throw badRequest(`${CONTACTS_COLUMN}: at most ${MAX_CONTACTS_PER_COMPANY} contacts`);
  return rows.map((row, index) => {
    const contact = parseBody(CONTACT_SPEC, row);
    if (contact.full_name === '') throw badRequest(`${CONTACTS_COLUMN}: contact ${index + 1} needs a name`);
    return contact;
  });
}

/**
 * Validate the card columns of one imported row ({ header: cell text }). Throws a 400 naming the column.
 * @returns {{ card: object, company: object, aliases: string[], contacts: object[] }}
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
  const result = { card: {}, company: {}, aliases: [], contacts: [] };
  for (const [header, { to, column }] of Object.entries(CARD_COLUMNS)) {
    const value = values[header];
    if (to === 'aliases') result.aliases = value ?? [];
    else if (to === 'contacts') result.contacts = value === null ? [] : parseContactsJson(value);
    else result[to][column] = value;
  }
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
    insert(db, 'contacts', { ...contact, company_id: companyId });
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
  const { card } = data;
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
  return { cardId: id, created: true };
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
