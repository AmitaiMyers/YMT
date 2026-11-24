// Executes one research run and one calibration. Every AI result is validated; only cited facts are stored;
// every card is a draft for its owner. Nothing is sent to anyone.

import { insert, update, findById, transaction, nowIso, audit } from '../db.js';
import { BudgetError } from '../ai/service.js';
import { findExistingCompany, normalizeDomain, normalizeUrl, normalizeName } from './classification.js';
import { assignOpportunity, isStale } from './assign.js';
import { findExclusion } from './exclusions.js';
import { isStrongTrigger } from './score.js';
import { loadServices } from './catalogue.js';
import { contactKeywordsFor, marketOf } from './spec.js';
import { loadMandates, findVersion } from './mandates.js';
import { entriesPerRun, pickEntries, recordChecks, matchEntry } from './watchLists.js';
import {
  discoverRequest, parseCandidates, parseCandidate, classifyRequest, parseClassification, judgeRequest, parseJudgement,
  InvalidResultError, contactsRequest, parseContacts, parseContact, MAX_CONTACTS,
} from './tasks.js';

const DAY_MS = 86400000;
const KNOWN_COMPANIES_IN_PROMPT = 200;
// Candidates the discovery may return beyond the batch, to make up for ones that fail checks.
const EXTRA_CANDIDATES = 3;

const COMPANY_COLUMNS = ['parent_company', 'business_unit', 'israel_connection', 'incorporation_country', 'hq_country', 'model_primary',
  'model_secondary', 'sector', 'subsector', 'employees_min', 'employees_max', 'employees_as_of', 'revenue_usd_min', 'revenue_usd_max',
  'revenue_fiscal_year', 'revenue_basis', 'revenue_original', 'ownership', 'export_proof', 'registry_number', 'description'];
// Decision 3 (24.11): "enters from 10 employees when revenue is unknown" applies to mandates without an employee range.
const MIN_EMPLOYEES_WITHOUT_RANGE = 10;
// Market statuses that make the company the wrong buyer for an entry mandate (decision 5).
const ESTABLISHED_STATUSES = ['established', 'main_market'];

function knownCompanyNames(db) {
  return db.prepare('SELECT name, website FROM companies ORDER BY id DESC LIMIT ?').all(KNOWN_COMPANIES_IN_PROMPT)
    .map((row) => (normalizeDomain(row.website) ? `${row.name} (${normalizeDomain(row.website)})` : row.name));
}

/** The stored source for a URL (one row per canonical URL). */
export function upsertSource(db, { url, title, publishedOn, kind }) {
  const canonical = normalizeUrl(url);
  const existing = db.prepare('SELECT id FROM sources WHERE url = ?').get(canonical);
  if (existing) return existing.id;
  return insert(db, 'sources', { url: canonical, title, published_on: publishedOn, kind });
}

function exactValue(min, max) {
  return min !== null && min === max ? min : null;
}

/** New company from a classification, or fill only the empty columns of an existing one (never overwrite). */
function saveCompany(db, existing, candidate, classified) {
  const values = Object.fromEntries(COMPANY_COLUMNS.map((column) => [column, classified[column]]));
  values.customer_types = JSON.stringify(classified.customer_types);
  values.customer_markets = JSON.stringify(classified.customer_markets);
  if (!existing) {
    return insert(db, 'companies', {
      ...values,
      name: classified.entity_name ?? candidate.companyName,
      industry: classified.subsector ?? classified.sector ?? 'unknown',
      country: classified.hq_country ?? 'unknown',
      website: candidate.website ?? classified.website,
      employee_count: exactValue(classified.employees_min, classified.employees_max),
      annual_revenue_usd: exactValue(classified.revenue_usd_min, classified.revenue_usd_max),
      origin: 'research',
    });
  }
  const current = findById(db, 'companies', existing.id);
  const fill = {};
  for (const [column, value] of Object.entries(values)) {
    const empty = current[column] === null || current[column] === '[]';
    if (empty && value !== null && value !== '[]') fill[column] = value;
  }
  if (Object.keys(fill).length > 0) update(db, 'companies', existing.id, { ...fill, updated_at: nowIso() });
  return existing.id;
}

