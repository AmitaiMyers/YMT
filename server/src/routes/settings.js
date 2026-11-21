// Settings (editable by any staff member), data & privacy visibility, backups and audit log.

import { Router } from 'express';
import { statSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { parseBody } from '../validate.js';
import { getSettings, count, audit } from '../db.js';
import { requireAdmin } from '../auth.js';
import { badRequest } from '../http.js';
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
  'meetings', 'tasks', 'documents', 'signatures', 'resources', 'share_links', 'opportunities', 'sources', 'facts', 'audit_log'];

function fileSize(filePath) {
  return filePath === ':memory:' ? 0 : statSync(filePath).size;
}

const AI_PROVIDER_NOTES = {
  claude: 'Anthropic Claude API – research only: public company information, search queries and the mandate text',
  openai: 'OpenAI API – research only: public company information, search queries and the mandate text',
};

export function settingsRoutes(db, { dbPath, hostingLocation, googleEnabled, aiProviders }) {
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
      storage: aiProviders.length > 0 ? 'SQLite database file on this server' : 'SQLite database file on this server (no AI/LLM providers)',
      hosting_location: hostingLocation,
      database_path: dbPath,
      database_size_bytes: fileSize(dbPath),
      // Honest list of every outside service that can receive company data.
      external_services: [
        ...(googleEnabled ? ['Google Calendar – only for staff who connect it: meeting title, time, place, organisation and person name'] : []),
        ...aiProviders.map((provider) => AI_PROVIDER_NOTES[provider]),
      ],
      row_counts: Object.fromEntries(COUNTED_TABLES.map((table) => [table, count(db, table)])),
    });
  });

  /** Consistent snapshot of the live database (VACUUM INTO) in DATA_DIR/backups. Returns the file path. */
  function createBackup(userId) {
    if (dbPath === ':memory:') throw badRequest('In-memory database cannot be backed up');
    const backupDir = path.join(path.dirname(dbPath), 'backups');
    mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `ymt-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
    db.prepare('VACUUM INTO ?').run(backupPath);
    audit(db, userId, 'backup.created', 'settings', null, backupPath);
    return backupPath;
  }

  router.post('/settings/backup', requireAdmin, (req, res) => {
    const backupPath = createBackup(req.user.id);
    res.json({ backup_path: backupPath, size_bytes: fileSize(backupPath) });
  });

  /** Fresh backup streamed to the admin's computer, so a copy exists outside the server's disk. */
  router.get('/settings/backup/download', requireAdmin, (req, res) => {
    const backupPath = createBackup(req.user.id);
    audit(db, req.user.id, 'backup.downloaded', 'settings', null, path.basename(backupPath));
    res.download(backupPath, path.basename(backupPath), { headers: { 'Content-Type': 'application/vnd.sqlite3' } });
  });

  router.get('/audit-log', requireAdmin, (req, res) => {
    res.json(db.prepare(`SELECT a.*, u.display_name AS user_name FROM audit_log a
      LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 300`).all());
  });

  return router;
}
