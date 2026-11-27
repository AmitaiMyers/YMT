// "Don't suggest" (27.11.2026): companies YMT told the agents never to suggest again – e.g. after an approach that
// failed. It applies to every agent until someone removes it. The agents skip these companies (and are told their
// names, so no search is spent on them); their cards leave the lead-flow board and the review, and come back on removal.

import { insert, update, findById, audit } from '../db.js';
import { findExistingCompany, normalizeDomain, normalizeName } from './classification.js';

/** SQL condition for card lists (alias `o` = opportunities): the card's company is not blocked. */
export const NOT_BLOCKED_SQL = 'NOT EXISTS (SELECT 1 FROM blocked_companies b WHERE b.company_id = o.company_id)';
/** SQL condition for watch-list entries (alias `e`): the listed company is not blocked by domain or name. */
export const ENTRY_NOT_BLOCKED_SQL = `NOT EXISTS (SELECT 1 FROM blocked_companies b
  WHERE (e.domain IS NOT NULL AND b.domain = e.domain) OR b.name_key = e.name_key)`;
const MAX_NAMES_IN_PROMPT = 200;

/** The block that matches a company (by CRM company, website domain or any of its names), or null. */
export function findBlock(db, { companyId = null, name, website = null, otherNames = [] }) {
  if (companyId !== null) {
    const byCompany = db.prepare('SELECT * FROM blocked_companies WHERE company_id = ?').get(companyId);
    if (byCompany) return byCompany;
  }
  const domain = normalizeDomain(website);
  if (domain) {
    const byDomain = db.prepare('SELECT * FROM blocked_companies WHERE domain = ?').get(domain);
    if (byDomain) return byDomain;
  }
  const byName = db.prepare('SELECT * FROM blocked_companies WHERE name_key = ?');
  for (const key of [name, ...otherNames].map(normalizeName).filter(Boolean)) {
    const row = byName.get(key);
    if (row) return row;
  }
  return null;
}

/**
 * Block a company for every agent. A company already in the CRM is linked, so its cards are hidden. Blocking a company
 * that is already blocked returns the existing block. Call inside a transaction when blocking several.
 * @returns {number} the block id
 */
export function blockCompany(db, { companyId = null, name, website = null, reason, userId }) {
  const company = companyId !== null ? findById(db, 'companies', companyId)
    : (findExistingCompany(db, { website, name, hqCountry: 'Israel' }) ?? { company: null }).company;
  const existing = findBlock(db, { companyId: company ? company.id : null, name: company ? company.name : name, website: website ?? (company ? company.website : null) });
  if (existing) {
    // A block added by name before the company was in the CRM: link it now so its cards are hidden too.
    if (existing.company_id === null && company) update(db, 'blocked_companies', existing.id, { company_id: company.id });
    return existing.id;
  }
  const id = insert(db, 'blocked_companies', {
    company_id: company ? company.id : null, name: company ? company.name : name, name_key: normalizeName(company ? company.name : name),
    domain: normalizeDomain(website ?? (company ? company.website : null)), reason, blocked_by: userId,
  });
  audit(db, userId, 'company.blocked', 'blocked_companies', id, `${company ? company.name : name}${reason ? `: ${reason}` : ''}`);
  return id;
}

/** Names the discovery prompt is told to skip. */
export function blockedNames(db) {
  return db.prepare('SELECT name, domain FROM blocked_companies ORDER BY id DESC LIMIT ?').all(MAX_NAMES_IN_PROMPT)
    .map((row) => (row.domain ? `${row.name} (${row.domain})` : row.name));
}
