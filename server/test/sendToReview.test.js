// Watch-list companies into Research review (25.11.2026): the card is built from the file's card columns (this CRM's own
// full export, or a plain list), a company that has a card keeps it, and "Run agent" researches the card's company again.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, insert } from '../src/db.js';
import { createApp } from '../src/app.js';
import { createUser } from '../src/auth.js';
import { createAiService } from '../src/ai/service.js';
import { processNext } from '../src/research/worker.js';
import { exportCardsCsv } from '../src/research/exportCards.js';
import { parseCardData } from '../src/research/importCards.js';
import { parseCsv } from '../../shared/csv.js';
import { CARD_COLUMN_NAMES, CONTACTS_COLUMN } from '../../shared/cardColumns.js';

const NOW = new Date();
const daysAgo = (days) => new Date(NOW.getTime() - days * 86400000).toISOString().slice(0, 10);
const NEWS = 'https://news.example/plain-india';

/** Fake Claude: finds a fresh India initiative for "Plain Co", classifies it and judges it a match. */
function fakeAi() {
  const usage = { input: 1000, output: 100, cacheRead: 0, cacheWrite: 0, searches: 0 };
  return {
    run: async ({ tool }) => {
      if (tool.name === 'submit_candidates') {
        return {
          input: { candidates: [{
            company_name: 'Plain Co', website: 'https://plain.example', source_url: NEWS, source_title: 'Plain Co goes to India', source_kind: 'web',
            published_on: daysAgo(10), initiative_quote: 'Plain Co is looking for an Indian distributor.', target_country: 'India',
            need_type: 'market_entry_distribution', business_need: 'Plain Co wants an Indian distributor.', relationship_role: 'client',
          }] },
          sources: [{ url: NEWS, title: 'Plain Co goes to India' }],
          usage,
        };
      }
      if (tool.name === 'submit_contacts') return { input: { contacts: [], company_routes: { email: '', phone: '', quote: '', source_url: '', linkedin_page_url: '', contact_page_url: '' } }, sources: [], usage };
      if (tool.name === 'submit_classification') {
        return {
          input: {
            entity_name: 'Plain Co', website: '', parent_company: '', business_unit: '', israel_connection: 'hq_israel', incorporation_country: 'Israel',
            hq_country: 'Israel', model_primary: 'product_owner', model_secondary: 'none', sector: 'industry_manufacturing', subsector: 'Pumps',
            customer_types: ['business'], customer_markets: [], employees_min: 120, employees_max: 120, employees_as_of: '2026',
            revenue_usd_min: null, revenue_usd_max: null, revenue_fiscal_year: null, revenue_basis: 'unknown', revenue_original: '', ownership: '',
            export_proof: 'proven', registry_number: '', other_names: [], description: '', markets: [],
            facts: [{ field: 'employees', value: '120', source_url: NEWS, quote: '120 employees', entity_covered: 'Plain Co' }],
            unknowns: [],
          },
          sources: [],
          usage,
        };
      }
      return {
        input: { verdict: 'match', reason: 'Named India initiative.', reason_to_act: 'This month.', trigger_kind: 'distributor_search',
          trigger_strength: 'Dated and public.', subsector_fit: 'priority', service_code: 'GL-2', proposed_service: 'Distributor search', unknowns: [] },
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
let shir;

async function call(user, method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { 'Content-Type': 'application/json', Cookie: cookies[user] }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
}

const sh1 = () => db.prepare("SELECT id FROM mandates WHERE code = 'SH1'").get().id;
const cardOf = (name) => db.prepare('SELECT o.* FROM opportunities o JOIN companies c ON c.id = o.company_id WHERE c.name = ?').get(name);

const ACME_CARD = {
  Agent: 'SH1', 'Target country': 'India', 'Need type': 'market_entry_distribution', 'Business need': 'Acme wants an Indian distributor.',
  'Relationship role': 'client', 'Evidence URL': 'https://news.example/acme-india', 'Evidence date': daysAgo(20),
  'Evidence quote': 'Acme seeks a distributor in India.', 'Agent verdict': 'match', Trigger: 'distributor_search', 'Subsector fit': 'priority',
  'Service code': 'GL-2', Flags: 'lower_priority', 'Missing facts': 'revenue | registry number', 'Israel connection': 'hq_israel',
  'Proven export': 'proven', 'Employees min': '200', 'Customer types': 'business', 'General email': 'info@acme.example', 'Other names': 'Acme Valves',
  [CONTACTS_COLUMN]: JSON.stringify([{ full_name: 'Dana Levi', job_title: 'CEO', department: 'management', email: 'dana@acme.example', phone: null,
    linkedin_url: null, country: null, preferred_language: 'en', preferred_channel: 'email', whatsapp_consent: false, verified: true,
    verified_source: 'https://acme.example/team', verified_at: '2026-11-01T10:00:00.000Z', opted_out_at: null }]),
};

before(async () => {
  db = openDatabase(':memory:');
  createUser(db, { username: 'tom', display_name: 'Tom', password: 'correct-horse', role: 'admin' });
  shir = createUser(db, { username: 'shir', display_name: 'Shir', password: 'correct-horse', role: 'member' });
  ai = createAiService(db, { claude: fakeAi() });
  server = createApp(db, { dbPath: ':memory:', hostingLocation: 'test', ai }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  for (const user of ['tom', 'shir']) {
    const response = await fetch(`${baseUrl}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: 'correct-horse' }) });
    cookies[user] = response.headers.get('set-cookie').split(';')[0];
  }
  // A company that already has a card.
  const old = insert(db, 'companies', { name: 'Old Co', industry: 'x', country: 'Israel', website: 'https://old.example' });
  insert(db, 'opportunities', {
    company_id: old, owner_id: shir, relationship_role: 'client', target_country: 'India', need_type: 'market_entry_distribution', business_need: 'x',
    evidence_source_id: insert(db, 'sources', { url: 'https://news.example/old', kind: 'web' }), evidence_date: daysAgo(5), evidence_quote: 'q',
    status: 'draft', flags: '[]', unknowns: '[]',
  });
});

after(() => {
  server.closeAllConnections();
  server.close();
});

test('card columns are checked on import and kept with the company', async () => {
  const bad = await call('shir', 'POST', '/watch-lists', { name: 'Bad', entries: [{ name: 'X', card_data: { 'Need type': 'world_domination' } }] });
  assert.equal(bad.status, 400);
  assert.match(bad.data.error, /^Row 1: Need type must be one of/);
  assert.equal((await call('shir', 'POST', '/watch-lists', { name: 'Bad', entries: [{ name: 'X', card_data: { Score: '90' } }] })).data.error, 'Row 1: Unknown card column(s): Score');
  assert.match((await call('shir', 'POST', '/watch-lists', { name: 'Bad', entries: [{ name: 'X', card_data: { [CONTACTS_COLUMN]: '[{' } }] })).data.error, /is not valid JSON/);

  const created = await call('shir', 'POST', '/watch-lists', { name: 'From the old CRM', entries: [
    { name: 'Acme', website: 'https://acme.example', country: 'Israel', card_data: ACME_CARD },
    { name: 'Plain Co', website: 'https://plain.example', country: 'Israel', card_data: null },
    { name: 'Old Co', website: 'https://old.example' },
    { name: 'Nameonly Co' },
  ] });
  assert.equal(created.status, 201, created.data.error);
  const list = (await call('shir', 'GET', `/watch-lists/${created.data.id}`)).data;
  assert.deepEqual(list.entries.map((entry) => [entry.name, entry.has_card_data, entry.opportunity_id]),
    [['Acme', 1, null], ['Nameonly Co', 0, null], ['Old Co', 0, null], ['Plain Co', 0, null]]);
});

test('chosen companies become cards in review; a company with a card keeps it; all or nothing', async () => {
  const list = (await call('shir', 'GET', '/watch-lists')).data.find((row) => row.name === 'From the old CRM');
  const entries = Object.fromEntries((await call('shir', 'GET', `/watch-lists/${list.id}`)).data.entries.map((entry) => [entry.name, String(entry.id)]));
  const send = (ids, mandateId = sh1()) => call('shir', 'POST', `/watch-lists/${list.id}/send-to-review`, { entry_ids: ids, mandate_id: mandateId });

  // A company without a website or evidence link cannot become a card – and nothing else is sent with it.
  const blocked = await send([entries.Acme, entries['Nameonly Co']]);
  assert.equal(blocked.status, 400);
  assert.equal(blocked.data.error, 'Nameonly Co: needs a website (or an evidence link) to become a card');
  assert.equal(cardOf('Acme'), undefined);

  const sent = await send([entries.Acme, entries['Plain Co'], entries['Old Co']]);
  assert.equal(sent.status, 200, sent.data.error);
  assert.equal(sent.data.created.length, 2);
  assert.deepEqual(sent.data.existing, [{ entry_id: Number(entries['Old Co']), card_id: cardOf('Old Co').id }]);

  // The card from the full export: its own fields, profile, other names and contacts.
  const acme = cardOf('Acme');
  assert.equal(acme.status, 'needs_review');
  assert.equal(acme.owner_id, shir);
  assert.equal(acme.business_need, 'Acme wants an Indian distributor.');
  assert.equal(acme.trigger_kind, 'distributor_search');
  assert.deepEqual(JSON.parse(acme.flags), ['lower_priority']);
  assert.deepEqual(JSON.parse(acme.unknowns), ['revenue', 'registry number']);
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(acme.company_id);
  assert.deepEqual([company.israel_connection, company.employees_min, company.general_email, company.customer_types], ['hq_israel', 200, 'info@acme.example', '["business"]']);
  assert.deepEqual(db.prepare('SELECT name FROM company_aliases WHERE company_id = ?').all(company.id).map((row) => row.name), ['Acme Valves']);
  const dana = db.prepare('SELECT * FROM contacts WHERE company_id = ?').get(company.id);
  assert.deepEqual([dana.full_name, dana.department, dana.verified, dana.preferred_channel], ['Dana Levi', 'management', 1, 'email']);
  const detail = (await call('shir', 'GET', `/opportunities/${acme.id}`)).data;
  assert.equal(detail.journey.next.kind, 'decide');
  assert.equal(detail.score.parts.trigger.level !== undefined, true);

  // The plain list entry: a card that says where it came from, on the chosen agent's market.
  const plain = cardOf('Plain Co');
  assert.equal(plain.business_need, 'Imported from the watch list "From the old CRM" – not researched yet.');
  assert.deepEqual([plain.target_country, plain.verdict, plain.mandate_id], ['India', null, sh1()]);

  // The list links each company to its card; sending again changes nothing.
  const after = (await call('shir', 'GET', `/watch-lists/${list.id}`)).data.entries;
  assert.equal(after.find((entry) => entry.name === 'Acme').opportunity_id, acme.id);
  assert.deepEqual((await send([entries.Acme])).data, { created: [], existing: [{ entry_id: Number(entries.Acme), card_id: acme.id }] });
});

test('"Run agent" researches the card\'s company again and updates the same card', async () => {
  const plain = cardOf('Plain Co');
  assert.equal((await call('tom', 'PATCH', `/mandates/${sh1()}`, { owner_id: shir, status: 'active' })).status, 200);
  const queued = await call('shir', 'POST', `/opportunities/${plain.id}/research`);
  assert.equal(queued.status, 201, queued.data.error);
  assert.equal((await call('shir', 'POST', `/opportunities/${plain.id}/research`)).status, 409);
  const board = (await call('shir', 'GET', '/flow')).data;
  assert.deepEqual(board.runs.map((run) => run.company_name), ['Plain Co']);

  while (await processNext(db, ai, NOW)) { /* the card research, then its decision-maker search */ }
  const detail = (await call('shir', 'GET', `/opportunities/${plain.id}`)).data;
  assert.equal(detail.agent_run.status, 'done', detail.agent_run.error);
  assert.equal(detail.id, plain.id);
  assert.deepEqual([detail.evidence_url, detail.verdict, detail.business_need, detail.status], [NEWS, 'match', 'Plain Co wants an Indian distributor.', 'needs_review']);
  assert.equal(detail.company.employees_min, 120);
  assert.ok(detail.facts.some((fact) => fact.field === 'employees'));
  assert.equal(detail.contact_search.status, 'done');
});

test('the full export reads back: every card column the import knows is in the export', () => {
  const [header, ...rows] = parseCsv(exportCardsCsv(db, { ownerId: null }).csv, ',');
  for (const column of CARD_COLUMN_NAMES) assert.ok(header.includes(column), column);
  const acmeRow = rows.find((row) => row[0] === 'Acme');
  const data = parseCardData(Object.fromEntries(CARD_COLUMN_NAMES.map((column) => [column, acmeRow[header.indexOf(column)]])));
  assert.equal(data.card.business_need, 'Acme wants an Indian distributor.');
  assert.deepEqual(data.card.flags, ['lower_priority']);
  assert.deepEqual(data.contacts.map((contact) => [contact.full_name, contact.verified]), [['Dana Levi', 1]]);
  assert.equal(data.company.general_email, 'info@acme.example');
});
