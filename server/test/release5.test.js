// Release 5: AI meeting summaries from notes, and the client discovery form (public link, admin-edited questions).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db.js';
import { createApp } from '../src/app.js';
import { createUser } from '../src/auth.js';
import { createAiService } from '../src/ai/service.js';

const ZERO = { input: 2000, output: 400, cacheRead: 0, cacheWrite: 0, searches: 0 };
const prompts = [];
const fakeAi = {
  run: async ({ tool, prompt }) => {
    prompts.push(prompt);
    assert.equal(tool.name, 'submit_meeting_summary');
    const bad = prompt.includes('INVALID');
    return {
      input: {
        summary: 'We discussed a Japan rollout with a local integrator.',
        decisions: ['Start with two integrators', 'Pilot in Osaka'],
        tasks: [
          { description: 'Send the integrator shortlist', assignee: 'Shir', due_date: bad ? 'next week' : '2026-12-01', client_commitment: false },
          { description: 'Share the product roadmap', assignee: 'Acme', due_date: '', client_commitment: true },
        ],
        recap_subject: 'Thank you for today',
        recap_body: 'Dear Dana,\nThank you for the meeting...\nShir, YMT Group',
      },
      sources: [],
      usage: ZERO,
    };
  },
};

let server;
let baseUrl;
let db;
const cookies = {};

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
  createUser(db, { username: 'tom', display_name: 'Tom', password: 'correct-horse', role: 'admin' });
  createUser(db, { username: 'shir', display_name: 'Shir', password: 'correct-horse', role: 'member' });
  const ai = createAiService(db, { claude: fakeAi });
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

async function companyWithDeal() {
  const company = (await call('shir', 'POST', '/companies', { name: 'Acme', industry: 'Software', country: 'Israel', india_activity: 'none' })).data.id;
  const contact = (await call('shir', 'POST', `/companies/${company}/contacts`, { full_name: 'Dana', department: 'sales', email: 'dana@acme.example', preferred_language: 'en' })).data.id;
  const deal = (await call('shir', 'POST', '/deals', { company_id: company, workflow_id: 1, title: 'Japan rollout', deal_model: 'retainer' })).data.id;
  return { company, contact, deal };
}

test('meeting summary: AI drafts from notes, nothing stored until the owner completes; the edited recap replaces the template', async () => {
  const { company, contact, deal } = await companyWithDeal();
  const meeting = (await call('shir', 'POST', '/meetings', {
    title: 'Japan kick-off', scheduled_at: '2026-11-20T09:00', company_id: company, contact_id: contact, deal_id: deal,
  }));
  assert.equal(meeting.status, 201, meeting.data.error);
  const id = meeting.data.id;
  assert.equal((await call('shir', 'GET', `/meetings/${id}/prep`)).data.ai_problem, null);

  const draft = await call('shir', 'POST', `/meetings/${id}/draft-summary`, { notes: 'Dana: wants two integrators. Pilot Osaka. Shir sends shortlist by 1 Dec.', language: 'en' });
  assert.equal(draft.status, 200, draft.data.error);
  assert.deepEqual(draft.data.decisions, ['Start with two integrators', 'Pilot in Osaka']);
  assert.deepEqual(draft.data.tasks[1], { description: 'Share the product roadmap', assignee: 'Acme', due_date: null, is_client_commitment: true });
  assert.ok(prompts.at(-1).includes('Pilot Osaka') && prompts.at(-1).includes('with Acme'));
  assert.equal(db.prepare("SELECT status FROM meetings WHERE id = ?").get(id).status, 'scheduled', 'drafting stores nothing');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM ai_usage WHERE task = 'meeting'").get().n, 1);
  assert.equal((await call('shir', 'POST', `/meetings/${id}/draft-summary`, { notes: 'INVALID', language: 'en' })).status, 502);

  const done = await call('shir', 'POST', `/meetings/${id}/complete`, {
    summary: draft.data.summary, decisions: draft.data.decisions.join('\n'), language: 'en', followup_contact_id: contact,
    followup_subject: draft.data.recap.subject, followup_body: draft.data.recap.body, tasks: draft.data.tasks,
  });
  assert.equal(done.status, 200, done.data.error);
  const recap = (await call('shir', 'GET', `/approvals/${done.data.approval_id}`)).data;
  assert.deepEqual([recap.kind, recap.subject, recap.content], ['meeting_followup_email', 'Thank you for today', draft.data.recap.body]);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE meeting_id = ? AND is_client_commitment = 1').get(id).n, 1);
  assert.match((await call('shir', 'POST', `/meetings/${id}/draft-summary`, { notes: 'x', language: 'en' })).data.error, /already done/);
});

