// Release 4 API: conversations after a first approach (replies, answers, follow-ups), the approved answers library
// and the owner's Gmail check.

import { Router } from 'express';
import { parseBody, parseId, parseOptionalEnum } from '../validate.js';
import { findById, insert, update, removeById, audit, nowIso } from '../db.js';
import { badRequest, conflict } from '../http.js';
import { requireAdmin } from '../auth.js';
import { assertCanSee, isAdmin } from '../research/access.js';
import {
  firstApproachOf, conversationView, conversationRows, saveReply, analyzeReply, decideOptOut, markReplyHandled, draftFollowup,
} from '../conversations.js';
import { syncGmailReplies } from '../gmailReplies.js';
import { tryGoogle } from '../calendarSync.js';
import { OUTREACH_CHANNELS, LANGUAGES, CONVERSATION_VIEWS } from '../constants.js';

const DRAFT_MODES = ['ai', 'blank'];
const OPT_OUT_DECISIONS = ['confirm', 'dismiss'];

const REPLY_SPEC = {
  channel: { type: 'string', required: true, enum: OUTREACH_CHANNELS },
  body: { type: 'text', required: true, max: 8000 },
  received_at: { type: 'datetime', required: true },
};
const FOLLOWUP_SPEC = { mode: { type: 'string', required: true, enum: DRAFT_MODES } };
const OPT_OUT_SPEC = { decision: { type: 'string', required: true, enum: OPT_OUT_DECISIONS } };
const ANSWER_SPEC = {
  language: { type: 'string', required: true, enum: LANGUAGES },
  title: { type: 'string', required: true, max: 120 },
  body: { type: 'text', required: true, max: 3000 },
  active: { type: 'bool' },
};

export function conversationRoutes(db, { ai, google }) {
  const router = Router();

  /** The person's conversation exists once a first approach was sent; its card's owner (or an admin) may act on it. */
  function assertConversation(req, contactId) {
    assertCanSee(req.user, findById(db, 'opportunities', firstApproachOf(db, contactId).opportunity_id));
  }

  function replyFor(req) {
    const reply = findById(db, 'replies', parseId(req.params.id));
    assertConversation(req, reply.contact_id);
    return reply;
  }

  router.get('/conversations', (req, res) => {
    const view = parseOptionalEnum(req.query.view, 'view', CONVERSATION_VIEWS) ?? 'needs_answer';
    const all = req.query.owner === 'all';
    if (all && !isAdmin(req.user)) throw badRequest('Only an admin can see every owner\'s conversations');
    const rows = conversationRows(db, req.user, { all });
    res.json(view === 'all' ? rows : rows.filter((row) => row[view]));
  });

  router.get('/conversations/counts', (req, res) => {
    const rows = conversationRows(db, req.user, { all: false });
    res.json({ needs_answer: rows.filter((row) => row.needs_answer).length, followup_due: rows.filter((row) => row.followup_due).length });
  });

  router.get('/conversations/:contactId', (req, res) => {
    const contactId = parseId(req.params.contactId);
    assertConversation(req, contactId);
    res.json(conversationView(db, ai, contactId));
  });

  /** The owner pastes a reply (any channel); it is analysed right away and an answer is drafted when possible. */
  router.post('/conversations/:contactId/replies', async (req, res) => {
    const contactId = parseId(req.params.contactId);
    assertConversation(req, contactId);
    const values = parseBody(REPLY_SPEC, req.body);
    if (values.received_at > nowIso()) throw badRequest('received_at is in the future');
    const id = saveReply(db, req.user, contactId, { channel: values.channel, body: values.body, receivedAt: values.received_at, source: 'pasted' });
    await analyzeReply(db, ai, id);
    res.status(201).json(findById(db, 'replies', id));
  });

  router.post('/replies/:id/analyze', async (req, res) => {
    const reply = replyFor(req);
    await analyzeReply(db, ai, reply.id);
    res.json(findById(db, 'replies', reply.id));
  });

  router.post('/replies/:id/opt-out', (req, res) => {
    const reply = replyFor(req);
    decideOptOut(db, req.user, reply.id, parseBody(OPT_OUT_SPEC, req.body).decision);
    res.json({ ok: true });
  });

  router.post('/replies/:id/handled', (req, res) => {
    const reply = replyFor(req);
    markReplyHandled(db, req.user, reply.id);
    res.json({ ok: true });
  });

  router.post('/conversations/:contactId/followup', async (req, res) => {
    const contactId = parseId(req.params.contactId);
    assertConversation(req, contactId);
    const id = await draftFollowup(db, ai, req.user, contactId, parseBody(FOLLOWUP_SPEC, req.body).mode);
    res.status(201).json({ id });
  });

  /** Check my Gmail for replies now (the server also checks every 15 minutes). */
  router.post('/gmail/sync', async (req, res) => {
    if (!google) throw badRequest('Google is not set up on this server');
    const result = await tryGoogle(() => syncGmailReplies(db, google, ai, req.user.id));
    if (!result.ok) {
      db.prepare('UPDATE google_accounts SET gmail_error = ? WHERE user_id = ?').run(result.message, req.user.id);
      throw conflict(result.message);
    }
    res.json(result.value);
  });

  // ------------------------------------------------------------ approved answers (read: everyone; write: admin)

  router.get('/approved-answers', (req, res) => {
    res.json(db.prepare(`SELECT a.*, u.display_name AS updated_by_name FROM approved_answers a LEFT JOIN users u ON u.id = a.updated_by
      ORDER BY a.language, a.title`).all());
  });

  router.post('/approved-answers', requireAdmin, (req, res) => {
    const values = parseBody(ANSWER_SPEC, req.body);
    const id = insert(db, 'approved_answers', { ...values, active: values.active ?? 1, updated_by: req.user.id });
    audit(db, req.user.id, 'answer.created', 'approved_answers', id, values.title);
    res.status(201).json({ id });
  });

  router.patch('/approved-answers/:id', requireAdmin, (req, res) => {
    const id = parseId(req.params.id);
    findById(db, 'approved_answers', id);
    update(db, 'approved_answers', id, { ...parseBody(ANSWER_SPEC, req.body, { partial: true }), updated_by: req.user.id, updated_at: nowIso() });
    audit(db, req.user.id, 'answer.updated', 'approved_answers', id);
    res.json({ ok: true });
  });

  router.delete('/approved-answers/:id', requireAdmin, (req, res) => {
    const id = parseId(req.params.id);
    removeById(db, 'approved_answers', id);
    audit(db, req.user.id, 'answer.deleted', 'approved_answers', id);
    res.json({ ok: true });
  });

  return router;
}
