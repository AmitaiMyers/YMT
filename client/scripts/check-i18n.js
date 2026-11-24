// Build-time guard: every translation key used in the code exists in BOTH Hebrew and English,
// and both dictionaries cover the same keys. Fails the build with a clear list otherwise.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STRINGS } from '../src/i18n/strings.js';
import * as enums from '../../shared/enums.js';

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');

// Keys built dynamically as `${prefix}.${value}` from a shared enum.
const DYNAMIC_KEYS = {
  stage: enums.PIPELINE_STAGES, dealStatus: enums.DEAL_STATUSES, dealModel: enums.DEAL_MODELS, indiaActivity: enums.INDIA_ACTIVITY,
  language: enums.LANGUAGES, department: enums.DEPARTMENTS, triggerType: enums.TRIGGER_TYPES, channel: enums.CHANNELS,
  direction: enums.DIRECTIONS, resourceType: enums.RESOURCE_TYPES, documentKind: enums.DOCUMENT_KINDS, documentStatus: enums.DOCUMENT_STATUSES,
  templateKind: enums.TEMPLATE_KINDS, approvalKind: enums.APPROVAL_KINDS, approvalStatus: enums.APPROVAL_STATUSES,
  meetingStatus: ['scheduled', 'done', 'cancelled'], role: ['admin', 'member'], share: ['active', 'expired', 'revoked'],
  companyTab: ['overview', 'contacts', 'triggers', 'pipeline', 'meetings', 'documents', 'matches', 'sharing', 'discovery', 'research'],
  privacy: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
  navGroup: ['today', 'research', 'win', 'clients', 'manage'],
  nav: ['inbox', 'approvals', 'calendar', 'research', 'conversations', 'mandates', 'watchLists', 'researchMetrics', 'leads', 'pipeline', 'clients', 'documents', 'network', 'dashboard', 'settings'],
  theme: ['system', 'light', 'dark'],
  'leads.tab': ['search', 'triggers', 'new'],
  'clients.scope': ['clients', 'all'],
  'complete.step': ['happened', 'tasks', 'followup'],
  'document.step': ['draft', 'final', 'clientSigned'],
  'approval.diff': ['added', 'removed'],
  inbox: ['morning', 'afternoon', 'evening'],
  calendarState: ['scheduled', 'needsSummary', 'done', 'cancelled'],
  'calendar.view': ['day', 'week', 'month'],
  // Research (Release 1)
  opportunityStatus: enums.OPPORTUNITY_STATUSES, verdict: enums.JUDGE_VERDICTS, runStatus: enums.RUN_STATUSES,
  flag: enums.OPPORTUNITY_FLAGS, needType: enums.NEED_TYPES, israelConnection: enums.ISRAEL_CONNECTIONS,
  relationshipRole: enums.RELATIONSHIP_ROLES, businessModel: enums.BUSINESS_MODELS, sector: enums.SECTORS,
  customerType: enums.CUSTOMER_TYPES, sizeBand: enums.SIZE_BANDS, revenueBasis: enums.REVENUE_BASES,
  rejectReason: enums.REJECT_REASONS, exampleLabel: enums.EXAMPLE_LABELS, sourceKind: enums.SOURCE_KINDS,
  mandateStatus: enums.MANDATE_STATUSES, mandateSchedule: enums.MANDATE_SCHEDULES, runTrigger: enums.RUN_TRIGGERS,
  aiProvider: ['claude', 'openai'], aiTask: enums.AI_TASKS, weekday: enums.WEEKDAYS.map(String),
  'research.view': ['queue', 'manual', 'followup', 'accepted', 'rejected'],
  'research.field': ['entity_name', 'parent_company', 'business_unit', 'israel_connection', 'incorporation_country', 'hq_country',
    'model_primary', 'model_secondary', 'sector', 'subsector', 'customer_types', 'customer_markets', 'employees', 'revenue', 'ownership',
    'export_proof', 'registry_number', 'other_names'],
  decision: enums.REVIEW_DECISIONS, 'decision.confirm': enums.REVIEW_DECISIONS,
  'decision.done': ['accepted', 'verify', 'deferred', 'rejected'],
  contactProposal: enums.CONTACT_PROPOSAL_STATUSES,
  // Release 3
  discoveryStatus: enums.DISCOVERY_STATUSES, discoveryKind: enums.DISCOVERY_ANSWER_KINDS,
  replyClass: enums.REPLY_CLASSES, replySource: enums.REPLY_SOURCES, 'conversation.view': enums.CONVERSATION_VIEWS,
  'conversation.empty': enums.CONVERSATION_VIEWS, followupBlocker: ['replied', 'in_queue', 'limit', 'waiting'],
  'approval.manualSend': enums.OUTREACH_CHANNELS, 'approval.recipientOf': enums.OUTREACH_CHANNELS, suppressionKind: enums.SUPPRESSION_KINDS,
  outreachBlock: ['opted_out', 'opt_out_pending', 'suppressed', 'no_country', 'country_not_cleared', 'role_unchecked', 'no_email', 'no_linkedin', 'no_phone', 'phone_format', 'no_whatsapp_consent'],
  'watch.field': ['name', 'website', 'country', 'notes'], 'watch.encoding': ['utf-8', 'windows-1255'],
  criteria: ['code', 'name', 'target_countries', 'proposed_service', 'accept_rule', 'false_positives', 'employees_min', 'employees_max',
    'revenue_min_usd', 'revenue_max_usd', 'search_terms', 'exclusions', 'change_note', 'revenue_floor_usd', 'service_codes'],
  // Lead-finding agent spec (22.11.2026)
  market: enums.MARKETS, marketStatus: enums.MARKET_STATUSES, marketFit: enums.MARKET_FITS, exportProof: enums.EXPORT_PROOFS,
  triggerKind: enums.TRIGGER_KINDS, subsectorFit: enums.SUBSECTOR_FITS, serviceStatus: enums.SERVICE_STATUSES,
  originator: enums.ORIGINATOR_KINDS, preferredChannel: enums.PREFERRED_CHANNELS, dismissReason: enums.PROPOSAL_DISMISS_REASONS,
  dropReason: enums.DROP_REASONS, 'score.part': enums.SCORE_PARTS, 'score.dm': enums.DECISION_MAKER_LEVELS,
  'score.service': enums.SERVICE_FIT_LEVELS, 'score.evidence': enums.EVIDENCE_LEVELS,
  'shepha.field': ['name', 'website', 'registry_number', 'note'],
};

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(jsx?|tsx?)$/.test(name) ? [full] : [];
  });
}

const usedKeys = new Set();
for (const file of sourceFiles(srcDir)) {
  for (const match of readFileSync(file, 'utf8').matchAll(/\bt\(\s*'([^']+)'/g)) usedKeys.add(match[1]);
}
for (const [prefix, values] of Object.entries(DYNAMIC_KEYS)) values.forEach((value) => usedKeys.add(`${prefix}.${value}`));

const problems = [];
for (const language of Object.keys(STRINGS)) {
  for (const key of usedKeys) if (!(key in STRINGS[language])) problems.push(`[${language}] missing "${key}"`);
}
const he = Object.keys(STRINGS.he);
const en = Object.keys(STRINGS.en);
he.filter((key) => !usedKeys.has(key)).forEach((key) => problems.push(`unused key "${key}" (remove it from strings.js)`));
he.filter((key) => !en.includes(key)).forEach((key) => problems.push(`[en] missing "${key}" (exists in he)`));
en.filter((key) => !he.includes(key)).forEach((key) => problems.push(`[he] missing "${key}" (exists in en)`));

if (problems.length > 0) {
  console.error(`i18n check failed:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`i18n check passed: ${usedKeys.size} keys used, ${he.length} keys per language.`);
