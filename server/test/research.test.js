// Research (Release 1): rules, AI adapters, cost cap, and the full run → review → calibration flow with a fake AI.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db.js';
import { createApp } from '../src/app.js';
import { createUser } from '../src/auth.js';
import { createAiService, BudgetError, costOf } from '../src/ai/service.js';
import { createClaudeProvider } from '../src/ai/claude.js';
import { createOpenAiProvider } from '../src/ai/openai.js';
import { employeeBand, revenueBand, normalizeDomain, normalizeName, normalizeUrl } from '../src/research/classification.js';
import { assignOpportunity, isStale } from '../src/research/assign.js';
import { processNext, scheduleWeeklyRuns, isoWeekKey, israelWeekday, recoverInterrupted } from '../src/research/worker.js';

const TODAY = new Date();
const daysAgo = (n) => new Date(TODAY.getTime() - n * 86400000).toISOString().slice(0, 10);
const ZERO_USAGE = { input: 1000, output: 500, cacheRead: 0, cacheWrite: 0, searches: 1 };

// ------------------------------------------------------------------ rules

test('size bands follow the dictionary, including ranges that span bands', () => {
  assert.equal(employeeBand(95, 95), 'medium');
  assert.equal(employeeBand(18, 18), 'small');
  assert.equal(employeeBand(40, 70), 'spans_multiple');
  assert.equal(employeeBand(1000, null), 'enterprise');
  assert.equal(employeeBand(null, null), 'unknown');
  assert.equal(revenueBand(28_000_000, 28_000_000), 'medium');
  assert.equal(revenueBand(10_000_000, 10_000_000), 'medium'); // $10m is the lower bound of medium
  assert.equal(revenueBand(9_999_999, 9_999_999), 'small');
});

test('domains, names and URLs are normalised for duplicate checks', () => {
  assert.equal(normalizeDomain('https://www.Example.co.il/about?x=1'), 'example.co.il');
  assert.equal(normalizeDomain('example.com'), 'example.com');
  assert.equal(normalizeDomain(''), null);
  assert.equal(normalizeName('Acme Software Ltd.'), normalizeName('ACME software'));
  assert.equal(normalizeName('אקמה בע"מ'), 'אקמה');
  assert.equal(normalizeUrl('https://News.Example.com/a/b/#top'), 'https://news.example.com/a/b');
});

test('evidence older than the freshness window is stale', () => {
  assert.equal(isStale(daysAgo(10), 183, TODAY), false);
  assert.equal(isStale(daysAgo(200), 183, TODAY), true);
});

test('routing: Israeli connection, matching mandate, manual queue and size flag', () => {
  const version = (countries, needs) => ({ id: 1, target_countries: countries, need_types: needs, employees_min: 10, employees_max: 249, revenue_min_usd: null, revenue_max_usd: null });
  const sh2 = { id: 2, owner_id: 7, status: 'active', version: { ...version(['Japan'], ['implementation_partner']), id: 20 } };
  const sh1 = { id: 1, owner_id: 7, status: 'active', version: { ...version(['India'], ['market_entry_distribution']), id: 10 } };
  const om3 = { id: 3, owner_id: 9, status: 'active', version: { ...version(['Israel'], ['executive_search']), id: 30 } };
  const mandates = [sh1, sh2, om3];
  const company = (over) => ({ israel_connection: 'hq_israel', employees_min: 95, employees_max: 95, revenue_usd_min: null, revenue_usd_max: null, ...over });

  assert.deepEqual(assignOpportunity({ runMandate: sh2, mandates, company: company(), verdict: 'match', opportunity: { targetCountry: 'japan', needType: 'implementation_partner' } }),
    { status: 'draft', mandateId: 2, versionId: 20, ownerId: 7, flags: [] });
  // Found by SH2 but it is an Israeli VP vacancy: routed to OM3's owner.
  assert.equal(assignOpportunity({ runMandate: sh2, mandates, company: company(), verdict: 'match', opportunity: { targetCountry: 'Israel', needType: 'executive_search' } }).ownerId, 9);
  // No mandate covers Vietnam: manual queue.
  assert.equal(assignOpportunity({ runMandate: sh2, mandates, company: company(), verdict: 'match', opportunity: { targetCountry: 'Vietnam', needType: 'technology_scouting' } }).status, 'manual_assignment');
  // Other Israeli connection: needs review by the owner who ran the search.
  const other = assignOpportunity({ runMandate: sh2, mandates, company: company({ israel_connection: 'other_connection' }), verdict: 'match', opportunity: { targetCountry: 'Japan', needType: 'implementation_partner' } });
  assert.equal(other.status, 'needs_review');
  // Outside preferred size and weak evidence are flags, not filters.
  const big = assignOpportunity({ runMandate: sh2, mandates, company: company({ employees_min: 4000, employees_max: 4000 }), verdict: 'weak', opportunity: { targetCountry: 'Japan', needType: 'implementation_partner' } });
  assert.equal(big.status, 'draft');
  assert.deepEqual(big.flags, ['weak_evidence', 'outside_preferred_size']);
});

