// Settings (editable by any staff member), data & privacy visibility, backups and audit log.

import { Router } from 'express';
import { statSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { parseBody } from '../validate.js';
import { getSettings, count, audit } from '../db.js';
import { requireAdmin } from '../auth.js';
import { MAX_FOLLOWUPS_HARD_LIMIT } from '../constants.js';

const SETTINGS_SPEC = {
  company_name: { type: 'string', max: 120 },
  stale_days: { type: 'int', min: 1, max: 365 },
  max_followups: { type: 'int', min: 1, max: MAX_FOLLOWUPS_HARD_LIMIT },
  target_new_leads_monthly: { type: 'int', min: 0 },
  target_meetings_monthly: { type: 'int', min: 0 },
  target_revenue_yearly_usd: { type: 'int', min: 0 },
  share_link_days: { type: 'int', min: 1, max: 90 },
};

const COUNTED_TABLES = ['users', 'companies', 'contacts', 'triggers', 'deals', 'interactions', 'approvals',
  'meetings', 'tasks', 'documents', 'signatures', 'resources', 'share_links', 'audit_log'];

function fileSize(filePath) {
  return filePath === ':memory:' ? 0 : statSync(filePath).size;
}

export function settingsRoutes(db, { dbPath, hostingLocation }) {
  const router = Router();

  router.get('/settings', (req, res) => res.json(getSettings(db)));

  router.patch('/settings', (req, res) => {
    const changes = parseBody(SETTINGS_SPEC, req.body, { partial: true });
    const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) continue; // empty input keeps the existing value
      upsert.run(key, String(value));
    }
    audit(db, req.user.id, 'settings.updated', 'settings', null, Object.keys(changes).join(','));
    res.json(getSettings(db));
  });

  /** Clear answer to "where is our data?" for the Data & Privacy page. */
  router.get('/settings/data-info', (req, res) => {
    res.json({
      storage: 'SQLite database file on this server (no third-party cloud services, no AI/LLM providers)',
      hosting_location: hostingLocation,
      database_path: dbPath,
      database_size_bytes: fileSize(dbPath),
      external_services: [],
      row_counts: Object.fromEntries(COUNTED_TABLES.map((table) => [table, count(db, table)])),
    });
  });

  router.post('/settings/backup', requireAdmin, (req, res) => {
    if (dbPath === ':memory:') {
      res.status(400).json({ error: 'In-memory database cannot be backed up' });
      return;
    }
    const backupDir = path.join(path.dirname(dbPath), 'backups');
    mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `ymt-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
    db.prepare('VACUUM INTO ?').run(backupPath);
    audit(db, req.user.id, 'backup.created', 'settings', null, backupPath);
    res.json({ backup_path: backupPath, size_bytes: fileSize(backupPath) });
  });

  router.get('/audit-log', requireAdmin, (req, res) => {
    res.json(db.prepare(`SELECT a.*, u.display_name AS user_name FROM audit_log a
      LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 300`).all());
  });

  return router;
}
