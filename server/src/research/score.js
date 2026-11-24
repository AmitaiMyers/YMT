// The 0–100 score of the lead-finding agent spec (22.11.2026), with the scales approved on 24.11 (decisions 13–14).
// The AI only picks levels and cites evidence; this file turns levels into points, so a score is reproducible and every
// point can be traced. It is computed when read, because trigger age and contact verification change with time.

const DAY_MS = 86_400_000;
const FULL_TRIGGER_DAYS = 183;   // up to 6 months: full points
const HALF_TRIGGER_DAYS = 365;   // 6–12 months: half; older: background only
const CONTACT_FRESH_DAYS = 30;   // a role verified more than 30 days ago no longer counts as verified
const LOWER_PRIORITY_DEDUCTION = 10;

export const TIER_A = 80;
export const TIER_B = 65;

const SUBSECTOR_POINTS = { priority: 25, shepha_sector: 20, accepted_model: 12, distributor_or_service: 5, unknown: 0 };
const TRIGGER_POINTS = {
  distributor_search: 25, mou: 25, market_office_or_hire: 25, regulatory: 25,
  trade_show: 20, delegation: 20, job_posting: 18, statement: 10, none: 0,
};
const SERVICE_POINTS = { ready: 20, in_build: 12, in_review: 12, not_offered: 0 };
const OTHER_MANDATE_SERVICE_POINTS = 8;
// Official primary sources for the evidence-quality component (besides the company's own website).
const PRIMARY_SOURCE_DOMAINS = ['gov.il', 'tase.co.il', 'maya.tase.co.il', 'export.gov.il', 'mca.gov.in', 'zaubacorp.com', 'bis.gov.in', 'cdsco.gov.in'];
// Facts that decide a card: they should be confirmed by two independent sources.
const KEY_FACT_FIELDS = ['revenue', 'employees', 'israel_connection', 'export_proof'];

function ageInDays(date, now) {
  return (now.getTime() - Date.parse(date.length === 10 ? `${date}T00:00:00Z` : date)) / DAY_MS;
}

function hostOf(url) {
  return URL.canParse(url) ? new URL(url).hostname.toLowerCase().replace(/^www\./, '') : null;
}

function isPrimary(host, companyDomain) {
  if (host === null) return false;
  if (companyDomain && (host === companyDomain || host.endsWith(`.${companyDomain}`))) return true;
  return PRIMARY_SOURCE_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/** Trigger points × age (and 0 when a live-type trigger was found gone on the review day). */
export function triggerPoints(opportunity, now) {
  const kind = opportunity.trigger_kind ?? 'none';
  if (kind === 'none' || opportunity.trigger_live === 0) return { level: kind, points: 0, factor: 0 };
  const age = ageInDays(opportunity.evidence_date, now);
  const factor = age <= FULL_TRIGGER_DAYS ? 1 : age <= HALF_TRIGGER_DAYS ? 0.5 : 0;
  return { level: kind, points: TRIGGER_POINTS[kind] * factor, factor };
}

/** True for a verified trigger of the top two groups within 6 months: what "strong" means for a below-floor company. */
export function isStrongTrigger(opportunity, now) {
  const { points, factor } = triggerPoints(opportunity, now);
  return factor === 1 && points >= TRIGGER_POINTS.trade_show;
}

/** Decision-maker access from the people the agent proposed (or the owner confirmed). */
export function decisionMakerLevel(people, now) {
  const named = people.filter((person) => person.status !== 'dismissed');
  if (named.length === 0) return 'none';
  const withRoute = named.filter((person) => person.email || person.linkedin_url || person.phone);
  if (withRoute.length === 0) return 'named_no_route';
  const fresh = withRoute.some((person) => ageInDays(person.verified_at, now) <= CONTACT_FRESH_DAYS);
  return fresh ? 'verified_route' : 'route_unverified';
}
const DECISION_MAKER_POINTS = { verified_route: 20, route_unverified: 14, named_no_route: 8, general_route: 4, none: 0 };

/** Evidence quality from the cited facts of the company. */
export function evidenceLevel(facts, companyDomain) {
  if (facts.length === 0) return 'contradicting_or_missing';
  const hostsByField = new Map();
  for (const fact of facts) {
    if (!KEY_FACT_FIELDS.includes(fact.field)) continue;
    const hosts = hostsByField.get(fact.field) ?? new Set();
    hosts.add(hostOf(fact.url));
    hostsByField.set(fact.field, hosts);
  }
  if (hostsByField.size > 0 && [...hostsByField.values()].every((hosts) => hosts.size >= 2)) return 'two_sources';
  if (facts.some((fact) => isPrimary(hostOf(fact.url), companyDomain))) return 'primary_source';
  return 'secondary_only';
}
const EVIDENCE_POINTS = { two_sources: 10, primary_source: 7, secondary_only: 4, contradicting_or_missing: 0 };

/** Fit to our service: the mandate's own service (by its status), another mandate's, or none. */
export function serviceLevel(serviceCode, mandateServiceCodes, servicesByCode) {
  if (!serviceCode || !servicesByCode.has(serviceCode)) return { level: 'none', points: 0 };
  const service = servicesByCode.get(serviceCode);
  if (!mandateServiceCodes.includes(serviceCode)) return { level: 'other_mandate', points: OTHER_MANDATE_SERVICE_POINTS };
  return { level: service.status, points: SERVICE_POINTS[service.status] };
}

export function tierOf(total) {
  if (total >= TIER_A) return 'A';
  if (total >= TIER_B) return 'B';
  return 'C';
}

/**
 * @param {object} input
 * @param {object} input.opportunity row (trigger_kind, trigger_live, evidence_date, subsector_fit, service_code, flags)
 * @param {object[]} input.people contact proposals and confirmed contacts ({ status, email, linkedin_url, phone, verified_at })
 * @param {object[]} input.facts company facts ({ field, url })
 * @param {string|null} input.companyDomain
 * @param {string[]} input.mandateServiceCodes
 * @param {Map<string, object>} input.servicesByCode
 */
export function computeScore({ opportunity, people, facts, companyDomain, mandateServiceCodes, servicesByCode, now = new Date() }) {
  const trigger = triggerPoints(opportunity, now);
  const subsectorLevel = opportunity.subsector_fit ?? 'unknown';
  const dm = decisionMakerLevel(people, now);
  const service = serviceLevel(opportunity.service_code, mandateServiceCodes, servicesByCode);
  const evidence = evidenceLevel(facts, companyDomain);
  const parts = {
    subsector: { level: subsectorLevel, points: SUBSECTOR_POINTS[subsectorLevel], max: 25 },
    trigger: { level: trigger.level, points: trigger.points, factor: trigger.factor, max: 25 },
    decision_maker: { level: dm, points: DECISION_MAKER_POINTS[dm], max: 20 },
    service: { level: service.level, points: service.points, max: 20 },
    evidence: { level: evidence, points: EVIDENCE_POINTS[evidence], max: 10 },
  };
  const flags = JSON.parse(opportunity.flags);
  const deduction = flags.includes('lower_priority') ? LOWER_PRIORITY_DEDUCTION : 0;
  const sum = Object.values(parts).reduce((total, part) => total + part.points, 0);
  const total = Math.max(0, Math.round(sum - deduction));
  return { total, tier: tierOf(total), parts, deduction, has_trigger: trigger.points > 0 };
}
