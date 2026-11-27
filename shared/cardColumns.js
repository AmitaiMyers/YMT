// Company-card columns that come back from a CSV (25.11.2026). The full company export (server/src/research/exportCards.js)
// writes these headers; a watch-list import keeps them with each company, and "Send to review" builds the card from them.
// One place for the header names, their target and their type, used by the import dialog (which columns to keep) and the
// server (validation). Lists are joined with LIST_SEPARATOR; the "(data)" columns hold contacts, sent messages and
// meetings as JSON. The progress columns put the card at the step it reached (decision, deal, messages, meetings, task).

import {
  NEED_TYPES, RELATIONSHIP_ROLES, JUDGE_VERDICTS, TRIGGER_KINDS, SUBSECTOR_FITS, OPPORTUNITY_FLAGS, ISRAEL_CONNECTIONS,
  BUSINESS_MODELS, SECTORS, CUSTOMER_TYPES, REVENUE_BASES, EXPORT_PROOFS, OPPORTUNITY_STATUSES, REJECT_REASONS, DEAL_STATUSES,
} from './enums.js';

export const LIST_SEPARATOR = ' | ';
export const CONTACTS_COLUMN = 'Contacts (data)';
export const MESSAGES_COLUMN = 'Messages (data)';
export const MEETINGS_COLUMN = 'Meetings (data)';

const text = (max) => ({ type: 'text', max });
const choice = (values) => ({ type: 'string', enum: values });
const list = (values = undefined) => ({ type: 'list', enum: values, itemMax: 300, maxItems: 50 });

/** header → { to: 'card' | 'company' | 'aliases', column, ...validation spec } */
export const CARD_COLUMNS = {
  // The research card
  Agent: { to: 'card', column: 'mandate_code', ...text(40) },
  'Lead originator': { to: 'card', column: 'originator', ...text(200) },
  'Target country': { to: 'card', column: 'target_country', ...text(100) },
  'Need type': { to: 'card', column: 'need_type', ...choice(NEED_TYPES) },
  'Business need': { to: 'card', column: 'business_need', ...text(2000) },
  'Relationship role': { to: 'card', column: 'relationship_role', ...choice(RELATIONSHIP_ROLES) },
  'Evidence URL': { to: 'card', column: 'evidence_url', type: 'url' },
  'Evidence title': { to: 'card', column: 'evidence_title', ...text(300) },
  'Evidence date': { to: 'card', column: 'evidence_date', type: 'date' },
  'Evidence quote': { to: 'card', column: 'evidence_quote', ...text(2000) },
  'Agent verdict': { to: 'card', column: 'verdict', ...choice(JUDGE_VERDICTS) },
  'Verdict reason': { to: 'card', column: 'verdict_reason', ...text(2000) },
  'Reason to act now': { to: 'card', column: 'reason_to_act', ...text(2000) },
  Trigger: { to: 'card', column: 'trigger_kind', ...choice(TRIGGER_KINDS) },
  'Trigger strength': { to: 'card', column: 'trigger_strength', ...text(1000) },
  'Subsector fit': { to: 'card', column: 'subsector_fit', ...choice(SUBSECTOR_FITS) },
  'Service code': { to: 'card', column: 'service_code', ...text(20) },
  'Proposed service': { to: 'card', column: 'proposed_service', ...text(1000) },
  Flags: { to: 'card', column: 'flags', ...list(OPPORTUNITY_FLAGS) },
  'Missing facts': { to: 'card', column: 'unknowns', ...list() },
  // The company
  'Israel connection': { to: 'company', column: 'israel_connection', ...choice(ISRAEL_CONNECTIONS) },
  'HQ country': { to: 'company', column: 'hq_country', ...text(100) },
  'Incorporation country': { to: 'company', column: 'incorporation_country', ...text(100) },
  'Parent company': { to: 'company', column: 'parent_company', ...text(200) },
  'Business unit': { to: 'company', column: 'business_unit', ...text(200) },
  'Business model': { to: 'company', column: 'model_primary', ...choice(BUSINESS_MODELS) },
  'Secondary model': { to: 'company', column: 'model_secondary', ...choice(BUSINESS_MODELS) },
  Sector: { to: 'company', column: 'sector', ...choice(SECTORS) },
  Subsector: { to: 'company', column: 'subsector', ...text(200) },
  Industry: { to: 'company', column: 'industry', ...text(200) },
  'Customer types': { to: 'company', column: 'customer_types', ...list(CUSTOMER_TYPES) },
  'Customer markets': { to: 'company', column: 'customer_markets', ...list() },
  'Employees min': { to: 'company', column: 'employees_min', type: 'int', min: 0 },
  'Employees max': { to: 'company', column: 'employees_max', type: 'int', min: 0 },
  'Employees as of': { to: 'company', column: 'employees_as_of', ...text(20) },
  'Revenue USD min': { to: 'company', column: 'revenue_usd_min', type: 'int', min: 0 },
  'Revenue USD max': { to: 'company', column: 'revenue_usd_max', type: 'int', min: 0 },
  'Revenue fiscal year': { to: 'company', column: 'revenue_fiscal_year', type: 'int', min: 1900, max: 2100 },
  'Revenue basis': { to: 'company', column: 'revenue_basis', ...choice(REVENUE_BASES) },
  'Revenue as reported': { to: 'company', column: 'revenue_original', ...text(200) },
  Ownership: { to: 'company', column: 'ownership', ...text(300) },
  'Proven export': { to: 'company', column: 'export_proof', ...choice(EXPORT_PROOFS) },
  'Registry number': { to: 'company', column: 'registry_number', ...text(50) },
  Description: { to: 'company', column: 'description', ...text(3000) },
  'Company notes': { to: 'company', column: 'notes', ...text(5000) },
  'General email': { to: 'company', column: 'general_email', type: 'email' },
  'General phone': { to: 'company', column: 'general_phone', ...text(50) },
  'LinkedIn company page': { to: 'company', column: 'linkedin_page_url', type: 'url' },
  'Contact page': { to: 'company', column: 'contact_page_url', type: 'url' },
  'Routes source': { to: 'company', column: 'routes_source_url', type: 'url' },
  'Other names': { to: 'aliases', column: 'names', ...list() },
  [CONTACTS_COLUMN]: { to: 'contacts', column: 'contacts', ...text(50_000) },
  // Progress: where the card stands
  'Card status': { to: 'progress', column: 'status', ...choice(OPPORTUNITY_STATUSES) },
  'Decision reason': { to: 'progress', column: 'decision_reason', ...choice(REJECT_REASONS) },
  'Decision note': { to: 'progress', column: 'decision_note', ...text(2000) },
  'Decided on': { to: 'progress', column: 'decided_at', type: 'datetime' },
  'Come back on': { to: 'progress', column: 'defer_until', type: 'date' },
  'Deal stage': { to: 'progress', column: 'deal_stage', ...text(40) },
  'Deal status': { to: 'progress', column: 'deal_status', ...choice(DEAL_STATUSES) },
  [MESSAGES_COLUMN]: { to: 'progress', column: 'messages', ...text(100_000) },
  [MEETINGS_COLUMN]: { to: 'progress', column: 'meetings', ...text(50_000) },
  'Next step': { to: 'progress', column: 'next_step', ...text(1000) },
  'Next step date': { to: 'progress', column: 'next_step_date', type: 'date' },
};

export const CARD_COLUMN_NAMES = Object.keys(CARD_COLUMNS);
