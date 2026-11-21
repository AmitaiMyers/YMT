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
  verified INTEGER NOT NULL DEFAULT 0,
  verified_source TEXT,
  verified_by INTEGER REFERENCES users(id),
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Human approval queue: every generated text lands here before any use.
CREATE TABLE IF NOT EXISTS approvals (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('company_brief', 'outreach_email', 'followup_email', 'meeting_followup_email')),
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE, -- optional: people and meetings can exist before a company is known
  deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  meeting_id INTEGER REFERENCES meetings(id) ON DELETE SET NULL,
  language TEXT NOT NULL CHECK (language IN ('he', 'en')),
  subject TEXT,
  content TEXT NOT NULL,
  original_content TEXT, -- the text exactly as generated, so reviewers can see what was changed
  recipient_email TEXT,
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
  channel TEXT NOT NULL CHECK (channel IN ('phone', 'email', 'linkedin', 'meeting', 'note')),
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
  connected_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- One-time OAuth "state" values (the Google redirect is cross-site, so the session cookie is not sent).
CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
  verdict TEXT CHECK (verdict IN ('match', 'weak', 'no_match')),
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
  task TEXT NOT NULL CHECK (task IN ('discover', 'classify', 'judge', 'contacts')),
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