/** True when this company already has this initiative (same source, or an open card for the same need and country). */
function isKnownInitiative(db, companyId, candidate) {
  const sameSource = db.prepare(`SELECT 1 FROM opportunities o JOIN sources s ON s.id = o.evidence_source_id
    WHERE o.company_id = ? AND s.url = ?`).get(companyId, normalizeUrl(candidate.sourceUrl));
  if (sameSource) return true;
  return Boolean(db.prepare(`SELECT 1 FROM opportunities WHERE company_id = ? AND need_type = ? AND lower(target_country) = lower(?)
    AND status IN ('draft', 'needs_review', 'manual_assignment', 'accepted', 'verify')`).get(companyId, candidate.needType, candidate.targetCountry));
}

/** Queue (or re-queue) the decision-maker search for a card. Spec step 5: it runs before the review, for every new card. */
export function queueContactSearch(db, opportunityId, userId) {
  const existing = db.prepare('SELECT id, status FROM contact_searches WHERE opportunity_id = ?').get(opportunityId);
  if (!existing) {
    insert(db, 'contact_searches', { opportunity_id: opportunityId, requested_by: userId });
    return;
  }
  if (existing.status === 'queued' || existing.status === 'running') return;
  update(db, 'contact_searches', existing.id, { status: 'queued', error: null, requested_by: userId, finished_at: null });
}

/** The run log of a company that did not become a card. */
function recordDrop(db, runId, candidate, reason, detail = null) {
  insert(db, 'run_drops', {
    run_id: runId, company_name: candidate.companyName, website: candidate.website ?? null, reason, detail, source_url: candidate.sourceUrl ?? null,
  });
  return 'filtered';
}

function knownSize(min, max) {
  return max ?? min;
}

/**
 * New companies only (the bank keeps its companies whatever the threshold): below the mandate's minimum they do not enter;
 * between the minimum and the revenue floor they enter only with a strong trigger, flagged "below floor".
 * Returns { drop: reason | null, belowFloor: boolean }.
 */
export function sizeGate(version, company, judgement, evidenceDate, now) {
  const revenue = knownSize(company.revenue_usd_min, company.revenue_usd_max);
  if (revenue !== null) {
    if (version.revenue_min_usd !== null && revenue < version.revenue_min_usd) return { drop: 'below_minimum', belowFloor: false };
    if (version.revenue_floor_usd !== null && revenue < version.revenue_floor_usd) {
      const strong = isStrongTrigger({ trigger_kind: judgement.triggerKind, trigger_live: null, evidence_date: evidenceDate }, now);
      return strong ? { drop: null, belowFloor: true } : { drop: 'below_floor', belowFloor: false };
    }
    return { drop: null, belowFloor: false };
  }
  const employees = knownSize(company.employees_min, company.employees_max);
  const minimum = version.employees_min ?? MIN_EMPLOYEES_WITHOUT_RANGE;
  if (employees !== null && employees < minimum) return { drop: 'below_minimum', belowFloor: false };
  return { drop: null, belowFloor: false };
}

function targetMarketEntry(markets, targetCountry) {
  const market = marketOf(targetCountry);
  return market ? markets.find((entry) => entry.market === market) : undefined;
}

/**
 * The disqualifiers of the spec (no Israeli connection, no proven export) and the market rule of decision 5
 * (own presence or largest market in the target country). Returns { reason, detail } or null.
 */
export function disqualify(profile, markets, targetCountry) {
  if (profile.israel_connection === 'none') return { reason: 'no_israeli_connection', detail: null };
  if (profile.export_proof === 'none') return { reason: 'no_export', detail: null };
  const entry = targetMarketEntry(markets, targetCountry);
  if (entry && ESTABLISHED_STATUSES.includes(entry.status)) {
    return { reason: 'already_established', detail: `${entry.market}: ${entry.status}${entry.note ? ` – ${entry.note}` : ''}` };
  }
  return null;
}

function hasRejection(db, companyId) {
  return Boolean(db.prepare("SELECT 1 FROM opportunities WHERE company_id = ? AND status = 'rejected'").get(companyId));
}

