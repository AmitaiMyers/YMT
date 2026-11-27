// "Don't suggest" (27.11.2026): blocked companies are skipped by every agent, their cards leave the board and the
// review, and removing the block brings everything back.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, insert } from '../src/db.js';
import { createApp } from '../src/app.js';
import { createUser } from '../src/auth.js';
import { createAiService } from '../src/ai/service.js';
import { processNext } from '../src/research/worker.js';
import { pickEntries } from '../src/research/watchLists.js';

const NOW = new Date();
const daysAgo = (days) => new Date(NOW.getTime() - days * 86400000).toISOString().slice(0, 10);
const prompts = [];

/** Fake Claude: the search reports "Blocked Co", which must be dropped before any further AI call. */
function fakeAi() {
  const usage = { input: 1000, output: 100, cacheRead: 0, cacheWrite: 0, searches: 0 };
  return {
    run: async ({ tool, prompt }) => {
      prompts.push(prompt);
      if (tool.name !== 'submit_candidates') throw new Error(`unexpected AI call: ${tool.name}`);
      return {
        input: { candidates: [{
          company_name: 'Blocked Co', website: 'https://www.blocked.example', source_url: 'https://news.example/blocked', source_title: 't',
          source_kind: 'web', published_on: daysAgo(5), initiative_quote: 'q', target_country: 'India', need_type: 'market_entry_distribution',
          business_need: 'x', relationship_role: 'client',
        }] },
        sources: [{ url: 'https://news.example/blocked', title: 't' }],
        usage,
      };
    },
  };
}

let server;
let baseUrl;
let db;
let ai;
let shir;
let card;
const cookies = {};

async function call(user, method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { 'Content-Type': 'application/json', Cookie: cookies[user] }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
}

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
  const company = insert(db, 'companies', { name: 'Tried Co', industry: 'x', country: 'Israel', website: 'https://tried.example' });
  card = insert(db, 'opportunities', {
    company_id: company, owner_id: shir, relationship_role: 'client', target_country: 'India', need_type: 'market_entry_distribution', business_need: 'x',
    evidence_source_id: insert(db, 'sources', { url: 'https://news.example/tried', kind: 'web' }), evidence_date: daysAgo(5), evidence_quote: 'q',
    status: 'needs_review', flags: '[]', unknowns: '[]',
  });
});

after(() => {
  server.closeAllConnections();
  server.close();
});

const onBoard = async () => (await call('shir', 'GET', '/flow')).data.cards.some((row) => row.id === card);
const inReview = async () => (await call('shir', 'GET', '/research/review')).data.some((row) => row.id === card);

test('blocking a card\'s company hides its cards; removing the block brings them back', async () => {
  assert.deepEqual([await onBoard(), await inReview(), (await call('shir', 'GET', '/research/counts')).data.queue], [true, true, 1]);
  const blocked = await call('shir', 'POST', `/opportunities/${card}/block`, { reason: 'Three touches, no answer' });
  assert.equal(blocked.status, 201, blocked.data.error);
  assert.deepEqual([blocked.data.name, blocked.data.domain, blocked.data.reason], ['Tried Co', 'tried.example', 'Three touches, no answer']);
  assert.deepEqual([await onBoard(), await inReview(), (await call('shir', 'GET', '/research/counts')).data.queue], [false, false, 0]);

  const detail = (await call('shir', 'GET', `/opportunities/${card}`)).data;
  assert.deepEqual([detail.blocked.reason, detail.blocked.blocked_by_name], ['Three touches, no answer', 'Shir']);
  assert.equal((await call('shir', 'POST', `/opportunities/${card}/research`)).status, 409);
  // Blocking again changes nothing.
  assert.equal((await call('shir', 'POST', `/opportunities/${card}/block`, {})).data.id, blocked.data.id);

  const list = (await call('shir', 'GET', '/blocked-companies')).data;
  assert.deepEqual(list.map((row) => [row.name, row.card_id, row.blocked_by_name]), [['Tried Co', card, 'Shir']]);
  assert.equal((await call('shir', 'DELETE', `/blocked-companies/${blocked.data.id}`)).status, 200);
  assert.deepEqual([await onBoard(), (await call('shir', 'GET', `/opportunities/${card}`)).data.blocked], [true, null]);
});

test('watch-list companies can be blocked; the rotation skips them', async () => {
  const created = await call('shir', 'POST', '/watch-lists', { name: 'Tried before', entries: [
    { name: 'Alpha Ltd', website: 'https://alpha.example' }, { name: 'Beta Ltd', website: 'https://beta.example' },
  ] });
  const entries = (await call('shir', 'GET', `/watch-lists/${created.data.id}`)).data.entries;
  const alpha = entries.find((entry) => entry.name === 'Alpha Ltd');
  assert.equal((await call('shir', 'POST', `/watch-lists/${created.data.id}/block`, { entry_ids: [String(alpha.id)], reason: 'No route' })).status, 201);
  const after = (await call('shir', 'GET', `/watch-lists/${created.data.id}`)).data.entries;
  assert.deepEqual(after.map((entry) => [entry.name, entry.blocked]), [['Alpha Ltd', 1], ['Beta Ltd', 0]]);
  const sh1 = db.prepare("SELECT id FROM mandates WHERE code = 'SH1'").get().id;
  assert.deepEqual(pickEntries(db, created.data.id, sh1, 10).map((entry) => entry.name), ['Beta Ltd']);

  // A blocked entry cannot be sent to review.
  const sent = await call('shir', 'POST', `/watch-lists/${created.data.id}/send-to-review`, { entry_ids: [String(alpha.id)], mandate_id: sh1 });
  assert.equal(sent.data.error, 'Alpha Ltd: is on the "Don\'t suggest" list – remove it there to send it to review');
});

test('the agents are told to skip blocked companies and drop any they still report', async () => {
  const manual = await call('shir', 'POST', '/blocked-companies', { name: 'Blocked Co', website: 'https://blocked.example', reason: 'Asked not to be contacted' });
  assert.equal(manual.status, 201, manual.data.error);
  assert.equal((await call('shir', 'POST', '/blocked-companies', { name: 'Blocked Co', website: 'not a site' })).status, 400);
  const sh1 = db.prepare("SELECT id FROM mandates WHERE code = 'SH1'").get().id;
  assert.equal((await call('tom', 'PATCH', `/mandates/${sh1}`, { owner_id: shir, status: 'active' })).status, 200);
  const run = await call('shir', 'POST', `/mandates/${sh1}/runs`, { batch_size: 1 });
  assert.equal(run.status, 201, run.data.error);
  while (await processNext(db, ai, NOW)) { /* the run */ }
  assert.equal(db.prepare('SELECT status FROM research_runs WHERE id = ?').get(run.data.id).status, 'done');
  assert.match(prompts[0], /Skip these companies[^\n]*Blocked Co \(blocked\.example\)/);
  assert.deepEqual(db.prepare('SELECT company_name, reason FROM run_drops WHERE run_id = ?').all(run.data.id).map((row) => [row.company_name, row.reason]), [['Blocked Co', 'ymt_blocked']]);
});
