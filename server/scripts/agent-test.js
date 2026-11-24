// Agent test (task 7, week of 22.11.2026): run the real lead-finding agent on the 10 test companies of the
// specification "Lead-finding agent · YMT Development Partnerships" and compare each result with the expected decision.
// The agent runs the same steps as a research run (find the initiative → classify with cited facts → judge against the
// mandate) but every step is recorded, including the rejections that a normal run drops.
// Nothing is stored: it uses an in-memory database. Needs ANTHROPIC_API_KEY (in ../.env or the environment).
// Usage (repository root): npm run agent:test   → prints a table and writes agent-test-results.json

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { openDatabase } from '../src/db.js';
import { createAiService, spentThisMonth } from '../src/ai/service.js';
import { createClaudeProvider } from '../src/ai/claude.js';
import { normalizeUrl } from '../src/research/classification.js';
import { loadMandates } from '../src/research/mandates.js';
import { loadServices } from '../src/research/catalogue.js';
import { disqualify, sizeGate } from '../src/research/runner.js';
import {
  discoverRequest, parseCandidates, parseCandidate, classifyRequest, parseClassification, judgeRequest, parseJudgement, InvalidResultError,
} from '../src/research/tasks.js';
import { repoRoot } from '../src/config.js';

const DAY_MS = 86_400_000;
const TRIGGER_MONTHS = 12; // the spec: up to 6 months full score, 6–12 half, older is background only

// The 10 test companies and the decision the specification expects.
const TEST_COMPANIES = [
  { name: 'Magen eco-Energy', expected: 'Accept', why: 'Manufacturer considering India after an earlier failed attempt; reached a price proposal' },
  { name: 'Cortex Dental', expected: 'Accept', why: 'Has been looking for an Indian distributor for months; two distributors fell over price. Strong trigger, below floor' },
  { name: 'Crow', expected: 'Accept', why: 'Good conversation; the CEO asked for a proposal' },
  { name: 'Tomorrow.io', expected: 'Accept', why: 'Looking for serious partners in India; the CEO approved new regions' },
  { name: 'Kornit Digital', expected: 'Defer', why: 'Interested in India strategically, not in a hurry; come back in a quarter' },
  { name: 'ARAN Packaging', expected: 'Defer', why: 'Gives priority to its exclusive agent' },
  { name: 'Ceragon', expected: 'Reject', why: 'India is already its largest market' },
  { name: 'Phinergy', expected: 'Reject', why: 'Already has a JV with India\'s state oil company' },
  { name: 'Gaash Lighting', expected: 'Reject', why: 'No export, and the company was recently sold' },
  { name: 'Highcon', expected: 'Reject', why: 'Insolvency; operations moved abroad' },
];

// The agent's verdict expressed in the review decisions of the specification.
const AGENT_DECISION = { match: 'Accept', weak: 'Verify', defer: 'Defer', no_match: 'Reject' };

function agrees(expected, agent) {
  if (agent === 'Needs review') return expected === 'Reject' ? 'safe' : 'no';
  return expected === agent ? 'yes' : 'no';
}

