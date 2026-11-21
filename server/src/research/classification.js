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

/** "https://www.Example.co.il/about?x" → "example.co.il". Returns null for empty or unparseable input. */
export function normalizeDomain(website) {
  if (typeof website !== 'string' || website.trim() === '') return null;
  const withScheme = /^[a-z]+:\/\//i.test(website.trim()) ? website.trim() : `https://${website.trim()}`;
  if (!URL.canParse(withScheme)) return null;
  const host = new URL(withScheme).hostname.toLowerCase().replace(/^www\./, '');
  return host.includes('.') ? host : null;
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

/**
 * Find an existing company: same website domain first, then the same normalised name and HQ country.
 * Returns { company, match: 'domain' | 'name' } or null.
 */
export function findExistingCompany(db, { website, name, hqCountry }) {
  const rows = db.prepare('SELECT id, name, website, hq_country, country FROM companies').all();
  const domain = normalizeDomain(website);
  if (domain) {
    const byDomain = rows.find((row) => normalizeDomain(row.website) === domain);
    if (byDomain) return { company: byDomain, match: 'domain' };
  }
  const key = normalizeName(name);
  const country = (hqCountry ?? '').trim().toLowerCase();
  const byName = rows.find((row) => normalizeName(row.name) === key
    && (row.hq_country ?? row.country ?? '').trim().toLowerCase() === country);
  return byName ? { company: byName, match: 'name' } : null;
}
