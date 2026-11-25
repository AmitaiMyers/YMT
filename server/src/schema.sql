-- YMT Group PWA schema. All business data lives in this single SQLite file.
-- Statements are idempotent (IF NOT EXISTS) so the schema is applied on every start.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Module 1: lead research ---------------------------------------------------

CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  industry TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'Israel',
  website TEXT,
  -- How to reach the company when no person has a route (25.11.2026): each found by the agent on a cited page.
  general_email TEXT,
  general_phone TEXT,
  linkedin_page_url TEXT,
  contact_page_url TEXT,
  routes_source_url TEXT,
  employee_count INTEGER,
  annual_revenue_usd INTEGER,
  exports INTEGER NOT NULL DEFAULT 0,
  export_markets TEXT,
  india_activity TEXT NOT NULL DEFAULT 'none' CHECK (india_activity IN ('none', 'exploring', 'active')),
  is_client INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  approved_brief TEXT,
  -- Classification dictionary fields (filled by research; optional for manually created companies).
  tenant_id INTEGER NOT NULL DEFAULT 1,
  origin TEXT NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual', 'research')),
  parent_company TEXT,
  business_unit TEXT,
  israel_connection TEXT CHECK (israel_connection IN ('hq_israel', 'israeli_unit', 'other_connection', 'none', 'unknown')),
  incorporation_country TEXT,
  hq_country TEXT,
  model_primary TEXT CHECK (model_primary IN ('product_owner', 'contract_producer', 'software_ip', 'distributor_retailer', 'service_project', 'platform', 'asset_operator', 'other', 'unknown')),
  model_secondary TEXT CHECK (model_secondary IN ('product_owner', 'contract_producer', 'software_ip', 'distributor_retailer', 'service_project', 'platform', 'asset_operator', 'other', 'unknown')),
  sector TEXT CHECK (sector IN ('agri_food', 'industry_manufacturing', 'energy_resources', 'construction_real_estate', 'consumer_trade', 'tech_comms', 'health_life', 'financial_business', 'transport_logistics', 'education_leisure', 'defence_dual_use', 'other', 'unknown')),
  subsector TEXT,
  customer_types TEXT NOT NULL DEFAULT '[]',   -- JSON array of CUSTOMER_TYPES
  customer_markets TEXT NOT NULL DEFAULT '[]', -- JSON array of free-text markets
  employees_min INTEGER,
  employees_max INTEGER,
  employees_as_of TEXT,
  revenue_usd_min INTEGER,
  revenue_usd_max INTEGER,
  revenue_fiscal_year INTEGER,
  revenue_basis TEXT CHECK (revenue_basis IN ('reported', 'estimated')),
  revenue_original TEXT,                        -- amount and currency as the source states it
  ownership TEXT,
  export_proof TEXT CHECK (export_proof IN ('proven', 'none', 'unknown')), -- spec 22.11: no proven export disqualifies
  registry_number TEXT,                         -- Israeli company number (ח.פ.) or other registry id: the strongest duplicate key
  description TEXT,                             -- short description and differentiators
  outreach_owner_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS triggers (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('trade_show', 'delegation', 'job_posting', 'news', 'other')),
  description TEXT NOT NULL,
  source_url TEXT NOT NULL,
  detected_on TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE, -- optional: people and meetings can exist before a company is known
  full_name TEXT NOT NULL,
  job_title TEXT,
  department TEXT NOT NULL CHECK (department IN ('sales', 'growth', 'asia_desk', 'management', 'other')),
  email TEXT,
  phone TEXT,
  linkedin_url TEXT,
  preferred_language TEXT NOT NULL DEFAULT 'he' CHECK (preferred_language IN ('he', 'en')),
  preferred_channel TEXT CHECK (preferred_channel IN ('email', 'linkedin', 'phone', 'whatsapp', 'switchboard')),
  country TEXT,                                  -- where the person sits; empty = the company's HQ country (outreach legal gate)
  whatsapp_consent INTEGER NOT NULL DEFAULT 0,   -- WhatsApp messages only to people who agreed to them
  opted_out_at TEXT,                             -- asked not to be contacted: blocks every channel
  verified INTEGER NOT NULL DEFAULT 0,
  verified_source TEXT,
  verified_by INTEGER REFERENCES users(id),
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Human approval queue: every generated text lands here before any use.
CREATE TABLE IF NOT EXISTS approvals (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('company_brief', 'outreach_email', 'followup_email', 'meeting_followup_email', 'first_approach', 'approach_followup', 'reply')),
  reply_id INTEGER REFERENCES replies(id) ON DELETE SET NULL, -- the reply this message answers (kind 'reply')
  channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'linkedin', 'whatsapp')),
  opportunity_id INTEGER REFERENCES opportunities(id) ON DELETE SET NULL, -- the research card a first approach came from
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE, -- optional: people and meetings can exist before a company is known
  deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  meeting_id INTEGER REFERENCES meetings(id) ON DELETE SET NULL,
  language TEXT NOT NULL CHECK (language IN ('he', 'en')),
  subject TEXT,
  content TEXT NOT NULL,
  original_content TEXT, -- the text exactly as generated, so reviewers can see what was changed
  recipient_email TEXT,
  recipient_phone TEXT,    -- WhatsApp
  recipient_linkedin TEXT, -- LinkedIn profile URL
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'sent')),
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  review_note TEXT,
  sent_by INTEGER REFERENCES users(id),
  sent_at TEXT
);

