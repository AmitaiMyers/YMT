// Watch lists: companies imported from a public list, checked by a mandate instead of an open web search.

import { insert } from '../db.js';
import { normalizeDomain, normalizeName } from './classification.js';
import { ENTRY_NOT_BLOCKED_SQL } from './blocked.js';

export const MAX_IMPORT_ROWS = 5000;

/** Companies per watch-list run: enough to find `batchSize` initiatives, few enough for one search session. */
export function entriesPerRun(batchSize) {
  return Math.min(Math.max(batchSize * 2, 5), 25);
}

/**
 * Add entries to a list, skipping duplicates (same domain or same normalised name, in the file or already listed).
 * Entries are already validated. Call inside a transaction. Returns { added, skipped }.
 */
export function importEntries(db, listId, entries) {
  const existing = db.prepare('SELECT name_key, domain FROM watch_list_entries WHERE list_id = ?').all(listId);
  const names = new Set(existing.map((row) => row.name_key));
  const domains = new Set(existing.filter((row) => row.domain).map((row) => row.domain));
  let added = 0;
  for (const entry of entries) {
    const nameKey = normalizeName(entry.name);
    const domain = normalizeDomain(entry.website);
    if (nameKey === '' || names.has(nameKey) || (domain && domains.has(domain))) continue;
    insert(db, 'watch_list_entries', {
      list_id: listId, name: entry.name, name_key: nameKey, website: entry.website, domain, country: entry.country, notes: entry.notes, card_data: entry.card_data,
    });
    names.add(nameKey);
    if (domain) domains.add(domain);
    added += 1;
  }
  return { added, skipped: entries.length - added };
}

/** The `count` entries this mandate checked longest ago (never-checked first). Companies on the "Don't suggest" list are skipped. */
export function pickEntries(db, listId, mandateId, count) {
  return db.prepare(`SELECT e.id, e.name, e.website, e.domain, e.country FROM watch_list_entries e
    LEFT JOIN watch_checks c ON c.entry_id = e.id AND c.mandate_id = ?
    WHERE e.list_id = ? AND ${ENTRY_NOT_BLOCKED_SQL}
    ORDER BY c.last_checked_at ASC NULLS FIRST, e.id ASC
    LIMIT ?`).all(mandateId, listId, count);
}

export function recordChecks(db, entries, mandateId, runId, now) {
  const upsert = db.prepare(`INSERT INTO watch_checks (entry_id, mandate_id, last_checked_at, last_run_id) VALUES (?, ?, ?, ?)
    ON CONFLICT (entry_id, mandate_id) DO UPDATE SET last_checked_at = excluded.last_checked_at, last_run_id = excluded.last_run_id`);
  for (const entry of entries) upsert.run(entry.id, mandateId, now.toISOString(), runId);
}

/** The listed entry a found company belongs to (same domain, else same normalised name), or null. */
export function matchEntry(entries, { companyName, website }) {
  const domain = normalizeDomain(website);
  if (domain) {
    const byDomain = entries.find((entry) => entry.domain === domain);
    if (byDomain) return byDomain;
  }
  const key = normalizeName(companyName);
  return entries.find((entry) => normalizeName(entry.name) === key) ?? null;
}