async function testCompany(ai, { mandate, services }, company, now) {
  const publishedAfter = new Date(now.getTime() - TRIGGER_MONTHS * 30 * DAY_MS).toISOString().slice(0, 10);
  const discovery = await ai.call('discover', discoverRequest({
    mandate, version: mandate.version, batchSize: 1, knownCompanies: [], publishedAfter, watchCompanies: [{ name: company.name }],
  }));
  const searchSources = new Set(discovery.sources.map((source) => normalizeUrl(source.url)));
  const raw = parseCandidates(discovery.input)[0];
  if (!raw) return { agent: 'Needs review', stage: 'find', reason: 'No dated India initiative found in public sources from the last 12 months' };

  let candidate;
  try {
    candidate = parseCandidate(raw, now);
  } catch (error) {
    if (!(error instanceof InvalidResultError)) throw error;
    return { agent: 'Needs review', stage: 'find', reason: `The search result broke the rules and was dropped: ${error.message}` };
  }
  const evidence = { url: candidate.sourceUrl, date: candidate.publishedOn, quote: candidate.quote, businessNeed: candidate.businessNeed, targetCountry: candidate.targetCountry };
  if (!searchSources.has(normalizeUrl(candidate.sourceUrl))) {
    return { agent: 'Needs review', stage: 'find', evidence, reason: 'The source link was not among the pages the search returned (possibly invented), so it was dropped' };
  }

  const classifyResult = await ai.call('classify', classifyRequest(candidate));
  const allowed = new Set([...searchSources, ...classifyResult.sources.map((source) => normalizeUrl(source.url)), normalizeUrl(candidate.sourceUrl)]);
  const classified = parseClassification(classifyResult.input, (url) => URL.canParse(url) && allowed.has(normalizeUrl(url)));
  const profile = classified.company;
  const companyView = { name: profile.entity_name ?? candidate.companyName, ...profile, markets: classified.markets };
  const disqualified = disqualify(profile, classified.markets, candidate.targetCountry);
  if (disqualified) {
    return { agent: 'Reject', stage: 'disqualify', reason: `${disqualified.reason}${disqualified.detail ? ` (${disqualified.detail})` : ''}`, evidence, markets: classified.markets };
  }
  const judged = parseJudgement((await ai.call('judge', judgeRequest({ mandate, version: mandate.version, evidence, company: companyView, services }))).input,
    services.map((service) => service.code));
  const size = sizeGate(mandate.version, profile, judged, candidate.publishedOn, now);
  if (size.drop && judged.verdict !== 'no_match') {
    return { agent: 'Reject', stage: 'size', reason: `${size.drop}: ${judged.reason}`, evidence, verdict: judged.verdict };
  }

  return {
    agent: AGENT_DECISION[judged.verdict],
    stage: 'judge',
    verdict: judged.verdict,
    reason: judged.reason,
    reason_to_act: judged.reasonToAct,
    proposed_service: judged.proposedService,
    service_code: judged.serviceCode,
    trigger: { kind: judged.triggerKind, strength: judged.triggerStrength },
    subsector_fit: judged.subsectorFit,
    below_floor: size.belowFloor,
    markets: classified.markets,
    unknowns: [...new Set([...classified.unknowns, ...judged.unknowns])],
    evidence,
    profile: {
      website: candidate.website ?? classified.company.website ?? null,
      israel_connection: classified.company.israel_connection,
      hq_country: classified.company.hq_country,
      sector: classified.company.sector,
      subsector: classified.company.subsector,
      employees: [classified.company.employees_min, classified.company.employees_max],
      revenue_usd: [classified.company.revenue_usd_min, classified.company.revenue_usd_max],
    },
    facts: classified.facts.map((fact) => ({ field: fact.field, value: fact.value, quote: fact.quote, source: fact.sourceUrl })),
  };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Set ANTHROPIC_API_KEY (for example in the .env file in the repository root) and run again');
  const db = openDatabase(':memory:');
  const ai = createAiService(db, { claude: createClaudeProvider({ client: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) }) });
  const now = new Date();
  // SH1 exactly as seeded from the specification of 22.11.2026 (floor, false positives, services).
  const mandate = loadMandates(db).find((m) => m.code === 'SH1');
  const services = loadServices(db);
  const results = [];
  for (const company of TEST_COMPANIES) {
    process.stdout.write(`${company.name} … `);
    const result = await testCompany(ai, { mandate, services }, company, now);
    const row = { company: company.name, expected: company.expected, expected_why: company.why, ...result, agrees: agrees(company.expected, result.agent) };
    results.push(row);
    console.log(`${row.agent} (expected ${row.expected}, agrees: ${row.agrees})`);
  }
  const cost = spentThisMonth(db, now);
  const output = { ran_at: now.toISOString(), mandate: { code: mandate.code, name: mandate.name }, mandate_version: mandate.version, cost_usd: Number(cost.toFixed(3)), results };
  const file = path.join(repoRoot, 'agent-test-results.json');
  writeFileSync(file, `${JSON.stringify(output, null, 2)}\n`);
  console.table(results.map((row) => ({ company: row.company, expected: row.expected, agent: row.agent, agrees: row.agrees })));
  console.log(`Cost: $${cost.toFixed(2)}. Full results (evidence, facts, reasons): ${file}`);
}

await main();