-- Module 2: CRM ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS workflows (
  id INTEGER PRIMARY KEY,
  name_he TEXT NOT NULL,
  name_en TEXT NOT NULL,
  stages TEXT NOT NULL, -- JSON array of stage keys, subset of the global stage list, in order
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS deals (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workflow_id INTEGER NOT NULL REFERENCES workflows(id),
  title TEXT NOT NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost')),
  owner_id INTEGER REFERENCES users(id),
  deal_model TEXT NOT NULL CHECK (deal_model IN ('commission', 'brokerage_fee', 'future_orders_pct', 'retainer')),
  expected_value_usd INTEGER NOT NULL DEFAULT 0,
  actual_revenue_usd INTEGER NOT NULL DEFAULT 0,
  followups_sent INTEGER NOT NULL DEFAULT 0,
  stage_changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_activity_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  closed_at TEXT,
  opportunity_id INTEGER UNIQUE REFERENCES opportunities(id) ON DELETE SET NULL, -- research card this deal came from (stable link)
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS interactions (
  id INTEGER PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE, -- optional: people and meetings can exist before a company is known
  deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('phone', 'email', 'linkedin', 'whatsapp', 'meeting', 'note')),
  direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound', 'internal')),
  summary TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Module 3: client service ----------------------------------------------------

CREATE TABLE IF NOT EXISTS meetings (
  id INTEGER PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE, -- optional: people and meetings can exist before a company is known
  deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  location TEXT,
  attendees TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'done', 'cancelled')),
  summary TEXT,
  decisions TEXT, -- newline separated
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL, -- the person the meeting is with
  duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes BETWEEN 5 AND 720),
  organizer_id INTEGER REFERENCES users(id),
  google_event_id TEXT,         -- event in the organizer's Google Calendar (when connected)
  google_owner_id INTEGER REFERENCES users(id),
  google_event_link TEXT,
  invite_sent_to TEXT,          -- set only after a staff member confirmed sending a Google invitation
  invite_sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE, -- optional: people and meetings can exist before a company is known
  meeting_id INTEGER REFERENCES meetings(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  assignee TEXT NOT NULL,
  due_date TEXT,
  is_client_commitment INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('quote', 'agreement', 'meeting_summary', 'outreach_email', 'followup_email', 'meeting_followup_email', 'company_brief')),
  name TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('he', 'en')),
  subject TEXT,
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('quote', 'agreement', 'meeting_summary')),
  title TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('he', 'en')),
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized', 'signed')),
  content_hash TEXT,
  sign_token TEXT UNIQUE,
  shareable INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  finalized_at TEXT
);

