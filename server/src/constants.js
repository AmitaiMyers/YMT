// Server-side constants. Enumerations come from shared/enums.js (single source of truth with the client).

import { PIPELINE_STAGES, MAX_FOLLOWUPS_HARD_LIMIT } from '../../shared/enums.js';

export * from '../../shared/enums.js';

export const DEFAULT_SETTINGS = {
  company_name: 'YMT Group',
  stale_days: '14',
  max_followups: String(MAX_FOLLOWUPS_HARD_LIMIT),
  target_new_leads_monthly: '10',
  target_meetings_monthly: '6',
  target_revenue_yearly_usd: '500000',
  share_link_days: '14',
};

export const DEFAULT_WORKFLOWS = [
  { name_he: 'ליווי אסטרטגי ארוך טווח', name_en: 'Long-term advisory', stages: PIPELINE_STAGES },
  { name_he: 'שידוך חד-פעמי (ספק/יצרן)', name_en: 'One-off matchmaking', stages: ['research', 'outreach', 'call', 'proposal', 'contract'] },
];
