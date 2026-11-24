// Enumerations shared by the server (validation, SQL) and the client (forms, labels).
// The database CHECK constraints in server/src/schema.sql must stay in sync with these lists.

export const PIPELINE_STAGES = ['research', 'outreach', 'call', 'meeting', 'proposal', 'contract'];
export const LANGUAGES = ['he', 'en'];
export const INDIA_ACTIVITY = ['none', 'exploring', 'active'];
export const TRIGGER_TYPES = ['trade_show', 'delegation', 'job_posting', 'news', 'other'];
export const DEPARTMENTS = ['sales', 'growth', 'asia_desk', 'management', 'other'];
export const DEAL_MODELS = ['commission', 'brokerage_fee', 'future_orders_pct', 'retainer'];
export const DEAL_STATUSES = ['open', 'won', 'lost'];
export const CHANNELS = ['phone', 'email', 'linkedin', 'whatsapp', 'meeting', 'note'];
export const DIRECTIONS = ['outbound', 'inbound', 'internal'];
export const RESOURCE_TYPES = ['manufacturer', 'supplier', 'expert'];
export const DOCUMENT_KINDS = ['quote', 'agreement', 'meeting_summary'];
export const EMAIL_KINDS = ['outreach_email', 'followup_email', 'meeting_followup_email'];
export const TEMPLATE_KINDS = [...DOCUMENT_KINDS, ...EMAIL_KINDS, 'company_brief'];
// Release 3: a first message to a decision maker, drafted from an accepted research card, on one channel.
export const OUTREACH_CHANNELS = ['email', 'linkedin', 'whatsapp'];
// Every approval kind that is a message to an outside person (everything except the internal brief).
// Release 4 adds a follow-up to a first approach that got no reply, and an answer to a reply.
export const MESSAGE_KINDS = [...EMAIL_KINDS, 'first_approach', 'approach_followup', 'reply'];
// Unsolicited contacts: the legal gate (cleared countries, opt-out sentence, "פרסומת" marking) applies to these.
export const COLD_KINDS = ['outreach_email', 'first_approach', 'approach_followup'];
// Messages of a conversation with one person (Release 4), shown as one thread.
export const CONVERSATION_KINDS = ['first_approach', 'approach_followup', 'reply'];
export const APPROVAL_KINDS = ['company_brief', ...MESSAGE_KINDS];
// Do-not-contact list entries; a domain blocks everyone at that company.
export const SUPPRESSION_KINDS = ['email', 'phone', 'linkedin', 'domain'];
export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected', 'sent'];
export const DOCUMENT_STATUSES = ['draft', 'finalized', 'signed'];

// Hard upper bound for follow-up touchpoints per lead (business rule; settings may only lower it).
export const MAX_FOLLOWUPS_HARD_LIMIT = 3;

// ---------------------------------------------------------------- Research (Release 1)
// Values follow YMT's classification dictionary ("How do we classify a company?").

export const ISRAEL_CONNECTIONS = ['hq_israel', 'israeli_unit', 'other_connection', 'none', 'unknown'];
// Only these two are in YMT's primary target group; the others go to "needs review".
export const ISRAEL_TARGET_CONNECTIONS = ['hq_israel', 'israeli_unit'];
export const BUSINESS_MODELS = ['product_owner', 'contract_producer', 'software_ip', 'distributor_retailer',
  'service_project', 'platform', 'asset_operator', 'other', 'unknown'];
export const SECTORS = ['agri_food', 'industry_manufacturing', 'energy_resources', 'construction_real_estate',
  'consumer_trade', 'tech_comms', 'health_life', 'financial_business', 'transport_logistics', 'education_leisure',
  'defence_dual_use', 'other', 'unknown'];
export const CUSTOMER_TYPES = ['business', 'consumer', 'public_sector'];
export const SIZE_BANDS = ['micro', 'small', 'medium', 'large', 'enterprise', 'unknown', 'spans_multiple'];
export const REVENUE_BASES = ['reported', 'estimated'];
export const RELATIONSHIP_ROLES = ['client', 'delivery_partner', 'supplier', 'unknown'];
// What the company is trying to do; mandates match on target country + need type.
export const NEED_TYPES = ['market_entry_distribution', 'implementation_partner', 'production_jv', 'operating_review',
  'domestic_sales_growth', 'executive_search', 'growth_exit', 'technology_scouting', 'sourcing', 'other'];
