// Research (Release 1): mandates, runs, the review queue, calibration, metrics and AI settings.
// Owners see and decide only their own cards; admins see everything and the manual-assignment queue.

import { Router } from 'express';
import { parseBody, parseId, parseOptionalEnum } from '../validate.js';
import { insert, update, findById, transaction, audit, nowIso } from '../db.js';
import { badRequest, forbidden, conflict, notFound } from '../http.js';
import { requireAdmin } from '../auth.js';
import {
  NEED_TYPES, SECTORS, RELATIONSHIP_ROLES, REVIEW_DECISIONS, REJECT_REASONS, MANDATE_STATUSES, MANDATE_SCHEDULES,
  ISRAEL_CONNECTIONS, EXAMPLE_LABELS, AI_PROVIDERS, AI_TASKS, MAX_RUN_BATCH, REVIEWABLE_STATUSES,
} from '../constants.js';
import { loadMandate, findVersion, createMandate, createVersion, parseVersion, CRITERIA_FIELDS } from '../research/mandates.js';
import { findExistingCompany, normalizeUrl, employeeBand, revenueBand } from '../research/classification.js';
import { budgetStatus } from '../ai/service.js';
import { requeueWaiting } from '../research/worker.js';

const MANDATE_FIELDS_SPEC = {
  name: { type: 'string', max: 120 },
  owner_id: { type: 'id' },
  status: { type: 'string', enum: MANDATE_STATUSES },
  schedule: { type: 'string', enum: MANDATE_SCHEDULES },
  schedule_weekday: { type: 'int', min: 0, max: 6 },
  default_batch: { type: 'int', min: 1, max: MAX_RUN_BATCH },
  freshness_days: { type: 'int', min: 7, max: 1095 },
};

const CRITERIA_SPEC = {
  target_countries: { type: 'list', required: true, minItems: 1, maxItems: 20, itemMax: 100 },
  need_types: { type: 'list', required: true, minItems: 1, enum: NEED_TYPES },
  accept_rule: { type: 'text', required: true, max: 1000 },
  false_positives: { type: 'list', maxItems: 20, itemMax: 300 },
  employees_min: { type: 'int', min: 0 },
  employees_max: { type: 'int', min: 0 },
  revenue_min_usd: { type: 'int', min: 0 },
  revenue_max_usd: { type: 'int', min: 0 },
  sectors: { type: 'list', enum: SECTORS },
  search_terms: { type: 'list', maxItems: 30, itemMax: 100 },
  exclusions: { type: 'list', maxItems: 100, itemMax: 200 },
  proposed_service: { type: 'string', required: true, max: 300 },
};

const CREATE_MANDATE_SPEC = { code: { type: 'string', required: true, max: 12 }, ...MANDATE_FIELDS_SPEC, name: { type: 'string', required: true, max: 120 }, ...CRITERIA_SPEC };
const VERSION_SPEC = { ...CRITERIA_SPEC, change_note: { type: 'text', required: true, max: 500 } };
const RUN_SPEC = { batch_size: { type: 'int', required: true, min: 1, max: MAX_RUN_BATCH } };
const DECISION_SPEC = {
  decision: { type: 'string', required: true, enum: REVIEW_DECISIONS },
  reason: { type: 'string', enum: REJECT_REASONS },
  note: { type: 'text', max: 1000 },
};
const ASSIGN_SPEC = { owner_id: { type: 'id', required: true }, mandate_id: { type: 'id' } };
const EXAMPLE_SPEC = { opportunity_id: { type: 'id', required: true }, label: { type: 'string', required: true, enum: EXAMPLE_LABELS }, note: { type: 'text', max: 500 } };
const CALIBRATION_SPEC = { from_version_id: { type: 'id', required: true }, to_version_id: { type: 'id', required: true } };
const CALIBRATION_NOTE_SPEC = { owner_note: { type: 'text', required: true, max: 1000 } };
const STAFF_OPPORTUNITY_SPEC = {
  company_id: { type: 'id' },
  company_name: { type: 'string', max: 200 },
  website: { type: 'url' },
  israel_connection: { type: 'string', enum: ISRAEL_CONNECTIONS },
  mandate_id: { type: 'id' },
  relationship_role: { type: 'string', required: true, enum: RELATIONSHIP_ROLES },
  target_country: { type: 'string', required: true, max: 100 },
  need_type: { type: 'string', required: true, enum: NEED_TYPES },
  business_need: { type: 'text', required: true, max: 500 },
  evidence_url: { type: 'url', required: true },
  evidence_date: { type: 'date', required: true },
  evidence_quote: { type: 'text', required: true, max: 1000 },
};
const MERGE_SPEC = { into_company_id: { type: 'id', required: true } };
const AI_SETTINGS_SPEC = {
  ai_monthly_cap_usd: { type: 'int', min: 1, max: 1000 },
  ...Object.fromEntries(AI_TASKS.flatMap((task) => [
    [`${task}_provider`, { type: 'string', enum: AI_PROVIDERS.filter((p) => p !== 'fake') }],
    [`${task}_model`, { type: 'string', max: 80 }],
  ])),
};
const PRICE_SPEC = {
  input: { type: 'number', required: true, min: 0, max: 1000 },
  output: { type: 'number', required: true, min: 0, max: 1000 },
  cache_read: { type: 'number', required: true, min: 0, max: 1000 },
  search: { type: 'number', required: true, min: 0, max: 10 },
};

