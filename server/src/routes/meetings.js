// Module 3: meetings, pre-meeting prep sheet, post-meeting workflow and tasks/commitments.

import { Router } from 'express';
import { parseBody, parseId, parseOptionalInt } from '../validate.js';
import { insert, update, findById, transaction, nowIso } from '../db.js';
import { badRequest } from '../http.js';
import { LANGUAGES, PIPELINE_STAGES } from '../constants.js';
import { recordInteraction } from '../timeline.js';
import { generateMeetingFollowupEmail, findTemplate } from '../generators.js';
import { createDocumentFromTemplate } from './documents.js';
import { enqueueApproval } from '../approvalQueue.js';

const MEETING_SPEC = {
  company_id: { type: 'id', required: true },
  deal_id: { type: 'id' },
  title: { type: 'string', required: true, max: 200 },
  scheduled_at: { type: 'datetime', required: true },
  location: { type: 'string', max: 200 },
  attendees: { type: 'string', max: 500 },
};

const MEETING_UPDATE_SPEC = {
  title: { type: 'string', max: 200 },
  scheduled_at: { type: 'datetime' },
  location: { type: 'string', max: 200 },
  attendees: { type: 'string', max: 500 },
  status: { type: 'string', enum: ['scheduled', 'cancelled'] },
};

const TASK_SPEC = {
  description: { type: 'string', required: true, max: 500 },
  assignee: { type: 'string', required: true, max: 120 },
  due_date: { type: 'date' },
  is_client_commitment: { type: 'bool' },
};

const NEW_TASK_SPEC = { ...TASK_SPEC, company_id: { type: 'id', required: true } };

const COMPLETE_SPEC = {
  summary: { type: 'text', required: true, max: 10000 },
  decisions: { type: 'text', max: 5000 },
  new_stage: { type: 'string', enum: PIPELINE_STAGES },
  followup_contact_id: { type: 'id' },
  create_summary_document: { type: 'bool' },
  language: { type: 'string', required: true, enum: LANGUAGES },
};

const SELECT_MEETINGS = `SELECT m.*, c.name AS company_name, d.title AS deal_title
  FROM meetings m JOIN companies c ON c.id = m.company_id LEFT JOIN deals d ON d.id = m.deal_id`;

function parseTasks(tasks) {
  if (!Array.isArray(tasks)) throw badRequest('tasks must be an array');
  return tasks.map((task) => parseBody(TASK_SPEC, task));
}

