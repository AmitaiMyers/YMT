// Mandates and their immutable criteria versions.

import { insert, update, findById, transaction } from '../db.js';
import { DEFAULT_MANDATES } from './defaultMandates.js';

const JSON_FIELDS = ['target_countries', 'need_types', 'false_positives', 'sectors', 'search_terms', 'exclusions'];
export const CRITERIA_FIELDS = [...JSON_FIELDS, 'accept_rule', 'employees_min', 'employees_max', 'revenue_min_usd', 'revenue_max_usd', 'proposed_service'];

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

/** Create a mandate with version 1 (paused until it has an owner). Returns the mandate id. */
export function createMandate(db, { code, name, owner_id = null, schedule = 'off', schedule_weekday = 0, default_batch = 5, freshness_days = 183 }, criteria, userId) {
  return transaction(db, () => {
    const id = insert(db, 'mandates', { code, name, owner_id, status: 'paused', schedule, schedule_weekday, default_batch, freshness_days });
    createVersion(db, id, criteria, { userId, changeNote: 'Initial version' });
    return id;
  });
}

export function seedMandates(db) {
  if (db.prepare('SELECT COUNT(*) AS n FROM mandates').get().n > 0) return;
  for (const { code, name, ...criteria } of DEFAULT_MANDATES) {
    createMandate(db, { code, name }, { sectors: [], exclusions: [], ...criteria }, null);
  }
}
