// End-to-end API tests for the business rules that must never regress.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db.js';
import { createApp } from '../src/app.js';
import { createUser } from '../src/auth.js';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
let server;
let baseUrl;
let cookie;
let db;

async function call(method, path, body, { auth = true } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth && cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  return { status: response.status, data, headers: response.headers };
}

before(async () => {
  db = openDatabase(':memory:');
  createUser(db, { username: 'tester', display_name: 'Test User', password: 'correct-horse', role: 'admin' });
  server = createApp(db, { dbPath: ':memory:', hostingLocation: 'test' }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  const login = await call('POST', '/auth/login', { username: 'tester', password: 'correct-horse' }, { auth: false });
  assert.equal(login.status, 200);
  cookie = login.headers.get('set-cookie').split(';')[0];
});

after(() => server.close());

async function createCompanyWithContact() {
  const company = await call('POST', '/companies', { name: 'Acme', industry: 'Valves', country: 'Israel', india_activity: 'none' });
  assert.equal(company.status, 201);
  const contact = await call('POST', `/companies/${company.data.id}/contacts`, {
    full_name: 'Dana', department: 'sales', email: 'dana@example.com',
  });
  assert.equal(contact.status, 201);
  return { companyId: company.data.id, contactId: contact.data.id };
}

test('unauthenticated requests are rejected', async () => {
  const response = await call('GET', '/companies', undefined, { auth: false });
  assert.equal(response.status, 401);
});

test('triggers require a valid source URL', async () => {
  const { companyId } = await createCompanyWithContact();
  const missing = await call('POST', `/companies/${companyId}/triggers`, { type: 'news', description: 'x', detected_on: '2026-01-01' });
  assert.equal(missing.status, 400);
  assert.match(missing.data.error, /source_url is required/);
  const ok = await call('POST', `/companies/${companyId}/triggers`, {
    type: 'news', description: 'x', detected_on: '2026-01-01', source_url: 'https://example.com/a',
  });
  assert.equal(ok.status, 201);
});

test('verifying a contact requires a verification source', async () => {
  const { contactId } = await createCompanyWithContact();
  const bad = await call('PATCH', `/contacts/${contactId}`, { verified: true });
  assert.equal(bad.status, 400);
  const good = await call('PATCH', `/contacts/${contactId}`, { verified: true, verified_source: 'LinkedIn profile' });
  assert.equal(good.status, 200);
});

test('outreach drafts cannot be marked sent before human approval', async () => {
  const { companyId, contactId } = await createCompanyWithContact();
  const draft = await call('POST', `/companies/${companyId}/outreach`, { contact_id: contactId, language: 'en' });
  assert.equal(draft.status, 201);

  const early = await call('POST', `/approvals/${draft.data.id}/mark-sent`, {});
  assert.equal(early.status, 409);

  assert.equal((await call('POST', `/approvals/${draft.data.id}/approve`, {})).status, 200);
  assert.equal((await call('PATCH', `/approvals/${draft.data.id}`, { content: 'changed' })).status, 409, 'approved items are frozen');
  assert.equal((await call('POST', `/approvals/${draft.data.id}/mark-sent`, {})).status, 200);

  const timeline = await call('GET', `/interactions?company_id=${companyId}`);
  assert.equal(timeline.data.length, 1);
  assert.equal(timeline.data[0].channel, 'email');
});

test('approving a brief stores it on the company', async () => {
  const { companyId } = await createCompanyWithContact();
  const brief = await call('POST', `/companies/${companyId}/brief`, { language: 'he' });
  await call('POST', `/approvals/${brief.data.id}/approve`, {});
  const company = await call('GET', `/companies/${companyId}`);
  assert.match(company.data.approved_brief, /Acme/);
});

test('follow-ups are capped at 3 per lead', async () => {
  const { companyId, contactId } = await createCompanyWithContact();
  const deal = await call('POST', '/deals', { company_id: companyId, workflow_id: 1, title: 'Deal', deal_model: 'commission' });
  for (let i = 0; i < 3; i += 1) {
    assert.equal((await call('POST', `/deals/${deal.data.id}/followup`, { contact_id: contactId, language: 'he' })).status, 201);
  }
  const fourth = await call('POST', `/deals/${deal.data.id}/followup`, { contact_id: contactId, language: 'he' });
  assert.equal(fourth.status, 409);

  const tooHigh = await call('PATCH', '/settings', { max_followups: 4 });
  assert.equal(tooHigh.status, 400);
});

test('deal stage must belong to its workflow', async () => {
  const { companyId } = await createCompanyWithContact();
  const workflow = await call('POST', '/workflows', { name_he: 'קצר', name_en: 'Short', stages: ['research', 'proposal'] });
  const deal = await call('POST', '/deals', { company_id: companyId, workflow_id: workflow.data.id, title: 'D', deal_model: 'retainer' });
  assert.equal((await call('PATCH', `/deals/${deal.data.id}`, { stage: 'meeting' })).status, 400);
  assert.equal((await call('PATCH', `/deals/${deal.data.id}`, { stage: 'proposal' })).status, 200);
});

test('post-meeting workflow creates tasks, a summary document and a queued follow-up email', async () => {
  const { companyId, contactId } = await createCompanyWithContact();
  const meeting = await call('POST', '/meetings', { company_id: companyId, title: 'Kickoff', scheduled_at: '2026-05-01T10:00' });
  const done = await call('POST', `/meetings/${meeting.data.id}/complete`, {
    summary: 'Good meeting', decisions: 'Go with Pune\nSend NDA', language: 'en', followup_contact_id: contactId,
    create_summary_document: true,
    tasks: [{ description: 'Send NDA', assignee: 'YMT', due_date: '2026-05-05', is_client_commitment: false }],
  });
  assert.equal(done.status, 200);
  const approval = await call('GET', `/approvals/${done.data.approval_id}`);
  assert.equal(approval.data.status, 'pending');
  assert.match(approval.data.content, /Go with Pune/);
  assert.match(approval.data.content, /Send NDA \(Owner: YMT, due 2026-05-05\)/);
  const document = await call('GET', `/documents/${done.data.document_id}`);
  assert.equal(document.data.kind, 'meeting_summary');
});

test('documents are frozen on finalize and signatures detect tampering', async () => {
  const { companyId } = await createCompanyWithContact();
  const deal = await call('POST', '/deals', { company_id: companyId, workflow_id: 1, title: 'Deal', deal_model: 'commission' });
  const template = (await call('GET', '/templates')).data.find((t) => t.kind === 'quote' && t.language === 'en');
  const created = await call('POST', '/documents', { template_id: template.id, company_id: companyId, deal_id: deal.data.id, title: 'Quote' });
  assert.equal(created.status, 201);
  const id = created.data.id;

  assert.equal((await call('POST', `/documents/${id}/sign`, { signer_name: 'A', signature_image: PNG })).status, 409, 'draft cannot be signed');
  assert.equal((await call('POST', `/documents/${id}/finalize`, {})).status, 200);
  assert.equal((await call('PATCH', `/documents/${id}`, { content: 'new' })).status, 409);

  const token = db.prepare('SELECT sign_token FROM documents WHERE id = ?').get(id).sign_token;
  const signed = await call('POST', `/public/sign/${token}`, { signer_name: 'Client', signature_image: PNG }, { auth: false });
  assert.equal(signed.status, 200);
  assert.equal((await call('GET', `/documents/${id}`)).data.integrity_ok, true);

  db.prepare('UPDATE documents SET content = content || ? WHERE id = ?').run('tampered', id);
  assert.equal((await call('GET', `/documents/${id}`)).data.integrity_ok, false);
});

test('share links expose only allow-listed data and can be revoked', async () => {
  const { companyId } = await createCompanyWithContact();
  await call('PATCH', `/companies/${companyId}`, { notes: 'INTERNAL SECRET' });
  const link = await call('POST', `/companies/${companyId}/share-links`, { label: 'Partner in Pune' });
  const shared = await call('GET', `/public/share/${link.data.token}`, undefined, { auth: false });
  assert.equal(shared.status, 200);
  assert.doesNotMatch(JSON.stringify(shared.data), /INTERNAL SECRET|dana@example.com/);

  await call('POST', `/share-links/${link.data.id}/revoke`, {});
  assert.equal((await call('GET', `/public/share/${link.data.token}`, undefined, { auth: false })).status, 404);
});

test('unknown fields are rejected (fail fast)', async () => {
  const response = await call('POST', '/companies', { name: 'X', industry: 'Y', country: 'Z', india_activity: 'none', revenue: 5 });
  assert.equal(response.status, 400);
  assert.match(response.data.error, /Unknown field\(s\): revenue/);
});

test('read endpoints respond without errors', async () => {
  const { companyId } = await createCompanyWithContact();
  const meeting = await call('POST', '/meetings', { company_id: companyId, title: 'Prep me', scheduled_at: '2030-01-01T09:00' });
  const paths = ['/me', '/dashboard', '/reminders', '/approvals?status=pending', '/deals', '/workflows', '/meetings', '/tasks',
    '/documents', '/templates', '/templates/placeholders', '/resources', '/resources/countries', '/settings',
    '/settings/data-info', '/audit-log', '/users', '/triggers', '/companies/industries',
    `/companies?industry=Valves&exports=no&min_employees=0`, `/companies/${companyId}/overview`,
    `/companies/${companyId}/matches`, `/meetings/${meeting.data.id}/prep`];
  for (const path of paths) {
    const response = await call('GET', path);
    assert.equal(response.status, 200, `${path}: ${JSON.stringify(response.data)}`);
  }
});
