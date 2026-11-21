// Module 2: pipelines, workflows, unified interaction timeline and stagnant-lead reminders.

import { Router } from 'express';
import { parseBody, parseId, parseOptionalEnum, parseOptionalInt } from '../validate.js';
import { insert, update, findById, nowIso, getNumericSetting, audit, transaction } from '../db.js';
import { badRequest, conflict } from '../http.js';
import { PIPELINE_STAGES, LANGUAGES, MAX_FOLLOWUPS_HARD_LIMIT, DEAL_MODELS, DEAL_STATUSES, CHANNELS, DIRECTIONS } from '../constants.js';
import { recordInteraction } from '../timeline.js';
import { generateFollowupEmail } from '../generators.js';
import { enqueueApproval, followupsCommitted } from '../approvalQueue.js';
import { SELECT_DEALS, buildReminders } from '../reminders.js';

const WORKFLOW_SPEC = {
  name_he: { type: 'string', required: true, max: 120 },
  name_en: { type: 'string', required: true, max: 120 },
  active: { type: 'bool' },
};

const DEAL_CREATE_SPEC = {
  company_id: { type: 'id', required: true },
  workflow_id: { type: 'id', required: true },
  title: { type: 'string', required: true, max: 200 },
  owner_id: { type: 'id' },
  deal_model: { type: 'string', required: true, enum: DEAL_MODELS },
  expected_value_usd: { type: 'int', min: 0 },
};

const DEAL_UPDATE_SPEC = {
  title: { type: 'string', max: 200 },
  stage: { type: 'string', enum: PIPELINE_STAGES },
  status: { type: 'string', enum: DEAL_STATUSES },
  owner_id: { type: 'id' },
  deal_model: { type: 'string', enum: DEAL_MODELS },
  expected_value_usd: { type: 'int', min: 0 },
  actual_revenue_usd: { type: 'int', min: 0 },
};

const INTERACTION_SPEC = {
  company_id: { type: 'id', required: true },
  deal_id: { type: 'id' },
  contact_id: { type: 'id' },
  channel: { type: 'string', required: true, enum: CHANNELS },
  direction: { type: 'string', required: true, enum: DIRECTIONS },
  summary: { type: 'text', required: true, max: 5000 },
  occurred_at: { type: 'datetime', required: true },
};

const FOLLOWUP_SPEC = {
  contact_id: { type: 'id', required: true },
  language: { type: 'string', required: true, enum: LANGUAGES },
};

/** Validate an ordered stage list coming from the workflow editor. */
function parseStages(stages) {
  if (!Array.isArray(stages) || stages.length === 0) throw badRequest('stages must be a non-empty array');
  const unknown = stages.filter((stage) => !PIPELINE_STAGES.includes(stage));
  if (unknown.length > 0) throw badRequest(`Unknown stage(s): ${unknown.join(', ')}`);
  if (new Set(stages).size !== stages.length) throw badRequest('stages must not repeat');
  return PIPELINE_STAGES.filter((stage) => stages.includes(stage)); // keep canonical order
}

function workflowWithStages(row) {
  return { ...row, stages: JSON.parse(row.stages) };
}

function loadWorkflow(db, id) {
  return workflowWithStages(findById(db, 'workflows', id));
}

