// Deterministic, template-based text generation (no AI/LLM).
// Every generator only RETURNS text; callers put it into the approval queue or a draft document.

import { badRequest } from './http.js';
import { findById, getSettings } from './db.js';

const EMPTY = '—';

const LABELS = {
  he: {
    yes: 'כן', no: 'לא', none: 'אין',
    india_activity: { none: 'אין פעילות', exploring: 'בבחינה', active: 'פעילה' },
    deal_model: { commission: 'עמלה', brokerage_fee: 'דמי תיווך', future_orders_pct: 'אחוז מהזמנות עתידיות', retainer: 'ריטיינר' },
    trigger_type: { trade_show: 'תערוכה', delegation: 'משלחת סחר', job_posting: 'משרה חדשה', news: 'חדשות', other: 'אחר' },
    department: { sales: 'מכירות', growth: 'צמיחה', asia_desk: 'דסק אסיה', management: 'הנהלה', other: 'אחר' },
    trigger_hook: (trigger) => `ראיתי ש${trigger.description} – נראה שזה עיתוי טוב לבחון את השוק ההודי.`,
    no_trigger_hook: 'ראיתי את הפעילות שלכם בתחום ונראה לי שיש פוטנציאל משמעותי בשוק ההודי.',
    assignee: 'אחראי', due: 'עד',
  },
  en: {
    yes: 'Yes', no: 'No', none: 'None',
    india_activity: { none: 'No activity', exploring: 'Exploring', active: 'Active' },
    deal_model: { commission: 'Commission', brokerage_fee: 'Brokerage fee', future_orders_pct: 'Percentage of future orders', retainer: 'Retainer' },
    trigger_type: { trade_show: 'Trade show', delegation: 'Trade delegation', job_posting: 'Job posting', news: 'News', other: 'Other' },
    department: { sales: 'Sales', growth: 'Growth', asia_desk: 'Asia desk', management: 'Management', other: 'Other' },
    trigger_hook: (trigger) => `I noticed that ${trigger.description} – this looks like a good moment to explore the Indian market.`,
    no_trigger_hook: 'I came across your work in the sector and believe there is significant potential for you in India.',
    assignee: 'Owner', due: 'due',
  },
};

function labels(language) {
  const result = LABELS[language];
  if (!result) throw badRequest(`Unsupported language: ${language}`);
  return result;
}

function show(value) {
  return value === null || value === undefined || value === '' ? EMPTY : String(value);
}

function bulletList(lines, language) {
  return lines.length === 0 ? `- ${labels(language).none}` : lines.map((line) => `- ${line}`).join('\n');
}

/**
 * Replace {{placeholder}} tokens. A placeholder missing from `context` is a template error and fails fast,
 * so staff immediately see a typo instead of sending a half-filled text.
 */
export function renderTemplate(text, context) {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, key) => {
    if (!(key in context)) {
      throw badRequest(`Template placeholder {{${key}}} is not available in this context`);
    }
    return show(context[key]);
  });
}

export function findTemplate(db, kind, language) {
  const template = db.prepare('SELECT * FROM templates WHERE kind = ? AND language = ? ORDER BY id LIMIT 1').get(kind, language);
  if (!template) throw badRequest(`No ${kind} template exists for language "${language}". Add one in Settings → Templates.`);
  return template;
}

export function renderFromTemplate(template, context) {
  return {
    subject: template.subject ? renderTemplate(template.subject, context) : null,
    content: renderTemplate(template.body, context),
  };
}

// ------------------------------------------------------------------ context builders (DRY building blocks)

function baseContext(db, user) {
  return {
    our_company: getSettings(db).company_name,
    sender_name: user.display_name,
    today: new Date().toISOString().slice(0, 10),
  };
}

function companyContext(company, language) {
  const l = labels(language);
  return {
    company_name: company.name,
    industry: company.industry,
    country: company.country,
    website: company.website,
    employee_count: company.employee_count,
    annual_revenue_usd: company.annual_revenue_usd,
    exports: company.exports ? l.yes : l.no,
    export_markets: company.export_markets,
    india_activity: l.india_activity[company.india_activity],
    notes: company.notes,
  };
}

function contactContext(contact) {
  return { contact_name: contact ? contact.full_name : EMPTY };
}

function dealContext(deal, language) {
  return {
    deal_title: deal.title,
    deal_model: labels(language).deal_model[deal.deal_model],
    expected_value_usd: deal.expected_value_usd,
  };
}

