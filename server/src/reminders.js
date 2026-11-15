// Shared read models for "what needs attention": used by /reminders and the Inbox.

import { getNumericSetting } from './db.js';
import { followupsCommitted } from './approvalQueue.js';

export const SELECT_DEALS = `
  SELECT d.*, c.name AS company_name, u.display_name AS owner_name,
    w.name_he AS workflow_name_he, w.name_en AS workflow_name_en
  FROM deals d
  JOIN companies c ON c.id = d.company_id
  JOIN workflows w ON w.id = d.workflow_id
  LEFT JOIN users u ON u.id = d.owner_id`;

const DAY_MS = 86400000;

export function daysSince(iso) {
  return Math.floor((Date.now() - Date.parse(iso)) / DAY_MS);
}

/** Open deals with no activity for more than `stale_days`, plus overdue open tasks. */
export function buildReminders(db) {
  const staleDays = getNumericSetting(db, 'stale_days');
  const maxFollowups = getNumericSetting(db, 'max_followups');
  const cutoff = new Date(Date.now() - staleDays * DAY_MS).toISOString();
  const stale = db.prepare(`${SELECT_DEALS} WHERE d.status = 'open' AND d.last_activity_at < ? ORDER BY d.last_activity_at`).all(cutoff);
  const today = new Date().toISOString().slice(0, 10);
  return {
    stale_days: staleDays,
    max_followups: maxFollowups,
    stale_deals: stale.map((deal) => {
      const committed = followupsCommitted(db, deal.id);
      return { ...deal, days_idle: daysSince(deal.last_activity_at), followups_committed: committed, can_followup: committed < maxFollowups };
    }),
    overdue_tasks: db.prepare(`SELECT t.*, c.name AS company_name FROM tasks t LEFT JOIN companies c ON c.id = t.company_id
      WHERE t.done = 0 AND t.due_date IS NOT NULL AND t.due_date < ? ORDER BY t.due_date`).all(today),
  };
}
