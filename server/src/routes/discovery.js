// Release 5: the client discovery form.
//   Staff create a personal, expiring, revocable link for a company (optionally a contact and a deal) and send it
//   themselves. The client answers without logging in, once. The answers land on the company file and the deal, the
//   timeline records them, and the person who sent the link gets a task to review them.
//   The public side sees only the company name and the questions; an admin edits the questions in Settings.

import { Router } from 'express';
import { parseBody, parseId } from '../validate.js';
import { insert, update, findById, audit, nowIso, transaction, getNumericSetting } from '../db.js';
import { badRequest, notFound, conflict } from '../http.js';
import { randomToken, requireAdmin } from '../auth.js';
import { recordInteraction } from '../timeline.js';
import { LANGUAGES, DISCOVERY_ANSWER_KINDS } from '../constants.js';

const DAY_MS = 86_400_000;
const REVIEW_TASK_DAYS = 1;
const ANSWER_MAX = { short: 300, long: 4000 };
const MOVES = ['up', 'down'];

const QUESTION_SPEC = {
  question_he: { type: 'string', required: true, max: 300 },
  question_en: { type: 'string', required: true, max: 300 },
  answer_kind: { type: 'string', required: true, enum: DISCOVERY_ANSWER_KINDS },
  required: { type: 'bool' },
  active: { type: 'bool' },
};
const REQUEST_SPEC = {
  contact_id: { type: 'id' },
  deal_id: { type: 'id' },
  language: { type: 'string', required: true, enum: LANGUAGES },
  days: { type: 'int', min: 1, max: 90 },
};
const SUBMIT_SPEC = {
  name: { type: 'string', required: true, max: 120 },
  language: { type: 'string', required: true, enum: LANGUAGES },
};

const activeQuestions = (db) => db.prepare('SELECT * FROM discovery_questions WHERE active = 1 ORDER BY position').all();

export function discoveryStatus(request, now = nowIso()) {
  if (request.revoked) return 'revoked';
  if (request.submitted_at) return 'answered';
  return request.expires_at <= now ? 'expired' : 'open';
}

/** Requests with their status and parsed answers, for the company file and the deal page. */
export function discoveryRequests(db, where, ...params) {
  return db.prepare(`SELECT r.*, u.display_name AS created_by_name, k.full_name AS contact_name, d.title AS deal_title
    FROM discovery_requests r LEFT JOIN users u ON u.id = r.created_by LEFT JOIN contacts k ON k.id = r.contact_id
    LEFT JOIN deals d ON d.id = r.deal_id WHERE ${where} ORDER BY r.created_at DESC`).all(...params)
    .map((request) => ({ ...request, status: discoveryStatus(request), answers: request.answers === null ? null : JSON.parse(request.answers) }));
}

export function discoveryRoutes(db) {
  const router = Router();

  // ------------------------------------------------------------ questions (read: everyone; write: admin)

  router.get('/discovery-questions', (req, res) => {
    res.json(db.prepare('SELECT * FROM discovery_questions ORDER BY position').all());
  });

  router.post('/discovery-questions', requireAdmin, (req, res) => {
    const values = parseBody(QUESTION_SPEC, req.body);
    const position = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS next FROM discovery_questions').get().next;
    const id = insert(db, 'discovery_questions', { ...values, required: values.required ?? 0, active: values.active ?? 1, position });
    audit(db, req.user.id, 'discovery.question_created', 'discovery_questions', id);
    res.status(201).json({ id });
  });

  router.patch('/discovery-questions/:id', requireAdmin, (req, res) => {
    const id = parseId(req.params.id);
    findById(db, 'discovery_questions', id);
    update(db, 'discovery_questions', id, { ...parseBody(QUESTION_SPEC, req.body, { partial: true }), updated_at: nowIso() });
    audit(db, req.user.id, 'discovery.question_updated', 'discovery_questions', id);
    res.json({ ok: true });
  });

  /** Swap a question with its neighbour (questions are never deleted: deactivate them instead). */
  router.post('/discovery-questions/:id/move', requireAdmin, (req, res) => {
    const question = findById(db, 'discovery_questions', parseId(req.params.id));
    const direction = parseBody({ direction: { type: 'string', required: true, enum: MOVES } }, req.body).direction;
    const neighbour = direction === 'up'
      ? db.prepare('SELECT * FROM discovery_questions WHERE position < ? ORDER BY position DESC LIMIT 1').get(question.position)
      : db.prepare('SELECT * FROM discovery_questions WHERE position > ? ORDER BY position LIMIT 1').get(question.position);
    if (!neighbour) throw badRequest(`This question is already ${direction === 'up' ? 'first' : 'last'}`);
    transaction(db, () => {
      update(db, 'discovery_questions', question.id, { position: neighbour.position });
      update(db, 'discovery_questions', neighbour.id, { position: question.position });
    });
    res.json({ ok: true });
  });

  // ------------------------------------------------------------ links (staff)

  router.get('/companies/:id/discovery', (req, res) => {
    const companyId = parseId(req.params.id);
    findById(db, 'companies', companyId);
    res.json(discoveryRequests(db, 'r.company_id = ?', companyId));
  });

  router.post('/companies/:id/discovery', (req, res) => {
    const companyId = parseId(req.params.id);
    findById(db, 'companies', companyId);
    const values = parseBody(REQUEST_SPEC, req.body);
    if (values.contact_id && findById(db, 'contacts', values.contact_id).company_id !== companyId) throw badRequest('This contact does not belong to the company');
    if (values.deal_id && findById(db, 'deals', values.deal_id).company_id !== companyId) throw badRequest('This deal does not belong to the company');
    if (activeQuestions(db).length === 0) throw conflict('The discovery form has no active questions. An admin can add them under Settings → Discovery form.');
    const days = values.days ?? getNumericSetting(db, 'share_link_days');
    const token = randomToken();
    const id = insert(db, 'discovery_requests', {
      token, company_id: companyId, deal_id: values.deal_id, contact_id: values.contact_id, language: values.language,
      expires_at: new Date(Date.now() + days * DAY_MS).toISOString(), created_by: req.user.id,
    });
    audit(db, req.user.id, 'discovery.link_created', 'discovery_requests', id);
    res.status(201).json({ id, token });
  });

  router.post('/discovery/:id/revoke', (req, res) => {
    const id = parseId(req.params.id);
    const request = findById(db, 'discovery_requests', id);
    if (discoveryStatus(request) !== 'open') throw conflict(`This link is already ${discoveryStatus(request)}`);
    update(db, 'discovery_requests', id, { revoked: 1 });
    audit(db, req.user.id, 'discovery.link_revoked', 'discovery_requests', id);
    res.json({ ok: true });
  });

  return router;
}

