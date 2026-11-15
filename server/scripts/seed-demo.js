// Load fictional demo data so staff can explore the app. Refuses to run on a database that already has companies.
// Usage: npm run seed:demo   (create a user first with npm run user:create)

import { openDatabase, count } from '../src/db.js';
import { configuredDbPath } from '../src/config.js';
import { loadDemoData } from '../src/demoData.js';

const db = openDatabase(configuredDbPath());
if (count(db, 'companies') > 0) throw new Error('Database already contains companies; demo seed only runs on an empty database');
const owner = db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get();
if (!owner) throw new Error('Create a user first: npm run user:create -- --username ... --name ... --password ... --admin');

loadDemoData(db, owner.id);
console.log('Demo data loaded.');
