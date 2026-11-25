// Exports are saved in DATA_DIR/exports, next to the database: plain .csv names only, Excel-friendly UTF-8.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDatabase } from '../src/db.js';
import { createApp } from '../src/app.js';
import { createUser } from '../src/auth.js';

let server;
let baseUrl;
let cookie;
let dir;

before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'ymt-export-'));
  const dbPath = path.join(dir, 'ymt.db');
  const db = openDatabase(dbPath);
  createUser(db, { username: 'shir', display_name: 'Shir', password: 'correct-horse', role: 'member' });
  server = createApp(db, { dbPath, hostingLocation: 'test' }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  const response = await fetch(`${baseUrl}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'shir', password: 'correct-horse' }) });
  cookie = response.headers.get('set-cookie').split(';')[0];
});

after(() => {
  server.closeAllConnections();
  server.close();
  rmSync(dir, { recursive: true });
});

const save = (body) => fetch(`${baseUrl}/exports`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) })
  .then(async (response) => ({ status: response.status, data: await response.json() }));

test('an export lands in data/exports with a BOM; only plain .csv names', async () => {
  const saved = await save({ filename: 'ymt-companies-2026-11-25-10-30.csv', content: 'Company,Website\r\nאקמה,https://acme.example' });
  assert.equal(saved.status, 201, saved.data.error);
  assert.equal(saved.data.path, path.join(dir, 'exports', 'ymt-companies-2026-11-25-10-30.csv'));
  assert.equal(readFileSync(saved.data.path, 'utf8'), '﻿Company,Website\r\nאקמה,https://acme.example');
  for (const filename of ['../ymt.db', 'evil.exe', 'sub/x.csv', 'UPPER.csv', '.csv']) {
    assert.equal((await save({ filename, content: 'x' })).status, 400, filename);
  }
  assert.equal(existsSync(path.join(dir, 'evil.exe')), false);
});
