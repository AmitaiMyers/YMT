// Module 3: meetings (person-first, company optional), calendar feed, Google sync, prep sheet,
// post-meeting workflow and tasks/commitments.

import { Router } from 'express';
import { parseBody, parseId, parseOptionalInt } from '../validate.js';
import { insert, update, findById, transaction, nowIso, audit } from '../db.js';
import { badRequest } from '../http.js';
import { LANGUAGES, PIPELINE_STAGES } from '../constants.js';
import { recordInteraction } from '../timeline.js';
import { generateMeetingFollowupEmail, findTemplate } from '../generators.js';
import { createDocumentFromTemplate } from './documents.js';
import { enqueueApproval } from '../approvalQueue.js';
import { meetingRequest, parseMeetingDraft } from '../research/tasks.js';
import { assertInvitePossible, pushNewMeeting, pushMeetingChange, googleAccount, googleEventsFor, tryGoogle } from '../calendarSync.js';

const DURATION = { type: 'int', min: 5, max: 720 };
const MAX_RANGE_DAYS = 62; // a month view plus the visible days of the neighbouring months

const MEETING_CREATE_SPEC = {
  title: { type: 'string', required: true, max: 200 },
  scheduled_at: { type: 'datetime', required: true },
  duration_minutes: DURATION,
  location: { type: 'string', max: 200 },
  attendees: { type: 'string', max: 500 },
  deal_id: { type: 'id' },
  company_id: { type: 'id' },
  contact_id: { type: 'id' },
  organization: { type: 'string', max: 200 },
  add_to_google: { type: 'bool' },
  send_invite: { type: 'bool' },
};

const NEW_PERSON_SPEC = {
  full_name: { type: 'string', required: true, max: 120 },
  email: { type: 'email' },
  phone: { type: 'string', max: 40 },
  job_title: { type: 'string', max: 120 },
  preferred_language: { type: 'string', enum: LANGUAGES },
};

