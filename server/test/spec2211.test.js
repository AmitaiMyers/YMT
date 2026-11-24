// Lead-finding agent specification of 22.11.2026 and the decisions of 24.11: score, disqualifiers, revenue floor,
// market rule, Defer, the SHEPHA list, the services catalogue and the live-trigger check. Fake AI, in-memory database.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db.js';
import { createApp } from '../src/app.js';
import { createUser } from '../src/auth.js';
import { createAiService } from '../src/ai/service.js';
import { processNext } from '../src/research/worker.js';
import { normalizeDomain, findExistingCompany } from '../src/research/classification.js';
import { computeScore, triggerPoints, isStrongTrigger, decisionMakerLevel, evidenceLevel, tierOf } from '../src/research/score.js';
import { insert } from '../src/db.js';
import { roleCheckedRecently } from '../src/outreachRules.js';

const DAY_MS = 86_400_000;
const NOW = new Date();
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY_MS).toISOString().slice(0, 10);
const M = 1_000_000;

// ------------------------------------------------------------------ score (pure)

const SERVICES = new Map([
  ['GL-2', { code: 'GL-2', status: 'ready' }],
  ['IL-2', { code: 'IL-2', status: 'in_build' }],
  ['GL-10', { code: 'GL-10', status: 'not_offered' }],
]);

test('score: trigger points shrink with age, a gone live trigger counts zero', () => {
  assert.deepEqual(triggerPoints({ trigger_kind: 'mou', evidence_date: daysAgo(30) }, NOW), { level: 'mou', points: 25, factor: 1 });
  assert.equal(triggerPoints({ trigger_kind: 'mou', evidence_date: daysAgo(200) }, NOW).points, 12.5);
  assert.equal(triggerPoints({ trigger_kind: 'mou', evidence_date: daysAgo(400) }, NOW).points, 0);
  assert.equal(triggerPoints({ trigger_kind: 'job_posting', trigger_live: 0, evidence_date: daysAgo(5) }, NOW).points, 0);
  assert.equal(isStrongTrigger({ trigger_kind: 'trade_show', evidence_date: daysAgo(10) }, NOW), true);
  assert.equal(isStrongTrigger({ trigger_kind: 'job_posting', evidence_date: daysAgo(10) }, NOW), false);
  assert.equal(isStrongTrigger({ trigger_kind: 'mou', evidence_date: daysAgo(200) }, NOW), false);
});

test('score: decision-maker access and evidence quality levels', () => {
  assert.equal(decisionMakerLevel([], NOW), 'none');
  assert.equal(decisionMakerLevel([{ status: 'proposed', verified_at: NOW.toISOString() }], NOW), 'named_no_route');
  assert.equal(decisionMakerLevel([{ status: 'proposed', email: 'a@b.example', verified_at: daysAgo(3) }], NOW), 'verified_route');
  assert.equal(decisionMakerLevel([{ status: 'confirmed', email: 'a@b.example', verified_at: daysAgo(45) }], NOW), 'route_unverified');

  assert.equal(evidenceLevel([], 'acme.example'), 'contradicting_or_missing');
  assert.equal(evidenceLevel([{ field: 'employees', url: 'https://news.example/a' }], 'acme.example'), 'secondary_only');
  assert.equal(evidenceLevel([{ field: 'employees', url: 'https://www.acme.example/about' }], 'acme.example'), 'primary_source');
  assert.equal(evidenceLevel([
    { field: 'employees', url: 'https://www.acme.example/about' }, { field: 'employees', url: 'https://news.example/a' },
  ], 'acme.example'), 'two_sources');
});

