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
    contacts: { provider: 'claude', model: 'claude-sonnet-5-5' },
    outreach: { provider: 'claude', model: 'claude-sonnet-5-5' },
    reply: { provider: 'claude', model: 'claude-sonnet-5-5' },
    meeting: { provider: 'claude', model: 'claude-sonnet-5-5' },
  }),
  // Which version of YMT's mandate wording the database was moved to (see applySpec2211).
  mandate_spec: '',
  // Focus mode hides the screens this week's tasks do not use (see client/src/app/viewMode.js); admins switch it.
  view_mode: 'focus',
  // Release 4: a first approach with no reply after this many days shows "Follow up".
  followup_after_days: '7',
  // Release 3 legal gate. Countries are names as used on companies ("Israel"). Israel is cleared by default because
  // the gate implements its Communications Law rules (opt-out sentence + "פרסומת" marking); YMT's lawyer confirms.
  outreach_cleared_countries: JSON.stringify(['Israel']),
  outreach_optout_he: 'אם אינכם מעוניינים לקבל מאיתנו פניות נוספות, השיבו "הסר" ולא נפנה אליכם שוב.',
  outreach_optout_en: 'If you would prefer not to hear from us, reply "remove" and we will not contact you again.',
  // Claude API list prices checked 20 Nov 2026 (platform.claude.com/docs/en/about-claude/pricing).
  ai_prices: JSON.stringify({
    'claude-sonnet-5-5': { input: 2, output: 10, cache_read: 0.1, search: 0.01 },
    'claude-opus-5-5': { input: 4, output: 20, cache_read: 0.2, search: 0.01 },
    'claude-haiku-5-5': { input: 0.1, output: 0.5, cache_read: 0.01, search: 0.01 },
  }),
};

export const MANDATE_SPEC = '2026-11-22';

// Release 5: the standard discovery questions YMT starts from (an admin edits them under Settings → Discovery form).
export const DEFAULT_DISCOVERY_QUESTIONS = [
  { question_he: 'מה תרצו להשיג ב-12 החודשים הקרובים?', question_en: 'What would you like to achieve in the next 12 months?', answer_kind: 'long', required: 1 },
  { question_he: 'לאילו שווקים או מדינות אתם מכוונים?', question_en: 'Which markets or countries are you targeting?', answer_kind: 'short', required: 1 },
  { question_he: 'באילו מוצרים או שירותים מדובר?', question_en: 'Which products or services is this about?', answer_kind: 'long', required: 0 },
  { question_he: 'מהו לוח הזמנים שלכם?', question_en: 'What is your timeline?', answer_kind: 'short', required: 0 },
  { question_he: 'איזה טווח תקציב הקציתם לכך?', question_en: 'What budget range have you set aside for this?', answer_kind: 'short', required: 0 },
  { question_he: 'מי שותף להחלטה, ואת מי עוד כדאי לשתף?', question_en: 'Who takes part in the decision, and who else should we involve?', answer_kind: 'long', required: 0 },
  { question_he: 'עם אילו שותפים, מפיצים או יועצים אתם כבר עובדים שם?', question_en: 'Which partners, distributors or advisors do you already work with there?', answer_kind: 'long', required: 0 },
  { question_he: 'אילו מגבלות כדאי שנכיר (רגולציה, תקינה, כושר ייצור, פיקוח יצוא)?', question_en: 'What constraints should we know about (regulation, certifications, capacity, export controls)?', answer_kind: 'long', required: 0 },
  { question_he: 'יש עוד משהו שחשוב שנדע?', question_en: 'Is there anything else we should know?', answer_kind: 'long', required: 0 },
];

export const DEFAULT_WORKFLOWS = [
  { name_he: 'ליווי אסטרטגי ארוך טווח', name_en: 'Long-term advisory', stages: PIPELINE_STAGES },
  { name_he: 'שידוך חד-פעמי (ספק/יצרן)', name_en: 'One-off matchmaking', stages: ['research', 'outreach', 'call', 'proposal', 'contract'] },
];