function saveMarkets(db, companyId, markets) {
  const existing = db.prepare('SELECT id, status FROM company_markets WHERE company_id = ? AND market = ?');
  for (const entry of markets) {
    const row = existing.get(companyId, entry.market);
    if (row && entry.status === 'unknown' && row.status !== 'unknown') continue; // never replace a sourced status with "unknown"
    const sourceId = entry.sourceUrl ? upsertSource(db, { url: entry.sourceUrl, title: null, publishedOn: null, kind: 'web' }) : null;
    const values = { status: entry.status, fit: entry.fit, note: entry.note, source_id: sourceId, checked_at: nowIso() };
    if (row) update(db, 'company_markets', row.id, values);
    else insert(db, 'company_markets', { company_id: companyId, market: entry.market, ...values });
  }
}

function saveAliases(db, companyId, names, sourceUrl) {
  const add = db.prepare('INSERT OR IGNORE INTO company_aliases (company_id, name, name_key, source_url) VALUES (?, ?, ?, ?)');
  for (const name of names) {
    const key = normalizeName(name);
    if (key) add.run(companyId, name, key, sourceUrl);
  }
}

/**
 * Classify, judge and store one candidate. Returns 'created' | 'duplicate' | 'filtered'.
 * AI calls happen before the database transaction, so a failed call never leaves half a card.
 */
async function processCandidate(db, ai, { run, runMandate, mandates, candidate, searchSources, services, now }) {
  // Step 2, before any AI cost: SHEPHA's exclusion list and the company bank.
  if (findExclusion(db, { name: candidate.companyName, website: candidate.website })) return recordDrop(db, run.id, candidate, 'shepha_exclusion');
  const foundFirst = findExistingCompany(db, { website: candidate.website, name: candidate.companyName, hqCountry: 'Israel' });
  if (foundFirst && isKnownInitiative(db, foundFirst.company.id, candidate)) return 'duplicate';

  // Steps 3–4: classify and verify, with a cited source for every value.
  const classifyResult = await ai.call('classify', classifyRequest(candidate), { runId: run.id, now });
  const allowed = new Set([...searchSources, ...classifyResult.sources.map((s) => normalizeUrl(s.url)), normalizeUrl(candidate.sourceUrl)]);
  const classified = parseClassification(classifyResult.input, (url) => URL.canParse(url) && allowed.has(normalizeUrl(url)));
  const profile = classified.company;
  const identity = {
    name: profile.entity_name ?? candidate.companyName, website: candidate.website ?? profile.website,
    registryNumber: profile.registry_number, otherNames: classified.otherNames,
  };

  if (findExclusion(db, identity)) return recordDrop(db, run.id, candidate, 'shepha_exclusion');
  const disqualified = disqualify(profile, classified.markets, candidate.targetCountry);
  if (disqualified) return recordDrop(db, run.id, candidate, disqualified.reason, disqualified.detail);
  const marketEntry = targetMarketEntry(classified.markets, candidate.targetCountry);
  const found = foundFirst ?? findExistingCompany(db, { ...identity, hqCountry: profile.hq_country ?? 'Israel' });
  if (found && isKnownInitiative(db, found.company.id, candidate)) return 'duplicate';

  // Step 6: recommendation against the mandate.
  const companyForJudge = { name: identity.name, ...profile, markets: classified.markets };
  const judgeResult = await ai.call('judge', judgeRequest({
    mandate: runMandate, version: runMandate.version, company: companyForJudge, services,
    evidence: { url: candidate.sourceUrl, date: candidate.publishedOn, quote: candidate.quote, businessNeed: candidate.businessNeed, targetCountry: candidate.targetCountry },
  }), { runId: run.id, now });
  const judgement = parseJudgement(judgeResult.input, services.map((service) => service.code));
  if (judgement.verdict === 'no_match') return recordDrop(db, run.id, candidate, 'not_a_match', judgement.reason);
  const size = found ? { drop: null, belowFloor: false } : sizeGate(runMandate.version, profile, judgement, candidate.publishedOn, now);
  if (size.drop) return recordDrop(db, run.id, candidate, size.drop);

  const assignment = assignOpportunity({
    runMandate, mandates, company: profile, verdict: judgement.verdict,
    opportunity: { targetCountry: candidate.targetCountry, needType: candidate.needType },
  });
  const sourceTitles = new Map(classifyResult.sources.map((s) => [normalizeUrl(s.url), s.title]));
  const flags = [
    ...assignment.flags,
    ...(found && found.match === 'name' ? ['possible_duplicate'] : []),
    ...(size.belowFloor ? ['below_floor'] : []),
    ...(marketEntry && marketEntry.status === 'distributor' && judgement.verdict !== 'defer' ? ['lower_priority'] : []),
    ...(found && hasRejection(db, found.company.id) ? ['rejected_before'] : []),
  ];

  transaction(db, () => {
    const companyId = saveCompany(db, found ? found.company : null, candidate, profile);
    const evidenceSourceId = upsertSource(db, { url: candidate.sourceUrl, title: candidate.sourceTitle, publishedOn: candidate.publishedOn, kind: candidate.sourceKind });
    for (const fact of classified.facts) {
      const sourceId = upsertSource(db, { url: fact.sourceUrl, title: sourceTitles.get(normalizeUrl(fact.sourceUrl)) ?? null, publishedOn: null, kind: 'web' });
      insert(db, 'facts', { company_id: companyId, field: fact.field, value: fact.value, source_id: sourceId, quote: fact.quote, entity_covered: fact.entityCovered, run_id: run.id });
    }
    saveAliases(db, companyId, classified.otherNames, (classified.facts.find((fact) => fact.field === 'other_names') ?? { sourceUrl: null }).sourceUrl);
    saveMarkets(db, companyId, classified.markets);
    const id = insert(db, 'opportunities', {
      company_id: companyId, mandate_id: assignment.mandateId, mandate_version_id: assignment.versionId, run_id: run.id,
      owner_id: assignment.ownerId, relationship_role: candidate.relationshipRole, target_country: candidate.targetCountry,
      need_type: candidate.needType, business_need: candidate.businessNeed, evidence_source_id: evidenceSourceId,
      evidence_date: candidate.publishedOn, evidence_quote: candidate.quote, verdict: judgement.verdict, verdict_reason: judgement.reason,
      reason_to_act: judgement.reasonToAct, proposed_service: judgement.proposedService ?? runMandate.version.proposed_service,
      trigger_kind: judgement.triggerKind, trigger_strength: judgement.triggerStrength, subsector_fit: judgement.subsectorFit,
      service_code: judgement.serviceCode, originator: `agent:${runMandate.code}`,
      unknowns: JSON.stringify([...new Set([...classified.unknowns, ...judgement.unknowns])]), flags: JSON.stringify(flags),
      status: assignment.status,
    });
    queueContactSearch(db, id, run.requested_by);
  });
  return 'created';
}