test('score: 0–100 total, lower-priority deduction and tiers', () => {
  const opportunity = { trigger_kind: 'distributor_search', evidence_date: daysAgo(10), subsector_fit: 'priority', service_code: 'GL-2', flags: '[]' };
  const people = [{ status: 'proposed', email: 'a@acme.example', verified_at: daysAgo(1) }];
  const facts = [{ field: 'employees', url: 'https://acme.example/about' }, { field: 'employees', url: 'https://news.example/a' }];
  const full = computeScore({ opportunity, people, facts, companyDomain: 'acme.example', mandateServiceCodes: ['GL-2'], servicesByCode: SERVICES, now: NOW });
  assert.deepEqual([full.total, full.tier, full.has_trigger], [100, 'A', true]);

  const lower = computeScore({ opportunity: { ...opportunity, flags: '["lower_priority"]' }, people, facts, companyDomain: 'acme.example',
    mandateServiceCodes: ['GL-2'], servicesByCode: SERVICES, now: NOW });
  assert.deepEqual([lower.total, lower.deduction, lower.tier], [90, 10, 'A']);

  // Another mandate's service counts 8; a service not offered counts 0.
  const other = computeScore({ opportunity: { ...opportunity, service_code: 'IL-2' }, people, facts, companyDomain: 'acme.example',
    mandateServiceCodes: ['GL-2'], servicesByCode: SERVICES, now: NOW });
  assert.equal(other.parts.service.points, 8);
  assert.equal(computeScore({ opportunity: { ...opportunity, service_code: 'GL-10' }, people, facts, companyDomain: 'acme.example',
    mandateServiceCodes: ['GL-10'], servicesByCode: SERVICES, now: NOW }).parts.service.points, 0);
  assert.deepEqual([tierOf(80), tierOf(79), tierOf(65), tierOf(64)], ['A', 'B', 'B', 'C']);
});

test('duplicates: registrable domain, registry number and other names', () => {
  assert.equal(normalizeDomain('https://shop.acme.co.il/x'), 'acme.co.il');
  assert.equal(normalizeDomain('https://eu.acme.com'), 'acme.com');
  const db = openDatabase(':memory:');
  const id = insert(db, 'companies', { name: 'Acme Holdings', industry: 'x', country: 'Israel', hq_country: 'Israel', website: 'https://acme.co.il', registry_number: '51-234567-8' });
  db.prepare('INSERT INTO company_aliases (company_id, name, name_key, source_url) VALUES (?, ?, ?, ?)').run(id, 'Acme Flow', 'acme flow', null);
  assert.equal(findExistingCompany(db, { website: 'https://www.shop.acme.co.il', name: 'Other', hqCountry: 'Israel' }).match, 'domain');
  assert.equal(findExistingCompany(db, { website: null, name: 'Other', hqCountry: 'Israel', registryNumber: '512345678' }).match, 'registry');
  assert.equal(findExistingCompany(db, { website: null, name: 'Acme Flow Ltd', hqCountry: 'Israel' }).company.id, id);
  assert.equal(findExistingCompany(db, { website: null, name: 'Other', hqCountry: 'Israel', otherNames: ['Acme Holdings'] }).company.id, id);
  assert.equal(findExistingCompany(db, { website: null, name: 'Acme Flow', hqCountry: 'Japan' }), null);
});

test('a first approach needs the role checked in the last 30 days (decision 19)', () => {
  const at = (days) => new Date(NOW.getTime() - days * DAY_MS).toISOString();
  assert.equal(roleCheckedRecently({ verified: 1, verified_at: at(29) }, NOW), true);
  assert.equal(roleCheckedRecently({ verified: 1, verified_at: at(31) }, NOW), false);
  assert.equal(roleCheckedRecently({ verified: 0, verified_at: null }, NOW), false);
});

// ------------------------------------------------------------------ a run against the SH1 rules

// Per company: what the classifier and the judge return (everything else is a plain, exporting Israeli company).
const COMPANIES = {
  'Excluded Co': {},
  'Domestic Co': { export_proof: 'none' },
  'Rooted Co': { india: 'established' },
  'Small Co': { revenue: 15 * M, trigger: 'statement' },
  'Strong Small Co': { revenue: 15 * M, trigger: 'distributor_search' },
  'Tiny Co': { revenue: 5 * M, trigger: 'mou' },
  'Later Co': { verdict: 'defer', trigger: 'none' },
  'Partner Co': { india: 'distributor', revenue: 50 * M, trigger: 'mou' },
  'Top Co': { revenue: 50 * M, trigger: 'distributor_search' },
};
const slug = (name) => name.toLowerCase().replace(/\s+/g, '');
const newsUrl = (name) => `https://news.example/${slug(name)}-india`;
const classified = [];