const STATUS_FOR_DECISION = { accept: 'accepted', verify: 'verify', defer: 'deferred', reject: 'rejected' };
const DECIDABLE_STATUSES = ['draft', 'needs_review', 'verify', 'deferred'];
const VIEWS = {
  queue: ['draft', 'needs_review'],
  manual: ['manual_assignment'],
  followup: ['verify', 'deferred'],
  accepted: ['accepted'],
  rejected: ['rejected'],
};
const MANDATE_CODE_RE = /^[A-Z0-9]{2,12}$/;
const CARD_JSON_FIELDS = ['flags', 'unknowns'];
const VERIFY_TASK_DAYS = 7;

// ------------------------------------------------------------------ helpers

const isAdmin = (user) => user.role === 'admin';

function assertMandateManager(user, mandate) {
  if (!isAdmin(user) && mandate.owner_id !== user.id) throw forbidden('Only the mandate owner or an admin can do this');
}

function assertCanSee(user, opportunity) {
  if (!isAdmin(user) && opportunity.owner_id !== user.id) throw forbidden('This card belongs to another owner');
}

function assertActiveUser(db, userId) {
  const user = db.prepare('SELECT id FROM users WHERE id = ? AND active = 1').get(userId);
  if (!user) throw badRequest(`User #${userId} does not exist or is inactive`);
}

function assertRanges(criteria) {
  if (criteria.employees_min !== null && criteria.employees_max !== null && criteria.employees_min > criteria.employees_max) {
    throw badRequest('employees_min must not be above employees_max');
  }
  if (criteria.revenue_min_usd !== null && criteria.revenue_max_usd !== null && criteria.revenue_min_usd > criteria.revenue_max_usd) {
    throw badRequest('revenue_min_usd must not be above revenue_max_usd');
  }
}

/** Criteria with empty optional lists as [] (parseBody returns null for absent fields). */
function criteriaFrom(values) {
  const criteria = Object.fromEntries(CRITERIA_FIELDS.map((field) => [field, values[field]]));
  for (const field of ['false_positives', 'sectors', 'search_terms', 'exclusions']) criteria[field] = criteria[field] ?? [];
  assertRanges(criteria);
  return criteria;
}

function parseCard(row) {
  const card = { ...row };
  for (const field of CARD_JSON_FIELDS) card[field] = JSON.parse(row[field]);
  return card;
}

function withBands(company) {
  return {
    ...company,
    customer_types: JSON.parse(company.customer_types),
    customer_markets: JSON.parse(company.customer_markets),
    employee_band: employeeBand(company.employees_min, company.employees_max),
    revenue_band: revenueBand(company.revenue_usd_min, company.revenue_usd_max),
  };
}

function dateRange(query) {
  const to = query.to ?? new Date().toISOString().slice(0, 10);
  const from = query.from ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  for (const [name, value] of [['from', from], ['to', to]]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw badRequest(`${name} must be a date in YYYY-MM-DD format`);
  }
  if (from > to) throw badRequest('from must not be after to');
  return { from, to, fromIso: `${from}T00:00:00.000Z`, toIso: `${to}T23:59:59.999Z` };
}

const CARD_LIST_SQL = `
  SELECT o.id, o.status, o.verdict, o.flags, o.unknowns, o.evidence_date, o.target_country, o.need_type, o.business_need,
    o.relationship_role, o.created_at, o.decided_at, o.decision_reason, o.owner_id, o.mandate_id,
    c.id AS company_id, c.name AS company_name, c.sector, c.israel_connection, c.employees_min, c.employees_max,
    c.revenue_usd_min, c.revenue_usd_max, m.code AS mandate_code, u.display_name AS owner_name
  FROM opportunities o
  JOIN companies c ON c.id = o.company_id
  LEFT JOIN mandates m ON m.id = o.mandate_id
  LEFT JOIN users u ON u.id = o.owner_id`;

