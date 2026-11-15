// Server entry point: reads configuration from the environment and starts listening.

import path from 'node:path';
import { openDatabase, count } from './db.js';
import { createApp } from './app.js';
import { repoRoot, requireEnv, configuredDbPath } from './config.js';

const port = Number(requireEnv('PORT', '3001'));
if (!Number.isInteger(port)) throw new Error('PORT must be an integer');

const dbPath = configuredDbPath();
const db = openDatabase(dbPath);

const app = createApp(db, {
  dbPath,
  hostingLocation: requireEnv('HOSTING_LOCATION', 'Not specified – set HOSTING_LOCATION in .env'),
  clientDist: path.join(repoRoot, 'client/dist'),
});

app.listen(port, () => {
  console.log(`YMT server listening on http://localhost:${port}`);
  console.log(`Database: ${dbPath}`);
  if (count(db, 'users') === 0) {
    console.log('No users yet. Create the first admin with:');
    console.log('  npm run user:create -- --username admin --name "Admin" --password "<10+ chars>" --admin');
  }
});
