// Start-up setup for a hosted demo (e.g. Render). Safe to run on every start:
//   - creates the admin from ADMIN_USERNAME / ADMIN_PASSWORD (/ ADMIN_NAME) only if that username does not exist yet;
//   - loads the demo data only if the database has no companies yet.
// Missing or invalid variables stop the start-up with a clear message (fail fast).

import { openDatabase, count } from '../src/db.js';
import { configuredDbPath, requireEnv } from '../src/config.js';
import { createUser } from '../src/auth.js';
import { loadDemoData } from '../src/demoData.js';

const username = requireEnv('ADMIN_USERNAME').trim();
const password = requireEnv('ADMIN_PASSWORD');
const displayName = (process.env.ADMIN_NAME ?? '').trim() || username;

const db = openDatabase(configuredDbPath());

const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
if (existing) {
  console.log(`Admin "${username}" already exists – not changed. To change its password use Settings → Users in the app.`);
} else {
  const id = createUser(db, { username, display_name: displayName, password, role: 'admin' });
  console.log(`Created admin "${username}" (id ${id}).`);
}

if (count(db, 'companies') === 0) {
  const owner = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  loadDemoData(db, owner.id);
  console.log('Demo data loaded.');
} else {
  console.log('Database already has companies – demo data not loaded again.');
}