test('discovery form: admin edits questions, staff sends a link, the client answers once, answers reach the deal with a review task', async () => {
  const { company, contact, deal } = await companyWithDeal();
  const questions = (await call('shir', 'GET', '/discovery-questions')).data;
  assert.equal(questions.length, 9);
  assert.equal((await call('shir', 'POST', '/discovery-questions', { question_he: 'ש', question_en: 'Q', answer_kind: 'short' })).status, 403);
  const added = await call('tom', 'POST', '/discovery-questions', { question_he: 'מי המתחרים שלכם?', question_en: 'Who are your competitors?', answer_kind: 'short' });
  assert.equal(added.status, 201);
  assert.equal((await call('tom', 'POST', `/discovery-questions/${added.data.id}/move`, { direction: 'up' })).status, 200);
  assert.equal((await call('tom', 'PATCH', `/discovery-questions/${questions[8].id}`, { active: false })).status, 200);
  assert.equal((await call('tom', 'POST', `/discovery-questions/${questions[0].id}/move`, { direction: 'up' })).data.error, 'This question is already first');

  const otherCompany = (await call('shir', 'POST', '/companies', { name: 'Other', industry: 'x', country: 'Israel', india_activity: 'none' })).data.id;
  assert.equal((await call('shir', 'POST', `/companies/${otherCompany}/discovery`, { deal_id: deal, language: 'en' })).status, 400);
  const link = await call('shir', 'POST', `/companies/${company}/discovery`, { contact_id: contact, deal_id: deal, language: 'he', days: 7 });
  assert.equal(link.status, 201);

  const form = (await call(null, 'GET', `/public/discovery/${link.data.token}`)).data;
  assert.deepEqual(Object.keys(form).sort(), ['company_name', 'expires_at', 'language', 'questions', 'submitted']);
  assert.equal(form.company_name, 'Acme');
  assert.equal(form.questions.length, 9, 'the deactivated question is hidden');
  assert.deepEqual(form.questions.slice(-2).map((q) => q.question_en), [questions[7].question_en, 'Who are your competitors?'], 'moved above the last question, which was then deactivated');
  assert.equal((await call(null, 'GET', '/public/discovery/not-a-token')).status, 404);

  const [goals, markets] = form.questions;
  const missing = await call(null, 'POST', `/public/discovery/${link.data.token}`, { name: 'Dana', language: 'he', answers: { [goals.id]: 'לפתוח את יפן' } });
  assert.equal(missing.status, 400);
  assert.match(missing.data.error, /לאילו שווקים/);
  assert.equal((await call(null, 'POST', `/public/discovery/${link.data.token}`, { name: 'Dana', language: 'en', answers: { 9999: 'x' } })).status, 400);
  const sent = await call(null, 'POST', `/public/discovery/${link.data.token}`, { name: 'Dana Levi', language: 'en', answers: { [goals.id]: 'Open Japan', [markets.id]: 'Japan, Korea', [form.questions[2].id]: '   ' } });
  assert.equal(sent.status, 200, sent.data.error);
  assert.equal((await call(null, 'POST', `/public/discovery/${link.data.token}`, { name: 'Again', language: 'en', answers: { [goals.id]: 'x', [markets.id]: 'y' } })).status, 409);
  assert.deepEqual((await call(null, 'GET', `/public/discovery/${link.data.token}`)).data, { company_name: 'Acme', submitted: true });

  const onDeal = (await call('shir', 'GET', `/deals/${deal}`)).data.discovery;
  assert.equal(onDeal.length, 1);
  assert.deepEqual(onDeal[0].answers, [
    { question: 'What would you like to achieve in the next 12 months?', answer: 'Open Japan' },
    { question: 'Which markets or countries are you targeting?', answer: 'Japan, Korea' },
  ]);
  assert.equal(onDeal[0].status, 'answered');
  assert.ok(db.prepare("SELECT 1 FROM tasks WHERE assignee = 'Shir' AND description = 'Review the discovery answers from Acme (Dana Levi)'").get());
  assert.ok(db.prepare("SELECT 1 FROM interactions WHERE deal_id = ? AND summary = 'Discovery form answered by Dana Levi'").get(deal));

  const second = (await call('shir', 'POST', `/companies/${company}/discovery`, { language: 'en' })).data;
  assert.equal((await call('shir', 'POST', `/discovery/${second.id}/revoke`)).status, 200);
  assert.equal((await call(null, 'GET', `/public/discovery/${second.token}`)).status, 404);
  const list = (await call('shir', 'GET', `/companies/${company}/discovery`)).data;
  assert.deepEqual(list.map((row) => row.status), ['revoked', 'answered']);
});