test('weekly schedule keys and Israeli weekday', () => {
  assert.equal(isoWeekKey(new Date('2026-11-22T10:00:00Z')), '2026-W47'); // Sunday belongs to the ISO week that started Monday 16 Nov
  assert.equal(isoWeekKey(new Date('2026-11-23T10:00:00Z')), '2026-W48');
  assert.equal(israelWeekday(new Date('2026-11-21T22:30:00Z')), 0); // 00:30 Sunday in Israel
});

// ------------------------------------------------------------------ adapters

test('Claude adapter: resumes pause_turn, reminds once, collects sources and usage, uses fallbacks', async () => {
  const calls = [];
  const responses = [
    { stop_reason: 'pause_turn', usage: { input_tokens: 100, output_tokens: 10, server_tool_use: { web_search_requests: 2 } },
      content: [{ type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: 'https://a.example/x', title: 'A' }] }] },
    { stop_reason: 'end_turn', usage: { input_tokens: 50, output_tokens: 5, cache_read_input_tokens: 40 }, content: [{ type: 'text', text: 'Found one.', citations: [{ type: 'web_search_result_location', url: 'https://b.example/y', title: 'B' }] }] },
    { stop_reason: 'tool_use', usage: { input_tokens: 20, output_tokens: 30 }, content: [{ type: 'tool_use', name: 'submit_x', input: { ok: true } }] },
  ];
  const client = { beta: { messages: { create: async (params) => { calls.push(params); return responses.shift(); } } } };
  const provider = createClaudeProvider({ client });
  const result = await provider.run({ model: 'claude-sonnet-5-5', system: 's', prompt: 'p', maxTokens: 100,
    tool: { name: 'submit_x', description: 'd', schema: { type: 'object' } }, webSearch: { maxUses: 3 } });

  assert.deepEqual(result.input, { ok: true });
  assert.deepEqual(result.sources.map((s) => s.url), ['https://a.example/x', 'https://b.example/y']);
  assert.deepEqual(result.usage, { input: 170, output: 45, cacheRead: 40, cacheWrite: 0, searches: 2 });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].tools[0].type, 'web_search_20260209');
  assert.equal(calls[0].fallbacks, 'default');
  assert.deepEqual(calls[0].betas, ['server-side-fallback-2026-07-01']);
  assert.equal(calls[2].messages.at(-1).content, 'Submit your result now by calling the submit_x tool.');

  const refusing = createClaudeProvider({ client: { beta: { messages: { create: async () => ({ stop_reason: 'refusal', stop_details: { category: 'cyber' }, usage: { input_tokens: 1, output_tokens: 0 }, content: [] }) } } } });
  await assert.rejects(refusing.run({ model: 'claude-haiku-5-5', system: 's', prompt: 'p', maxTokens: 10, tool: { name: 't', description: 'd', schema: {} }, webSearch: null }), /declined.*cyber/);
});

