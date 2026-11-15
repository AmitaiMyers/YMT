// Management dashboard: pipeline distribution, upcoming meetings, open proposals, targets vs actuals, revenue.

import { Router } from 'express';
import { getNumericSetting } from '../db.js';
import { PIPELINE_STAGES } from '../constants.js';

const UPCOMING_DAYS = 14;

function startOfMonthIso(now) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function startOfYearIso(now) {
  return new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
}

export function dashboardRoutes(db) {
  const router = Router();

  router.get('/dashboard', (req, res) => {
    const now = new Date();
    const nowIso = now.toISOString();
    const monthStart = startOfMonthIso(now);
    const yearStart = startOfYearIso(now);
    const upcomingEnd = new Date(now.getTime() + UPCOMING_DAYS * 86400000).toISOString();
    const one = (sql, ...params) => db.prepare(sql).get(...params);

    const stageCounts = Object.fromEntries(
      db.prepare(`SELECT stage, COUNT(*) AS n FROM deals WHERE status = 'open' GROUP BY stage`).all().map((r) => [r.stage, r.n]),
    );

    res.json({
      stage_distribution: PIPELINE_STAGES.map((stage) => ({ stage, count: stageCounts[stage] ?? 0 })),
      upcoming_meetings: db.prepare(`SELECT m.id, m.title, m.scheduled_at, m.location, c.name AS company_name
        FROM meetings m JOIN companies c ON c.id = m.company_id
        WHERE m.status = 'scheduled' AND m.scheduled_at >= ? AND m.scheduled_at <= ? ORDER BY m.scheduled_at`)
        .all(nowIso, upcomingEnd),
      open_proposals: db.prepare(`SELECT d.id, d.title, d.expected_value_usd, d.stage_changed_at, c.name AS company_name
        FROM deals d JOIN companies c ON c.id = d.company_id
        WHERE d.status = 'open' AND d.stage IN ('proposal', 'contract') ORDER BY d.stage_changed_at`).all(),
      unsigned_documents: one(`SELECT COUNT(*) AS n FROM documents WHERE kind IN ('quote', 'agreement') AND status = 'finalized'`).n,
      pending_approvals: one(`SELECT COUNT(*) AS n FROM approvals WHERE status = 'pending'`).n,
      approved_not_sent: one(`SELECT COUNT(*) AS n FROM approvals WHERE status = 'approved' AND kind != 'company_brief'`).n,
      targets: {
        new_leads_month: {
          target: getNumericSetting(db, 'target_new_leads_monthly'),
          actual: one('SELECT COUNT(*) AS n FROM deals WHERE created_at >= ?', monthStart).n,
        },
        meetings_month: {
          target: getNumericSetting(db, 'target_meetings_monthly'),
          actual: one(`SELECT COUNT(*) AS n FROM meetings WHERE status = 'done' AND scheduled_at >= ?`, monthStart).n,
        },
        revenue_year_usd: {
          target: getNumericSetting(db, 'target_revenue_yearly_usd'),
          actual: one(`SELECT COALESCE(SUM(actual_revenue_usd), 0) AS n FROM deals WHERE status = 'won' AND closed_at >= ?`, yearStart).n,
        },
      },
      revenue_by_model: db.prepare(`SELECT deal_model,
          COALESCE(SUM(CASE WHEN status = 'won' THEN actual_revenue_usd END), 0) AS won_usd,
          COALESCE(SUM(CASE WHEN status = 'open' THEN expected_value_usd END), 0) AS pipeline_usd
        FROM deals GROUP BY deal_model ORDER BY deal_model`).all(),
    });
  });

  return router;
}