function finishRun(db, runId, values) {
  const cost = db.prepare('SELECT COALESCE(SUM(cost_usd), 0) AS total FROM ai_usage WHERE run_id = ?').get(runId).total;
  update(db, 'research_runs', runId, { ...values, cost_usd: cost, finished_at: nowIso() });
}

/** Run one queued research run to the end. Budget exhaustion pauses it ('waiting_budget'); other errors fail it. */
export async function executeRun(db, ai, runId, now = new Date()) {
  const run = findById(db, 'research_runs', runId);
  update(db, 'research_runs', runId, { status: 'running', started_at: nowIso(), error: null });
  const stats = { candidates_found: 0, cards_created: 0, duplicates: 0, filtered: 0, companies_checked: 0 };

  try {
    const mandates = loadMandates(db);
    const base = mandates.find((m) => m.id === run.mandate_id);
    if (!base) throw new Error(`Mandate #${run.mandate_id} not found`);
    const runMandate = { ...base, version: findVersion(db, run.mandate_version_id) };
    const services = loadServices(db);
    const publishedAfter = new Date(now.getTime() - base.freshness_days * DAY_MS).toISOString().slice(0, 10);

    const watched = run.watch_list_id === null ? null : pickEntries(db, run.watch_list_id, base.id, entriesPerRun(run.batch_size));
    if (watched !== null && watched.length === 0) throw new Error('The watch list has no companies');
    const discovery = await ai.call('discover', discoverRequest({
      mandate: runMandate, version: runMandate.version, batchSize: run.batch_size, knownCompanies: knownCompanyNames(db), publishedAfter,
      watchCompanies: watched,
    }), { runId, now });
    if (watched !== null) {
      recordChecks(db, watched, base.id, runId, now); // checked even when nothing was found, so the rotation moves on
      stats.companies_checked = watched.length;
    }
    const searchSources = new Set(discovery.sources.map((s) => normalizeUrl(s.url)));
    const rawCandidates = parseCandidates(discovery.input).slice(0, run.batch_size + EXTRA_CANDIDATES);
    stats.candidates_found = rawCandidates.length;

    for (const raw of rawCandidates) {
      if (stats.cards_created >= run.batch_size) break;
      let outcome;
      try {
        // A result that breaks the contract is counted and skipped; it must not stop the rest of the batch.
        // Only InvalidResultError is handled here: AI, budget and database errors still stop the run.
        const parsed = parseCandidate(raw, now);
        const entry = watched === null ? null : matchEntry(watched, parsed);
        // Watch-list runs report listed companies only; the listed website fills in when the search gave none.
        const candidate = entry && !parsed.website ? { ...parsed, website: entry.website } : parsed;
        const listed = watched === null || entry !== null;
        const verifiable = searchSources.has(normalizeUrl(candidate.sourceUrl)); // else the URL may be invented
        if (!listed) outcome = 'filtered';
        else if (!verifiable) outcome = recordDrop(db, runId, candidate, 'unverifiable_source');
        else if (isStale(candidate.publishedOn, base.freshness_days, now)) outcome = recordDrop(db, runId, candidate, 'stale', candidate.publishedOn);
        else outcome = await processCandidate(db, ai, { run, runMandate, mandates, candidate, searchSources, services, now });
      } catch (error) {
        if (!(error instanceof InvalidResultError)) throw error;
        outcome = recordDrop(db, runId, { companyName: typeof raw.company_name === 'string' ? raw.company_name : 'unknown', website: null, sourceUrl: null }, 'invalid_result', error.message);
      }
      if (outcome === 'created') stats.cards_created += 1;
      if (outcome === 'duplicate') stats.duplicates += 1;
      if (outcome === 'filtered') stats.filtered += 1;
    }
    finishRun(db, runId, { ...stats, status: 'done' });
  } catch (error) {
    const status = error instanceof BudgetError ? 'waiting_budget' : 'failed';
    finishRun(db, runId, { ...stats, status, error: error.message });
    audit(db, null, `research.run_${status}`, 'research_runs', runId, error.message);
  }
}

