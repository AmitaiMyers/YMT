// "Today" view: everything that needs a person, ranked by urgency, plus counts for the navigation badges.

import { Router } from 'express';
import { buildReminders } from '../reminders.js';
import { badRequest } from '../http.js';

const HOUR_MS = 3600000;
const SEARCH_LIMIT = 8;

export function inboxRoutes(db) {
  const router = Router();
  const pendingApprovals = db.prepare(`SELECT a.id, a.kind, a.subject, a.created_at, a.company_id, c.name AS company_name,
      k.full_name AS contact_name
    FROM approvals a JOIN companies c ON c.id = a.company_id LEFT JOIN contacts k ON k.id = a.contact_id
    WHERE a.status = 'pending' ORDER BY a.created_at`);
  const approvedNotSent = db.prepare(`SELECT COUNT(*) AS n FROM approvals WHERE status = 'approved' AND kind != 'company_brief'`);
  const meetingsBetween = db.prepare(`SELECT m.id, m.title, m.scheduled_at, m.location, m.company_id, c.name AS company_name
    FROM meetings m JOIN companies c ON c.id = m.company_id
    WHERE m.status = 'scheduled' AND m.scheduled_at >= ? AND m.scheduled_at < ? ORDER BY m.scheduled_at`);

  function buildInbox() {
    const now = Date.now();
    const reminders = buildReminders(db);
    return {
      approvals: pendingApprovals.all(),
      approved_not_sent: approvedNotSent.get().n,
      overdue_tasks: reminders.overdue_tasks,
      meetings_to_prep: meetingsBetween.all(new Date(now).toISOString(), new Date(now + 24 * HOUR_MS).toISOString()),
      meetings_to_summarize: meetingsBetween.all('0000', new Date(now).toISOString()),
      stale_deals: reminders.stale_deals,
      max_followups: reminders.max_followups,
      stale_days: reminders.stale_days,
    };
  }

  router.get('/inbox', (req, res) => res.json(buildInbox()));

  /** Lightweight counters for the navigation badges (polled on focus). */
  router.get('/inbox/counts', (req, res) => {
    const inbox = buildInbox();
    res.json({
      approvals: inbox.approvals.length,
      inbox: inbox.approvals.length + inbox.overdue_tasks.length + inbox.meetings_to_prep.length
        + inbox.meetings_to_summarize.length + inbox.stale_deals.length,
    });
  });

  /** Global search for the command palette: companies and deals by name. */
  router.get('/search', (req, res) => {
    if (typeof req.query.q !== 'string') throw badRequest('q is required');
    const q = req.query.q.trim();
    if (q.length < 2) {
      res.json({ companies: [], deals: [] });
      return;
    }
    const like = `%${q}%`;
    res.json({
      companies: db.prepare(`SELECT id, name, industry, is_client FROM companies WHERE name LIKE ? ORDER BY name LIMIT ${SEARCH_LIMIT}`).all(like),
      deals: db.prepare(`SELECT d.id, d.title, d.stage, c.name AS company_name FROM deals d JOIN companies c ON c.id = d.company_id
        WHERE d.status = 'open' AND (d.title LIKE ? OR c.name LIKE ?) ORDER BY d.title LIMIT ${SEARCH_LIMIT}`).all(like, like),
    });
  });

  return router;
}