export const MANDATE_STATUSES = ['active', 'paused'];
export const MANDATE_SCHEDULES = ['off', 'weekly'];
export const RUN_TRIGGERS = ['manual', 'weekly'];
export const RUN_STATUSES = ['queued', 'running', 'done', 'failed', 'waiting_budget'];
export const OPPORTUNITY_STATUSES = ['draft', 'needs_review', 'manual_assignment', 'accepted', 'verify', 'deferred', 'rejected'];
// Statuses that wait for a person's review decision.
export const REVIEWABLE_STATUSES = ['draft', 'needs_review', 'manual_assignment'];
export const REVIEW_DECISIONS = ['accept', 'verify', 'defer', 'reject'];
export const REJECT_REASONS = ['duplicate', 'wrong_buyer', 'wrong_market', 'no_current_initiative', 'no_israeli_connection', 'other'];
export const OPPORTUNITY_FLAGS = ['outside_preferred_size', 'weak_evidence', 'possible_duplicate', 'below_floor', 'lower_priority', 'rejected_before'];
export const SOURCE_KINDS = ['web', 'job', 'list', 'staff'];
// 'defer': fits, but not now (a signed distributor or MoU in the market) – spec 22.11.2026.
export const JUDGE_VERDICTS = ['match', 'weak', 'defer', 'no_match'];
export const EXAMPLE_LABELS = ['good', 'false_positive'];
export const CONTACT_PROPOSAL_STATUSES = ['proposed', 'confirmed', 'dismissed'];
export const JOB_STATUSES = ['queued', 'running', 'done', 'failed', 'waiting_budget'];
export const AI_PROVIDERS = ['claude', 'openai', 'fake'];
export const AI_TASKS = ['discover', 'classify', 'judge', 'contacts', 'outreach', 'reply', 'meeting'];
// Release 5: client discovery form (sent as a personal link) and its admin-editable questions.
export const DISCOVERY_ANSWER_KINDS = ['short', 'long'];
export const DISCOVERY_STATUSES = ['open', 'answered', 'expired', 'revoked'];
// Release 4: replies from people we approached.
export const REPLY_SOURCES = ['pasted', 'gmail'];
export const REPLY_CLASSES = ['interested', 'question', 'not_now', 'not_interested', 'opt_out', 'referral', 'out_of_office', 'other'];
export const REPLY_STATUSES = ['new', 'handled'];
// An opt-out found in a reply waits for the owner: pending blocks every message to the person until confirmed or dismissed.
export const OPT_OUT_STATES = ['none', 'pending', 'confirmed', 'dismissed'];
export const CONVERSATION_VIEWS = ['needs_answer', 'followup_due', 'all'];
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6]; // 0 = Sunday (Israeli work week starts on Sunday)

// Size bands by headcount and by annual revenue in USD (YMT's internal bands). `max` is inclusive for
// employees and exclusive for revenue, exactly as the dictionary defines them.
export const EMPLOYEE_BANDS = [
  { band: 'micro', min: 1, max: 9 },
  { band: 'small', min: 10, max: 49 },
  { band: 'medium', min: 50, max: 249 },
  { band: 'large', min: 250, max: 999 },
  { band: 'enterprise', min: 1000, max: Infinity },
];
export const REVENUE_BANDS = [
  { band: 'micro', min: 0, max: 1_000_000 },
  { band: 'small', min: 1_000_000, max: 10_000_000 },
  { band: 'medium', min: 10_000_000, max: 100_000_000 },
  { band: 'large', min: 100_000_000, max: 500_000_000 },
  { band: 'enterprise', min: 500_000_000, max: Infinity },
];
export const MAX_RUN_BATCH = 20;

// ---------------------------------------------------------------- Lead-finding agent spec (22.11.2026)

// Fit and status are kept per market (Thailand and Vietnam together, as in the spec).
export const MARKETS = ['india', 'japan', 'thailand_vietnam', 'china'];
// established = own subsidiary, office, plant or JV there; main_market = already the company's largest market.
export const MARKET_STATUSES = ['not_active', 'exploring', 'distributor', 'established', 'main_market', 'unknown'];
export const MARKET_FITS = ['fit', 'possible', 'no_fit', 'unknown'];
export const EXPORT_PROOFS = ['proven', 'none', 'unknown'];
export const TRIGGER_KINDS = ['distributor_search', 'mou', 'market_office_or_hire', 'regulatory', 'trade_show', 'delegation', 'job_posting', 'statement', 'none'];
// Triggers that count only while the page is still live on the day of the review.
export const LIVE_TRIGGER_KINDS = ['job_posting', 'distributor_search'];
export const SUBSECTOR_FITS = ['priority', 'shepha_sector', 'accepted_model', 'distributor_or_service', 'unknown'];
export const SCORE_TIERS = ['A', 'B', 'C'];
export const SERVICE_LINES = ['IL', 'GL'];
export const SERVICE_STATUSES = ['ready', 'in_build', 'in_review', 'not_offered'];
export const ORIGINATOR_KINDS = ['agent', 'staff', 'partner', 'referral', 'web'];
export const PREFERRED_CHANNELS = ['email', 'linkedin', 'phone', 'whatsapp', 'switchboard'];
export const PROPOSAL_DISMISS_REASONS = ['not_relevant', 'wrong_or_outdated'];
// Why a found company did not become a card (kept per run, so owners can see what the agent dropped).
export const DROP_REASONS = ['shepha_exclusion', 'no_israeli_connection', 'no_export', 'already_established', 'below_floor', 'below_minimum',
  'not_a_match', 'stale', 'unverifiable_source', 'invalid_result'];

