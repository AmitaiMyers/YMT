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
  // Research (Release 1). Prices: USD per million tokens, and USD per web search.
  ai_monthly_cap_usd: '20',
  ai_alert_month: '',
  ai_tasks: JSON.stringify({
    discover: { provider: 'claude', model: 'claude-sonnet-5-5' },
    classify: { provider: 'claude', model: 'claude-sonnet-5-5' },
    judge: { provider: 'claude', model: 'claude-sonnet-5-5' },
  }),
  // Claude API list prices checked 20 Nov 2026 (platform.claude.com/docs/en/about-claude/pricing).
  ai_prices: JSON.stringify({
    'claude-sonnet-5-5': { input: 2, output: 10, cache_read: 0.1, search: 0.01 },
    'claude-opus-5-5': { input: 4, output: 20, cache_read: 0.2, search: 0.01 },
    'claude-haiku-5-5': { input: 0.1, output: 0.5, cache_read: 0.01, search: 0.01 },
  }),
};

export const DEFAULT_WORKFLOWS = [
  { name_he: 'ליווי אסטרטגי ארוך טווח', name_en: 'Long-term advisory', stages: PIPELINE_STAGES },
  { name_he: 'שידוך חד-פעמי (ספק/יצרן)', name_en: 'One-off matchmaking', stages: ['research', 'outreach', 'call', 'proposal', 'contract'] },
];