/** No login: the client opens the link, sees the company name and the questions, and answers once. */
export function publicDiscoveryRoutes(db) {
  const router = Router();

  function openRequest(token) {
    const request = db.prepare('SELECT * FROM discovery_requests WHERE token = ?').get(token);
    if (!request || ['revoked', 'expired'].includes(discoveryStatus(request))) throw notFound('This link is invalid, expired or has been withdrawn');
    return request;
  }

  router.get('/discovery/:token', (req, res) => {
    const request = openRequest(req.params.token);
    const company = findById(db, 'companies', request.company_id);
    if (request.submitted_at) {
      res.json({ company_name: company.name, submitted: true });
      return;
    }
    res.json({
      company_name: company.name, submitted: false, language: request.language, expires_at: request.expires_at,
      questions: activeQuestions(db).map(({ id, question_he: he, question_en: en, answer_kind: kind, required }) => ({ id, question_he: he, question_en: en, answer_kind: kind, required })),
    });
  });

  router.post('/discovery/:token', (req, res) => {
    const request = openRequest(req.params.token);
    if (request.submitted_at) throw conflict('These answers were already sent. Thank you!');
    const { answers: rawAnswers, ...rest } = req.body;
    const values = parseBody(SUBMIT_SPEC, rest);
    if (typeof rawAnswers !== 'object' || rawAnswers === null || Array.isArray(rawAnswers)) throw badRequest('answers must be an object');
    const questions = activeQuestions(db);
    const unknown = Object.keys(rawAnswers).filter((key) => !questions.some((question) => String(question.id) === key));
    if (unknown.length > 0) throw badRequest('The form has changed. Please reload the page and send your answers again.');
    const answers = questions.flatMap((question) => {
      const raw = rawAnswers[question.id];
      const answer = typeof raw === 'string' ? raw.trim() : '';
      if (raw !== undefined && typeof raw !== 'string') throw badRequest(`Answer ${question.id} must be text`);
      if (question.required && answer === '') throw badRequest(`Please answer: ${values.language === 'he' ? question.question_he : question.question_en}`);
      if (answer.length > ANSWER_MAX[question.answer_kind]) throw badRequest(`An answer is longer than ${ANSWER_MAX[question.answer_kind]} characters`);
      return answer === '' ? [] : [{ question: values.language === 'he' ? question.question_he : question.question_en, answer }];
    });

    transaction(db, () => {
      const submittedAt = nowIso();
      update(db, 'discovery_requests', request.id, {
        submitted_at: submittedAt, submitted_name: values.name, submitted_language: values.language, answers: JSON.stringify(answers),
      });
      recordInteraction(db, {
        company_id: request.company_id, deal_id: request.deal_id, contact_id: request.contact_id, channel: 'note', direction: 'inbound',
        summary: `Discovery form answered by ${values.name}`, occurred_at: submittedAt, user_id: null,
      });
      const sender = findById(db, 'users', request.created_by);
      insert(db, 'tasks', {
        company_id: request.company_id, assignee: sender.display_name,
        due_date: new Date(Date.now() + REVIEW_TASK_DAYS * DAY_MS).toISOString().slice(0, 10),
        description: `Review the discovery answers from ${findById(db, 'companies', request.company_id).name} (${values.name})`,
      });
      audit(db, null, 'discovery.answered', 'discovery_requests', request.id, values.name);
    });
    res.json({ ok: true });
  });

  return router;
}