// ------------------------------------------------------------------ calibration

function inScope(version, opportunity) {
  return version.target_countries.some((c) => c.toLowerCase() === opportunity.target_country.toLowerCase())
    && version.need_types.includes(opportunity.need_type);
}

function isCorrect(label, row) {
  const selected = row.inScope && row.verdict !== 'no_match';
  return label === 'good' ? selected : !selected;
}

/** Judge every saved example with both versions and store the before/after rows. */
export async function executeCalibration(db, ai, calibrationId, now = new Date()) {
  const calibration = findById(db, 'calibrations', calibrationId);
  update(db, 'calibrations', calibrationId, { status: 'running', error: null });
  try {
    const mandate = findById(db, 'mandates', calibration.mandate_id);
    const versions = { before: findVersion(db, calibration.from_version_id), after: findVersion(db, calibration.to_version_id) };
    const services = loadServices(db);
    const examples = db.prepare(`SELECT e.label, e.note, o.*, c.name AS company_name, c.israel_connection, c.sector, c.employees_min,
        c.employees_max, c.revenue_usd_min, c.revenue_usd_max, s.url AS evidence_url
      FROM calibration_examples e JOIN opportunities o ON o.id = e.opportunity_id
      JOIN companies c ON c.id = o.company_id JOIN sources s ON s.id = o.evidence_source_id
      WHERE e.mandate_id = ? ORDER BY e.id`).all(calibration.mandate_id);

    const rows = [];
    for (const example of examples) {
      const result = {};
      for (const [side, version] of Object.entries(versions)) {
        const reuse = side === 'before' && example.mandate_version_id === version.id && example.verdict !== null;
        let verdict = example.verdict;
        if (!reuse) {
          const judged = await ai.call('judge', judgeRequest({
            mandate, version, services, company: { name: example.company_name, ...example },
            evidence: { url: example.evidence_url, date: example.evidence_date, quote: example.evidence_quote, businessNeed: example.business_need, targetCountry: example.target_country },
          }), { calibrationId, now });
          verdict = parseJudgement(judged.input, services.map((service) => service.code)).verdict;
        }
        result[side] = { verdict, inScope: inScope(version, example) };
      }
      rows.push({
        opportunity_id: example.id, company: example.company_name, label: example.label,
        before: { ...result.before, correct: isCorrect(example.label, result.before) },
        after: { ...result.after, correct: isCorrect(example.label, result.after) },
      });
    }
    const cost = db.prepare('SELECT COALESCE(SUM(cost_usd), 0) AS total FROM ai_usage WHERE calibration_id = ?').get(calibrationId).total;
    update(db, 'calibrations', calibrationId, { status: 'done', rows: JSON.stringify(rows), cost_usd: cost, finished_at: nowIso() });
  } catch (error) {
    const status = error instanceof BudgetError ? 'waiting_budget' : 'failed';
    update(db, 'calibrations', calibrationId, { status, error: error.message, finished_at: nowIso() });
  }
}