test('OpenAI adapter: function call result, cached tokens and citations', async () => {
  const bodies = [];
  const fetchImpl = async (url, init) => {
    bodies.push(JSON.parse(init.body));
    return new Response(JSON.stringify({
      id: 'resp_1',
      usage: { input_tokens: 300, output_tokens: 40, input_tokens_details: { cached_tokens: 100 } },
      output: [
        { type: 'web_search_call', action: { sources: [{ url: 'https://c.example/z', title: 'C' }] } },
        { type: 'message', content: [{ type: 'output_text', text: 'x', annotations: [{ type: 'url_citation', url: 'https://d.example/w', title: 'D' }] }] },
        { type: 'function_call', name: 'submit_x', arguments: '{"ok":1}' },
      ],
    }), { status: 200 });
  };
  const provider = createOpenAiProvider({ apiKey: 'test', fetchImpl });
  const result = await provider.run({ model: 'gpt-test', system: 's', prompt: 'p', maxTokens: 50, tool: { name: 'submit_x', description: 'd', schema: {} }, webSearch: { maxUses: 2 } });
  assert.deepEqual(result.input, { ok: 1 });
  assert.deepEqual(result.usage, { input: 200, output: 40, cacheRead: 100, cacheWrite: 0, searches: 1 });
  assert.deepEqual(result.sources.map((s) => s.url), ['https://c.example/z', 'https://d.example/w']);
  assert.equal(bodies[0].tools[0].type, 'web_search');
});

test('AI service: cost is recorded and the monthly cap blocks calls', async () => {
  const db = openDatabase(':memory:');
  const fake = { run: async () => ({ input: {}, sources: [], usage: ZERO_USAGE }) };
  const ai = createAiService(db, { claude: fake });
  const result = await ai.call('judge', { system: 's', prompt: 'p', tool: { name: 't' }, webSearch: null, maxTokens: 1000 });
  const expected = costOf({ input: 2, output: 10, cache_read: 0.1, search: 0.01 }, ZERO_USAGE);
  assert.equal(result.costUsd, expected);
  assert.equal(db.prepare('SELECT cost_usd FROM ai_usage').get().cost_usd, expected);

  db.prepare("UPDATE settings SET value = '1' WHERE key = 'ai_monthly_cap_usd'").run();
  db.prepare('INSERT INTO ai_usage (task, provider, model, input_tokens, output_tokens, cache_read_tokens, web_searches, cost_usd) VALUES (?, ?, ?, 0, 0, 0, 0, ?)').run('judge', 'claude', 'claude-sonnet-5-5', 0.95);
  await assert.rejects(ai.call('discover', { system: 's', prompt: 'p', tool: { name: 't' }, webSearch: { maxUses: 5 }, maxTokens: 16000 }), BudgetError);
  assert.equal(db.prepare("SELECT value FROM settings WHERE key = 'ai_alert_month'").get().value, TODAY.toISOString().slice(0, 7));
  assert.equal(createAiService(db, {}).problem('discover'), 'AI provider "claude" is not configured for "discover": set ANTHROPIC_API_KEY on the server.');
});

// ------------------------------------------------------------------ end to end with a fake AI

const SEARCH = {
  good: 'https://news.example/acme-japan-partners',
  homepage: 'https://acme-two.example/ja',
  vacancy: 'https://jobs.example/vp-ops',
  vietnam: 'https://news.example/delta-vietnam',
};

