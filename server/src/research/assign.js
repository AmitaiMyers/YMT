// Routing rules for a found initiative (YMT "Who owns this opportunity?"). Plain code, no AI, fully testable.

import { ISRAEL_TARGET_CONNECTIONS } from '../constants.js';

const DAY_MS = 86400000;

function sameCountry(a, b) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function versionMatches(version, { targetCountry, needType }) {
  return version.target_countries.some((country) => sameCountry(country, targetCountry))
    && version.need_types.includes(needType);
}

function outside(min, max, value) {
  if (value === null) return false; // unknown size is not "outside"; it is listed under unknowns instead
  return (min !== null && value < min) || (max !== null && value > max);
}

/** True when the known size (headcount or revenue) falls outside the mandate's preferred band. */
export function outsidePreferredSize(version, company) {
  const employees = company.employees_max ?? company.employees_min;
  const revenue = company.revenue_usd_max ?? company.revenue_usd_min;
  return outside(version.employees_min, version.employees_max, employees)
    || outside(version.revenue_min_usd, version.revenue_max_usd, revenue);
}

/** Evidence published before (today - freshness_days) is too old to act on. */
export function isStale(evidenceDate, freshnessDays, now) {
  const published = Date.parse(`${evidenceDate}T00:00:00Z`);
  if (Number.isNaN(published)) throw new Error(`Invalid evidence date: ${evidenceDate}`);
  return published < now.getTime() - freshnessDays * DAY_MS;
}

/**
 * Decide status, mandate and owner for a new opportunity.
 * @param {{ runMandate: object, mandates: object[], opportunity: { targetCountry: string, needType: string },
 *   company: object, verdict: 'match' | 'weak' | 'defer' }} input
 *   Mandates carry their parsed current version as `mandate.version`.
 * @returns {{ status: string, mandateId: number | null, versionId: number | null, ownerId: number | null, flags: string[] }}
 */
export function assignOpportunity({ runMandate, mandates, opportunity, company, verdict }) {
  const flags = verdict === 'weak' ? ['weak_evidence'] : [];

  if (company.israel_connection === 'unknown') {
    // Missing or contradicting sources: "stop and pass" to Tom (decision 11), who assigns it by hand.
    return { status: 'manual_assignment', mandateId: runMandate.id, versionId: runMandate.version.id, ownerId: null, flags };
  }
  if (!ISRAEL_TARGET_CONNECTIONS.includes(company.israel_connection)) {
    // Other Israeli connection: YMT checks who may sign first; the owner who ran the search reviews it.
    return { status: 'needs_review', mandateId: runMandate.id, versionId: runMandate.version.id, ownerId: runMandate.owner_id, flags };
  }

  // Prefer the mandate that ran the search; otherwise the first other active mandate that covers the initiative.
  const candidates = [runMandate, ...mandates.filter((m) => m.id !== runMandate.id && m.status === 'active')];
  const mandate = candidates.find((m) => versionMatches(m.version, opportunity));
  if (!mandate) {
    return { status: 'manual_assignment', mandateId: null, versionId: null, ownerId: null, flags };
  }
  if (outsidePreferredSize(mandate.version, company)) flags.push('outside_preferred_size');
  if (mandate.owner_id === null) {
    return { status: 'manual_assignment', mandateId: mandate.id, versionId: mandate.version.id, ownerId: null, flags };
  }
  return { status: 'draft', mandateId: mandate.id, versionId: mandate.version.id, ownerId: mandate.owner_id, flags };
}
