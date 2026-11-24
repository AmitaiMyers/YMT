// SHEPHA's exclusion list (spec 22.11.2026: one of the three reasons that disqualify a company). An admin imports it
// from Excel; the comparison runs in code, so the list is never sent to the AI or shown to non-admins.

import { insert, audit, transaction } from '../db.js';
import { normalizeDomain, normalizeName, normalizeRegistry } from './classification.js';

export const MAX_EXCLUSION_ROWS = 5000;

/** Replace the whole list with a new import (the Excel is always the complete list). */
export function replaceExclusions(db, userId, rows) {
  transaction(db, () => {
    db.prepare('DELETE FROM shepha_exclusions').run();
    for (const row of rows) {
      insert(db, 'shepha_exclusions', {
        name: row.name, name_key: normalizeName(row.name), domain: normalizeDomain(row.website),
        registry_number: normalizeRegistry(row.registry_number), note: row.note, imported_by: userId,
      });
    }
    audit(db, userId, 'shepha_exclusions.imported', 'shepha_exclusions', null, `${rows.length} rows`);
  });
}

/** The matching exclusion row, or null. Any one key is enough: name (or another name), website domain, company number. */
export function findExclusion(db, { name, website = null, registryNumber = null, otherNames = [] }) {
  const domain = normalizeDomain(website);
  if (domain) {
    const row = db.prepare('SELECT * FROM shepha_exclusions WHERE domain = ?').get(domain);
    if (row) return row;
  }
  const registry = normalizeRegistry(registryNumber);
  if (registry) {
    const row = db.prepare('SELECT * FROM shepha_exclusions WHERE registry_number = ?').get(registry);
    if (row) return row;
  }
  const byName = db.prepare('SELECT * FROM shepha_exclusions WHERE name_key = ?');
  for (const key of [name, ...otherNames].map(normalizeName).filter(Boolean)) {
    const row = byName.get(key);
    if (row) return row;
  }
  return null;
}
