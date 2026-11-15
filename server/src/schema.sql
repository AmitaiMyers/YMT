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

CREATE INDEX IF NOT EXISTS idx_deals_company ON deals(company_id);
CREATE INDEX IF NOT EXISTS idx_interactions_company ON interactions(company_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
CREATE INDEX IF NOT EXISTS idx_meetings_company ON meetings(company_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_meetings_time ON meetings(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(full_name);
