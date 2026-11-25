// The lead journey: one company walks the whole flow and the board shows the right stage and next action at every step.
// Found → review → approved → first message → waiting → replied → meeting → closed.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, insert } from '../src/db.js';
import { createApp } from '../src/app.js';
import { createUser } from '../src/auth.js';
import { exportCardsCsv } from '../src/research/exportCards.js';
import { parseCsv } from '../../shared/csv.js';

let server;
let baseUrl;
let db;
const cookies = {};
let card;

async function call(user, method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { 'Content-Type': 'application/json', Cookie: cookies[user] }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
}

const journeyOf = async () => (await call('shir', 'GET', `/opportunities/${card}`)).data.journey;
const boardRow = async () => (await call('shir', 'GET', '/flow')).data.cards.find((row) => row.id === card);

before(async () => {
  db = openDatabase(':memory:');
  createUser(db, { username: 'tom', display_name: 'Tom', password: 'correct-horse', role: 'admin' });
  const shir = createUser(db, { username: 'shir', display_name: 'Shir', password: 'correct-horse', role: 'member' });
  server = createApp(db, { dbPath: ':memory:', hostingLocation: 'test' }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  for (const user of ['tom', 'shir']) {
    const response = await fetch(`${baseUrl}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: 'correct-horse' }) });
    cookies[user] = response.headers.get('set-cookie').split(';')[0];
  }
  const company = insert(db, 'companies', { name: 'Acme', industry: 'Valves', country: 'Israel', hq_country: 'Israel', website: 'https://acme.example', origin: 'research' });
  const source = insert(db, 'sources', { url: 'https://news.example/acme-india', kind: 'web' });
  card = insert(db, 'opportunities', {
    company_id: company, owner_id: shir, relationship_role: 'client', target_country: 'India', need_type: 'market_entry_distribution',
    business_need: 'Indian distributor', evidence_source_id: source, evidence_date: '2026-11-01', evidence_quote: 'Acme seeks a distributor in India.',
    status: 'draft', flags: '[]', unknowns: '[]',
  });
});

after(() => {
  server.closeAllConnections();
  server.close();
});

test('a company walks the whole flow; the board always shows its stage and the next action', async () => {
  assert.deepEqual(await journeyOf(), { stage: 'review', since: (await boardRow()).created_at, next: { kind: 'decide' } });
  assert.equal((await call('shir', 'GET', '/flow?owner=all')).status, 403);

  // Approve → the deal opens; nobody to write to yet.
  assert.equal((await call('shir', 'POST', `/opportunities/${card}/decision`, { decision: 'accept' })).status, 200);
  assert.deepEqual([(await journeyOf()).stage, (await journeyOf()).next.kind], ['approved', 'pick_contact']);
  const companyId = (await call('shir', 'GET', `/opportunities/${card}`)).data.company.id;
  const dana = (await call('shir', 'POST', `/companies/${companyId}/contacts`, {
    full_name: 'Dana Levi', department: 'sales', email: 'dana@acme.example', preferred_language: 'en', verified: true, verified_source: 'https://acme.example/team',
  })).data.id;
  assert.equal((await journeyOf()).next.kind, 'draft_message');

  // First message drafted → "send"; approve & send in one click → waiting for a reply.
  const draft = await call('shir', 'POST', `/opportunities/${card}/approaches`, { contact_id: dana, channel: 'email', mode: 'blank' });
  assert.equal(draft.status, 201, draft.data.error);
  assert.deepEqual(await journeyOf().then((j) => [j.stage, j.next.kind, j.next.approval_id, j.next.approved]), ['message', 'send', draft.data.id, false]);
  await call('shir', 'PATCH', `/approvals/${draft.data.id}`, { subject: 'פרסומת: Indian distributors', content: `Dear Dana,\nA short call?\n\n${(await call('shir', 'GET', '/outreach/rules')).data.opt_out.en}` });
  const sent = await call('shir', 'POST', `/approvals/${draft.data.id}/approve-and-send`);
  assert.equal(sent.status, 200, sent.data.error);
  assert.equal(db.prepare('SELECT status FROM approvals WHERE id = ?').get(draft.data.id).status, 'sent');
  const waiting = await journeyOf();
  assert.deepEqual([waiting.stage, waiting.next.kind, waiting.next.contact_id], ['waiting', 'wait', dana]);
  assert.ok(waiting.next.due_at > new Date().toISOString());
  assert.equal((await call('shir', 'POST', `/approvals/${draft.data.id}/approve-and-send`)).status, 409); // already sent

  // Follow-up due after N days.
  db.prepare('UPDATE approvals SET sent_at = ? WHERE id = ?').run(new Date(Date.now() - 10 * 86400000).toISOString(), draft.data.id);
  assert.deepEqual(await journeyOf().then((j) => [j.next.kind, j.next.number]), ['followup', 1]);

  // A reply → answer it; once handled → schedule a meeting.
  const reply = await call('shir', 'POST', `/conversations/${dana}/replies`, { channel: 'email', body: 'Sounds interesting, let us talk next week.', received_at: new Date(Date.now() - 3600000).toISOString() });
  assert.equal(reply.status, 201, reply.data.error);
  assert.deepEqual(await journeyOf().then((j) => [j.stage, j.next.kind, j.next.contact_id]), ['replied', 'answer', dana]);
  assert.equal((await call('shir', 'POST', `/replies/${reply.data.id}/handled`)).status, 200);
  const replied = await journeyOf();
  assert.deepEqual([replied.next.kind, replied.next.contact_id], ['schedule', dana]);

  // Meeting booked → upcoming; after it took place → summarize; summarized → close the deal.
  const dealId = (await call('shir', 'GET', `/opportunities/${card}`)).data.deal.id;
  const at = new Date(Date.now() + 2 * 86400000).toISOString();
  const meeting = await call('shir', 'POST', '/meetings', { title: 'Acme – intro', scheduled_at: at, company_id: companyId, contact_id: dana, deal_id: dealId });
  assert.equal(meeting.status, 201, meeting.data.error);
  assert.deepEqual(await journeyOf().then((j) => [j.stage, j.next.kind, j.next.at]), ['meeting', 'meeting_upcoming', at]);
  db.prepare('UPDATE meetings SET scheduled_at = ? WHERE id = ?').run(new Date(Date.now() - 3600000).toISOString(), meeting.data.id);
  assert.equal((await journeyOf()).next.kind, 'summarize');
  db.prepare("UPDATE meetings SET status = 'done' WHERE id = ?").run(meeting.data.id);
  assert.deepEqual(await journeyOf().then((j) => [j.next.kind, j.next.deal_id]), ['close', dealId]);

  // Won → closed; the board still lists it in the last column.
  assert.equal((await call('shir', 'PATCH', `/deals/${dealId}`, { status: 'won' })).status, 200);
  const closed = await boardRow();
  assert.deepEqual([closed.journey.stage, closed.journey.next.kind, closed.journey.next.outcome], ['closed', 'done', 'won']);

  // The full export carries the whole story: deal, sent message, reply and meeting.
  const { csv } = exportCardsCsv(db, { ownerId: null });
  const [header, row] = parseCsv(csv, ',');
  const cell = (column) => row[header.indexOf(column)];
  assert.equal(cell('Flow step'), 'closed');
  assert.equal(cell('Messages sent'), '1');
  assert.match(cell('Deal'), / · won/);
  assert.match(cell('Replies'), / · email/);
  assert.match(cell('Meetings'), / · done · Acme – intro/);
});

test('rejected cards leave the board; only messages can be approved & sent', async () => {
  const other = insert(db, 'opportunities', {
    company_id: db.prepare("SELECT id FROM companies WHERE name = 'Acme'").get().id, owner_id: db.prepare("SELECT id FROM users WHERE username = 'shir'").get().id,
    relationship_role: 'client', target_country: 'Japan', need_type: 'market_entry_distribution', business_need: 'Japan', evidence_source_id: insert(db, 'sources', { url: 'https://news.example/acme-japan', kind: 'web' }),
    evidence_date: '2026-11-01', evidence_quote: 'q', status: 'draft', flags: '[]', unknowns: '[]',
  });
  assert.equal((await call('shir', 'POST', `/opportunities/${other}/decision`, { decision: 'reject', reason: 'wrong_market' })).status, 200);
  const board = (await call('shir', 'GET', '/flow')).data;
  assert.equal(board.cards.some((row) => row.id === other), false);
  assert.deepEqual(board.runs, []);
  const brief = insert(db, 'approvals', { kind: 'company_brief', company_id: 1, language: 'en', content: 'x', created_by: 1 });
  assert.equal((await call('tom', 'POST', `/approvals/${brief}/approve-and-send`)).status, 400);
});

test('nobody to reach → "find a way to reach them"; the company\'s general email is enough to go on', async () => {
  const shirId = db.prepare("SELECT id FROM users WHERE username = 'shir'").get().id;
  const company = insert(db, 'companies', { name: 'Quiet Co', industry: 'x', country: 'Israel', website: 'https://quiet.example' });
  const quiet = insert(db, 'opportunities', {
    company_id: company, owner_id: shirId, relationship_role: 'client', target_country: 'India', need_type: 'market_entry_distribution', business_need: 'x',
    evidence_source_id: insert(db, 'sources', { url: 'https://news.example/quiet', kind: 'web' }), evidence_date: '2026-11-01', evidence_quote: 'q',
    status: 'draft', flags: '[]', unknowns: '[]',
  });
  assert.equal((await call('shir', 'POST', `/opportunities/${quiet}/decision`, { decision: 'accept' })).status, 200);
  db.prepare("UPDATE contact_searches SET status = 'done' WHERE opportunity_id = ?").run(quiet);
  const nextOf = async () => (await call('shir', 'GET', `/opportunities/${quiet}`)).data.journey.next.kind;
  assert.equal(await nextOf(), 'find_route');
  // A named person without any route does not help yet.
  insert(db, 'contacts', { company_id: company, full_name: 'No Route', department: 'sales', preferred_language: 'en' });
  assert.equal(await nextOf(), 'find_route');
  db.prepare("UPDATE companies SET general_email = 'info@quiet.example' WHERE id = ?").run(company);
  assert.equal(await nextOf(), 'pick_contact');
});
