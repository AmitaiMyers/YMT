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
import { createGoogleClient, GMAIL_SCOPE } from '../src/google.js';
import { saveGoogleAccount } from '../src/calendarSync.js';
import { syncGmailReplies, parseGmailMessage, stripQuoted } from '../src/gmailReplies.js';
import { hasOptOutWords } from '../src/conversations.js';

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
  listed: 'https://news.example/listed-india',
  team: 'https://acmesoftware.example/team',
  linkedin: 'https://www.linkedin.com/in/dana-levi',
  stranger: 'https://news.example/stranger-india',
};
const prompts = [];

/** Scripted AI: discovery returns four candidates; classification and judgement depend on the company. */
function fakeScript() {
  const candidate = (name, url, need, country, quote) => ({
    company_name: name, website: `https://${name.toLowerCase().replace(/\s+/g, '')}.example`, source_url: url, source_title: `${name} news`,
    source_kind: 'web', published_on: daysAgo(12), initiative_quote: quote, target_country: country, need_type: need,
    business_need: quote, relationship_role: 'client',
  });
  return {
    run: async ({ tool, prompt }) => {
      prompts.push(prompt);
      if (tool.name === 'submit_candidates' && prompt.includes("YMT's watch list")) {
        return {
          input: { candidates: [
            { ...candidate('Listed Co', SEARCH.listed, 'market_entry_distribution', 'India', 'Listed Co is appointing a distributor in India.'), website: '' },
            candidate('Stranger Co', SEARCH.stranger, 'market_entry_distribution', 'India', 'Stranger Co enters India.'),
          ] },
          sources: Object.values(SEARCH).map((url) => ({ url, title: 'Result' })),
          usage: { input: 5000, output: 500, cacheRead: 0, cacheWrite: 0, searches: 2 },
        };
      }
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
      if (tool.name === 'submit_contacts') {
        return {
          input: { contacts: [
            { full_name: 'Dana Levi', job_title: 'VP Business Development', email: 'dana@acmesoftware.example', linkedin_url: SEARCH.linkedin,
              source_url: SEARCH.team, quote: 'Dana Levi, VP Business Development (dana@acmesoftware.example), leads partnerships.' },
            { full_name: 'Yossi Cohen', job_title: 'CEO', email: 'yossi.cohen@gmail.com', linkedin_url: 'https://www.linkedin.com/in/not-in-search',
              source_url: SEARCH.team, quote: 'CEO Yossi Cohen (yossi.cohen@gmail.com) founded Acme.' },
            { full_name: 'Ghost Person', job_title: 'CTO', email: '', linkedin_url: '', source_url: 'https://invented.example/x', quote: 'Ghost is CTO.' },
          ],
          company_routes: {
            email: 'info@acmesoftware.example', phone: '+972 3 555 0000', quote: 'Contact us: info@acmesoftware.example · +972 3 555 0000', source_url: SEARCH.team,
            linkedin_page_url: 'http://www.linkedin.com/company/acme-software', contact_page_url: 'https://acmesoftware.example/contact',
          } },
          sources: [{ url: SEARCH.team, title: 'Team' }, { url: SEARCH.linkedin, title: 'Dana Levi | LinkedIn' }, { url: 'https://www.linkedin.com/company/acme-software', title: 'Acme | LinkedIn' }],
          usage: { input: 3000, output: 300, cacheRead: 0, cacheWrite: 0, searches: 2 },
        };
      }
      if (tool.name === 'submit_reply_analysis') {
        const reply = prompt.split('New reply')[1];
        if (reply.includes('garbage')) return { input: { classification: 'maybe' }, sources: [], usage: { input: 900, output: 50, cacheRead: 0, cacheWrite: 0, searches: 0 } };
        const price = reply.includes('price');
        const remove = /remove|הסר/.test(reply);
        return {
          input: {
            classification: remove ? 'opt_out' : price ? 'question' : 'interested',
            summary: remove ? 'Asks to be removed.' : price ? 'Asks for the price of a partner shortlist.' : 'Wants a call.',
            opt_out: remove, missing: price ? ['Fee for a partner shortlist'] : [],
            draft_subject: 'Re: Japanese integration partners',
            draft_body: remove ? '' : 'Thank you, Dana. I will check the fee and come back to you this week.\nShir, YMT Group',
          },
          sources: [],
          usage: { input: 2500, output: 300, cacheRead: 0, cacheWrite: 0, searches: 0 },
        };
      }
      if (tool.name === 'submit_draft') {
        return {
          input: { subject: 'Japanese integration partners', body: 'Dear Dana,\nI read that Acme is seeking Japanese implementation partners.\nShir, YMT Group' },
          sources: [],
          usage: { input: 1500, output: 200, cacheRead: 0, cacheWrite: 0, searches: 0 },
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
            export_proof: 'proven', registry_number: '', other_names: [], description: `${name} sells B2B software.`,
            markets: [{ market: 'india', status: 'not_active', fit: 'possible', note: '', source_url: url }, { market: 'japan', status: 'exploring', fit: 'fit', note: '', source_url: url }],
            facts: [
              { field: 'export_proof', value: 'proven', source_url: url, quote: 'customers in Europe and Asia', entity_covered: name },
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
          reason_to_act: 'Published this month.', trigger_kind: homepage ? 'none' : 'distributor_search', trigger_strength: homepage ? '' : 'A dated, public partner search.',
          subsector_fit: 'priority', service_code: 'GL-12', proposed_service: 'Shortlist partners', unknowns: [] },
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
  assert.deepEqual(card.facts.map((f) => f.field).sort(), ['employees', 'export_proof', 'israel_connection']);
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
  while (await processNext(db, ai, TODAY)) { /* the decision-maker search queued by Accept runs first */ }
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
  // Spec 22.11 seeds every mandate weekly; this test schedules only OM3.
  db.prepare("UPDATE mandates SET schedule = 'off'").run();
  db.prepare("UPDATE mandates SET schedule = 'weekly', schedule_weekday = 0 WHERE code = 'OM3'").run();
  assert.equal(scheduleWeeklyRuns(db, sunday), 1);
  assert.equal(scheduleWeeklyRuns(db, sunday), 0);
  db.prepare("UPDATE research_runs SET status = 'running' WHERE trigger = 'weekly'").run();
  recoverInterrupted(db);
  assert.equal(db.prepare("SELECT status FROM research_runs WHERE trigger = 'weekly'").get().status, 'failed');
});

test('watch lists: import with duplicates, runs check listed companies only, rotation and weekly runs', async () => {
  const bad = await call('shir', 'POST', '/watch-lists', { name: 'Bad', entries: [{ name: 'X', website: 'not a site' }] });
  assert.equal(bad.status, 400);
  assert.equal(bad.data.error, 'Row 1: website "not a site" is not a web address');

  const created = await call('shir', 'POST', '/watch-lists', {
    name: 'Exporters 2026', source_url: 'https://data.example/exporters',
    entries: [{ name: 'Listed Co', website: 'listedco.example' }, { name: 'Listed Co Ltd' }, { name: 'Other Co', website: 'https://other.example' }],
  });
  assert.equal(created.status, 201);
  assert.deepEqual([created.data.added, created.data.skipped], [2, 1]);
  const listId = created.data.id;

  const empty = await call('shir', 'POST', '/watch-lists', { name: 'Empty', entries: [{ name: 'Only Co' }] });
  db.prepare('DELETE FROM watch_list_entries WHERE list_id = ?').run(empty.data.id);
  assert.equal((await call('shir', 'POST', `/mandates/${mandateId('SH1')}/runs`, { batch_size: 2, watch_list_id: empty.data.id })).data.error, 'This watch list has no companies yet');

  while (await processNext(db, ai, TODAY)) { /* finish runs queued by earlier tests */ }
  const run = await call('shir', 'POST', `/mandates/${mandateId('SH1')}/runs`, { batch_size: 2, watch_list_id: listId });
  assert.equal(run.status, 201);
  prompts.length = 0;
  await processNext(db, ai, TODAY);
  const done = db.prepare('SELECT * FROM research_runs WHERE id = ?').get(run.data.id);
  assert.equal(done.status, 'done', done.error);
  assert.equal(done.companies_checked, 2);
  assert.equal(done.cards_created, 1);
  assert.equal(done.filtered, 1); // Stranger Co is not on the list
  assert.ok(prompts[0].includes('- Listed Co (listedco.example)'));
  assert.ok(!prompts[0].includes('Skip these companies'));
  const listed = db.prepare("SELECT website FROM companies WHERE name = 'Listed Co'").get();
  assert.equal(listed.website, 'listedco.example'); // filled in from the list
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM watch_checks WHERE mandate_id = ?').get(mandateId('SH1')).n, 2);

  const card = db.prepare("SELECT o.id FROM opportunities o JOIN companies c ON c.id = o.company_id WHERE c.name = 'Listed Co'").get();
  assert.equal((await call('shir', 'GET', `/opportunities/${card.id}`)).data.watch_list_name, 'Exporters 2026');
  const lists = (await call('omer', 'GET', '/watch-lists')).data;
  const summary = lists.find((l) => l.id === listId);
  assert.deepEqual([summary.entry_count, summary.checked_count, summary.cards_found], [2, 2, 1]);

  assert.equal((await call('tom', 'PATCH', `/mandates/${mandateId('SH1')}`, { weekly_watch_list_id: listId, schedule: 'weekly', schedule_weekday: 1 })).status, 200);
  assert.equal(scheduleWeeklyRuns(db, new Date('2026-11-23T08:00:00Z')), 1); // Monday
  assert.equal(db.prepare("SELECT watch_list_id FROM research_runs WHERE trigger = 'weekly' AND mandate_id = ?").get(mandateId('SH1')).watch_list_id, listId);

  assert.equal((await call('omer', 'DELETE', `/watch-lists/${listId}`)).status, 403);
  assert.equal((await call('shir', 'DELETE', `/watch-lists/${listId}`)).status, 200);
});

test('Release 2: accept writes the timeline and finds decision makers; open one deal per card; contacts confirmed by the owner', async () => {
  while (await processNext(db, ai, TODAY)) { /* finish queued work */ }
  const card = (await call('shir', 'GET', `/opportunities/${ids.acme}`)).data;
  assert.equal(card.contact_search.status, 'done', card.contact_search.error);
  const people = Object.fromEntries(card.contact_proposals.map((p) => [p.full_name, p]));
  assert.deepEqual(Object.keys(people).sort(), ['Dana Levi', 'Yossi Cohen']); // Ghost: source not returned by the search
  assert.equal(people['Dana Levi'].email, 'dana@acmesoftware.example');
  assert.equal(people['Dana Levi'].linkedin_url, SEARCH.linkedin);
  assert.equal(people['Yossi Cohen'].email, null); // personal mailbox dropped
  assert.equal(people['Yossi Cohen'].linkedin_url, null); // link not returned by the search
  // The company's general ways in, each backed by a page the search returned.
  assert.deepEqual([card.company.general_email, card.company.general_phone, card.company.linkedin_page_url, card.company.contact_page_url, card.company.routes_source_url],
    ['info@acmesoftware.example', '+972 3 555 0000', 'https://www.linkedin.com/company/acme-software', 'https://acmesoftware.example/contact', SEARCH.team]);

  assert.equal((await call('omer', 'POST', `/contact-proposals/${people['Dana Levi'].id}/confirm`, { department: 'growth', preferred_language: 'en' })).status, 403);
  const confirmed = await call('shir', 'POST', `/contact-proposals/${people['Dana Levi'].id}/confirm`, { department: 'growth', preferred_language: 'en' });
  assert.equal(confirmed.status, 200);
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(confirmed.data.contact_id);
  assert.deepEqual([contact.verified, contact.verified_source, contact.email], [1, SEARCH.team, 'dana@acmesoftware.example']);
  assert.equal((await call('shir', 'POST', `/contact-proposals/${people['Dana Levi'].id}/confirm`, { department: 'growth', preferred_language: 'en' })).status, 409);
  assert.equal((await call('shir', 'POST', `/contact-proposals/${people['Yossi Cohen'].id}/dismiss`)).status, 200);

  // A second search does not propose the same people again.
  assert.equal((await call('shir', 'POST', `/opportunities/${ids.acme}/contacts/search`)).status, 201);
  while (await processNext(db, ai, TODAY)) { /* run it */ }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM contact_proposals WHERE opportunity_id = ?').get(ids.acme).n, 2);

  // Accept opened the card's one deal (decision 21); mandate defaults apply to later accepts.
  const workflowId = db.prepare('SELECT id FROM workflows ORDER BY id LIMIT 1').get().id;
  assert.equal((await call('tom', 'PATCH', `/mandates/${mandateId('SH2')}`, { default_workflow_id: workflowId, default_deal_model: 'retainer' })).status, 200);
  assert.deepEqual((await call('shir', 'GET', `/opportunities/${ids.acme}`)).data.deal_defaults, { default_workflow_id: workflowId, default_deal_model: 'retainer' });
  assert.equal((await call('omer', 'POST', `/opportunities/${ids.metal}/deal`, { title: 'x', workflow_id: workflowId, deal_model: 'retainer' })).data.error, 'Accept the card before opening a deal');
  const deal = { data: (await call('shir', 'GET', `/opportunities/${ids.acme}`)).data.deal };
  assert.ok(deal.data.id, 'Accept opens the deal');
  assert.equal((await call('shir', 'POST', `/opportunities/${ids.acme}/deal`, { title: 'again', workflow_id: workflowId, deal_model: 'retainer' })).data.error, `This card already has deal #${deal.data.id}`);
  const dealPage = (await call('shir', 'GET', `/deals/${deal.data.id}`)).data;
  assert.equal(dealPage.research_card.mandate_code, 'SH2');
  assert.equal(dealPage.research_card.evidence_url, SEARCH.good);
  assert.equal(dealPage.owner_id, ids.shir);
  const timeline = db.prepare('SELECT summary FROM interactions WHERE company_id = ? ORDER BY id').all(dealPage.company_id).map((i) => i.summary);
  assert.ok(timeline[0].startsWith('Research card accepted (SH2)'));
  assert.ok(timeline.some((summary) => summary.startsWith('Deal opened from research card')));
  assert.equal((await call('shir', 'GET', `/opportunities/${ids.acme}`)).data.deal.id, deal.data.id);

  const research = (await call('shir', 'GET', `/companies/${dealPage.company_id}/research`)).data;
  assert.deepEqual(research.map((r) => r.id), [ids.acme]);
});

test('Release 3: first approach drafted from the card, legal gate, manual channels, opt-out and do-not-contact list', async () => {
  const card = (await call('shir', 'GET', `/opportunities/${ids.acme}`)).data;
  const companyId = card.company.id;
  const dana = card.outreach.contacts.find((c) => c.full_name === 'Dana Levi');
  assert.equal(card.outreach.ai_problem, null);
  assert.equal(dana.recipient_country, 'Israel'); // falls back to the company's HQ country
  assert.deepEqual(dana.channels, { email: null, linkedin: null, whatsapp: 'no_phone' });

  // AI draft → approval queue with the opt-out sentence and the "פרסומת" marking.
  assert.equal((await call('omer', 'POST', `/opportunities/${ids.acme}/approaches`, { contact_id: dana.id, channel: 'email', mode: 'ai' })).status, 403);
  const drafted = await call('shir', 'POST', `/opportunities/${ids.acme}/approaches`, { contact_id: dana.id, channel: 'email', mode: 'ai' });
  assert.equal(drafted.status, 201, drafted.data.error);
  assert.ok(prompts.at(-1).includes('Acme is seeking Japanese implementation partners.') && prompts.at(-1).includes('Dana Levi'));
  const rules = (await call('shir', 'GET', '/outreach/rules')).data;
  const item = (await call('shir', 'GET', `/approvals/${drafted.data.id}`)).data;
  assert.deepEqual([item.kind, item.channel, item.recipient_email, item.opportunity_id, item.language],
    ['first_approach', 'email', 'dana@acmesoftware.example', ids.acme, 'en']);
  assert.equal(item.subject, 'פרסומת: Japanese integration partners');
  assert.ok(item.content.startsWith('Dear Dana') && item.content.endsWith(rules.opt_out.en));
  assert.equal(item.deal_id, card.deal.id);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM ai_usage WHERE task = 'outreach'").get().n, 1);
  assert.match((await call('shir', 'POST', `/opportunities/${ids.acme}/approaches`, { contact_id: dana.id, channel: 'linkedin', mode: 'ai' })).data.error, /already waiting/);

  // The marking and the opt-out sentence cannot be removed.
  await call('shir', 'PATCH', `/approvals/${item.id}`, { subject: 'Japanese integration partners', content: item.content });
  assert.match((await call('shir', 'POST', `/approvals/${item.id}/approve`, {})).data.error, /must start with "פרסומת"/);
  await call('shir', 'PATCH', `/approvals/${item.id}`, { subject: item.subject, content: item.content });
  assert.equal((await call('shir', 'POST', `/approvals/${item.id}/approve`, {})).status, 200);
  assert.equal((await call('shir', 'POST', `/approvals/${item.id}/mark-sent`)).status, 200);
  const sent = { ...db.prepare('SELECT channel, summary, deal_id FROM interactions WHERE contact_id = ? ORDER BY id DESC').get(dana.id) };
  assert.deepEqual(sent, { channel: 'email', summary: item.subject, deal_id: card.deal.id });
  assert.match((await call('shir', 'POST', `/opportunities/${ids.acme}/approaches`, { contact_id: dana.id, channel: 'linkedin', mode: 'blank' })).data.error, /already sent/);

  // Countries an admin has not cleared are blocked; clearing is admin-only.
  const hans = (await call('shir', 'POST', `/companies/${companyId}/contacts`, {
    full_name: 'Hans Weber', department: 'sales', country: 'Germany', preferred_language: 'en', linkedin_url: 'https://de.linkedin.com/in/Hans-Weber/',
  })).data.id;
  assert.match((await call('shir', 'POST', `/opportunities/${ids.acme}/approaches`, { contact_id: hans, channel: 'linkedin', mode: 'blank' })).data.error, /not cleared/);
  const newRules = { cleared_countries: ['Israel', 'Germany'], opt_out_he: rules.opt_out.he, opt_out_en: rules.opt_out.en };
  assert.equal((await call('shir', 'PUT', '/outreach/rules', newRules)).status, 403);
  assert.equal((await call('tom', 'PUT', '/outreach/rules', newRules)).status, 200);
  // Decision 19: the role must have been checked against a public source in the last 30 days.
  assert.match((await call('shir', 'POST', `/opportunities/${ids.acme}/approaches`, { contact_id: hans, channel: 'linkedin', mode: 'blank' })).data.error, /current role/);
  await call('shir', 'PATCH', `/contacts/${hans}`, { verified: true, verified_source: 'https://de.linkedin.com/in/Hans-Weber/' });
  const linkedin = await call('shir', 'POST', `/opportunities/${ids.acme}/approaches`, { contact_id: hans, channel: 'linkedin', mode: 'blank' });
  assert.equal(linkedin.status, 201, linkedin.data.error);
  const linkedinItem = (await call('shir', 'GET', `/approvals/${linkedin.data.id}`)).data;
  assert.deepEqual([linkedinItem.subject, linkedinItem.recipient_linkedin, linkedinItem.content.trim()], [null, 'https://de.linkedin.com/in/Hans-Weber/', rules.opt_out.en]);

  // An opt-out withdraws waiting messages and puts the person's details on the do-not-contact list.
  assert.equal((await call('shir', 'POST', `/contacts/${hans}/opt-out`, { reason: 'Replied "remove"' })).status, 200);
  assert.equal((await call('shir', 'GET', `/approvals/${linkedin.data.id}`)).data.status, 'rejected');
  const listed = (await call('shir', 'GET', '/suppressions')).data;
  assert.deepEqual(listed.map((row) => [row.kind, row.value]), [['linkedin', 'https://linkedin.com/in/hans-weber']]);
  const afterOptOut = (await call('shir', 'GET', `/opportunities/${ids.acme}`)).data.outreach.contacts.find((c) => c.id === hans);
  assert.equal(afterOptOut.channels.linkedin, 'opted_out');

  // WhatsApp: international number and consent; an opt-out after approval still blocks "mark as sent".
  const noa = (await call('shir', 'POST', `/companies/${companyId}/contacts`, {
    full_name: 'Noa Bar', department: 'management', phone: '050-123-4567', email: 'noa@acmesoftware.example',
    verified: true, verified_source: SEARCH.team,
  })).data.id;
  const channelsOf = async (id) => (await call('shir', 'GET', `/opportunities/${ids.acme}`)).data.outreach.contacts.find((c) => c.id === id).channels;
  assert.equal((await channelsOf(noa)).whatsapp, 'phone_format');
  await call('shir', 'PATCH', `/contacts/${noa}`, { phone: '+972 50-123-4567' });
  assert.equal((await channelsOf(noa)).whatsapp, 'no_whatsapp_consent');
  await call('shir', 'PATCH', `/contacts/${noa}`, { whatsapp_consent: true });
  assert.equal((await channelsOf(noa)).whatsapp, null);
  const whatsapp = (await call('shir', 'POST', `/opportunities/${ids.acme}/approaches`, { contact_id: noa, channel: 'whatsapp', mode: 'blank' })).data.id;
  const whatsappItem = (await call('shir', 'GET', `/approvals/${whatsapp}`)).data;
  assert.equal(whatsappItem.language, 'he');
  assert.ok(whatsappItem.content.startsWith('פרסומת\n') && whatsappItem.content.endsWith(rules.opt_out.he));
  await call('shir', 'PATCH', `/approvals/${whatsapp}`, { content: whatsappItem.content.replace('\n\n', '\nשלום נועה\n\n'), recipient_phone: whatsappItem.recipient_phone });
  assert.equal((await call('shir', 'POST', `/approvals/${whatsapp}/approve`, {})).status, 200);
  assert.equal((await call('omer', 'POST', '/suppressions', { kind: 'domain', value: 'https://www.AcmeSoftware.example/about' })).status, 201);
  assert.match((await call('shir', 'POST', `/approvals/${whatsapp}/mark-sent`)).data.error, /do-not-contact/);
  const domainRow = db.prepare("SELECT id, value FROM suppressions WHERE kind = 'domain'").get();
  assert.equal(domainRow.value, 'acmesoftware.example');
  assert.equal((await call('omer', 'DELETE', `/suppressions/${domainRow.id}`)).status, 403);
  assert.equal((await call('tom', 'DELETE', `/suppressions/${domainRow.id}`)).status, 200);
  assert.equal((await call('shir', 'POST', `/approvals/${whatsapp}/mark-sent`)).status, 200);
  const whatsappSent = { ...db.prepare('SELECT channel, summary FROM interactions WHERE contact_id = ? ORDER BY id DESC').get(noa) };
  assert.deepEqual(whatsappSent, { channel: 'whatsapp', summary: 'שלום נועה' });
});

test('Release 4: follow-ups after N days, replies analysed from approved answers, opt-out decided by the owner', async () => {
  const contactIdOf = (name) => db.prepare('SELECT id FROM contacts WHERE full_name = ?').get(name).id;
  const dana = contactIdOf('Dana Levi');
  const noa = contactIdOf('Noa Bar');
  const all = (await call('shir', 'GET', '/conversations?view=all')).data;
  assert.deepEqual(all.map((row) => row.full_name).sort(), ['Dana Levi', 'Noa Bar']);
  assert.deepEqual((await call('omer', 'GET', '/conversations?view=all')).data, []);
  assert.equal((await call('omer', 'GET', `/conversations/${dana}`)).status, 403);

  // Follow-up: not before followup_after_days; same channel, legal gate, one in the queue at a time, capped.
  assert.match((await call('shir', 'POST', `/conversations/${dana}/followup`, { mode: 'ai' })).data.error, /due from/);
  const eightDaysAgo = new Date(Date.now() - 8 * 86400000).toISOString();
  db.prepare("UPDATE approvals SET sent_at = ? WHERE contact_id = ? AND status = 'sent'").run(eightDaysAgo, dana);
  assert.deepEqual((await call('shir', 'GET', '/conversations/counts')).data, { needs_answer: 0, followup_due: 1 });
  const followup = await call('shir', 'POST', `/conversations/${dana}/followup`, { mode: 'ai' });
  assert.equal(followup.status, 201, followup.data.error);
  assert.ok(prompts.at(-1).includes('follow-up number 1') && prompts.at(-1).includes('Dear Dana'));
  const followupItem = (await call('shir', 'GET', `/approvals/${followup.data.id}`)).data;
  const rules = (await call('shir', 'GET', '/outreach/rules')).data;
  assert.deepEqual([followupItem.kind, followupItem.channel, followupItem.subject], ['approach_followup', 'email', 'פרסומת: Re: Japanese integration partners']);
  assert.ok(followupItem.content.endsWith(rules.opt_out.en));
  assert.match((await call('shir', 'POST', `/conversations/${dana}/followup`, { mode: 'blank' })).data.error, /already waiting/);
  await call('shir', 'POST', `/approvals/${followup.data.id}/approve`, {});
  await call('shir', 'POST', `/approvals/${followup.data.id}/mark-sent`);
  assert.equal((await call('tom', 'PATCH', '/settings', { max_followups: 1 })).status, 200);
  db.prepare("UPDATE approvals SET sent_at = ? WHERE contact_id = ? AND status = 'sent'").run(eightDaysAgo, dana);
  assert.match((await call('shir', 'POST', `/conversations/${dana}/followup`, { mode: 'blank' })).data.error, /limit \(1\)/);
  await call('tom', 'PATCH', '/settings', { max_followups: 3 });

  // Approved answers: admin-only edits; the AI sees them.
  assert.equal((await call('shir', 'POST', '/approved-answers', { language: 'en', title: 'How YMT works', body: 'We shortlist partners in 4 weeks.' })).status, 403);
  assert.equal((await call('tom', 'POST', '/approved-answers', { language: 'en', title: 'How YMT works', body: 'We shortlist partners in 4 weeks.' })).status, 201);

  // A pasted reply with a question nobody approved an answer for: task + answer draft that promises to come back.
  const received = new Date(Date.now() - 3600000).toISOString();
  const pasted = await call('shir', 'POST', `/conversations/${dana}/replies`, { channel: 'email', body: 'Thanks. What is your price for a partner shortlist?', received_at: received });
  assert.equal(pasted.status, 201, pasted.data.error);
  assert.deepEqual([pasted.data.classification, pasted.data.opt_out_state, JSON.parse(pasted.data.missing)], ['question', 'none', ['Fee for a partner shortlist']]);
  assert.ok(prompts.at(-1).includes('### How YMT works') && prompts.at(-1).includes('Dear Dana'));
  assert.ok(db.prepare("SELECT 1 FROM tasks WHERE description LIKE 'Reply from Dana Levi – find out: Fee for a partner shortlist'").get());
  const view = (await call('shir', 'GET', `/conversations/${dana}`)).data;
  const answer = view.messages.find((message) => message.kind === 'reply');
  assert.deepEqual([answer.status, answer.reply_id, answer.subject, answer.recipient_email], ['pending', pasted.data.id, 'Re: Japanese integration partners', 'dana@acmesoftware.example']);
  assert.equal(view.followup.blocker, 'replied');
  assert.deepEqual((await call('shir', 'GET', '/conversations/counts')).data, { needs_answer: 1, followup_due: 0 });
  assert.equal((await call('shir', 'POST', `/approvals/${answer.id}/approve`, {})).status, 200, 'answers are not cold messages: no opt-out sentence needed');
  await call('shir', 'POST', `/approvals/${answer.id}/mark-sent`);
  assert.equal(db.prepare('SELECT status FROM replies WHERE id = ?').get(pasted.data.id).status, 'handled');

  // An unusable AI answer never loses the reply; it can be analysed again.
  const garbage = (await call('shir', 'POST', `/conversations/${dana}/replies`, { channel: 'email', body: 'garbage', received_at: received })).data;
  assert.match(garbage.analysis_error, /classification must be one of/);
  assert.equal(garbage.classification, null);

  // Opt-out words: pending at once, nothing can be approved to the person until the owner decides.
  const removeMe = (await call('shir', 'POST', `/conversations/${noa}/replies`, { channel: 'whatsapp', body: 'Please remove me from your list', received_at: received })).data;
  assert.equal(removeMe.opt_out_state, 'pending');
  const noaView = (await call('shir', 'GET', `/conversations/${noa}`)).data;
  assert.deepEqual([noaView.opt_out_pending, noaView.contact.channel_problem, noaView.messages.filter((m) => m.kind === 'reply').length], [true, 'opt_out_pending', 0]);
  assert.match((await call('shir', 'POST', `/replies/${removeMe.id}/handled`)).data.error, /opt-out first/);
  assert.equal((await call('shir', 'POST', `/replies/${removeMe.id}/opt-out`, { decision: 'dismiss' })).status, 200);
  assert.equal((await call('shir', 'GET', `/conversations/${noa}`)).data.contact.channel_problem, null);
  const hebrew = (await call('shir', 'POST', `/conversations/${noa}/replies`, { channel: 'whatsapp', body: 'הסר', received_at: received })).data;
  assert.equal((await call('shir', 'POST', `/replies/${hebrew.id}/opt-out`, { decision: 'confirm' })).status, 200);
  const noaContact = db.prepare('SELECT opted_out_at FROM contacts WHERE id = ?').get(noa);
  assert.ok(noaContact.opted_out_at);
  assert.ok(db.prepare("SELECT 1 FROM suppressions WHERE kind = 'phone' AND value = '972501234567'").get());
  assert.deepEqual(db.prepare('SELECT DISTINCT status FROM replies WHERE contact_id = ?').all(noa).map((row) => row.status), ['handled']);
  assert.equal(hasOptOutWords('We stopped the project'), false);
  assert.equal(hasOptOutWords('Please unsubscribe me'), true);
});

test('Release 4: Gmail replies are read only from addresses we emailed, without quoted text, once', async () => {
  assert.equal(stripQuoted('Sounds good, call me.\n\nOn Mon, 1 Dec 2026 Shir wrote:\n> Dear Dana'), 'Sounds good, call me.');
  assert.equal(stripQuoted('נשמע טוב\n\nבתאריך יום ב׳, שיר כתבה:\nשלום'), 'נשמע טוב');
  const encode = (text) => Buffer.from(text).toString('base64url');
  const messages = {
    m1: { id: 'm1', internalDate: String(Date.now() - 60000), payload: { mimeType: 'multipart/alternative', headers: [
      { name: 'From', value: 'Dana Levi <Dana@AcmeSoftware.example>' }, { name: 'Subject', value: 'Re: Japanese integration partners' }],
    parts: [{ mimeType: 'text/plain', body: { data: encode('Yes, let us talk on Tuesday.\n\nOn Mon Shir wrote:\n> hello') } }, { mimeType: 'text/html', body: { data: encode('<p>x</p>') } }] } },
    m2: { id: 'm2', internalDate: String(Date.now() - 60000), payload: { mimeType: 'text/plain', headers: [{ name: 'From', value: 'spoof@evil.example' }], body: { data: encode('hi') } } },
  };
  assert.equal(parseGmailMessage(messages.m1).from, 'dana@acmesoftware.example');
  const searches = [];
  const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const google = createGoogleClient({ clientId: 'id', clientSecret: 'secret', publicUrl: 'https://ymt.example', encryptionKey: 'k'.repeat(32) }, async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/messages')) {
      searches.push(parsed.searchParams.get('q'));
      return json(parsed.searchParams.get('q').startsWith('from:dana@acmesoftware.example') ? { messages: [{ id: 'm1' }, { id: 'm2' }] } : { resultSizeEstimate: 0 });
    }
    return json(messages[parsed.pathname.split('/').at(-1)]);
  });
  saveGoogleAccount(db, google, ids.shir, { email: 'shir@ymt.example', scopes: ['openid', GMAIL_SCOPE], accessToken: 'a', refreshToken: 'r', expiresAt: new Date(Date.now() + 3600000).toISOString() });
  const result = await syncGmailReplies(db, google, ai, ids.shir);
  assert.deepEqual(searches, ['from:dana@acmesoftware.example after:' + Math.floor(Date.parse(db.prepare("SELECT MIN(sent_at) AS t FROM approvals WHERE recipient_email = 'dana@acmesoftware.example' AND status = 'sent'").get().t) / 1000)]);
  assert.deepEqual(result, { checked: 1, added: 1 });
  const reply = db.prepare("SELECT * FROM replies WHERE source = 'gmail'").get();
  assert.deepEqual([reply.body, reply.gmail_message_id, reply.classification], ['Yes, let us talk on Tuesday.', 'm1', 'interested']);
  assert.deepEqual(await syncGmailReplies(db, google, ai, ids.shir), { checked: 1, added: 0 });
  assert.ok(db.prepare('SELECT gmail_checked_at FROM google_accounts WHERE user_id = ?').get(ids.shir).gmail_checked_at);
});
