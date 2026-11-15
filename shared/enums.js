// Enumerations shared by the server (validation, SQL) and the client (forms, labels).
// The database CHECK constraints in server/src/schema.sql must stay in sync with these lists.

export const PIPELINE_STAGES = ['research', 'outreach', 'call', 'meeting', 'proposal', 'contract'];
export const LANGUAGES = ['he', 'en'];
export const INDIA_ACTIVITY = ['none', 'exploring', 'active'];
export const TRIGGER_TYPES = ['trade_show', 'delegation', 'job_posting', 'news', 'other'];
export const DEPARTMENTS = ['sales', 'growth', 'asia_desk', 'management', 'other'];
export const DEAL_MODELS = ['commission', 'brokerage_fee', 'future_orders_pct', 'retainer'];
export const DEAL_STATUSES = ['open', 'won', 'lost'];
export const CHANNELS = ['phone', 'email', 'linkedin', 'meeting', 'note'];
export const DIRECTIONS = ['outbound', 'inbound', 'internal'];
export const RESOURCE_TYPES = ['manufacturer', 'supplier', 'expert'];
export const DOCUMENT_KINDS = ['quote', 'agreement', 'meeting_summary'];
export const EMAIL_KINDS = ['outreach_email', 'followup_email', 'meeting_followup_email'];
export const TEMPLATE_KINDS = [...DOCUMENT_KINDS, ...EMAIL_KINDS, 'company_brief'];
export const APPROVAL_KINDS = ['company_brief', ...EMAIL_KINDS];
export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected', 'sent'];
export const DOCUMENT_STATUSES = ['draft', 'finalized', 'signed'];

// Hard upper bound for follow-up touchpoints per lead (business rule; settings may only lower it).
export const MAX_FOLLOWUPS_HARD_LIMIT = 3;