CREATE TABLE IF NOT EXISTS signatures (
  id INTEGER PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  signer_name TEXT NOT NULL,
  signer_email TEXT,
  signer_role TEXT NOT NULL CHECK (signer_role IN ('ymt', 'client')),
  signature_image TEXT NOT NULL, -- PNG data URL drawn by the signer
  content_hash TEXT NOT NULL,
  ip_address TEXT,
  signed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS share_links (
  id INTEGER PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS resources (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('manufacturer', 'supplier', 'expert')),
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  city TEXT,
  industries TEXT NOT NULL, -- comma separated
  capabilities TEXT,
  certifications TEXT,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,
  nda_signed INTEGER NOT NULL DEFAULT 0,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Google Calendar connection per staff member. Tokens are encrypted (AES-256-GCM) with TOKEN_ENCRYPTION_KEY.
CREATE TABLE IF NOT EXISTS google_accounts (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  google_email TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  access_token_enc TEXT,
  access_expires_at TEXT,
  gmail_read INTEGER NOT NULL DEFAULT 0, -- Release 4: the person also allowed read-only Gmail access (replies only)
  gmail_checked_at TEXT,
  gmail_error TEXT,
  connected_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- One-time OAuth "state" values (the Google redirect is cross-site, so the session cookie is not sent).
CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL DEFAULT 'calendar' CHECK (purpose IN ('calendar', 'gmail')), -- where to return after Google
  expires_at TEXT NOT NULL
);

-- Research (Release 1): mandates, runs, sourced facts and opportunities --------------------------------

CREATE TABLE IF NOT EXISTS mandates (
  id INTEGER PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  owner_id INTEGER REFERENCES users(id),           -- NULL until an admin assigns an owner
  status TEXT NOT NULL DEFAULT 'paused' CHECK (status IN ('active', 'paused')),
  current_version_id INTEGER REFERENCES mandate_versions(id),
  schedule TEXT NOT NULL DEFAULT 'off' CHECK (schedule IN ('off', 'weekly')),
  schedule_weekday INTEGER NOT NULL DEFAULT 0 CHECK (schedule_weekday BETWEEN 0 AND 6),
  default_batch INTEGER NOT NULL DEFAULT 5 CHECK (default_batch BETWEEN 1 AND 20),
  freshness_days INTEGER NOT NULL DEFAULT 183 CHECK (freshness_days BETWEEN 7 AND 1095),
  weekly_watch_list_id INTEGER REFERENCES watch_lists(id) ON DELETE SET NULL, -- NULL: weekly runs search the open web
  default_workflow_id INTEGER REFERENCES workflows(id) ON DELETE SET NULL,         -- prefilled when a card opens a deal
  default_deal_model TEXT CHECK (default_deal_model IN ('commission', 'brokerage_fee', 'future_orders_pct', 'retainer')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Watch lists: imported company lists (registries, exhibitor lists). A run can check these companies instead of
-- searching the open web; checks rotate so repeated runs work through the whole list.
CREATE TABLE IF NOT EXISTS watch_lists (
  id INTEGER PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  source_url TEXT,                    -- where the list came from
  source_note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS watch_list_entries (
  id INTEGER PRIMARY KEY,
  list_id INTEGER NOT NULL REFERENCES watch_lists(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,             -- normalised name, for duplicates within the list
  website TEXT,
  domain TEXT,
  country TEXT,
  notes TEXT,
  card_data TEXT,                     -- JSON: the company-card columns of the imported file (shared/cardColumns.js), or NULL
  opportunity_id INTEGER REFERENCES opportunities(id) ON DELETE SET NULL, -- the card it was sent to review as (or already had)
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (list_id, name_key)
);

-- When each listed company was last checked for each mandate (rotation order).
CREATE TABLE IF NOT EXISTS watch_checks (
  entry_id INTEGER NOT NULL REFERENCES watch_list_entries(id) ON DELETE CASCADE,
  mandate_id INTEGER NOT NULL REFERENCES mandates(id) ON DELETE CASCADE,
  last_checked_at TEXT NOT NULL,
  last_run_id INTEGER REFERENCES research_runs(id) ON DELETE SET NULL,
  PRIMARY KEY (entry_id, mandate_id)
);

-- Immutable: every criteria change creates a new version so results stay comparable.
CREATE TABLE IF NOT EXISTS mandate_versions (
  id INTEGER PRIMARY KEY,
  mandate_id INTEGER NOT NULL REFERENCES mandates(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  target_countries TEXT NOT NULL,     -- JSON array of country names, e.g. ["India"]
  need_types TEXT NOT NULL,           -- JSON array of NEED_TYPES
  accept_rule TEXT NOT NULL,
  false_positives TEXT NOT NULL,      -- JSON array of strings
  employees_min INTEGER,
  employees_max INTEGER,
  revenue_min_usd INTEGER,
  revenue_max_usd INTEGER,
  sectors TEXT NOT NULL DEFAULT '[]', -- JSON array of SECTORS; empty = any sector
  search_terms TEXT NOT NULL DEFAULT '[]',
  exclusions TEXT NOT NULL DEFAULT '[]',
  proposed_service TEXT NOT NULL,
  revenue_floor_usd INTEGER,            -- new companies below it enter only with a strong trigger ("below floor")
  service_codes TEXT NOT NULL DEFAULT '[]', -- JSON array of service codes this mandate offers (first = default)
  change_note TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (mandate_id, version)
);

-- One execution of a mandate version. Runs are the work queue: the worker picks status 'queued'.
CREATE TABLE IF NOT EXISTS research_runs (
  id INTEGER PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  mandate_id INTEGER NOT NULL REFERENCES mandates(id) ON DELETE CASCADE,
  mandate_version_id INTEGER NOT NULL REFERENCES mandate_versions(id),
  trigger TEXT NOT NULL CHECK (trigger IN ('manual', 'weekly')),
  week_key TEXT,                      -- ISO week for scheduled runs (one per mandate per week)
  requested_by INTEGER REFERENCES users(id),
  batch_size INTEGER NOT NULL CHECK (batch_size BETWEEN 1 AND 20),
  watch_list_id INTEGER REFERENCES watch_lists(id) ON DELETE SET NULL, -- NULL: open web search
  opportunity_id INTEGER REFERENCES opportunities(id) ON DELETE CASCADE, -- set: research this one card's company again
  companies_checked INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed', 'waiting_budget')),
  candidates_found INTEGER NOT NULL DEFAULT 0,
  cards_created INTEGER NOT NULL DEFAULT 0,
  duplicates INTEGER NOT NULL DEFAULT 0,
  filtered INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  error TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (mandate_id, week_key)
);

-- Every page or file used as evidence, stored once.
CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  url TEXT NOT NULL UNIQUE,
  title TEXT,
  published_on TEXT,                  -- YYYY-MM-DD when the source states it
  kind TEXT NOT NULL CHECK (kind IN ('web', 'job', 'list', 'staff')),
  retrieved_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Evidence behind each company value: which source, which entity it covers, when it was checked.
CREATE TABLE IF NOT EXISTS facts (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  value TEXT NOT NULL,
  source_id INTEGER NOT NULL REFERENCES sources(id),
  quote TEXT,
  entity_covered TEXT,
  run_id INTEGER REFERENCES research_runs(id) ON DELETE SET NULL,
  checked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- One business initiative of one company (YMT's "opportunity record").
CREATE TABLE IF NOT EXISTS opportunities (
  id INTEGER PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  mandate_id INTEGER REFERENCES mandates(id) ON DELETE SET NULL,
  mandate_version_id INTEGER REFERENCES mandate_versions(id),
  run_id INTEGER REFERENCES research_runs(id) ON DELETE SET NULL,
  owner_id INTEGER REFERENCES users(id),
  relationship_role TEXT NOT NULL CHECK (relationship_role IN ('client', 'delivery_partner', 'supplier', 'unknown')),
  target_country TEXT NOT NULL,
  need_type TEXT NOT NULL CHECK (need_type IN ('market_entry_distribution', 'implementation_partner', 'production_jv', 'operating_review', 'domestic_sales_growth', 'executive_search', 'growth_exit', 'technology_scouting', 'sourcing', 'other')),
  business_need TEXT NOT NULL,
  evidence_source_id INTEGER NOT NULL REFERENCES sources(id),
  evidence_date TEXT NOT NULL,        -- publication date of the evidence (YYYY-MM-DD)
  evidence_quote TEXT NOT NULL,
  verdict TEXT CHECK (verdict IN ('match', 'weak', 'defer', 'no_match')),
  trigger_kind TEXT CHECK (trigger_kind IN ('distributor_search', 'mou', 'market_office_or_hire', 'regulatory', 'trade_show', 'delegation', 'job_posting', 'statement', 'none')),
  trigger_strength TEXT,              -- why the trigger is strong (required for a "below floor" card)
  trigger_live INTEGER,               -- live-type triggers: 1 still live / 0 gone on the review day; NULL = not checked yet
  trigger_checked_at TEXT,
  subsector_fit TEXT CHECK (subsector_fit IN ('priority', 'shepha_sector', 'accepted_model', 'distributor_or_service', 'unknown')),
  service_code TEXT,                  -- from the services catalogue (IL-1…IL-13, GL-1…GL-13)
  originator TEXT,                    -- lead originator: agent:SH1 · staff:<username> · partner:<name> · referral:<name> · web:<code>
  defer_until TEXT,                   -- YYYY-MM-DD: when a deferred card comes back
  verdict_reason TEXT,
  reason_to_act TEXT,
  proposed_service TEXT,
  unknowns TEXT NOT NULL DEFAULT '[]',  -- JSON array of missing facts
  flags TEXT NOT NULL DEFAULT '[]',     -- JSON array of OPPORTUNITY_FLAGS
  status TEXT NOT NULL CHECK (status IN ('draft', 'needs_review', 'manual_assignment', 'accepted', 'verify', 'deferred', 'rejected')),
  decision_reason TEXT CHECK (decision_reason IN ('duplicate', 'wrong_buyer', 'wrong_market', 'no_current_initiative', 'no_israeli_connection', 'other')),
  decision_note TEXT,
  decided_by INTEGER REFERENCES users(id),
  decided_at TEXT,
  opened_at TEXT,                     -- first time the owner opened the card (review time = decided - opened)
  review_seconds INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (company_id, evidence_source_id)
);

CREATE TABLE IF NOT EXISTS calibration_examples (
  id INTEGER PRIMARY KEY,
  mandate_id INTEGER NOT NULL REFERENCES mandates(id) ON DELETE CASCADE,
  opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (label IN ('good', 'false_positive')),
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (mandate_id, opportunity_id)
);

-- Before/after comparison of two mandate versions on the saved examples. Also a work-queue item.
CREATE TABLE IF NOT EXISTS calibrations (
  id INTEGER PRIMARY KEY,
  mandate_id INTEGER NOT NULL REFERENCES mandates(id) ON DELETE CASCADE,
  from_version_id INTEGER NOT NULL REFERENCES mandate_versions(id),
  to_version_id INTEGER NOT NULL REFERENCES mandate_versions(id),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed', 'waiting_budget')),
  rows TEXT NOT NULL DEFAULT '[]',
  owner_note TEXT,
  cost_usd REAL NOT NULL DEFAULT 0,
  error TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  finished_at TEXT
);

-- Decision-maker search for an accepted card (queue item; one per card, re-run on request).
CREATE TABLE IF NOT EXISTS contact_searches (
  id INTEGER PRIMARY KEY,
  opportunity_id INTEGER NOT NULL UNIQUE REFERENCES opportunities(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed', 'waiting_budget')),
  found INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  error TEXT,
  requested_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  finished_at TEXT
);

-- People proposed by the search. Saved as contacts only after the owner confirms. Business details only.
CREATE TABLE IF NOT EXISTS contact_proposals (
  id INTEGER PRIMARY KEY,
  opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  job_title TEXT NOT NULL,
  email TEXT,
  linkedin_url TEXT,
  source_id INTEGER NOT NULL REFERENCES sources(id),
  quote TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'confirmed', 'dismissed')),
  dismiss_reason TEXT CHECK (dismiss_reason IN ('not_relevant', 'wrong_or_outdated')),
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  decided_by INTEGER REFERENCES users(id),
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (company_id, name_key)
);

-- Every AI call and what it cost; powers the monthly cap.
CREATE TABLE IF NOT EXISTS ai_usage (
  id INTEGER PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  run_id INTEGER REFERENCES research_runs(id) ON DELETE SET NULL,
  calibration_id INTEGER REFERENCES calibrations(id) ON DELETE SET NULL,
  task TEXT NOT NULL CHECK (task IN ('discover', 'classify', 'judge', 'contacts', 'outreach', 'reply', 'meeting')),
  contact_search_id INTEGER REFERENCES contact_searches(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cache_read_tokens INTEGER NOT NULL,
  web_searches INTEGER NOT NULL,
  cost_usd REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Release 3: do-not-contact list. Values are normalised (lower-case email/domain/URL, phone digits only).
CREATE TABLE IF NOT EXISTS suppressions (
  id INTEGER PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  kind TEXT NOT NULL CHECK (kind IN ('email', 'phone', 'linkedin', 'domain')),
  value TEXT NOT NULL,
  reason TEXT,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (kind, value)
);

-- Release 4: a reply from a person we approached (pasted by the owner, or read from the owner's Gmail).
CREATE TABLE IF NOT EXISTS replies (
  id INTEGER PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  in_reply_to INTEGER REFERENCES approvals(id) ON DELETE SET NULL, -- the last message we sent before it
  channel TEXT NOT NULL CHECK (channel IN ('email', 'linkedin', 'whatsapp')),
  source TEXT NOT NULL CHECK (source IN ('pasted', 'gmail')),
  gmail_message_id TEXT UNIQUE,
  subject TEXT,
  body TEXT NOT NULL,
  received_at TEXT NOT NULL,
  classification TEXT CHECK (classification IN ('interested', 'question', 'not_now', 'not_interested', 'opt_out', 'referral', 'out_of_office', 'other')),
  summary TEXT,
  missing TEXT NOT NULL DEFAULT '[]',  -- JSON array: questions the card and the approved answers cannot answer (each became a task)
  analysis_error TEXT,
  opt_out_state TEXT NOT NULL DEFAULT 'none' CHECK (opt_out_state IN ('none', 'pending', 'confirmed', 'dismissed')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'handled')),
  created_by INTEGER REFERENCES users(id),
  handled_by INTEGER REFERENCES users(id),
  handled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_replies_contact ON replies(contact_id, received_at);

-- Release 4: approved texts the AI may use when answering a reply (what YMT offers, how it works, fees policy...).
CREATE TABLE IF NOT EXISTS approved_answers (
  id INTEGER PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  language TEXT NOT NULL CHECK (language IN ('he', 'en')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Release 5: the client discovery form. Questions are edited by an admin; each request is a personal, expiring,
-- revocable link. Answers keep the question text as it was shown, so later edits never change what a client answered.
CREATE TABLE IF NOT EXISTS discovery_questions (
  id INTEGER PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL,
  question_he TEXT NOT NULL,
  question_en TEXT NOT NULL,
  answer_kind TEXT NOT NULL DEFAULT 'long' CHECK (answer_kind IN ('short', 'long')),
  required INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS discovery_requests (
  id INTEGER PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  token TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  language TEXT NOT NULL CHECK (language IN ('he', 'en')),
  expires_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  submitted_at TEXT,
  submitted_name TEXT,
  submitted_language TEXT CHECK (submitted_language IN ('he', 'en')),
  answers TEXT -- JSON array of { question, answer } as the client saw and wrote them
);
CREATE INDEX IF NOT EXISTS idx_discovery_company ON discovery_requests(company_id);

-- Lead-finding agent spec (22.11.2026) ---------------------------------------------------------------

-- Other names of a company (Hebrew name, former names, group name) for duplicate checks.
CREATE TABLE IF NOT EXISTS company_aliases (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  source_url TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (company_id, name_key)
);
CREATE INDEX IF NOT EXISTS idx_aliases_key ON company_aliases(name_key);

-- Status and fit of a company per target market, each with its source.
CREATE TABLE IF NOT EXISTS company_markets (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  market TEXT NOT NULL CHECK (market IN ('india', 'japan', 'thailand_vietnam', 'china')),
  status TEXT NOT NULL CHECK (status IN ('not_active', 'exploring', 'distributor', 'established', 'main_market', 'unknown')),
  fit TEXT NOT NULL CHECK (fit IN ('fit', 'possible', 'no_fit', 'unknown')),
  note TEXT,
  source_id INTEGER REFERENCES sources(id),
  checked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (company_id, market)
);

-- One service catalogue for both lines (YMT Consulting IL-*, YMT Development Partnerships GL-*).
CREATE TABLE IF NOT EXISTS services (
  code TEXT PRIMARY KEY,
  line TEXT NOT NULL CHECK (line IN ('IL', 'GL')),
  name_en TEXT NOT NULL,
  name_he TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ready', 'in_build', 'in_review', 'not_offered')),
  sort INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- SHEPHA's exclusion list (imported from Excel by an admin; never sent to the AI). A match disqualifies a company.
CREATE TABLE IF NOT EXISTS shepha_exclusions (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  domain TEXT,
  registry_number TEXT,
  note TEXT,
  imported_by INTEGER REFERENCES users(id),
  imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_shepha_key ON shepha_exclusions(name_key);

-- Companies a run found but did not turn into a card, with the reason (the run log the owner can read).
CREATE TABLE IF NOT EXISTS run_drops (
  id INTEGER PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES research_runs(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  website TEXT,
  reason TEXT NOT NULL CHECK (reason IN ('shepha_exclusion', 'no_israeli_connection', 'no_export', 'already_established', 'below_floor',
    'below_minimum', 'not_a_match', 'stale', 'unverifiable_source', 'invalid_result')),
  detail TEXT,
  source_url TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_deals_company ON deals(company_id);
CREATE INDEX IF NOT EXISTS idx_interactions_company ON interactions(company_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
CREATE INDEX IF NOT EXISTS idx_meetings_company ON meetings(company_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_meetings_time ON meetings(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(full_name);
CREATE INDEX IF NOT EXISTS idx_opportunities_queue ON opportunities(status, owner_id, evidence_date);
CREATE INDEX IF NOT EXISTS idx_opportunities_company ON opportunities(company_id);
CREATE INDEX IF NOT EXISTS idx_facts_company ON facts(company_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON research_runs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_time ON ai_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_watch_entries_list ON watch_list_entries(list_id);

-- Apollo and Lusha API keys (admin-entered; read only by the server, never sent to the browser).
CREATE TABLE IF NOT EXISTS data_source_keys (
  provider TEXT PRIMARY KEY CHECK (provider IN ('apollo', 'lusha')),
  api_key TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL
);