/** Scripted AI: discovery returns four candidates; classification and judgement depend on the company. */
function fakeScript() {
  const candidate = (name, url, need, country, quote) => ({
    company_name: name, website: `https://${name.toLowerCase().replace(/\s+/g, '')}.example`, source_url: url, source_title: `${name} news`,
    source_kind: 'web', published_on: daysAgo(12), initiative_quote: quote, target_country: country, need_type: need,
    business_need: quote, relationship_role: 'client',
  });
  return {
    run: async ({ tool, prompt }) => {
      if (tool.name === 'submit_candidates') {
        return {
          input: { candidates: [
            candidate('Acme Software', SEARCH.good, 'implementation_partner', 'Japan', 'Acme is seeking Japanese implementation partners.'),
            candidate('Acme Two', SEARCH.homepage, 'implementation_partner', 'Japan', 'Acme Two launched a Japanese homepage.'),
            candidate('Invented Co', 'https://not-in-search.example/x', 'implementation_partner', 'Japan', 'Invented.'),
            candidate('Delta Robotics', SEARCH.vietnam, 'technology_scouting', 'Vietnam', 'Delta looks for technology partners in Vietnam.'),
            candidate('Metal Works', SEARCH.vacancy, 'executive_search', 'Israel', 'Metal Works is hiring a VP Operations in Israel.'),
          ] },
          sources: Object.values(SEARCH).map((url) => ({ url, title: 'Result' })),
          usage: { input: 20000, output: 2000, cacheRead: 0, cacheWrite: 0, searches: 4 },
        };
      }
      if (tool.name === 'submit_classification') {
        const name = /Classify the company "([^"]+)"/.exec(prompt)[1];
        const url = Object.values(SEARCH).find((u) => prompt.includes(u));
        return {
          input: {
            entity_name: name, website: '', parent_company: '', business_unit: '', israel_connection: 'hq_israel', incorporation_country: 'Israel',
            hq_country: 'Israel', model_primary: 'software_ip', model_secondary: 'none', sector: 'tech_comms', subsector: 'B2B software',
            customer_types: ['business'], customer_markets: ['Manufacturing'], employees_min: 95, employees_max: 95, employees_as_of: '2026',
            revenue_usd_min: null, revenue_usd_max: null, revenue_fiscal_year: null, revenue_basis: 'unknown', revenue_original: '', ownership: '',
            facts: [
              { field: 'israel_connection', value: 'hq_israel', source_url: url, quote: 'headquartered in Tel Aviv', entity_covered: name },
              { field: 'employees', value: '95', source_url: url, quote: '95 employees', entity_covered: name },
              { field: 'sector', value: 'tech_comms', source_url: 'https://uncited.example/page', quote: 'x', entity_covered: name },
            ],
            unknowns: ['revenue'],
          },
          sources: [],
          usage: { input: 8000, output: 800, cacheRead: 0, cacheWrite: 0, searches: 1 },
        };
      }
      const homepage = prompt.includes('Japanese homepage');
      return {
        input: { verdict: homepage ? 'no_match' : 'match', reason: homepage ? 'A homepage alone is not a partner initiative.' : 'Dated partner call.',
          reason_to_act: 'Published this month.', proposed_service: 'Shortlist partners', unknowns: [] },
        sources: [],
        usage: { input: 2000, output: 200, cacheRead: 0, cacheWrite: 0, searches: 0 },
      };
    },
  };
}

let server;
let baseUrl;
let db;
let ai;
const cookies = {};
const ids = {};