export function meetingRoutes(db) {
  const router = Router();

  router.get('/meetings', (req, res) => {
    const companyId = parseOptionalInt(req.query.company_id, 'company_id');
    const rows = companyId
      ? db.prepare(`${SELECT_MEETINGS} WHERE m.company_id = ? ORDER BY m.scheduled_at DESC`).all(companyId)
      : db.prepare(`${SELECT_MEETINGS} ORDER BY m.status = 'scheduled' DESC, m.scheduled_at DESC LIMIT 300`).all();
    res.json(rows);
  });

  router.post('/meetings', (req, res) => {
    const values = parseBody(MEETING_SPEC, req.body);
    findById(db, 'companies', values.company_id);
    if (values.deal_id && findById(db, 'deals', values.deal_id).company_id !== values.company_id) {
      throw badRequest('Deal does not belong to this company');
    }
    res.status(201).json({ id: insert(db, 'meetings', values) });
  });

  router.get('/meetings/:id', (req, res) => {
    const id = parseId(req.params.id);
    findById(db, 'meetings', id);
    res.json({
      ...db.prepare(`${SELECT_MEETINGS} WHERE m.id = ?`).get(id),
      tasks: db.prepare('SELECT * FROM tasks WHERE meeting_id = ? ORDER BY id').all(id),
    });
  });

  router.patch('/meetings/:id', (req, res) => {
    update(db, 'meetings', parseId(req.params.id), parseBody(MEETING_UPDATE_SPEC, req.body, { partial: true }));
    res.json({ ok: true });
  });

  /** Pre-meeting prep sheet: everything to read in 2 minutes before the call. */
  router.get('/meetings/:id/prep', (req, res) => {
    const meeting = findById(db, 'meetings', parseId(req.params.id));
    const companyId = meeting.company_id;
    res.json({
      meeting,
      company: findById(db, 'companies', companyId),
      deal: meeting.deal_id ? findById(db, 'deals', meeting.deal_id) : null,
      contacts: db.prepare('SELECT * FROM contacts WHERE company_id = ? ORDER BY verified DESC').all(companyId),
      recent_interactions: db.prepare(`SELECT i.*, u.display_name AS user_name FROM interactions i
        LEFT JOIN users u ON u.id = i.user_id WHERE i.company_id = ? ORDER BY occurred_at DESC LIMIT 10`).all(companyId),
      previous_meetings: db.prepare(`SELECT id, title, scheduled_at, decisions, summary FROM meetings
        WHERE company_id = ? AND status = 'done' AND id != ? ORDER BY scheduled_at DESC LIMIT 3`).all(companyId, meeting.id),
      open_tasks: db.prepare('SELECT * FROM tasks WHERE company_id = ? AND done = 0 ORDER BY due_date').all(companyId),
      open_documents: db.prepare(`SELECT id, kind, title, status FROM documents
        WHERE company_id = ? AND status != 'signed' ORDER BY created_at DESC`).all(companyId),
      recent_triggers: db.prepare('SELECT * FROM triggers WHERE company_id = ? ORDER BY detected_on DESC LIMIT 5').all(companyId),
    });
  });

  /**
   * Post-meeting workflow: store summary + decisions, create tasks, log the meeting in the timeline,
   * optionally advance the deal stage, and queue a follow-up email draft for human approval.
   */
  router.post('/meetings/:id/complete', (req, res) => {
    const id = parseId(req.params.id);
    const meeting = findById(db, 'meetings', id);
    if (meeting.status !== 'scheduled') throw badRequest(`Meeting is already ${meeting.status}`);
    const { tasks, ...rest } = req.body;
    const values = parseBody(COMPLETE_SPEC, rest);
    const parsedTasks = parseTasks(tasks ?? []);
    if (values.new_stage && !meeting.deal_id) throw badRequest('new_stage requires the meeting to be linked to a deal');

    const result = transaction(db, () => {
      update(db, 'meetings', id, { status: 'done', summary: values.summary, decisions: values.decisions });
      for (const task of parsedTasks) {
        insert(db, 'tasks', { ...task, is_client_commitment: task.is_client_commitment ?? 0, company_id: meeting.company_id, meeting_id: id });
      }
      recordInteraction(db, {
        company_id: meeting.company_id, deal_id: meeting.deal_id, channel: 'meeting', direction: 'internal',
        summary: `${meeting.title}: ${values.summary}`, occurred_at: nowIso(), user_id: req.user.id,
      });
      if (values.new_stage) {
        const deal = findById(db, 'deals', meeting.deal_id);
        const stages = JSON.parse(findById(db, 'workflows', deal.workflow_id).stages);
        if (!stages.includes(values.new_stage)) throw badRequest(`Stage "${values.new_stage}" is not part of this deal's workflow`);
        if (deal.stage !== values.new_stage) update(db, 'deals', deal.id, { stage: values.new_stage, stage_changed_at: nowIso() });
      }
      const documentId = values.create_summary_document
        ? createDocumentFromTemplate(db, req.user, {
          templateId: findTemplate(db, 'meeting_summary', values.language).id,
          companyId: meeting.company_id, dealId: meeting.deal_id, meetingId: id, title: meeting.title,
        })
        : null;
      if (!values.followup_contact_id) return { approval_id: null, document_id: documentId };
      const contact = findById(db, 'contacts', values.followup_contact_id);
      if (contact.company_id !== meeting.company_id) throw badRequest('Contact does not belong to this company');
      const completed = findById(db, 'meetings', id);
      const { subject, content } = generateMeetingFollowupEmail(db, req.user, { meeting: completed, contact, language: values.language });
      const approvalId = enqueueApproval(db, req.user.id, {
        kind: 'meeting_followup_email', company_id: meeting.company_id, deal_id: meeting.deal_id,
        contact_id: contact.id, meeting_id: id, language: values.language, subject, content, recipient_email: contact.email,
      });
      return { approval_id: approvalId, document_id: documentId };
    });
    res.json({ ok: true, ...result });
  });

  // ------------------------------------------------------------ tasks / commitments
  router.get('/tasks', (req, res) => {
    res.json(db.prepare(`SELECT t.*, c.name AS company_name FROM tasks t JOIN companies c ON c.id = t.company_id
      WHERE t.done = 0 ORDER BY t.due_date IS NULL, t.due_date`).all());
  });

  router.post('/tasks', (req, res) => {
    const values = parseBody(NEW_TASK_SPEC, req.body);
    findById(db, 'companies', values.company_id);
    res.status(201).json({ id: insert(db, 'tasks', { ...values, is_client_commitment: values.is_client_commitment ?? 0 }) });
  });

  router.patch('/tasks/:id', (req, res) => {
    update(db, 'tasks', parseId(req.params.id), parseBody({ ...TASK_SPEC, done: { type: 'bool' } }, req.body, { partial: true }));
    res.json({ ok: true });
  });

  return router;
}