function fakeAi() {
  const usage = { input: 1000, output: 100, cacheRead: 0, cacheWrite: 0, searches: 0 };
  return {
    run: async ({ tool, prompt }) => {
      if (tool.name === 'submit_candidates') {
        return {
          input: { candidates: Object.keys(COMPANIES).map((name) => ({
            company_name: name, website: `https://www.${slug(name)}.example`, source_url: newsUrl(name), source_title: name,
            source_kind: 'web', published_on: daysAgo(12), initiative_quote: `${name} is looking for a distributor in India.`,
            target_country: 'India', need_type: 'market_entry_distribution', business_need: `${name} wants an Indian distributor.`, relationship_role: 'client',
          })) },
          sources: Object.keys(COMPANIES).map((name) => ({ url: newsUrl(name), title: name })),
          usage,
        };
      }
      if (tool.name === 'submit_contacts') return { input: { contacts: [] }, sources: [], usage };
      // Longest name first: "Small Co" is part of "Strong Small Co".
      const name = Object.keys(COMPANIES).sort((a, b) => b.length - a.length).find((n) => prompt.includes(n));
      const spec = COMPANIES[name];
      const url = newsUrl(name);
      if (tool.name === 'submit_classification') {
        classified.push(name);
        const fact = (field, value) => ({ field, value: String(value), source_url: url, quote: `${field}: ${value}`, entity_covered: name });
        return {
          input: {
            entity_name: name, website: '', parent_company: '', business_unit: '', israel_connection: 'hq_israel', incorporation_country: 'Israel',
            hq_country: 'Israel', model_primary: 'product_owner', model_secondary: 'none', sector: 'industry_manufacturing', subsector: 'Valves',
            customer_types: ['business'], customer_markets: [], employees_min: 95, employees_max: 95, employees_as_of: '2026',
            revenue_usd_min: spec.revenue ?? null, revenue_usd_max: spec.revenue ?? null, revenue_fiscal_year: 2025, revenue_basis: 'reported',
            revenue_original: '', ownership: '', export_proof: spec.export_proof ?? 'proven', registry_number: '', other_names: [], description: '',
            markets: [{ market: 'india', status: spec.india ?? 'not_active', fit: 'fit', note: '', source_url: url }],
            facts: [
              fact('israel_connection', 'hq_israel'), fact('employees', 95), fact('export_proof', spec.export_proof ?? 'proven'),
              ...(spec.revenue ? [fact('revenue', spec.revenue)] : []),
            ],
            unknowns: [],
          },
          sources: [],
          usage,
        };
      }
      const trigger = spec.trigger ?? 'none';
      return {
        input: { verdict: spec.verdict ?? 'match', reason: 'Named India initiative.', reason_to_act: 'This month.', trigger_kind: trigger,
          trigger_strength: trigger === 'none' ? '' : 'Dated and public.', subsector_fit: 'priority', service_code: 'GL-2',
          proposed_service: 'Distributor search with SHEPHA', unknowns: [] },
        sources: [],
        usage,
      };
    },
  };
}

let server;
let baseUrl;
let db;
let ai;
const cookies = {};
const users = {};

async function call(user, method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookies[user] },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}