async function call(user, method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(user ? { Cookie: cookies[user] } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}

before(async () => {
  db = openDatabase(':memory:');
  ids.tom = createUser(db, { username: 'tom', display_name: 'Tom', password: 'correct-horse', role: 'admin' });
  ids.shir = createUser(db, { username: 'shir', display_name: 'Shir', password: 'correct-horse', role: 'member' });
  ids.omer = createUser(db, { username: 'omer', display_name: 'Omer', password: 'correct-horse', role: 'member' });
  ai = createAiService(db, { claude: fakeScript() });
  server = createApp(db, { dbPath: ':memory:', hostingLocation: 'test', ai }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  for (const user of ['tom', 'shir', 'omer']) {
    const response = await fetch(`${baseUrl}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: 'correct-horse' }) });
    cookies[user] = response.headers.get('set-cookie').split(';')[0];
  }
});

after(() => {
  server.closeAllConnections();
  server.close();
});

const mandateId = (code) => db.prepare('SELECT id FROM mandates WHERE code = ?').get(code).id;

test('mandates: seeded, owners assigned by admins only, active needs an owner', async () => {
  const list = await call('shir', 'GET', '/mandates');
  assert.deepEqual(list.data.map((m) => m.code), ['GE1', 'OM1', 'OM2', 'OM3', 'SH1', 'SH2', 'SH3']);
  assert.equal(list.data.find((m) => m.code === 'SH2').version.target_countries[0], 'Japan');

  assert.equal((await call('shir', 'PATCH', `/mandates/${mandateId('SH2')}`, { owner_id: ids.shir })).status, 403);
  assert.equal((await call('tom', 'PATCH', `/mandates/${mandateId('SH2')}`, { status: 'active' })).data.error, 'An active mandate needs an owner');
  for (const [code, owner] of [['SH1', 'shir'], ['SH2', 'shir'], ['SH3', 'shir'], ['OM3', 'omer']]) {
    const patched = await call('tom', 'PATCH', `/mandates/${mandateId(code)}`, { owner_id: ids[owner], status: 'active' });
    assert.equal(patched.status, 200);
  }
  assert.equal((await call('omer', 'POST', `/mandates/${mandateId('SH2')}/runs`, { batch_size: 3 })).status, 403);
  assert.equal((await call('shir', 'POST', `/mandates/${mandateId('SH2')}/runs`, { batch_size: 21 })).status, 400);
});

test('a run creates draft cards for the right owners and drops unverifiable or false-positive candidates', async () => {
  const run = await call('shir', 'POST', `/mandates/${mandateId('SH2')}/runs`, { batch_size: 5 });
  assert.equal(run.status, 201);
  assert.equal(await processNext(db, ai, TODAY), true);
  const done = (await call('shir', 'GET', `/research/runs/${run.data.id}`)).data;
  assert.equal(done.status, 'done', done.error);
  assert.equal(done.candidates_found, 5);
  assert.equal(done.cards_created, 3); // Acme (SH2), Delta (manual), Metal Works (OM3)
  assert.equal(done.filtered, 2);      // homepage false positive + invented URL
  assert.ok(done.cost_usd > 0);

  const shirQueue = (await call('shir', 'GET', '/research/review')).data;
  assert.deepEqual(shirQueue.map((c) => c.company_name), ['Acme Software']);
  ids.acme = shirQueue[0].id;
  assert.equal(shirQueue[0].mandate_code, 'SH2');
  const omerQueue = (await call('omer', 'GET', '/research/review')).data;
  assert.deepEqual(omerQueue.map((c) => c.company_name), ['Metal Works']);
  ids.metal = omerQueue[0].id;
  assert.equal((await call('shir', 'GET', '/research/review?view=manual')).status, 403);
  const manual = (await call('tom', 'GET', '/research/review?view=manual')).data;
  assert.deepEqual(manual.map((c) => c.company_name), ['Delta Robotics']);
  ids.delta = manual[0].id;

  // Only cited facts are kept; the uncited sector is dropped and listed as unknown.
  const card = (await call('shir', 'GET', `/opportunities/${ids.acme}`)).data;
  assert.equal(card.company.israel_connection, 'hq_israel');
  assert.equal(card.company.employee_band, 'medium');
  assert.equal(card.company.sector, null);
  assert.ok(card.unknowns.includes('sector'));
  assert.ok(!card.unknowns.includes('entity_name'));
  assert.deepEqual(card.facts.map((f) => f.field).sort(), ['employees', 'israel_connection']);
  assert.equal(card.evidence_url, SEARCH.good);
  assert.equal((await call('omer', 'GET', `/opportunities/${ids.acme}`)).status, 403);

  // Research companies stay out of the regular company list until a card is accepted.
  const companies = (await call('tom', 'GET', '/companies')).data;
  assert.equal(companies.some((c) => c.name === 'Acme Software'), false);
});

test('a second run skips known initiatives as duplicates', async () => {
  await call('shir', 'POST', `/mandates/${mandateId('SH2')}/runs`, { batch_size: 5 });
  await processNext(db, ai, TODAY);
  const run = db.prepare('SELECT * FROM research_runs ORDER BY id DESC LIMIT 1').get();
  assert.equal(run.cards_created, 0);
  assert.equal(run.duplicates, 3);
});

test('review decisions: reasons, verify task, accept makes the company visible, timing recorded', async () => {
  assert.equal((await call('omer', 'POST', `/opportunities/${ids.acme}/decision`, { decision: 'accept' })).status, 403);
  assert.equal((await call('shir', 'POST', `/opportunities/${ids.acme}/decision`, { decision: 'reject' })).data.error, 'reason is required to reject');
  assert.equal((await call('shir', 'POST', `/opportunities/${ids.acme}/decision`, { decision: 'verify' })).status, 400);
  assert.equal((await call('tom', 'POST', `/opportunities/${ids.delta}/decision`, { decision: 'accept' })).data.error, 'Assign an owner before deciding');

  const accepted = await call('shir', 'POST', `/opportunities/${ids.acme}/decision`, { decision: 'accept' });
  assert.equal(accepted.data.status, 'accepted');
  assert.ok(accepted.data.review_seconds >= 0); // the card was opened in the earlier test
  assert.equal((await call('shir', 'POST', `/opportunities/${ids.acme}/decision`, { decision: 'reject', reason: 'duplicate' })).status, 409);
  assert.equal((await call('tom', 'GET', '/companies')).data.some((c) => c.name === 'Acme Software'), true);
  const company = db.prepare("SELECT outreach_owner_id FROM companies WHERE name = 'Acme Software'").get();
  assert.equal(company.outreach_owner_id, ids.shir);

  const verified = await call('omer', 'POST', `/opportunities/${ids.metal}/decision`, { decision: 'verify', note: 'Confirm external search' });
  assert.equal(verified.data.status, 'verify');
  assert.equal(db.prepare("SELECT assignee FROM tasks WHERE description = 'Verify: Confirm external search'").get().assignee, 'Omer');

  const assigned = await call('tom', 'POST', `/opportunities/${ids.delta}/assign`, { owner_id: ids.shir });
  assert.equal(assigned.data.status, 'draft');
  const rejected = await call('shir', 'POST', `/opportunities/${ids.delta}/decision`, { decision: 'reject', reason: 'wrong_market' });
  assert.equal(rejected.data.decision_reason, 'wrong_market');
});

test('calibration compares two versions on saved examples', async () => {
  const sh2 = mandateId('SH2');
  const before = (await call('shir', 'GET', `/mandates/${sh2}`)).data;
  assert.equal((await call('shir', 'POST', `/mandates/${sh2}/examples`, { opportunity_id: ids.acme, label: 'good' })).status, 201);
  const version = await call('shir', 'POST', `/mandates/${sh2}/versions`, {
    ...Object.fromEntries(['target_countries', 'need_types', 'accept_rule', 'false_positives', 'search_terms', 'exclusions', 'proposed_service']
      .map((field) => [field, before.version[field]])),
    target_countries: ['Korea'], change_note: 'Try Korea instead of Japan',
  });
  assert.equal(version.status, 201);
  assert.equal(version.data.version, 2);

  const calibration = await call('shir', 'POST', `/mandates/${sh2}/calibrations`, { from_version_id: before.version.id, to_version_id: version.data.id });
  assert.equal(calibration.status, 201);
  await processNext(db, ai, TODAY);
  const detail = (await call('shir', 'GET', `/mandates/${sh2}`)).data;
  const [row] = detail.calibrations[0].rows;
  assert.equal(detail.calibrations[0].status, 'done');
  assert.deepEqual(row.before, { verdict: 'match', inScope: true, correct: true });
  assert.deepEqual(row.after, { verdict: 'match', inScope: false, correct: false }); // Korea no longer covers the Japan example
});

test('metrics per mandate', async () => {
  const metrics = (await call('tom', 'GET', '/research/metrics')).data;
  const sh2 = metrics.rows.find((r) => r.code === 'SH2');
  assert.equal(sh2.reviewed, 1); // Acme accepted
  assert.equal(sh2.accepted, 1);
  const unassigned = metrics.rows.find((r) => r.mandate_id === null);
  assert.equal(unassigned.rejected, 1); // Delta: assigned to an owner without a mandate, then rejected
  assert.deepEqual(unassigned.reject_reasons, { wrong_market: 1 });
  assert.equal(sh2.duplicates, 3);
  assert.equal(sh2.runs, 2);
});

test('budget cap pauses a run and a higher cap releases it', async () => {
  const spent = db.prepare('SELECT SUM(cost_usd) AS total FROM ai_usage').get().total;
  db.prepare("UPDATE settings SET value = ? WHERE key = 'ai_monthly_cap_usd'").run(String(spent + 0.05));
  const blocked = await call('shir', 'POST', `/mandates/${mandateId('SH1')}/runs`, { batch_size: 2 });
  assert.equal(blocked.status, 201); // there is still room for a call, but not for this run's estimate
  await processNext(db, ai, TODAY);
  assert.equal(db.prepare('SELECT status FROM research_runs WHERE id = ?').get(blocked.data.id).status, 'waiting_budget');
  assert.equal((await call('shir', 'PATCH', '/research/ai', { ai_monthly_cap_usd: 50 })).status, 403);
  const raised = await call('tom', 'PATCH', '/research/ai', { ai_monthly_cap_usd: 50 });
  assert.equal(raised.data.budget.cap, 50);
  assert.equal(db.prepare('SELECT status FROM research_runs WHERE id = ?').get(blocked.data.id).status, 'queued');
});

test('staff can add an opportunity with evidence; merge of research-only duplicates', async () => {
  const metal = db.prepare('SELECT company_id FROM opportunities WHERE id = ?').get(ids.metal).company_id;
  const added = await call('omer', 'POST', '/opportunities', {
    company_id: metal, mandate_id: mandateId('OM3'), relationship_role: 'client', target_country: 'Israel', need_type: 'executive_search',
    business_need: 'CFO succession', evidence_url: 'https://jobs.example/cfo', evidence_date: daysAgo(3), evidence_quote: 'We are looking for a CFO.',
  });
  assert.equal(added.status, 201);
  assert.equal(added.data.owner_id, ids.omer);
  assert.equal(added.data.status, 'draft');
  assert.equal(added.data.company_id, metal);

  const twin = await call('tom', 'POST', '/opportunities', {
    company_name: 'Metal Works Twin', website: 'https://twin.example', relationship_role: 'client', target_country: 'Israel',
    need_type: 'executive_search', business_need: 'COO', evidence_url: 'https://jobs.example/coo', evidence_date: daysAgo(2), evidence_quote: 'COO wanted.',
  });
  assert.equal(twin.data.status, 'manual_assignment');
  const merged = await call('tom', 'POST', `/companies/${twin.data.company_id}/merge`, { into_company_id: metal });
  assert.equal(merged.status, 200);
  assert.equal(db.prepare('SELECT company_id FROM opportunities WHERE id = ?').get(twin.data.id).company_id, metal);
});

test('weekly runs are queued once per mandate per week; interrupted runs fail', () => {
  const sunday = new Date('2026-11-22T08:00:00Z');
  db.prepare("UPDATE mandates SET schedule = 'weekly', schedule_weekday = 0 WHERE code = 'OM3'").run();
  assert.equal(scheduleWeeklyRuns(db, sunday), 1);
  assert.equal(scheduleWeeklyRuns(db, sunday), 0);
  db.prepare("UPDATE research_runs SET status = 'running' WHERE trigger = 'weekly'").run();
  recoverInterrupted(db);
  assert.equal(db.prepare("SELECT status FROM research_runs WHERE trigger = 'weekly'").get().status, 'failed');
});
