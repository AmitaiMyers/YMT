// Apollo and Lusha: keys, company search into a watch list, decision makers on a card. A fake fetch answers in the
// formats of the providers' API references and records every request, so the requests we send are checked too.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, insert } from '../src/db.js';
import { createApp } from '../src/app.js';
import { createUser } from '../src/auth.js';

const requests = [];
let nextStatus = 200;

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function fakeFetch(url, init) {
  if (!String(url).startsWith('https://api.')) return fetch(url, init); // the test's own calls to the app
  const parsed = new URL(url);
  requests.push({ host: parsed.host, path: parsed.pathname, query: parsed.searchParams, headers: init.headers, body: init.body ? JSON.parse(init.body) : null });
  if (nextStatus !== 200) {
    const status = nextStatus;
    nextStatus = 200;
    return new Response('{"error":"Insufficient credits"}', { status });
  }
  if (parsed.pathname === '/api/v1/mixed_companies/search') {
    return json({ pagination: { page: 1 }, organizations: [
      { id: 'o1', name: 'Magen eco-Energy', website_url: 'http://www.magen-eco.example', primary_domain: 'magen-eco.example' },
      { id: 'o2', name: 'Cortex Dental', website_url: null, primary_domain: 'cortex-dental.example' },
    ] });
  }
  if (parsed.pathname === '/api/v1/mixed_people/api_search') {
    return json({ total_entries: 2, people: [{ id: 'p1', first_name: 'Dana', last_name_obfuscated: 'Le***i', title: 'VP Sales' }, { id: 'p2', first_name: 'Yossi', title: 'CEO' }] });
  }
  if (parsed.pathname === '/api/v1/people/match') {
    const id = parsed.searchParams.get('id');
    return json({ person: id === 'p1'
      ? { id: 'p1', name: 'Dana Levi', title: 'VP Sales', email: 'dana@acme.example', linkedin_url: 'http://www.linkedin.com/in/dana-levi' }
      : { id: 'p2', name: 'Yossi Cohen', title: 'CEO', email: 'yossi@gmail.com', linkedin_url: null } });
  }
  if (parsed.pathname === '/v3/companies/prospecting') {
    return json({ results: [
      { id: 'c1', name: 'Tomorrow.io', domain: 'tomorrow.example', industry: 'Software', location: { country: 'Israel' } },
      { id: 'c2', error: { code: 'COMPLIANCE_RESTRICTED' } },
    ], pagination: { page: 0, size: 10, total: 2 } });
  }
  if (parsed.pathname === '/v3/contacts/prospecting') return json({ results: [{ id: 'l1', firstName: 'Noa' }, { id: 'l2', error: { code: 'NOT_FOUND' } }] });
  if (parsed.pathname === '/v3/contacts/enrich') {
    return json({ results: [{ id: 'l1', fullName: 'Noa Bar', jobTitle: { title: 'VP Business Development' },
      emails: [{ email: 'noa@gmail.com', type: 'private' }, { email: 'noa@acme.example', type: 'work' }], socialLinks: { linkedin: 'https://www.linkedin.com/in/noa-bar' } }], status: 'completed' });
  }
  throw new Error(`Unexpected request ${url}`);
}

let server;
let baseUrl;
let db;
const cookies = {};

async function call(user, method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { 'Content-Type': 'application/json', Cookie: cookies[user] }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
}

