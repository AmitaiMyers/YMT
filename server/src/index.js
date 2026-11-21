// Server entry point: reads configuration from the environment and starts listening.

import path from 'node:path';
import { openDatabase, count } from './db.js';
import { createApp } from './app.js';
import { repoRoot, requireEnv, configuredDbPath } from './config.js';
import { googleConfigFromEnv, createGoogleClient } from './google.js';
import Anthropic from '@anthropic-ai/sdk';
import { createAiService } from './ai/service.js';
import { createClaudeProvider } from './ai/claude.js';
import { createOpenAiProvider } from './ai/openai.js';
import { startResearchWorker } from './research/worker.js';
import { syncAllGmail } from './gmailReplies.js';

const port = Number(requireEnv('PORT', '3001'));
if (!Number.isInteger(port)) throw new Error('PORT must be an integer');

/** TRUST_PROXY: a hop count ("1" behind one proxy) or an Express trust-proxy keyword/CIDR list. */
function parseTrustProxy(value) {
  return /^\d+$/.test(value) ? Number(value) : value;
}

const googleConfig = googleConfigFromEnv(process.env); // all four Google variables or none (fails fast)
const dbPath = configuredDbPath();
const db = openDatabase(dbPath);

// AI providers are switched on by their API keys; without a key, research runs report what is missing.
const aiProviders = {};
if (process.env.ANTHROPIC_API_KEY) aiProviders.claude = createClaudeProvider({ client: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) });
if (process.env.OPENAI_API_KEY) aiProviders.openai = createOpenAiProvider({ apiKey: process.env.OPENAI_API_KEY });
const ai = createAiService(db, aiProviders);
startResearchWorker(db, ai);

const google = googleConfig ? createGoogleClient(googleConfig) : null;

// Release 4: check the Gmail of everyone who allowed it for replies, every 15 minutes (one run at a time).
const GMAIL_CHECK_MS = 15 * 60_000;
if (google) {
  let checking = false;
  setInterval(() => {
    if (checking) return;
    checking = true;
    syncAllGmail(db, google, ai).finally(() => { checking = false; });
  }, GMAIL_CHECK_MS);
}

const app = createApp(db, {
  dbPath,
  hostingLocation: requireEnv('HOSTING_LOCATION', 'Not specified – set HOSTING_LOCATION in .env'),
  clientDist: path.join(repoRoot, 'client/dist'),
  trustProxy: parseTrustProxy(requireEnv('TRUST_PROXY', 'loopback')),
  google,
  ai,
});

app.listen(port, () => {
  console.log(`YMT server listening on http://localhost:${port}`);
  console.log(`Database: ${dbPath}`);
  console.log(`Google Calendar and Gmail replies: ${googleConfig ? `enabled (redirect ${googleConfig.publicUrl}/api/google/callback)` : 'not configured'}`);
  console.log(`AI providers: ${Object.keys(aiProviders).join(', ') || 'none (set ANTHROPIC_API_KEY to run research)'}`);
  if (count(db, 'users') === 0) {
    console.log('No users yet. Create the first admin with:');
    console.log('  npm run user:create -- --username admin --name "Admin" --password "<10+ chars>" --admin');
  }
});