// ------------------------------------------------------------------ decision makers (Release 2)

/**
 * Store people as decision-maker proposals on a card, for the owner to confirm. People already at the company (contacts
 * or earlier proposals, by name) are skipped. Returns how many were added.
 * @param {{ fullName: string, jobTitle: string|null, email: string|null, linkedinUrl: string|null, sourceUrl: string, quote: string }[]} people
 * @param {'web'|'list'} sourceKind web = found by the AI's search; list = from a data provider (Apollo, Lusha)
 */
export function proposeContacts(db, opportunity, people, sourceKind) {
  const known = new Set([
    ...db.prepare('SELECT full_name FROM contacts WHERE company_id = ?').all(opportunity.company_id).map((c) => normalizeName(c.full_name)),
    ...db.prepare('SELECT name_key FROM contact_proposals WHERE company_id = ?').all(opportunity.company_id).map((p) => p.name_key),
  ]);
  let added = 0;
  for (const person of people) {
    const nameKey = normalizeName(person.fullName);
    if (nameKey === '' || known.has(nameKey)) continue;
    known.add(nameKey);
    const sourceId = upsertSource(db, { url: person.sourceUrl, title: null, publishedOn: null, kind: sourceKind });
    insert(db, 'contact_proposals', {
      opportunity_id: opportunity.id, company_id: opportunity.company_id, full_name: person.fullName, name_key: nameKey, job_title: person.jobTitle ?? '',
      email: person.email, linkedin_url: person.linkedinUrl, source_id: sourceId, quote: person.quote,
    });
    added += 1;
  }
  return added;
}

/** Search for decision makers of an accepted card and store them as proposals for the owner to confirm. */
export async function executeContactSearch(db, ai, searchId, now = new Date()) {
  const search = findById(db, 'contact_searches', searchId);
  update(db, 'contact_searches', searchId, { status: 'running', error: null });
  try {
    const opportunity = findById(db, 'opportunities', search.opportunity_id);
    const company = findById(db, 'companies', opportunity.company_id);
    const evidence = findById(db, 'sources', opportunity.evidence_source_id);
    const mandate = opportunity.mandate_id ? findById(db, 'mandates', opportunity.mandate_id) : null;
    const keywords = contactKeywordsFor(mandate ? mandate.code : null);
    const result = await ai.call('contacts', contactsRequest({ company, opportunity, proposedService: opportunity.proposed_service, keywords }), { contactSearchId: searchId, now });
    const allowed = new Set([...result.sources.map((s) => normalizeUrl(s.url)), normalizeUrl(evidence.url)]);
    const isAllowed = (url) => URL.canParse(url) && allowed.has(normalizeUrl(url));
    const people = [];
    for (const raw of parseContacts(result.input).slice(0, MAX_CONTACTS)) {
      try {
        people.push(parseContact(raw, isAllowed)); // a person without a usable source is skipped, not the whole search
      } catch (error) {
        if (!(error instanceof InvalidResultError)) throw error;
      }
    }
    const found = proposeContacts(db, opportunity, people, 'web');
    const cost = db.prepare('SELECT COALESCE(SUM(cost_usd), 0) AS total FROM ai_usage WHERE contact_search_id = ?').get(searchId).total;
    update(db, 'contact_searches', searchId, { status: 'done', found, cost_usd: cost, finished_at: nowIso() });
  } catch (error) {
    const status = error instanceof BudgetError ? 'waiting_budget' : 'failed';
    update(db, 'contact_searches', searchId, { status, error: error.message, finished_at: nowIso() });
  }
}
