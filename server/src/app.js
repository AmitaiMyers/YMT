// Express application assembly. Kept free of process/env access so tests can build it in-memory.

import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { errorHandler, notFound } from './http.js';
import { requireAuth } from './auth.js';
import { authPublicRoutes, userRoutes } from './routes/auth.js';
import { companyRoutes } from './routes/companies.js';
import { approvalRoutes } from './routes/approvals.js';
import { crmRoutes } from './routes/crm.js';
import { meetingRoutes } from './routes/meetings.js';
import { documentRoutes, publicSignRoutes } from './routes/documents.js';
import { directoryRoutes } from './routes/directory.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { settingsRoutes } from './routes/settings.js';
import { shareRoutes, publicShareRoutes } from './routes/share.js';
import { inboxRoutes } from './routes/inbox.js';
import { dataSourceRoutes } from './routes/dataSources.js';
import { googleRoutes, googleCallbackRoutes } from './routes/google.js';
import { researchRoutes } from './routes/research.js';
import { watchListRoutes } from './routes/watchLists.js';
import { blockedRoutes } from './routes/blocked.js';
import { outreachRoutes } from './routes/outreach.js';
import { conversationRoutes } from './routes/conversations.js';
import { discoveryRoutes, publicDiscoveryRoutes } from './routes/discovery.js';
import { createAiService } from './ai/service.js';

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{ dbPath: string, hostingLocation: string, clientDist?: string, trustProxy?: string | number,
 *   google?: ReturnType<typeof import('./google.js').createGoogleClient> | null,
 *   ai?: ReturnType<typeof import('./ai/service.js').createAiService> }} options
 *   Without `ai`, research screens work but runs report that no AI provider is configured.
 */
export function createApp(db, { dbPath, hostingLocation, clientDist, trustProxy = 'loopback', google = null, ai = createAiService(db, {}), fetchImpl = fetch }) {
  const app = express();
  // Behind a hosting proxy/load balancer this must count its hops, or every visitor shares the proxy's IP
  // (one login rate-limit bucket for everybody).
  app.set('trust proxy', trustProxy);
  app.use(helmet());
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  // Body-less requests get an empty object so validators report precise "x is required" messages.
  app.use((req, res, next) => {
    req.body = req.body ?? {};
    next();
  });
  // API responses carry confidential data: never let browsers or proxies cache them.
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // Public endpoints (no login): login, client e-signing, partner share links, client discovery form.
  app.use('/api/auth', authPublicRoutes(db));
  app.use('/api/public', publicSignRoutes(db));
  app.use('/api/public', publicShareRoutes(db));
  app.use('/api/public', publicDiscoveryRoutes(db));
  app.use('/api', googleCallbackRoutes(db, { google })); // Google redirects here without our session cookie
  app.get('/api/health', (req, res) => res.json({ ok: true }));

  // Everything below requires a signed-in YMT staff member.
  const api = express.Router();
  api.use(requireAuth(db));
  for (const routes of [
    userRoutes(db), companyRoutes(db), approvalRoutes(db), crmRoutes(db), meetingRoutes(db, { google, ai }),
    documentRoutes(db), directoryRoutes(db), dashboardRoutes(db),
    settingsRoutes(db, { dbPath, hostingLocation, googleEnabled: Boolean(google), aiProviders: ai.configuredProviders() }),
    shareRoutes(db), inboxRoutes(db), googleRoutes(db, { google }), researchRoutes(db, { ai }), watchListRoutes(db), blockedRoutes(db), outreachRoutes(db, { ai }), conversationRoutes(db, { ai, google }), discoveryRoutes(db),
    dataSourceRoutes(db, { fetchImpl }),
  ]) {
    api.use(routes);
  }
  app.use('/api', api);
  app.use('/api', (req) => {
    throw notFound(`No API route for ${req.method} ${req.path}`);
  });

  if (clientDist && existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false }));
    app.get('/{*splat}', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
