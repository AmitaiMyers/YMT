// Deterministic classification helpers from YMT's dictionary. No AI here: bands and identities are computed in code.

import { EMPLOYEE_BANDS, REVENUE_BANDS } from '../constants.js';

function bandOf(bands, value, maxInclusive) {
  const match = bands.find((b) => value >= b.min && (maxInclusive ? value <= b.max : value < b.max));
  if (!match) throw new Error(`No size band for value ${value}`);
  return match.band;
}

/**
 * Band for a range of values. A single number is a range with min = max. A range that crosses a band boundary is
 * "spans_multiple" (YMT: "retain the range and mark it Spans multiple bands"). Missing numbers are "unknown".
 */
function bandForRange(bands, min, max, maxInclusive) {
  if (min === null && max === null) return 'unknown';
  const low = min ?? max;
  const high = max ?? min;
  if (low > high) throw new Error(`Invalid range ${low}–${high}`);
  const first = bandOf(bands, low, maxInclusive);
  return first === bandOf(bands, high, maxInclusive) ? first : 'spans_multiple';
}

export function employeeBand(min, max) {
  return bandForRange(EMPLOYEE_BANDS, min, max, true);
}

export function revenueBand(minUsd, maxUsd) {
  return bandForRange(REVENUE_BANDS, minUsd, maxUsd, false);
}

// Second-level suffixes under which a company registers its name (example.co.il, example.com.au).
const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'ac', 'gov', 'muni', 'edu', 'ltd', 'plc', 'or', 'ne', 'go']);

/**
 * The registrable domain of a website: "https://shop.Example.co.il/about?x" → "example.co.il".
 * Returns null for empty or unparseable input.
 */
export function normalizeDomain(website) {
  if (typeof website !== 'string' || website.trim() === '') return null;
  const withScheme = /^[a-z]+:\/\//i.test(website.trim()) ? website.trim() : `https://${website.trim()}`;
  if (!URL.canParse(withScheme)) return null;
  const labels = new URL(withScheme).hostname.toLowerCase().replace(/^www\./, '').split('.');
  if (labels.length < 2) return null;
  const keep = labels.length >= 3 && labels.at(-1).length === 2 && SECOND_LEVEL.has(labels.at(-2)) ? 3 : 2;
  return labels.slice(-keep).join('.');
}

const LEGAL_SUFFIXES = /\b(ltd|limited|inc|incorporated|corp|corporation|llc|plc|gmbh|co|company|group|holdings|bm|b\.m)\b\.?/g;

/** Company name for duplicate checks: lower case, no legal suffixes, punctuation or Hebrew "בע"מ". */
export function normalizeName(name) {
  return name.toLowerCase()
    .replace(/בע"?מ/g, '')
    .replace(/\(demo\)/g, '')
    .replace(LEGAL_SUFFIXES, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Canonical form of a source URL so the same page is stored once (no fragment, no trailing slash). */
export function normalizeUrl(url) {
  const parsed = new URL(url);
  parsed.hash = '';
  parsed.hostname = parsed.hostname.toLowerCase();
  const text = parsed.toString();
  return text.endsWith('/') && parsed.pathname !== '/' ? text.slice(0, -1) : text;
}

/** Digits only: "51-234567-8" and "512345678" are the same company number. */
export function normalizeRegistry(number) {
  if (typeof number !== 'string') return null;
  const digits = number.replace(/\D/g, '');
  return digits.length >= 6 ? digits : null;
}

/**
 * Find an existing company, strongest key first: website domain, company number, then the same normalised name
 * (or one of its other names) with the same HQ country. Returns { company, match: 'domain' | 'registry' | 'name' } or null.
 */
export function findExistingCompany(db, { website, name, hqCountry, registryNumber = null, otherNames = [] }) {
  const rows = db.prepare('SELECT id, name, website, hq_country, country, registry_number FROM companies').all();
  const domain = normalizeDomain(website);
  if (domain) {
    const byDomain = rows.find((row) => normalizeDomain(row.website) === domain);
    if (byDomain) return { company: byDomain, match: 'domain' };
  }
  const registry = normalizeRegistry(registryNumber);
  if (registry) {
    const byRegistry = rows.find((row) => normalizeRegistry(row.registry_number) === registry);
    if (byRegistry) return { company: byRegistry, match: 'registry' };
  }
  const keys = new Set([name, ...otherNames].map(normalizeName).filter(Boolean));
  const country = (hqCountry ?? '').trim().toLowerCase();
  const sameCountry = (row) => (row.hq_country ?? row.country ?? '').trim().toLowerCase() === country;
  const byName = rows.find((row) => keys.has(normalizeName(row.name)) && sameCountry(row));
  if (byName) return { company: byName, match: 'name' };
  const alias = db.prepare(`SELECT c.id, c.name, c.website, c.hq_country, c.country, c.registry_number FROM company_aliases a
    JOIN companies c ON c.id = a.company_id WHERE a.name_key = ?`);
  for (const key of keys) {
    const byAlias = alias.all(key).find(sameCountry);
    if (byAlias) return { company: byAlias, match: 'name' };
  }
  return null;
}
