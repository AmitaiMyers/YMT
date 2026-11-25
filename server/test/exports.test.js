// The full company export: every research card (rejected ones too) with everything known about it, saved in
// DATA_DIR/exports next to the database as Excel-friendly UTF-8. Members export their own cards; admins everyone's.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDatabase, insert } from '../src/db.js';
import { createApp } from '../src/app.js';
import { createUser } from '../src/auth.js';

let server;
let baseUrl;
let dir;
const cookies = {};

before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'ymt-export-'));
  const dbPath = path.join(dir, 'ymt.db');
  const db = openDatabase(dbPath);
  createUser(db, { username: 'tom', display_name: 'Tom', password: 'correct-horse', role: 'admin' });
  const shir = createUser(db, { username: 'shir', display_name: 'Shir', password: 'correct-horse', role: 'member' });
  server = createApp(db, { dbPath, hostingLocation: 'test' }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  for (const user of ['tom', 'shir']) {
    const response = await fetch(`${baseUrl}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: 'correct-horse' }) });
    cookies[user] = response.headers.get('set-cookie').split(';')[0];
  }

  const acme = insert(db, 'companies', {
    name: 'אקמה, Ltd', industry: 'Valves', country: 'Israel', website: 'https://acme.example', origin: 'research', general_email: 'info@acme.example',
    description: 'Valves "made in Israel"', linkedin_page_url: 'https://www.linkedin.com/company/acme',
  });
  const source = insert(db, 'sources', { url: 'https://news.example/acme-india', kind: 'web' });
  insert(db, 'facts', { company_id: acme, field: 'employees', value: '120', source_id: source, quote: '120 people', entity_covered: 'Acme' });
  insert(db, 'company_markets', { company_id: acme, market: 'india', status: 'exploring', fit: 'fit', source_id: source });
  insert(db, 'contacts', { company_id: acme, full_name: 'Dana Levi', job_title: 'CEO', department: 'management', email: 'dana@acme.example', preferred_language: 'en' });
  const card = (company, owner, status) => insert(db, 'opportunities', {
    company_id: company, owner_id: owner, relationship_role: 'client', target_country: 'India', need_type: 'market_entry_distribution',
    business_need: 'Indian distributor', evidence_source_id: source, evidence_date: '2026-11-01', evidence_quote: 'Acme seeks a distributor.',
    status, flags: '["lower_priority"]', unknowns: '[]',
  });
  card(acme, shir, 'draft');
  card(insert(db, 'companies', { name: 'Rejected Co', industry: 'Other', country: 'unknown', origin: 'research' }), shir, 'rejected');
  card(insert(db, 'companies', { name: 'Unowned Co', industry: 'Other', country: 'Israel', origin: 'research' }), null, 'manual_assignment');
});

after(() => {
  server.closeAllConnections();
  server.close();
  rmSync(dir, { recursive: true });
});

const exportAs = (user, owner) => fetch(`${baseUrl}/exports/companies`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookies[user] }, body: JSON.stringify({ owner }),
}).then(async (response) => ({ status: response.status, data: await response.json() }));

test('a member exports their own cards, rejected ones included, with the full company card', async () => {
  const saved = await exportAs('shir', 'me');
  assert.equal(saved.status, 201, saved.data.error);
  assert.equal(saved.data.count, 2);
  assert.equal(path.dirname(saved.data.path), path.join(dir, 'exports'));
  assert.match(path.basename(saved.data.path), /^ymt-companies-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.csv$/);

  const text = readFileSync(saved.data.path, 'utf8');
  assert.equal(text[0], '﻿'); // Excel reads Hebrew correctly
  const [header, acme, rejected] = text.slice(1).split('\r\n');
  assert.ok(header.startsWith('Company,Website,Country,Notes,Card ID,'), header); // the watch-list import's columns first
  for (const column of ['Business need', 'Score', 'Tier', 'General email', 'LinkedIn company page', 'Markets', 'Contacts', 'Facts with sources', 'Deal', 'Messages', 'Replies', 'Meetings']) {
    assert.ok(header.split(',').includes(column), column);
  }
  assert.ok(acme.startsWith('"אקמה, Ltd",https://acme.example,Israel,'), acme); // quoted: the name holds a comma
  for (const value of ['Indian distributor', 'info@acme.example', '"Valves ""made in Israel"""', 'india · exploring · fit', 'Dana Levi · CEO · management · dana@acme.example',
    'employees = 120 [https://news.example/acme-india]', 'lower_priority']) {
    assert.ok(acme.includes(value), value);
  }
  assert.ok(rejected.startsWith('Rejected Co,,,'), rejected); // "unknown" country exported empty
  assert.ok(rejected.includes(',rejected,'), rejected);
});

test('only admins export everyone\'s cards', async () => {
  assert.equal((await exportAs('shir', 'all')).status, 403);
  assert.equal((await exportAs('shir', 'everyone')).status, 400);
  const all = await exportAs('tom', 'all');
  assert.equal(all.status, 201, all.data.error);
  assert.equal(all.data.count, 3);
});