const MEETING_UPDATE_SPEC = {
  title: { type: 'string', max: 200 },
  scheduled_at: { type: 'datetime' },
  duration_minutes: DURATION,
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
const MAX_NOTES = 60000; // about an hour of transcript
const DRAFT_SUMMARY_SPEC = {
  notes: { type: 'text', required: true, max: MAX_NOTES },
  language: { type: 'string', required: true, enum: LANGUAGES },
};

const COMPLETE_SPEC = {
  summary: { type: 'text', required: true, max: 10000 },
  // Release 5: an edited recap email (from the AI draft) replaces the template-based follow-up email.
  followup_subject: { type: 'string', max: 300 },
  followup_body: { type: 'text', max: 10000 },
  decisions: { type: 'text', max: 5000 },
  new_stage: { type: 'string', enum: PIPELINE_STAGES },
  followup_contact_id: { type: 'id' },
  create_summary_document: { type: 'bool' },
  language: { type: 'string', required: true, enum: LANGUAGES },
};

export const SELECT_MEETINGS = `SELECT m.*, c.name AS company_name, d.title AS deal_title,
    k.full_name AS contact_name, k.email AS contact_email, u.display_name AS organizer_name
  FROM meetings m
  LEFT JOIN companies c ON c.id = m.company_id
  LEFT JOIN deals d ON d.id = m.deal_id
  LEFT JOIN contacts k ON k.id = m.contact_id
  LEFT JOIN users u ON u.id = m.organizer_id`;

function parseTasks(tasks) {
  if (!Array.isArray(tasks)) throw badRequest('tasks must be an array');
  return tasks.map((task) => parseBody(TASK_SPEC, task));
}

/** Existing company with this name (case-insensitive), or a new one. Companies keep their data quality rules. */
function companyForOrganization(db, userId, name) {
  const existing = db.prepare('SELECT id FROM companies WHERE lower(name) = lower(?)').get(name);
  if (existing) return existing.id;
  const id = insert(db, 'companies', { name, industry: '', country: '', india_activity: 'none' });
  audit(db, userId, 'company.created_from_meeting', 'companies', id, name);
  return id;
}

/**
 * Person-first participant resolution:
 *  - person: an existing contact (contact_id) or a new one (new_contact); optional if an organization is given;
 *  - organization: an existing company (company_id), a typed name (organization), the person's own company, or none.
 */
function resolveParticipants(db, userId, values, newContactInput) {
  if (values.contact_id && newContactInput) throw badRequest('Use either contact_id or new_contact, not both');
  if (values.company_id && values.organization) throw badRequest('Use either company_id or organization, not both');
  const newContact = newContactInput ? parseBody(NEW_PERSON_SPEC, newContactInput) : null;
  const existingContact = values.contact_id ? findById(db, 'contacts', values.contact_id) : null;

  let companyId = values.company_id ?? null;
  if (companyId) findById(db, 'companies', companyId);
  if (!companyId && values.organization) companyId = companyForOrganization(db, userId, values.organization);

  if (existingContact) {
    if (existingContact.company_id && companyId && existingContact.company_id !== companyId) {
      throw badRequest(`${existingContact.full_name} belongs to another organization; leave the organization empty or choose theirs`);
    }
    if (!existingContact.company_id && companyId) update(db, 'contacts', existingContact.id, { company_id: companyId });
    companyId = companyId ?? existingContact.company_id;
    return { companyId, contactId: existingContact.id, contactEmail: existingContact.email };
  }
  if (newContact) {
    const contactId = insert(db, 'contacts', {
      ...newContact, preferred_language: newContact.preferred_language ?? 'he', department: 'other', verified: 0, company_id: companyId,
    });
    return { companyId, contactId, contactEmail: newContact.email };
  }
  if (!companyId) throw badRequest('Choose a person or an organization for the meeting');
  return { companyId, contactId: null, contactEmail: null };
}

export function meetingRoutes(db, { google, ai }) {
  const router = Router();

  router.get('/meetings', (req, res) => {
    const companyId = parseOptionalInt(req.query.company_id, 'company_id');
    const rows = companyId
      ? db.prepare(`${SELECT_MEETINGS} WHERE m.company_id = ? ORDER BY m.scheduled_at DESC`).all(companyId)
      : db.prepare(`${SELECT_MEETINGS} ORDER BY m.status = 'scheduled' DESC, m.scheduled_at DESC LIMIT 300`).all();
    res.json(rows);
  });

  /** Calendar feed: all YMT meetings in [from, to) + the signed-in user's own Google events (if connected). */
  router.get('/calendar/events', async (req, res) => {
    const { from, to } = parseBody({ from: { type: 'datetime', required: true }, to: { type: 'datetime', required: true } },
      { from: req.query.from, to: req.query.to });
    if (Date.parse(to) <= Date.parse(from)) throw badRequest('to must be after from');
    if (Date.parse(to) - Date.parse(from) > MAX_RANGE_DAYS * 86_400_000) throw badRequest(`The range can be at most ${MAX_RANGE_DAYS} days`);
    const meetings = db.prepare(`${SELECT_MEETINGS} WHERE m.scheduled_at >= ? AND m.scheduled_at < ? ORDER BY m.scheduled_at`).all(from, to);
    const connected = Boolean(google && googleAccount(db, req.user.id));
    const googleResult = connected ? await tryGoogle(() => googleEventsFor(db, google, req.user.id, from, to)) : null;
    res.json({
      meetings,
      google_events: googleResult && googleResult.ok ? googleResult.value : [],
      google_error: googleResult && !googleResult.ok ? googleResult.message : null,
    });
  });

  router.post('/meetings', async (req, res) => {
    const { new_contact: newContactInput, ...rest } = req.body;
    const values = parseBody(MEETING_CREATE_SPEC, rest);
    const addToGoogle = values.add_to_google === 1;
    const sendInvite = values.send_invite === 1;

    const created = transaction(db, () => {
      const { companyId, contactId, contactEmail } = resolveParticipants(db, req.user.id, values, newContactInput);
      // Validate the Google request before saving, so an impossible invite never leaves a half-done meeting.
      assertInvitePossible(db, { addToGoogle, sendInvite, contactEmail, userId: req.user.id, googleEnabled: Boolean(google) });
      if (values.deal_id) {
        const deal = findById(db, 'deals', values.deal_id);
        if (!companyId || deal.company_id !== companyId) throw badRequest('Deal does not belong to this organization');
      }
      const id = insert(db, 'meetings', {
        title: values.title, scheduled_at: values.scheduled_at, duration_minutes: values.duration_minutes ?? 60,
        location: values.location, attendees: values.attendees, deal_id: values.deal_id,
        company_id: companyId, contact_id: contactId, organizer_id: req.user.id,
      });
      audit(db, req.user.id, 'meeting.created', 'meetings', id);
      return { id, companyId, contactId, contactEmail };
    });

    const googleStatus = { status: 'skipped', message: null };
    if (addToGoogle) {
      const result = await tryGoogle(() => pushNewMeeting(db, google, created.id, req.user.id, { inviteEmail: sendInvite ? created.contactEmail : null }));
      Object.assign(googleStatus, result.ok
        ? { status: sendInvite ? 'invited' : 'added' }
        : { status: 'failed', message: result.message });
    }
    res.status(201).json({ id: created.id, company_id: created.companyId, contact_id: created.contactId, google: googleStatus });
  });

  router.get('/meetings/:id', (req, res) => {
    const id = parseId(req.params.id);
    findById(db, 'meetings', id);
    res.json({
      ...db.prepare(`${SELECT_MEETINGS} WHERE m.id = ?`).get(id),
      tasks: db.prepare('SELECT * FROM tasks WHERE meeting_id = ? ORDER BY id').all(id),
    });
  });

  /** Reschedule / rename / cancel. Mirrored to Google; people already invited are notified by Google. */
  router.patch('/meetings/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const meeting = findById(db, 'meetings', id);
    const changes = parseBody(MEETING_UPDATE_SPEC, req.body, { partial: true });
    if (meeting.status === 'done') throw badRequest('A summarised meeting cannot be changed');
    update(db, 'meetings', id, changes);
    audit(db, req.user.id, changes.status === 'cancelled' ? 'meeting.cancelled' : 'meeting.updated', 'meetings', id);
    const needsGoogle = Boolean(google && meeting.google_event_id);
    const result = needsGoogle ? await tryGoogle(() => pushMeetingChange(db, google, id, req.user.id)) : { ok: true };
    res.json({ ok: true, google_error: result.ok ? null : result.message });
  });

  /** Pre-meeting prep sheet: everything to read in 2 minutes before the call. Works with or without a company. */
  router.get('/meetings/:id/prep', (req, res) => {
    const meeting = db.prepare(`${SELECT_MEETINGS} WHERE m.id = ?`).get(parseId(req.params.id));
    if (!meeting) findById(db, 'meetings', parseId(req.params.id)); // throws the standard 404
    const companyId = meeting.company_id;
    const person = meeting.contact_id ? findById(db, 'contacts', meeting.contact_id) : null;
    // Company file when known; otherwise everything we know about the person.
    const scope = companyId ? { column: 'company_id', value: companyId } : { column: 'contact_id', value: meeting.contact_id };
    const scoped = (sql, ...params) => (scope.value ? db.prepare(sql.replaceAll(':scope', scope.column)).all(scope.value, ...params) : []);
    const companyOnly = (sql) => (companyId ? db.prepare(sql).all(companyId) : []);
    const companyContacts = companyOnly('SELECT * FROM contacts WHERE company_id = ? ORDER BY verified DESC');
    res.json({
      meeting,
      company: companyId ? findById(db, 'companies', companyId) : null,
      person,
      deal: meeting.deal_id ? findById(db, 'deals', meeting.deal_id) : null,
      contacts: person && !companyContacts.some((c) => c.id === person.id) ? [person, ...companyContacts] : companyContacts,
      recent_interactions: scoped(`SELECT i.*, u.display_name AS user_name FROM interactions i
        LEFT JOIN users u ON u.id = i.user_id WHERE i.:scope = ? ORDER BY occurred_at DESC LIMIT 10`),
      previous_meetings: scoped(`SELECT id, title, scheduled_at, decisions, summary FROM meetings
        WHERE :scope = ? AND status = 'done' AND id != ? ORDER BY scheduled_at DESC LIMIT 3`, meeting.id),
      open_tasks: companyOnly('SELECT * FROM tasks WHERE company_id = ? AND done = 0 ORDER BY due_date'),
      open_documents: companyOnly(`SELECT id, kind, title, status FROM documents WHERE company_id = ? AND status != 'signed' ORDER BY created_at DESC`),
      recent_triggers: companyOnly('SELECT * FROM triggers WHERE company_id = ? ORDER BY detected_on DESC LIMIT 5'),
      ai_problem: ai.problem('meeting'),
    });
  });

  /**
   * Release 5: draft the summary, decisions, tasks and recap email from notes or a pasted transcript. Nothing is
   * stored here: the owner edits the draft in the post-meeting form and saves it with "complete" as before.
   */
  router.post('/meetings/:id/draft-summary', async (req, res) => {
    const meeting = findById(db, 'meetings', parseId(req.params.id));
    if (meeting.status !== 'scheduled') throw badRequest(`Meeting is already ${meeting.status}`);
    const { notes, language } = parseBody(DRAFT_SUMMARY_SPEC, req.body);
    const result = await ai.call('meeting', meetingRequest({
      meeting, language, notes,
      companyName: meeting.company_id ? findById(db, 'companies', meeting.company_id).name : null,
      personName: meeting.contact_id ? findById(db, 'contacts', meeting.contact_id).full_name : null,
      organizerName: findById(db, 'users', meeting.organizer_id ?? req.user.id).display_name,
    }));
    audit(db, req.user.id, 'meeting.summary_drafted', 'meetings', meeting.id);
    res.json(parseMeetingDraft(result.input));
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
    if (values.create_summary_document && !meeting.company_id) {
      throw badRequest('A summary document needs an organization; link the meeting to a company first');
    }

    const result = transaction(db, () => {
      update(db, 'meetings', id, { status: 'done', summary: values.summary, decisions: values.decisions });
      for (const task of parsedTasks) {
        insert(db, 'tasks', { ...task, is_client_commitment: task.is_client_commitment ?? 0, company_id: meeting.company_id, meeting_id: id });
      }
      recordInteraction(db, {
        company_id: meeting.company_id, deal_id: meeting.deal_id, contact_id: meeting.contact_id, channel: 'meeting', direction: 'internal',
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
      const isMeetingPerson = contact.id === meeting.contact_id;
      const isCompanyContact = meeting.company_id !== null && contact.company_id === meeting.company_id;
      if (!isMeetingPerson && !isCompanyContact) throw badRequest('This contact is not part of the meeting or its organization');
      const completed = findById(db, 'meetings', id);
      const { subject, content } = values.followup_body
        ? { subject: values.followup_subject, content: values.followup_body }
        : generateMeetingFollowupEmail(db, req.user, { meeting: completed, contact, language: values.language });
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
    res.json(db.prepare(`SELECT t.*, c.name AS company_name FROM tasks t LEFT JOIN companies c ON c.id = t.company_id
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