export function crmRoutes(db) {
  const router = Router();

  // ------------------------------------------------------------ workflows
  router.get('/workflows', (req, res) => {
    res.json(db.prepare('SELECT * FROM workflows ORDER BY id').all().map(workflowWithStages));
  });

  router.post('/workflows', (req, res) => {
    const { stages, ...rest } = req.body;
    const values = parseBody(WORKFLOW_SPEC, rest);
    const id = insert(db, 'workflows', { ...values, active: values.active ?? 1, stages: JSON.stringify(parseStages(stages)) });
    res.status(201).json({ id });
  });

  router.patch('/workflows/:id', (req, res) => {
    const id = parseId(req.params.id);
    const { stages, ...rest } = req.body;
    const values = Object.keys(rest).length > 0 ? parseBody(WORKFLOW_SPEC, rest, { partial: true }) : {};
    const changes = stages === undefined ? values : { ...values, stages: JSON.stringify(parseStages(stages)) };
    if (Object.keys(changes).length === 0) throw badRequest('No fields to update');
    if (changes.stages) {
      const allowed = JSON.parse(changes.stages);
      const orphaned = db.prepare(`SELECT COUNT(*) AS n FROM deals WHERE workflow_id = ? AND status = 'open'
        AND stage NOT IN (SELECT value FROM json_each(?))`).get(id, changes.stages).n;
      if (orphaned > 0) throw conflict(`${orphaned} open deal(s) are in a stage not in [${allowed.join(', ')}]; move them first`);
    }
    update(db, 'workflows', id, changes);
    res.json({ ok: true });
  });

  // ------------------------------------------------------------ deals (leads in pipeline)
  router.get('/deals', (req, res) => {
    const status = parseOptionalEnum(req.query.status, 'status', DEAL_STATUSES) ?? 'open';
    const workflowId = parseOptionalInt(req.query.workflow_id, 'workflow_id');
    const rows = workflowId
      ? db.prepare(`${SELECT_DEALS} WHERE d.status = ? AND d.workflow_id = ? ORDER BY d.last_activity_at`).all(status, workflowId)
      : db.prepare(`${SELECT_DEALS} WHERE d.status = ? ORDER BY d.last_activity_at`).all(status);
    res.json(rows);
  });

  router.post('/deals', (req, res) => {
    const values = parseBody(DEAL_CREATE_SPEC, req.body);
    findById(db, 'companies', values.company_id);
    const workflow = loadWorkflow(db, values.workflow_id);
    if (!workflow.active) throw badRequest('Workflow is inactive');
    const id = insert(db, 'deals', {
      ...values,
      owner_id: values.owner_id ?? req.user.id,
      expected_value_usd: values.expected_value_usd ?? 0,
      stage: workflow.stages[0],
    });
    audit(db, req.user.id, 'deal.created', 'deals', id);
    res.status(201).json({ id });
  });

  router.get('/deals/:id', (req, res) => {
    const id = parseId(req.params.id);
    findById(db, 'deals', id);
    const deal = db.prepare(`${SELECT_DEALS} WHERE d.id = ?`).get(id);
    res.json({
      ...deal,
      workflow: loadWorkflow(db, deal.workflow_id),
      max_followups: getNumericSetting(db, 'max_followups'),
      followups_committed: followupsCommitted(db, id),
      interactions: db.prepare(`SELECT i.*, u.display_name AS user_name, k.full_name AS contact_name
        FROM interactions i LEFT JOIN users u ON u.id = i.user_id LEFT JOIN contacts k ON k.id = i.contact_id
        WHERE i.deal_id = ? ORDER BY i.occurred_at DESC`).all(id),
      contacts: db.prepare('SELECT * FROM contacts WHERE company_id = ? ORDER BY full_name').all(deal.company_id),
      // The research card this deal came from (Release 2): evidence and decision stay visible on the deal.
      research_card: deal.opportunity_id === null ? null : db.prepare(`SELECT o.id, o.business_need, o.target_country, o.need_type,
          o.evidence_date, o.evidence_quote, o.decided_at, o.decision_note, s.url AS evidence_url, m.code AS mandate_code, u.display_name AS decided_by_name
        FROM opportunities o JOIN sources s ON s.id = o.evidence_source_id LEFT JOIN mandates m ON m.id = o.mandate_id
        LEFT JOIN users u ON u.id = o.decided_by WHERE o.id = ?`).get(deal.opportunity_id),
    });
  });

  router.patch('/deals/:id', (req, res) => {
    const id = parseId(req.params.id);
    const deal = findById(db, 'deals', id);
    const changes = parseBody(DEAL_UPDATE_SPEC, req.body, { partial: true });
    const now = nowIso();
    const extra = {};
    if (changes.stage && changes.stage !== deal.stage) {
      const workflow = loadWorkflow(db, deal.workflow_id);
      if (!workflow.stages.includes(changes.stage)) throw badRequest(`Stage "${changes.stage}" is not part of this workflow`);
      Object.assign(extra, { stage_changed_at: now, last_activity_at: now });
    }
    if (changes.status && changes.status !== deal.status) {
      extra.closed_at = changes.status === 'open' ? null : now;
    }
    transaction(db, () => {
      update(db, 'deals', id, { ...changes, ...extra });
      if (extra.stage_changed_at) {
        recordInteraction(db, {
          company_id: deal.company_id, deal_id: id, channel: 'note', direction: 'internal',
          summary: `stage: ${deal.stage} → ${changes.stage}`, occurred_at: now, user_id: req.user.id,
        });
      }
    });
    res.json({ ok: true });
  });

  // ------------------------------------------------------------ interactions (unified timeline)
  router.get('/interactions', (req, res) => {
    const companyId = parseId(req.query.company_id, 'company_id');
    res.json(db.prepare(`SELECT i.*, u.display_name AS user_name FROM interactions i
      LEFT JOIN users u ON u.id = i.user_id WHERE i.company_id = ? ORDER BY occurred_at DESC`).all(companyId));
  });

  router.post('/interactions', (req, res) => {
    const values = parseBody(INTERACTION_SPEC, req.body);
    findById(db, 'companies', values.company_id);
    const id = transaction(db, () => recordInteraction(db, { ...values, user_id: req.user.id }));
    res.status(201).json({ id });
  });

  // ------------------------------------------------------------ reminders
  router.get('/reminders', (req, res) => res.json(buildReminders(db)));

  router.post('/deals/:id/followup', (req, res) => {
    const id = parseId(req.params.id);
    const deal = findById(db, 'deals', id);
    if (deal.status !== 'open') throw badRequest('Follow-ups can only be drafted for open deals');
    const { contact_id: contactId, language } = parseBody(FOLLOWUP_SPEC, req.body);
    const contact = findById(db, 'contacts', contactId);
    if (contact.company_id !== deal.company_id) throw badRequest('Contact does not belong to this company');
    const maxFollowups = Math.min(getNumericSetting(db, 'max_followups'), MAX_FOLLOWUPS_HARD_LIMIT);
    const committed = followupsCommitted(db, id);
    if (committed >= maxFollowups) {
      throw conflict(`This lead already has ${committed} of ${maxFollowups} follow-ups sent or queued`);
    }
    const { subject, content } = generateFollowupEmail(db, req.user, {
      deal, contact, language, followupNumber: committed + 1, maxFollowups,
    });
    const approvalId = enqueueApproval(db, req.user.id, {
      kind: 'followup_email', company_id: deal.company_id, deal_id: id, contact_id: contactId,
      language, subject, content, recipient_email: contact.email,
    });
    res.status(201).json({ id: approvalId });
  });

  return router;
}
