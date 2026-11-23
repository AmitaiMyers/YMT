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
import {
  discoverRequest, parseCandidates, parseCandidate, classifyRequest, parseClassification, judgeRequest, parseJudgement, InvalidResultError,
} from '../src/research/tasks.js';
import { repoRoot } from '../src/config.js';

const M = 1_000_000;
const DAY_MS = 86_400_000;
const TRIGGER_MONTHS = 12; // the spec: up to 6 months full score, 6–12 half, older is background only

// SH1 as written in the specification of 22.11.2026 (mandate table, foundation definitions, disqualification rules).
const SH1 = { code: 'SH1', name: 'India: market entry, distribution, commercial partnerships, expansion' };
const SH1_SPEC_VERSION = {
  target_countries: ['India'],
  need_types: ['market_entry_distribution'],
  accept_rule: 'An Israeli company (HQ in Israel, or an Israeli business unit of a foreign group) with a proven export product names a '
    + 'current India initiative: a distributor or partner search, an India trade show or delegation it confirmed, an India office or hire, '
    + 'or an Indian regulatory registration. Companies already in India that want to expand also count, at a lower priority. '
    + 'New companies start from about USD 30M annual revenue; USD 10–30M only with a strong trigger (mark "below floor"). '
    + 'Priority areas: software, defence and dual-use, plastics manufacturing.',
  false_positives: [
    'General interest in Asia with no named India initiative (Verify, not Reject)',
    'India is already the company\'s largest market, with its own offices there (no entry need)',
    'The company already has a joint venture with an Indian (state-owned) company in this field',
    'The company already signed a distributor or an MoU in India (Defer: fits, but not now)',
    'An Indian company or factory offering its services or capacity (a supplier, not a client)',
    'No proven export, the company was sold or closed, or its operations moved abroad',
    'A trade show the company did not itself confirm, or an industry-level trend',
  ],
  employees_min: 50, employees_max: 249, revenue_min_usd: 10 * M, revenue_max_usd: 100 * M,
  sectors: [],
  search_terms: ['India distributor', 'Indian market entry', 'India partner', 'expands to India', 'India trade show', 'BIS certification', 'CDSCO registration'],
  exclusions: ['Companies on the SHEPHA exclusion list'],
  proposed_service: 'Connection to a distributor or local partner in India (1–3 screened candidates and an introduction meeting), with SHEPHA',
};

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
const AGENT_DECISION = { match: 'Accept', weak: 'Verify', no_match: 'Reject' };

function agrees(expected, agent) {
  if (agent === 'Needs review') return expected === 'Reject' ? 'safe' : 'no';
  if (expected === 'Defer') return agent === 'Verify' ? 'close' : 'no';
  return expected === agent ? 'yes' : 'no';
}

async function testCompany(ai, company, now) {
  const publishedAfter = new Date(now.getTime() - TRIGGER_MONTHS * 30 * DAY_MS).toISOString().slice(0, 10);
  const discovery = await ai.call('discover', discoverRequest({
    mandate: SH1, version: SH1_SPEC_VERSION, batchSize: 1, knownCompanies: [], publishedAfter, watchCompanies: [{ name: company.name }],
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
  const judged = parseJudgement((await ai.call('judge', judgeRequest({
    mandate: SH1, version: SH1_SPEC_VERSION, evidence,
    company: { name: classified.company.entity_name ?? candidate.companyName, ...classified.company },
  }))).input);

  return {
    agent: AGENT_DECISION[judged.verdict],
    stage: 'judge',
    verdict: judged.verdict,
    reason: judged.reason,
    reason_to_act: judged.reasonToAct,
    proposed_service: judged.proposedService,
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
  const results = [];
  for (const company of TEST_COMPANIES) {
    process.stdout.write(`${company.name} … `);
    const result = await testCompany(ai, company, now);
    const row = { company: company.name, expected: company.expected, expected_why: company.why, ...result, agrees: agrees(company.expected, result.agent) };
    results.push(row);
    console.log(`${row.agent} (expected ${row.expected}, agrees: ${row.agrees})`);
  }
  const cost = spentThisMonth(db, now);
  const output = { ran_at: now.toISOString(), mandate: SH1, mandate_version: SH1_SPEC_VERSION, cost_usd: Number(cost.toFixed(3)), results };
  const file = path.join(repoRoot, 'agent-test-results.json');
  writeFileSync(file, `${JSON.stringify(output, null, 2)}\n`);
  console.table(results.map((row) => ({ company: row.company, expected: row.expected, agent: row.agent, agrees: row.agrees })));
  console.log(`Cost: $${cost.toFixed(2)}. Full results (evidence, facts, reasons): ${file}`);
}

await main();