before(async () => {
  db = openDatabase(':memory:');
  createUser(db, { username: 'tom', display_name: 'Tom', password: 'correct-horse', role: 'admin' });
  createUser(db, { username: 'shir', display_name: 'Shir', password: 'correct-horse', role: 'member' });
  server = createApp(db, { dbPath: ':memory:', hostingLocation: 'test', fetchImpl: fakeFetch }).listen(0);
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

const search = { list_name: 'Israeli exporters', countries: 'Israel', keywords: 'plastics, valves', employees_min: 50, employees_max: 250, limit: 25 };

test('keys: admins save them, nobody sees them back; searches need a connected provider', async () => {
  assert.equal((await call('shir', 'POST', '/data-sources/apollo/companies', search)).status, 409);
  assert.equal((await call('shir', 'PUT', '/data-sources/apollo', { api_key: 'apollo-secret-1234' })).status, 403);
  const saved = await call('tom', 'PUT', '/data-sources/apollo', { api_key: 'apollo-secret-1234' });
  assert.deepEqual([saved.data.apollo.configured, saved.data.apollo.key_end, saved.data.lusha.configured], [true, '1234', false]);
  assert.ok(!JSON.stringify((await call('shir', 'GET', '/data-sources')).data).includes('apollo-secret'));
  assert.ok(!JSON.stringify((await call('shir', 'GET', '/settings')).data).includes('apollo-secret'));
  assert.equal((await call('tom', 'PUT', '/data-sources/hubspot', { api_key: 'x' })).status, 400);
  assert.equal((await call('tom', 'PUT', '/data-sources/lusha', { api_key: 'lusha-secret-9876' })).status, 200);
});

test('Apollo company search fills a new watch list; a second search skips the duplicates', async () => {
  const first = await call('shir', 'POST', '/data-sources/apollo/companies', search);
  assert.equal(first.status, 201, first.data.error);
  assert.deepEqual([first.data.found, first.data.added], [2, 2]);
  const request = requests.at(-1);
  assert.equal(request.headers['x-api-key'], 'apollo-secret-1234');
  assert.deepEqual(request.query.getAll('organization_locations[]'), ['Israel']);
  assert.deepEqual(request.query.getAll('q_organization_keyword_tags[]'), ['plastics', 'valves']);
  assert.deepEqual(request.query.getAll('organization_num_employees_ranges[]'), ['50,250']);
  assert.equal(request.query.get('per_page'), '25');
  const list = (await call('shir', 'GET', `/watch-lists/${first.data.list_id}`)).data;
  assert.deepEqual(list.entries.map((e) => [e.name, e.website]), [['Cortex Dental', 'https://cortex-dental.example'], ['Magen eco-Energy', 'http://www.magen-eco.example']]);
  assert.match(list.source_note, /Apollo company search/);
  const again = await call('shir', 'POST', '/data-sources/apollo/companies', { ...search, list_name: null, list_id: first.data.list_id });
  assert.deepEqual([again.data.added, again.data.skipped], [0, 2]);
  assert.equal((await call('shir', 'POST', '/data-sources/apollo/companies', { ...search, list_id: first.data.list_id })).status, 400); // both list_id and list_name
});

test('Lusha company search sends the documented filters and skips restricted results', async () => {
  const result = await call('shir', 'POST', '/data-sources/lusha/companies', { ...search, list_name: 'Lusha list', limit: 5 });
  assert.equal(result.status, 201, result.data.error);
  assert.deepEqual([result.data.found, result.data.added], [1, 1]);
  const request = requests.at(-1);
  assert.equal(request.headers.api_key, 'lusha-secret-9876');
  assert.deepEqual(request.body, { pagination: { page: 0, size: 10 }, filters: { companies: { include: { locations: [{ country: 'Israel' }], keywords: ['plastics', 'valves'], sizes: [{ min: 50, max: 250 }] } } } });
});

test('decision makers from Apollo and Lusha become proposals; personal emails dropped; provider errors are explained', async () => {
  const companyId = insert(db, 'companies', { name: 'Acme', industry: 'x', country: 'Israel', website: 'https://www.acme.example' });
  const sourceId = insert(db, 'sources', { url: 'https://news.example/acme', kind: 'web' });
  const opportunity = insert(db, 'opportunities', {
    company_id: companyId, relationship_role: 'client', target_country: 'India', need_type: 'market_entry_distribution', business_need: 'Indian distributor',
    evidence_source_id: sourceId, evidence_date: '2026-11-01', evidence_quote: 'q', status: 'draft', flags: '[]', unknowns: '[]',
  });
  const apollo = await call('tom', 'POST', `/opportunities/${opportunity}/contacts-from/apollo`, { limit: 2 });
  assert.equal(apollo.status, 201, apollo.data.error);
  assert.deepEqual(apollo.data, { found: 2, added: 2 });
  const searchRequest = requests.find((r) => r.path === '/api/v1/mixed_people/api_search');
  assert.deepEqual(searchRequest.query.getAll('q_organization_domains_list[]'), ['acme.example']);
  assert.ok(searchRequest.query.getAll('person_titles[]').includes('VP Business Development'));
  const lusha = await call('tom', 'POST', `/opportunities/${opportunity}/contacts-from/lusha`, {});
  assert.deepEqual(lusha.data, { found: 1, added: 1 });
  const proposals = db.prepare(`SELECT p.full_name, p.job_title, p.email, p.linkedin_url, s.url, s.kind FROM contact_proposals p
    JOIN sources s ON s.id = p.source_id WHERE p.opportunity_id = ? ORDER BY p.id`).all(opportunity).map((row) => ({ ...row }));
  assert.deepEqual(proposals, [
    { full_name: 'Dana Levi', job_title: 'VP Sales', email: 'dana@acme.example', linkedin_url: 'https://www.linkedin.com/in/dana-levi', url: 'https://www.linkedin.com/in/dana-levi', kind: 'list' },
    { full_name: 'Yossi Cohen', job_title: 'CEO', email: null, linkedin_url: null, url: 'https://app.apollo.io/', kind: 'list' },
    { full_name: 'Noa Bar', job_title: 'VP Business Development', email: 'noa@acme.example', linkedin_url: 'https://www.linkedin.com/in/noa-bar', url: 'https://www.linkedin.com/in/noa-bar', kind: 'list' },
  ]);
  assert.deepEqual(requests.find((r) => r.path === '/v3/contacts/enrich').body, { ids: ['l1'], reveal: ['emails'] });
  // The same people are not proposed twice.
  assert.equal((await call('tom', 'POST', `/opportunities/${opportunity}/contacts-from/apollo`, { limit: 2 })).data.added, 0);
  nextStatus = 402;
  const outOfCredits = await call('tom', 'POST', `/opportunities/${opportunity}/contacts-from/lusha`, {});
  assert.equal(outOfCredits.status, 502);
  assert.match(outOfCredits.data.error, /Lusha: the account is out of credits/);
  const noSite = insert(db, 'companies', { name: 'No Site', industry: 'x', country: 'Israel' });
  const other = insert(db, 'opportunities', {
    company_id: noSite, relationship_role: 'client', target_country: 'India', need_type: 'market_entry_distribution', business_need: 'x',
    evidence_source_id: sourceId, evidence_date: '2026-11-01', evidence_quote: 'q', status: 'draft', flags: '[]', unknowns: '[]',
  });
  assert.match((await call('tom', 'POST', `/opportunities/${other}/contacts-from/apollo`, {})).data.error, /website first/);
});
