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

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{ dbPath: string, hostingLocation: string, clientDist?: string }} options
 */
export function createApp(db, { dbPath, hostingLocation, clientDist }) {
  const app = express();
  app.set('trust proxy', 'loopback');
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

  // Public endpoints (no login): login, client e-signing, partner share links.
  app.use('/api/auth', authPublicRoutes(db));
  app.use('/api/public', publicSignRoutes(db));
  app.use('/api/public', publicShareRoutes(db));
  app.get('/api/health', (req, res) => res.json({ ok: true }));

  // Everything below requires a signed-in YMT staff member.
  const api = express.Router();
  api.use(requireAuth(db));
  for (const routes of [
    userRoutes(db), companyRoutes(db), approvalRoutes(db), crmRoutes(db), meetingRoutes(db),
    documentRoutes(db), directoryRoutes(db), dashboardRoutes(db), settingsRoutes(db, { dbPath, hostingLocation }),
    shareRoutes(db),
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