// ------------------------------------------------------------------ routes

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{ ai: ReturnType<typeof import('../ai/service.js').createAiService> }} deps
 */
export function researchRoutes(db, { ai }) {
  const router = Router();

  function mandateSummary(mandate) {
    const lastRun = db.prepare('SELECT id, status, created_at, finished_at, cards_created, cost_usd FROM research_runs WHERE mandate_id = ? ORDER BY id DESC LIMIT 1').get(mandate.id);
    const pending = db.prepare(`SELECT COUNT(*) AS n FROM opportunities WHERE mandate_id = ? AND status IN ('draft', 'needs_review')`).get(mandate.id).n;
    const owner = mandate.owner_id ? db.prepare('SELECT display_name FROM users WHERE id = ?').get(mandate.owner_id) : null;
    return { ...mandate, owner_name: owner ? owner.display_name : null, last_run: lastRun ?? null, pending_cards: pending };
  }

  // ---------------------------------------------------------- mandates
  router.get('/mandates', (req, res) => {
    const ids = db.prepare('SELECT id FROM mandates ORDER BY code').all();
    res.json(ids.map(({ id }) => mandateSummary(loadMandate(db, id))));
  });

  router.get('/mandates/:id', (req, res) => {
    const mandate = loadMandate(db, parseId(req.params.id));
    res.json({
      ...mandateSummary(mandate),
      versions: db.prepare(`SELECT v.*, u.display_name AS created_by_name FROM mandate_versions v LEFT JOIN users u ON u.id = v.created_by
        WHERE v.mandate_id = ? ORDER BY v.version DESC`).all(mandate.id).map(parseVersion),
      runs: db.prepare(`SELECT r.*, v.version, u.display_name AS requested_by_name FROM research_runs r
        JOIN mandate_versions v ON v.id = r.mandate_version_id LEFT JOIN users u ON u.id = r.requested_by
        WHERE r.mandate_id = ? ORDER BY r.id DESC LIMIT 20`).all(mandate.id),
      examples: db.prepare(`SELECT e.*, c.name AS company_name, o.business_need, o.verdict, o.status AS opportunity_status
        FROM calibration_examples e JOIN opportunities o ON o.id = e.opportunity_id JOIN companies c ON c.id = o.company_id
        WHERE e.mandate_id = ? ORDER BY e.id`).all(mandate.id),
      calibrations: db.prepare(`SELECT k.*, fv.version AS from_version, tv.version AS to_version FROM calibrations k
        JOIN mandate_versions fv ON fv.id = k.from_version_id JOIN mandate_versions tv ON tv.id = k.to_version_id
        WHERE k.mandate_id = ? ORDER BY k.id DESC`).all(mandate.id).map((k) => ({ ...k, rows: JSON.parse(k.rows) })),
    });
  });

  router.post('/mandates', requireAdmin, (req, res) => {
    const values = parseBody(CREATE_MANDATE_SPEC, req.body);
    if (!MANDATE_CODE_RE.test(values.code)) throw badRequest('code must be 2–12 capital letters or digits, e.g. SH4');
    if (db.prepare('SELECT 1 FROM mandates WHERE code = ?').get(values.code)) throw conflict(`Mandate ${values.code} already exists`);
    if (values.owner_id !== null) assertActiveUser(db, values.owner_id);
    if (values.status === 'active' && values.owner_id === null) throw badRequest('An active mandate needs an owner');
    const id = createMandate(db, {
      code: values.code, name: values.name, owner_id: values.owner_id, schedule: values.schedule ?? 'off',
      schedule_weekday: values.schedule_weekday ?? 0, default_batch: values.default_batch ?? 5, freshness_days: values.freshness_days ?? 183,
    }, criteriaFrom(values), req.user.id);
    if (values.status === 'active') update(db, 'mandates', id, { status: 'active' });
    audit(db, req.user.id, 'mandate.created', 'mandates', id, values.code);
    res.status(201).json(mandateSummary(loadMandate(db, id)));
  });

  router.patch('/mandates/:id', requireAdmin, (req, res) => {
    const mandate = findById(db, 'mandates', parseId(req.params.id));
    const changes = parseBody(MANDATE_FIELDS_SPEC, req.body, { partial: true });
    if ('owner_id' in changes && changes.owner_id !== null) assertActiveUser(db, changes.owner_id);
    const ownerAfter = 'owner_id' in changes ? changes.owner_id : mandate.owner_id;
    const statusAfter = changes.status ?? mandate.status;
    if (statusAfter === 'active' && ownerAfter === null) throw badRequest('An active mandate needs an owner');
    for (const field of ['name', 'status', 'schedule', 'schedule_weekday', 'default_batch', 'freshness_days']) {
      if (field in changes && changes[field] === null) throw badRequest(`${field} cannot be empty`);
    }
    update(db, 'mandates', mandate.id, changes);
    audit(db, req.user.id, 'mandate.updated', 'mandates', mandate.id, Object.keys(changes).join(','));
    res.json(mandateSummary(loadMandate(db, mandate.id)));
  });

  router.post('/mandates/:id/versions', (req, res) => {
    const mandate = findById(db, 'mandates', parseId(req.params.id));
    assertMandateManager(req.user, mandate);
    const values = parseBody(VERSION_SPEC, req.body);
    const versionId = transaction(db, () => createVersion(db, mandate.id, criteriaFrom(values), { userId: req.user.id, changeNote: values.change_note }));
    audit(db, req.user.id, 'mandate.version_created', 'mandates', mandate.id, values.change_note);
    res.status(201).json(findVersion(db, versionId));
  });

  // ---------------------------------------------------------- runs
  router.post('/mandates/:id/runs', (req, res) => {
    const mandate = findById(db, 'mandates', parseId(req.params.id));
    assertMandateManager(req.user, mandate);
    if (mandate.owner_id === null) throw badRequest('Assign an owner to this mandate before running it');
    const { batch_size: batchSize } = parseBody(RUN_SPEC, req.body);
    for (const task of AI_TASKS) {
      const problem = ai.problem(task);
      if (problem) throw conflict(problem);
    }
    if (budgetStatus(db).remaining <= 0) throw conflict('The monthly AI cap is used up. An admin can raise it in AI settings.');
    const id = insert(db, 'research_runs', {
      mandate_id: mandate.id, mandate_version_id: mandate.current_version_id, trigger: 'manual', requested_by: req.user.id, batch_size: batchSize,
    });
    audit(db, req.user.id, 'research.run_requested', 'research_runs', id, `${mandate.code} × ${batchSize}`);
    res.status(201).json(findById(db, 'research_runs', id));
  });

  router.get('/research/runs/:id', (req, res) => {
    res.json(findById(db, 'research_runs', parseId(req.params.id)));
  });

  // ---------------------------------------------------------- review queue
  router.get('/research/review', (req, res) => {
    const view = parseOptionalEnum(req.query.view, 'view', Object.keys(VIEWS)) ?? 'queue';
    const scope = parseOptionalEnum(req.query.owner, 'owner', ['me', 'all']) ?? 'me';
    if ((view === 'manual' || scope === 'all') && !isAdmin(req.user)) throw forbidden('Admin role required');
    const statuses = VIEWS[view];
    const conditions = [`o.status IN (${statuses.map(() => '?').join(', ')})`];
    const params = [...statuses];
    if (view !== 'manual' && scope === 'me') {
      conditions.push('o.owner_id = ?');
      params.push(req.user.id);
    }
    if (req.query.mandate_id) {
      conditions.push('o.mandate_id = ?');
      params.push(parseId(req.query.mandate_id, 'mandate_id'));
    }
    const order = view === 'queue' || view === 'manual'
      ? "CASE o.verdict WHEN 'match' THEN 0 ELSE 1 END, o.evidence_date DESC, o.id"
      : 'COALESCE(o.decided_at, o.created_at) DESC';
    const rows = db.prepare(`${CARD_LIST_SQL} WHERE ${conditions.join(' AND ')} ORDER BY ${order} LIMIT 300`).all(...params);
    res.json(rows.map(parseCard));
  });

  router.get('/research/counts', (req, res) => {
    const queue = db.prepare(`SELECT COUNT(*) AS n FROM opportunities WHERE owner_id = ? AND status IN ('draft', 'needs_review')`).get(req.user.id).n;
    const manual = isAdmin(req.user) ? db.prepare("SELECT COUNT(*) AS n FROM opportunities WHERE status = 'manual_assignment'").get().n : 0;
    res.json({ queue, manual });
  });

  router.get('/opportunities/:id', (req, res) => {
    const id = parseId(req.params.id);
    const opportunity = findById(db, 'opportunities', id);
    assertCanSee(req.user, opportunity);
    if (opportunity.opened_at === null && opportunity.owner_id === req.user.id && REVIEWABLE_STATUSES.includes(opportunity.status)) {
      update(db, 'opportunities', id, { opened_at: nowIso() }); // review time starts when the owner first opens the card
    }
    const card = db.prepare(`SELECT o.*, s.url AS evidence_url, s.title AS evidence_title, s.kind AS evidence_kind,
        m.code AS mandate_code, m.name AS mandate_name, u.display_name AS owner_name, d.display_name AS decided_by_name,
        v.version AS mandate_version
      FROM opportunities o JOIN sources s ON s.id = o.evidence_source_id
      LEFT JOIN mandates m ON m.id = o.mandate_id LEFT JOIN users u ON u.id = o.owner_id
      LEFT JOIN users d ON d.id = o.decided_by LEFT JOIN mandate_versions v ON v.id = o.mandate_version_id
      WHERE o.id = ?`).get(id);
    const company = withBands(findById(db, 'companies', opportunity.company_id));
    res.json({
      ...parseCard(card),
      company,
      facts: db.prepare(`SELECT f.id, f.field, f.value, f.quote, f.entity_covered, f.checked_at, s.url, s.title
        FROM facts f JOIN sources s ON s.id = f.source_id WHERE f.company_id = ? ORDER BY f.field, f.id`).all(company.id),
      other_opportunities: db.prepare(`${CARD_LIST_SQL} WHERE o.company_id = ? AND o.id != ? ORDER BY o.id DESC`).all(company.id, id).map(parseCard),
      examples: db.prepare('SELECT id, mandate_id, label, note FROM calibration_examples WHERE opportunity_id = ?').all(id),
    });
  });

  router.post('/opportunities/:id/decision', (req, res) => {
    const id = parseId(req.params.id);
    const opportunity = findById(db, 'opportunities', id);
    assertCanSee(req.user, opportunity);
    if (!DECIDABLE_STATUSES.includes(opportunity.status)) {
      throw conflict(opportunity.status === 'manual_assignment' ? 'Assign an owner before deciding' : `A card with status "${opportunity.status}" cannot be decided again`);
    }
    const { decision, reason, note } = parseBody(DECISION_SPEC, req.body);
    if (decision === 'reject' && reason === null) throw badRequest('reason is required to reject');
    if (decision !== 'reject' && reason !== null) throw badRequest('reason is only used when rejecting');
    if ((decision === 'verify' || decision === 'defer' || reason === 'other') && note === null) {
      throw badRequest(decision === 'reject' ? 'note is required when the reason is "other"' : `note is required to ${decision} (what is missing or why)`);
    }
    const decidedAt = new Date();
    const reviewSeconds = opportunity.opened_at ? Math.max(0, Math.round((decidedAt - new Date(opportunity.opened_at)) / 1000)) : null;
    transaction(db, () => {
      update(db, 'opportunities', id, {
        status: STATUS_FOR_DECISION[decision], decision_reason: reason, decision_note: note, decided_by: req.user.id,
        decided_at: decidedAt.toISOString(), review_seconds: reviewSeconds,
      });
      const company = findById(db, 'companies', opportunity.company_id);
      if (decision === 'accept' && company.outreach_owner_id === null && opportunity.owner_id !== null) {
        update(db, 'companies', company.id, { outreach_owner_id: opportunity.owner_id, updated_at: nowIso() });
      }
      if (decision === 'verify') {
        const owner = findById(db, 'users', opportunity.owner_id ?? req.user.id);
        const due = new Date(decidedAt.getTime() + VERIFY_TASK_DAYS * 86400000).toISOString().slice(0, 10);
        insert(db, 'tasks', { company_id: company.id, description: `Verify: ${note}`, assignee: owner.display_name, due_date: due });
      }
      audit(db, req.user.id, `opportunity.${decision}`, 'opportunities', id, reason ?? note);
    });
    res.json(parseCard(findById(db, 'opportunities', id)));
  });

  router.post('/opportunities/:id/assign', requireAdmin, (req, res) => {
    const id = parseId(req.params.id);
    const opportunity = findById(db, 'opportunities', id);
    if (!REVIEWABLE_STATUSES.includes(opportunity.status)) throw conflict('Only cards waiting for review can be reassigned');
    const values = parseBody(ASSIGN_SPEC, req.body);
    assertActiveUser(db, values.owner_id);
    const mandate = values.mandate_id === null ? null : findById(db, 'mandates', values.mandate_id);
    update(db, 'opportunities', id, {
      owner_id: values.owner_id,
      mandate_id: mandate ? mandate.id : opportunity.mandate_id,
      mandate_version_id: mandate ? mandate.current_version_id : opportunity.mandate_version_id,
      status: opportunity.status === 'manual_assignment' ? 'draft' : opportunity.status,
      opened_at: null,
    });
    audit(db, req.user.id, 'opportunity.assigned', 'opportunities', id, `owner ${values.owner_id}`);
    res.json(parseCard(findById(db, 'opportunities', id)));
  });

  /** Staff input: a referral or a known initiative, with the same evidence rules as research cards. */
  router.post('/opportunities', (req, res) => {
    const values = parseBody(STAFF_OPPORTUNITY_SPEC, req.body);
    if (values.company_id === null && values.company_name === null) throw badRequest('company_id or company_name is required');
    if (values.evidence_date > new Date().toISOString().slice(0, 10)) throw badRequest('evidence_date must not be in the future');
    const mandate = values.mandate_id === null ? null : findById(db, 'mandates', values.mandate_id);
    const id = transaction(db, () => {
      let companyId = values.company_id;
      if (companyId === null) {
        const found = findExistingCompany(db, { website: values.website, name: values.company_name, hqCountry: 'Israel' });
        companyId = found ? found.company.id : insert(db, 'companies', {
          name: values.company_name, industry: 'unknown', country: 'Israel', website: values.website,
          israel_connection: values.israel_connection ?? 'unknown', origin: 'research',
        });
      } else {
        findById(db, 'companies', companyId);
      }
      const url = normalizeUrl(values.evidence_url);
      const existingSource = db.prepare('SELECT id FROM sources WHERE url = ?').get(url);
      const sourceId = existingSource ? existingSource.id : insert(db, 'sources', { url, title: null, published_on: values.evidence_date, kind: 'staff' });
      if (db.prepare('SELECT 1 FROM opportunities WHERE company_id = ? AND evidence_source_id = ?').get(companyId, sourceId)) {
        throw conflict('This company already has a card with this evidence');
      }
      const ownerId = mandate ? mandate.owner_id : null;
      return insert(db, 'opportunities', {
        company_id: companyId, mandate_id: mandate ? mandate.id : null, mandate_version_id: mandate ? mandate.current_version_id : null,
        owner_id: ownerId, relationship_role: values.relationship_role, target_country: values.target_country, need_type: values.need_type,
        business_need: values.business_need, evidence_source_id: sourceId, evidence_date: values.evidence_date, evidence_quote: values.evidence_quote,
        proposed_service: mandate ? findVersion(db, mandate.current_version_id).proposed_service : null,
        status: ownerId === null ? 'manual_assignment' : 'draft',
      });
    });
    audit(db, req.user.id, 'opportunity.added_by_staff', 'opportunities', id);
    res.status(201).json(parseCard(findById(db, 'opportunities', id)));
  });

  /** Merge a research-only duplicate company into another company (cards and facts move; nothing else exists yet). */
  router.post('/companies/:id/merge', requireAdmin, (req, res) => {
    const source = findById(db, 'companies', parseId(req.params.id));
    const { into_company_id: targetId } = parseBody(MERGE_SPEC, req.body);
    if (targetId === source.id) throw badRequest('A company cannot be merged into itself');
    findById(db, 'companies', targetId);
    if (source.origin !== 'research') throw conflict('Only companies created by research can be merged');
    const linked = ['contacts', 'triggers', 'deals', 'interactions', 'approvals', 'meetings', 'tasks', 'documents', 'share_links']
      .filter((table) => db.prepare(`SELECT 1 FROM ${table} WHERE company_id = ? LIMIT 1`).get(source.id));
    if (linked.length > 0) throw conflict(`This company already has ${linked.join(', ')}; merge is not possible`);
    transaction(db, () => {
      for (const opportunity of db.prepare('SELECT id, evidence_source_id FROM opportunities WHERE company_id = ?').all(source.id)) {
        const clash = db.prepare('SELECT 1 FROM opportunities WHERE company_id = ? AND evidence_source_id = ?').get(targetId, opportunity.evidence_source_id);
        if (clash) db.prepare('DELETE FROM opportunities WHERE id = ?').run(opportunity.id); // same initiative, same evidence: a true duplicate
        else update(db, 'opportunities', opportunity.id, { company_id: targetId });
      }
      db.prepare('UPDATE facts SET company_id = ? WHERE company_id = ?').run(targetId, source.id);
      db.prepare('DELETE FROM companies WHERE id = ?').run(source.id);
      audit(db, req.user.id, 'company.merged', 'companies', targetId, `from #${source.id} ${source.name}`);
    });
    res.json({ merged_into: targetId });
  });

  // ---------------------------------------------------------- calibration
  router.post('/mandates/:id/examples', (req, res) => {
    const mandate = findById(db, 'mandates', parseId(req.params.id));
    assertMandateManager(req.user, mandate);
    const values = parseBody(EXAMPLE_SPEC, req.body);
    findById(db, 'opportunities', values.opportunity_id);
    if (db.prepare('SELECT 1 FROM calibration_examples WHERE mandate_id = ? AND opportunity_id = ?').get(mandate.id, values.opportunity_id)) {
      throw conflict('This card is already an example for this mandate');
    }
    const id = insert(db, 'calibration_examples', { ...values, mandate_id: mandate.id, created_by: req.user.id });
    res.status(201).json(findById(db, 'calibration_examples', id));
  });

  router.delete('/mandates/:id/examples/:exampleId', (req, res) => {
    const mandate = findById(db, 'mandates', parseId(req.params.id));
    assertMandateManager(req.user, mandate);
    const result = db.prepare('DELETE FROM calibration_examples WHERE id = ? AND mandate_id = ?').run(parseId(req.params.exampleId, 'exampleId'), mandate.id);
    if (result.changes === 0) throw notFound('Example not found');
    res.json({ ok: true });
  });

  router.post('/mandates/:id/calibrations', (req, res) => {
    const mandate = findById(db, 'mandates', parseId(req.params.id));
    assertMandateManager(req.user, mandate);
    const values = parseBody(CALIBRATION_SPEC, req.body);
    if (values.from_version_id === values.to_version_id) throw badRequest('Choose two different versions');
    for (const versionId of [values.from_version_id, values.to_version_id]) {
      if (findById(db, 'mandate_versions', versionId).mandate_id !== mandate.id) throw badRequest(`Version #${versionId} belongs to another mandate`);
    }
    if (!db.prepare('SELECT 1 FROM calibration_examples WHERE mandate_id = ?').get(mandate.id)) throw badRequest('Save at least one example before comparing');
    const problem = ai.problem('judge');
    if (problem) throw conflict(problem);
    const id = insert(db, 'calibrations', { mandate_id: mandate.id, ...values, created_by: req.user.id });
    res.status(201).json(findById(db, 'calibrations', id));
  });

  router.patch('/calibrations/:id', (req, res) => {
    const calibration = findById(db, 'calibrations', parseId(req.params.id));
    assertMandateManager(req.user, findById(db, 'mandates', calibration.mandate_id));
    update(db, 'calibrations', calibration.id, parseBody(CALIBRATION_NOTE_SPEC, req.body));
    res.json(findById(db, 'calibrations', calibration.id));
  });

  // ---------------------------------------------------------- metrics
  router.get('/research/metrics', (req, res) => {
    const range = dateRange(req.query);
    const decisions = db.prepare(`SELECT o.mandate_id,
        COUNT(*) AS reviewed,
        SUM(o.status = 'accepted') AS accepted,
        SUM(o.status = 'rejected') AS rejected,
        SUM(o.status = 'verify') AS verify,
        SUM(o.status = 'deferred') AS deferred,
        SUM(o.decision_reason = 'wrong_market') AS wrong_market,
        SUM(o.decision_reason = 'duplicate') AS rejected_duplicates,
        AVG(o.review_seconds) AS avg_review_seconds
      FROM opportunities o WHERE o.decided_at BETWEEN ? AND ? GROUP BY o.mandate_id`).all(range.fromIso, range.toIso);
    const reasons = db.prepare(`SELECT o.mandate_id, o.decision_reason AS reason, COUNT(*) AS n FROM opportunities o
      WHERE o.status = 'rejected' AND o.decided_at BETWEEN ? AND ? GROUP BY o.mandate_id, o.decision_reason`).all(range.fromIso, range.toIso);
    const runs = db.prepare(`SELECT mandate_id, COUNT(*) AS runs, SUM(cards_created) AS cards_created, SUM(duplicates) AS duplicates,
        SUM(filtered) AS filtered, SUM(cost_usd) AS cost_usd
      FROM research_runs WHERE created_at BETWEEN ? AND ? GROUP BY mandate_id`).all(range.fromIso, range.toIso);
    const pending = db.prepare(`SELECT mandate_id, COUNT(*) AS n FROM opportunities WHERE status IN ('draft', 'needs_review') GROUP BY mandate_id`).all();

    const byMandate = (rows, mandateId) => rows.find((row) => row.mandate_id === mandateId);
    const mandates = db.prepare(`SELECT m.id, m.code, m.name, u.display_name AS owner_name FROM mandates m
      LEFT JOIN users u ON u.id = m.owner_id ORDER BY m.code`).all();
    const rows = [...mandates, { id: null, code: null, name: null, owner_name: null }].map((mandate) => {
      const decided = byMandate(decisions, mandate.id);
      const run = byMandate(runs, mandate.id);
      const accepted = decided ? decided.accepted : 0;
      const cost = run ? run.cost_usd : 0;
      return {
        mandate_id: mandate.id, code: mandate.code, name: mandate.name, owner_name: mandate.owner_name,
        reviewed: decided ? decided.reviewed : 0, accepted, rejected: decided ? decided.rejected : 0,
        verify: decided ? decided.verify : 0, deferred: decided ? decided.deferred : 0,
        acceptance_rate: decided && decided.reviewed > 0 ? accepted / decided.reviewed : null,
        wrong_market: decided ? decided.wrong_market : 0,
        duplicates: (run ? run.duplicates : 0) + (decided ? decided.rejected_duplicates : 0),
        avg_review_minutes: decided && decided.avg_review_seconds !== null ? decided.avg_review_seconds / 60 : null,
        reject_reasons: Object.fromEntries(reasons.filter((r) => r.mandate_id === mandate.id).map((r) => [r.reason, r.n])),
        runs: run ? run.runs : 0, cards_created: run ? run.cards_created : 0, filtered: run ? run.filtered : 0,
        cost_usd: cost, cost_per_accepted: accepted > 0 ? cost / accepted : null,
        pending: (byMandate(pending, mandate.id) ?? { n: 0 }).n,
      };
    }).filter((row) => row.mandate_id !== null || row.reviewed > 0 || row.pending > 0);
    res.json({ from: range.from, to: range.to, rows });
  });

  // ---------------------------------------------------------- AI settings and budget
  function aiStatus() {
    const tasks = JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'ai_tasks'").get().value);
    const prices = JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'ai_prices'").get().value);
    return {
      budget: budgetStatus(db), tasks, prices, providers: ai.configuredProviders(),
      problems: Object.fromEntries(AI_TASKS.map((task) => [task, ai.problem(task)])),
    };
  }

  router.get('/research/ai', (req, res) => res.json(aiStatus()));

  router.patch('/research/ai', requireAdmin, (req, res) => {
    const values = parseBody(AI_SETTINGS_SPEC, req.body, { partial: true });
    transaction(db, () => {
      if (values.ai_monthly_cap_usd !== undefined && values.ai_monthly_cap_usd !== null) {
        db.prepare("UPDATE settings SET value = ? WHERE key = 'ai_monthly_cap_usd'").run(String(values.ai_monthly_cap_usd));
      }
      const tasks = JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'ai_tasks'").get().value);
      for (const task of AI_TASKS) {
        for (const part of ['provider', 'model']) {
          const value = values[`${task}_${part}`];
          if (value === undefined) continue;
          if (value === null) throw badRequest(`${task}_${part} cannot be empty`);
          tasks[task][part] = value;
        }
      }
      db.prepare("UPDATE settings SET value = ? WHERE key = 'ai_tasks'").run(JSON.stringify(tasks));
    });
    requeueWaiting(db); // a higher cap releases runs that were waiting for budget
    audit(db, req.user.id, 'ai.settings_updated', 'settings', null, Object.keys(values).join(','));
    res.json(aiStatus());
  });

  router.put('/research/ai/prices/:model', requireAdmin, (req, res) => {
    const model = req.params.model;
    if (!/^[a-z0-9][a-z0-9.-]{1,79}$/.test(model)) throw badRequest('model must be a model id such as claude-sonnet-5-5');
    const price = parseBody(PRICE_SPEC, req.body);
    const prices = JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'ai_prices'").get().value);
    prices[model] = price;
    db.prepare("UPDATE settings SET value = ? WHERE key = 'ai_prices'").run(JSON.stringify(prices));
    audit(db, req.user.id, 'ai.price_updated', 'settings', null, model);
    res.json(aiStatus());
  });

  return router;
}
