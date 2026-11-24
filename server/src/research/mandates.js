// Mandates and their immutable criteria versions.

import { insert, update, findById, transaction } from '../db.js';
import { DEFAULT_MANDATES } from './defaultMandates.js';

const JSON_FIELDS = ['target_countries', 'need_types', 'false_positives', 'sectors', 'search_terms', 'exclusions', 'service_codes'];
export const CRITERIA_FIELDS = [...JSON_FIELDS, 'accept_rule', 'employees_min', 'employees_max', 'revenue_min_usd', 'revenue_max_usd',
  'revenue_floor_usd', 'proposed_service'];

export function parseVersion(row) {
  const version = { ...row };
  for (const field of JSON_FIELDS) version[field] = JSON.parse(row[field]);
  return version;
}

export function findVersion(db, id) {
  return parseVersion(findById(db, 'mandate_versions', id));
}

/** All mandates with their parsed current version as `version`. */
export function loadMandates(db) {
  return db.prepare('SELECT * FROM mandates ORDER BY code').all()
    .map((mandate) => ({ ...mandate, version: findVersion(db, mandate.current_version_id) }));
}

export function loadMandate(db, id) {
  const mandate = findById(db, 'mandates', id);
  return { ...mandate, version: findVersion(db, mandate.current_version_id) };
}

/** Insert a new version (next number) and make it current. Returns the version id. */
export function createVersion(db, mandateId, criteria, { userId, changeNote }) {
  const last = db.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM mandate_versions WHERE mandate_id = ?').get(mandateId).v;
  const row = { mandate_id: mandateId, version: last + 1, change_note: changeNote, created_by: userId };
  for (const field of CRITERIA_FIELDS) {
    if (!(field in criteria)) throw new Error(`Mandate criteria is missing ${field}`);
    row[field] = JSON_FIELDS.includes(field) ? JSON.stringify(criteria[field]) : criteria[field];
  }
  const versionId = insert(db, 'mandate_versions', row);
  update(db, 'mandates', mandateId, { current_version_id: versionId });
  return versionId;
}

// Spec 22.11.2026: triggers count up to 12 months (half the score after 6), and mandates run weekly (decision 18).
const SPEC_FRESHNESS_DAYS = 365;
const SPEC_SCHEDULE = 'weekly';
const SPEC_NOTE = 'Lead-finding agent specification of 22.11.2026';

/** Create a mandate with version 1 (paused until it has an owner). Returns the mandate id. */
export function createMandate(db, { code, name, owner_id = null, schedule = 'off', schedule_weekday = 0, default_batch = 5, freshness_days = 183 }, criteria, userId) {
  return transaction(db, () => {
    const id = insert(db, 'mandates', { code, name, owner_id, status: 'paused', schedule, schedule_weekday, default_batch, freshness_days });
    createVersion(db, id, criteria, { userId, changeNote: 'Initial version' });
    return id;
  });
}

function specCriteria({ code, name, ...criteria }) {
  return { sectors: [], exclusions: ['Companies on the SHEPHA exclusion list'], ...criteria };
}

/** Empty database: the spec's mandates as version 1. */
export function seedMandates(db) {
  if (db.prepare('SELECT COUNT(*) AS n FROM mandates').get().n > 0) return false;
  for (const mandate of DEFAULT_MANDATES) {
    createMandate(db, { code: mandate.code, name: mandate.name, schedule: SPEC_SCHEDULE, freshness_days: SPEC_FRESHNESS_DAYS }, specCriteria(mandate), null);
  }
  return true;
}

/**
 * Existing database (once per change of the default wording): every mandate gets the default wording as a new version, so
 * earlier cards keep the version they were judged with; missing mandates are created. Owners and status stay as the admin
 * set them. `mandateFields` are the mandate columns this change also sets (e.g. the spec's weekly schedule).
 */
export function applyDefaultMandates(db, { note, mandateFields }) {
  for (const mandate of DEFAULT_MANDATES) {
    const existing = db.prepare('SELECT id FROM mandates WHERE code = ?').get(mandate.code);
    if (!existing) {
      createMandate(db, { code: mandate.code, name: mandate.name, schedule: SPEC_SCHEDULE, freshness_days: SPEC_FRESHNESS_DAYS }, specCriteria(mandate), null);
      continue;
    }
    transaction(db, () => {
      createVersion(db, existing.id, specCriteria(mandate), { userId: null, changeNote: note });
      update(db, 'mandates', existing.id, { name: mandate.name, ...mandateFields });
    });
  }
}

/** Spec of 22.11.2026: the spec's wording, weekly runs and a 12-month window. */
export function applySpec2211(db) {
  applyDefaultMandates(db, { note: SPEC_NOTE, mandateFields: { schedule: SPEC_SCHEDULE, freshness_days: SPEC_FRESHNESS_DAYS } });
}

/** 25.11.2026: wider search terms only; schedule and window stay as the admin set them. */
export function applySearchTerms2511(db) {
  applyDefaultMandates(db, { note: 'Wider search terms (English and Hebrew, trade shows, business news) – 25.11.2026', mandateFields: {} });
}