before(async () => {
  db = openDatabase(':memory:');
  users.tom = createUser(db, { username: 'tom', display_name: 'Tom', password: 'correct-horse', role: 'admin' });
  users.shir = createUser(db, { username: 'shir', display_name: 'Shir', password: 'correct-horse', role: 'member' });
  ai = createAiService(db, { claude: fakeAi() });
  server = createApp(db, { dbPath: ':memory:', hostingLocation: 'test', ai }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  for (const user of ['tom', 'shir']) {
    const response = await fetch(`${baseUrl}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: 'correct-horse' }) });
    cookies[user] = response.headers.get('set-cookie').split(';')[0];
  }
});

after(() => {
  server.closeAllConnections();
  server.close();
});

const sh1 = () => db.prepare("SELECT id FROM mandates WHERE code = 'SH1'").get().id;
const cardOf = (name) => db.prepare('SELECT o.* FROM opportunities o JOIN companies c ON c.id = o.company_id WHERE c.name = ?').get(name);

test('services catalogue: 26 codes with the new GL-12, GL-13 and IL-13; status changes are admin-only', async () => {
  const services = (await call('shir', 'GET', '/services')).data;
  assert.equal(services.length, 26);
  assert.ok(['GL-12', 'GL-13', 'IL-13'].every((code) => services.some((s) => s.code === code)));
  assert.equal((await call('shir', 'PATCH', '/services/IL-2', { status: 'ready' })).status, 403);
  assert.equal((await call('tom', 'PATCH', '/services/IL-2', { status: 'ready' })).data.status, 'ready');
  assert.equal((await call('tom', 'PATCH', '/services/XX-1', { status: 'ready' })).status, 404);
  assert.equal((await call('tom', 'PATCH', '/services/IL-2', { status: 'maybe' })).status, 400);
});

test('SHEPHA list: admin-only Excel import that replaces the previous list', async () => {
  assert.equal((await call('shir', 'POST', '/shepha-exclusions', { rows: [{ name: 'X' }] })).status, 403);
  assert.equal((await call('tom', 'POST', '/shepha-exclusions', { rows: [{ name: '' }] })).data.error, 'Row 1: name is required');
  assert.equal((await call('tom', 'POST', '/shepha-exclusions', { rows: [{ name: 'Old Co' }] })).status, 201);
  const imported = await call('tom', 'POST', '/shepha-exclusions', { rows: [{ name: 'Excluded Co Ltd', website: 'https://excludedco.example/about' }, { name: 'Other Excluded' }] });
  assert.equal(imported.status, 201);
  const list = (await call('tom', 'GET', '/shepha-exclusions')).data;
  assert.deepEqual(list.rows.map((row) => row.name), ['Excluded Co Ltd', 'Other Excluded']);
  assert.equal(list.rows[0].domain, 'excludedco.example');
  assert.equal((await call('shir', 'GET', '/shepha-exclusions')).status, 403);
});

test('a SH1 run: disqualifiers, market rule, revenue floor and Defer; every drop is logged with its reason', async () => {
  assert.equal((await call('tom', 'PATCH', `/mandates/${sh1()}`, { owner_id: users.shir, status: 'active' })).status, 200);
  const run = await call('shir', 'POST', `/mandates/${sh1()}/runs`, { batch_size: 9 });
  assert.equal(run.status, 201);
  while (await processNext(db, ai, NOW)) { /* run, then the contact searches */ }
  const done = (await call('shir', 'GET', `/research/runs/${run.data.id}`)).data;
  assert.equal(done.status, 'done', done.error);
  assert.equal(classified.includes('Excluded Co'), false, 'the SHEPHA list is checked before any AI cost');

  const detail = (await call('shir', 'GET', `/mandates/${sh1()}`)).data;
  const drops = Object.fromEntries(detail.runs[0].drops.map((drop) => [drop.company_name, drop.reason]));
  assert.deepEqual(drops, {
    'Excluded Co': 'shepha_exclusion', 'Domestic Co': 'no_export', 'Rooted Co': 'already_established',
    'Small Co': 'below_floor', 'Tiny Co': 'below_minimum',
  });
  assert.equal(done.cards_created, 4);

  assert.deepEqual(JSON.parse(cardOf('Strong Small Co').flags), ['below_floor']); // a strong trigger lets it in, flagged
  assert.deepEqual(JSON.parse(cardOf('Partner Co').flags), ['lower_priority']);   // one distributor that wants to expand
  assert.equal(cardOf('Later Co').verdict, 'defer');
  assert.equal(cardOf('Top Co').originator, 'agent:SH1');
  assert.equal(cardOf('Top Co').service_code, 'GL-2');

  // The queue puts cards with a trigger first, then the highest score.
  const queue = (await call('shir', 'GET', '/research/review')).data;
  assert.deepEqual(queue.map((card) => card.company_name), ['Strong Small Co', 'Top Co', 'Partner Co', 'Later Co']);
  assert.equal(queue.at(-1).has_trigger, false);
  const top = (await call('shir', 'GET', `/opportunities/${cardOf('Top Co').id}`)).data;
  assert.deepEqual(Object.fromEntries(Object.entries(top.score.parts).map(([key, part]) => [key, part.level])),
    { subsector: 'priority', trigger: 'distributor_search', decision_maker: 'none', service: 'ready', evidence: 'secondary_only' });
  assert.equal(top.score.total, 74);
  assert.deepEqual(top.markets.map((m) => [m.market, m.status]), [['india', 'not_active']]);
  assert.equal(top.mandate_floor_usd, 30 * M);
  assert.equal(top.live_check, true);
});

test('live trigger check: a distributor page found gone on the review day counts zero', async () => {
  const top = cardOf('Top Co');
  assert.equal((await call('shir', 'POST', `/opportunities/${cardOf('Later Co').id}/trigger-check`, { live: true })).status, 400);
  assert.equal((await call('shir', 'POST', `/opportunities/${top.id}/trigger-check`, { live: false })).status, 200);
  const card = (await call('shir', 'GET', `/opportunities/${top.id}`)).data;
  assert.deepEqual([card.score.parts.trigger.points, card.score.has_trigger, card.trigger_live], [0, false, 0]);
  assert.equal((await call('shir', 'POST', `/opportunities/${top.id}/trigger-check`, { live: true })).status, 200);
  assert.equal((await call('shir', 'GET', `/opportunities/${top.id}`)).data.score.parts.trigger.points, 25);
});

test('Defer: 90 days by default with a come-back task; Accept opens the deal', async () => {
  const later = cardOf('Later Co');
  assert.equal((await call('shir', 'POST', `/opportunities/${later.id}/decision`, { decision: 'defer' })).status, 400); // note required
  assert.equal((await call('shir', 'POST', `/opportunities/${later.id}/decision`, { decision: 'defer', note: 'x', defer_until: daysAgo(1) })).status, 400);
  const deferred = await call('shir', 'POST', `/opportunities/${later.id}/decision`, { decision: 'defer', note: 'Signed distributor, review after the season' });
  assert.equal(deferred.status, 200);
  const expected = new Date(NOW.getTime() + 90 * DAY_MS).toISOString().slice(0, 10);
  assert.equal(deferred.data.defer_until, expected);
  const task = db.prepare('SELECT description, due_date, assignee FROM tasks WHERE company_id = ?').get(later.company_id);
  assert.deepEqual([task.due_date, task.assignee], [expected, 'Shir']);
  assert.ok(task.description.startsWith('Come back (deferred)'));

  const top = cardOf('Top Co');
  assert.equal((await call('shir', 'POST', `/opportunities/${top.id}/decision`, { decision: 'accept' })).status, 200);
  const deal = (await call('shir', 'GET', `/opportunities/${top.id}`)).data.deal;
  assert.equal(deal.title, 'SH1: Top Co wants an Indian distributor.');

  // Quality measures per mandate: drops by reason and review time per mandate version.
  const row = (await call('tom', 'GET', '/research/metrics')).data.rows.find((r) => r.code === 'SH1');
  assert.deepEqual(row.drop_reasons, { already_established: 1, below_floor: 1, below_minimum: 1, no_export: 1, shepha_exclusion: 1 });
  assert.deepEqual(row.review_minutes_by_version.map((v) => [v.version, v.reviewed]), [[1, 2]]); // a new database starts with the spec as version 1
  assert.deepEqual([row.contacts_decided, row.contacts_wrong], [0, 0]);
});

test('view mode: focus by default; only admins switch it', async () => {
  assert.equal((await call('shir', 'GET', '/settings')).data.view_mode, 'focus');
  assert.equal((await call('shir', 'PUT', '/settings/view-mode', { view_mode: 'full' })).status, 403);
  assert.equal((await call('tom', 'PUT', '/settings/view-mode', { view_mode: 'simple' })).status, 400);
  assert.equal((await call('tom', 'PUT', '/settings/view-mode', { view_mode: 'full' })).data.view_mode, 'full');
  assert.equal((await call('shir', 'GET', '/settings')).data.view_mode, 'full');
});
