// Executes one research run and one calibration. Every AI result is validated; only cited facts are stored;
// every card is a draft for its owner. Nothing is sent to anyone.

import { insert, update, findById, transaction, nowIso, audit } from '../db.js';
import { BudgetError } from '../ai/service.js';
import { findExistingCompany, normalizeDomain, normalizeUrl } from './classification.js';
import { assignOpportunity, isStale } from './assign.js';
import { loadMandates, findVersion } from './mandates.js';
import { entriesPerRun, pickEntries, recordChecks, matchEntry } from './watchLists.js';
import {
  discoverRequest, parseCandidates, parseCandidate, classifyRequest, parseClassification, judgeRequest, parseJudgement,
  InvalidResultError,
} from './tasks.js';

const DAY_MS = 86400000;
const KNOWN_COMPANIES_IN_PROMPT = 200;
// Candidates the discovery may return beyond the batch, to make up for ones that fail checks.
const EXTRA_CANDIDATES = 3;

const COMPANY_COLUMNS = ['parent_company', 'business_unit', 'israel_connection', 'incorporation_country', 'hq_country', 'model_primary',
  'model_secondary', 'sector', 'subsector', 'employees_min', 'employees_max', 'employees_as_of', 'revenue_usd_min', 'revenue_usd_max',
  'revenue_fiscal_year', 'revenue_basis', 'revenue_original', 'ownership'];

function knownCompanyNames(db) {
  return db.prepare('SELECT name, website FROM companies ORDER BY id DESC LIMIT ?').all(KNOWN_COMPANIES_IN_PROMPT)
    .map((row) => (normalizeDomain(row.website) ? `${row.name} (${normalizeDomain(row.website)})` : row.name));
}

function upsertSource(db, { url, title, publishedOn, kind }) {
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

/**
 * Classify, judge and store one candidate. Returns 'created' | 'duplicate' | 'filtered'.
 * AI calls happen before the database transaction, so a failed call never leaves half a card.
 */
async function processCandidate(db, ai, { run, runMandate, mandates, candidate, searchSources, now }) {
  const found = findExistingCompany(db, { website: candidate.website, name: candidate.companyName, hqCountry: 'Israel' });
  if (found && isKnownInitiative(db, found.company.id, candidate)) return 'duplicate';

  const classifyResult = await ai.call('classify', classifyRequest(candidate), { runId: run.id, now });
  const allowed = new Set([...searchSources, ...classifyResult.sources.map((s) => normalizeUrl(s.url)), normalizeUrl(candidate.sourceUrl)]);
  const classified = parseClassification(classifyResult.input, (url) => URL.canParse(url) && allowed.has(normalizeUrl(url)));

  const companyForJudge = { name: classified.company.entity_name ?? candidate.companyName, ...classified.company };
  const judgeResult = await ai.call('judge', judgeRequest({
    mandate: runMandate, version: runMandate.version, company: companyForJudge,
    evidence: { url: candidate.sourceUrl, date: candidate.publishedOn, quote: candidate.quote, businessNeed: candidate.businessNeed, targetCountry: candidate.targetCountry },
  }), { runId: run.id, now });
  const judgement = parseJudgement(judgeResult.input);
  if (judgement.verdict === 'no_match') return 'filtered';

  const assignment = assignOpportunity({
    runMandate, mandates, company: classified.company, verdict: judgement.verdict,
    opportunity: { targetCountry: candidate.targetCountry, needType: candidate.needType },
  });
  const sourceTitles = new Map(classifyResult.sources.map((s) => [normalizeUrl(s.url), s.title]));

  transaction(db, () => {
    const companyId = saveCompany(db, found ? found.company : null, candidate, classified.company);
    const evidenceSourceId = upsertSource(db, { url: candidate.sourceUrl, title: candidate.sourceTitle, publishedOn: candidate.publishedOn, kind: candidate.sourceKind });
    for (const fact of classified.facts) {
      const sourceId = upsertSource(db, { url: fact.sourceUrl, title: sourceTitles.get(normalizeUrl(fact.sourceUrl)) ?? null, publishedOn: null, kind: 'web' });
      insert(db, 'facts', { company_id: companyId, field: fact.field, value: fact.value, source_id: sourceId, quote: fact.quote, entity_covered: fact.entityCovered, run_id: run.id });
    }
    const flags = found && found.match === 'name' ? [...assignment.flags, 'possible_duplicate'] : assignment.flags;
    insert(db, 'opportunities', {
      company_id: companyId, mandate_id: assignment.mandateId, mandate_version_id: assignment.versionId, run_id: run.id,
      owner_id: assignment.ownerId, relationship_role: candidate.relationshipRole, target_country: candidate.targetCountry,
      need_type: candidate.needType, business_need: candidate.businessNeed, evidence_source_id: evidenceSourceId,
      evidence_date: candidate.publishedOn, evidence_quote: candidate.quote, verdict: judgement.verdict, verdict_reason: judgement.reason,
      reason_to_act: judgement.reasonToAct, proposed_service: judgement.proposedService ?? runMandate.version.proposed_service,
      unknowns: JSON.stringify([...new Set([...classified.unknowns, ...judgement.unknowns])]), flags: JSON.stringify(flags),
      status: assignment.status,
    });
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
        outcome = verifiable && listed && !isStale(candidate.publishedOn, base.freshness_days, now)
          ? await processCandidate(db, ai, { run, runMandate, mandates, candidate, searchSources, now })
          : 'filtered';
      } catch (error) {
        if (!(error instanceof InvalidResultError)) throw error;
        outcome = 'filtered';
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
            mandate, version, company: { name: example.company_name, ...example },
            evidence: { url: example.evidence_url, date: example.evidence_date, quote: example.evidence_quote, businessNeed: example.business_need, targetCountry: example.target_country },
          }), { calibrationId, now });
          verdict = parseJudgement(judged.input).verdict;
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