function meetingContext(db, meeting, language) {
  const tasks = db.prepare('SELECT * FROM tasks WHERE meeting_id = ? ORDER BY id').all(meeting.id);
  const l = labels(language);
  const taskLines = tasks.map((task) => `${task.description} (${l.assignee}: ${task.assignee}${task.due_date ? `, ${l.due} ${task.due_date}` : ''})`);
  const decisions = (meeting.decisions ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
  return {
    meeting_title: meeting.title,
    meeting_date: meeting.scheduled_at.slice(0, 10),
    attendees: meeting.attendees,
    summary: meeting.summary,
    decisions_list: bulletList(decisions, language),
    tasks_list: bulletList(taskLines, language),
  };
}

function latestTrigger(db, companyId) {
  return db.prepare('SELECT * FROM triggers WHERE company_id = ? ORDER BY detected_on DESC LIMIT 1').get(companyId);
}

function optionalRow(db, table, id) {
  return id ? findById(db, table, id) : null;
}

// ------------------------------------------------------------------ public generators

export function generateCompanyBrief(db, user, companyId, language) {
  const company = findById(db, 'companies', companyId);
  const l = labels(language);
  const triggers = db.prepare('SELECT * FROM triggers WHERE company_id = ? ORDER BY detected_on DESC LIMIT 5').all(companyId);
  const contacts = db.prepare('SELECT * FROM contacts WHERE company_id = ? ORDER BY verified DESC, id').all(companyId);
  const interactionStats = db.prepare('SELECT COUNT(*) AS n, MAX(occurred_at) AS last FROM interactions WHERE company_id = ?').get(companyId);

  const context = {
    ...baseContext(db, user),
    ...companyContext(company, language),
    triggers_list: bulletList(triggers.map((t) => `${t.detected_on} · ${l.trigger_type[t.type]}: ${t.description} (${t.source_url})`), language),
    contacts_list: bulletList(contacts.map((c) => `${c.full_name}, ${show(c.job_title)} [${l.department[c.department]}]${c.verified ? ' ✓' : ''}`), language),
    interaction_count: interactionStats.n,
    last_interaction: interactionStats.last ? interactionStats.last.slice(0, 10) : EMPTY,
  };
  return renderFromTemplate(findTemplate(db, 'company_brief', language), context);
}

export function generateOutreachEmail(db, user, { companyId, contactId, dealId, language }) {
  const company = findById(db, 'companies', companyId);
  const contact = findById(db, 'contacts', contactId);
  if (contact.company_id !== companyId) throw badRequest('Contact does not belong to this company');
  const deal = optionalRow(db, 'deals', dealId);
  const trigger = latestTrigger(db, companyId);
  const l = labels(language);
  const context = {
    ...baseContext(db, user),
    ...companyContext(company, language),
    ...contactContext(contact),
    ...(deal ? dealContext(deal, language) : {}),
    trigger_hook: trigger ? l.trigger_hook(trigger) : l.no_trigger_hook,
  };
  return renderFromTemplate(findTemplate(db, 'outreach_email', language), context);
}

export function generateFollowupEmail(db, user, { deal, contact, language, followupNumber, maxFollowups }) {
  const company = findById(db, 'companies', deal.company_id);
  const context = {
    ...baseContext(db, user),
    ...companyContext(company, language),
    ...contactContext(contact),
    ...dealContext(deal, language),
    followup_number: followupNumber,
    max_followups: maxFollowups,
  };
  return renderFromTemplate(findTemplate(db, 'followup_email', language), context);
}

export function generateMeetingFollowupEmail(db, user, { meeting, contact, language }) {
  const company = findById(db, 'companies', meeting.company_id);
  const context = {
    ...baseContext(db, user),
    ...companyContext(company, language),
    ...contactContext(contact),
    ...meetingContext(db, meeting, language),
  };
  return renderFromTemplate(findTemplate(db, 'meeting_followup_email', language), context);
}

/** Render a document template (quote / agreement / meeting summary) into draft text. */
export function generateDocumentContent(db, user, { template, companyId, dealId, meetingId }) {
  const company = findById(db, 'companies', companyId);
  const deal = optionalRow(db, 'deals', dealId);
  const meeting = optionalRow(db, 'meetings', meetingId);
  if (deal && deal.company_id !== companyId) throw badRequest('Deal does not belong to this company');
  if (meeting && meeting.company_id !== companyId) throw badRequest('Meeting does not belong to this company');
  const context = {
    ...baseContext(db, user),
    ...companyContext(company, template.language),
    ...(deal ? dealContext(deal, template.language) : {}),
    ...(meeting ? meetingContext(db, meeting, template.language) : {}),
  };
  return renderFromTemplate(template, context).content;
}

/** Documented placeholders per template kind, shown to staff in the template editor. */
export const PLACEHOLDERS = {
  common: ['our_company', 'sender_name', 'today', 'company_name', 'industry', 'country', 'website', 'employee_count', 'annual_revenue_usd', 'exports', 'export_markets', 'india_activity', 'notes'],
  company_brief: ['triggers_list', 'contacts_list', 'interaction_count', 'last_interaction'],
  outreach_email: ['contact_name', 'trigger_hook', 'deal_title (if a deal is selected)'],
  followup_email: ['contact_name', 'deal_title', 'deal_model', 'expected_value_usd', 'followup_number', 'max_followups'],
  meeting_followup_email: ['contact_name', 'meeting_title', 'meeting_date', 'attendees', 'summary', 'decisions_list', 'tasks_list'],
  quote: ['deal_title', 'deal_model', 'expected_value_usd'],
  agreement: ['deal_title', 'deal_model', 'expected_value_usd'],
  meeting_summary: ['meeting_title', 'meeting_date', 'attendees', 'summary', 'decisions_list', 'tasks_list'],
};
