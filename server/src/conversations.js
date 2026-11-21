// Release 4: the conversation with one person after their first approach was sent.
//   - A reply (pasted by the owner, or read from the owner's Gmail) is stored first, then analysed by the AI: classified,
//     summarised, opt-out flagged, missing information turned into a task, and an answer drafted into the approval queue.
//     The AI may use only the card, the conversation and YMT's approved answers.
//   - Opt-out words in a reply make the opt-out "pending": nothing more can be approved to that person until the owner
//     confirms it (do-not-contact list) or dismisses it.
//   - No reply after `followup_after_days`: a follow-up on the same channel, up to `max_followups`, with the legal gate.
// A failed AI step never loses a reply: the error is stored on it and the owner can analyse it again.

import { findById, insert, update, audit, nowIso, transaction, getNumericSetting } from './db.js';
import { badRequest, conflict } from './http.js';
import { SELECT_APPROVALS } from './approvalQueue.js';
import { assertMayContact, contactChannelProblem, composeMessage, hasPendingOptOut, ADVERTISEMENT_MARK } from './outreachRules.js';
import { loadAcceptedCard, proposedServiceFor, queueMessage, applyOptOut } from './outreach.js';
import { outreachRequest, parseDraft, replyRequest, parseReplyAnalysis, InvalidResultError } from './research/tasks.js';
import { AiError } from './ai/service.js';
import { CONVERSATION_KINDS, OUTREACH_CHANNELS } from './constants.js';

const DAY_MS = 86_400_000;
const MISSING_TASK_DAYS = 2;
const MAX_REPLY_LENGTH = 8000;
// Plain words that ask to stop, in English and Hebrew. The AI also looks for opt-outs in any wording.
const OPT_OUT_PATTERNS = [/\bunsubscribe\b/i, /\bremove me\b/i, /\btake me off\b/i, /\bopt[\s-]?out\b/i, /\bdo not (contact|email|write)\b/i,
  /\bdon'?t (contact|email|write)\b/i, /\bstop (contacting|emailing|writing|messaging)\b/i, /הסר/, /הסיר/, /אל תפנו/, /לא לפנות/, /תפסיקו/];

export function hasOptOutWords(text) {
  return OPT_OUT_PATTERNS.some((pattern) => pattern.test(text));
}

const sentOutbound = (db, contactId) => db.prepare(`SELECT * FROM approvals WHERE contact_id = ? AND status = 'sent'
  AND kind IN (${CONVERSATION_KINDS.map(() => '?').join(', ')}) ORDER BY sent_at`).all(contactId, ...CONVERSATION_KINDS);

/** The sent first approach that opened the conversation with this person. */
export function firstApproachOf(db, contactId) {
  const first = db.prepare("SELECT * FROM approvals WHERE contact_id = ? AND kind = 'first_approach' AND status = 'sent' ORDER BY id DESC LIMIT 1").get(contactId);
  if (!first) throw conflict('No first approach was sent to this person yet');
  return first;
}

function withoutMark(subject) {
  return (subject ?? '').replace(new RegExp(`^${ADVERTISEMENT_MARK}:?\\s*`), '').replace(/^(Re:\s*)+/i, '');
}

function ownerOf(db, card) {
  return findById(db, 'users', card.owner_id);
}

/** Messages in time order, as the AI and the screen see them. */
function timeline(db, contactId) {
  const outbound = sentOutbound(db, contactId).map((message) => ({ at: message.sent_at, from: 'YMT', channel: message.channel, text: message.content }));
  const inbound = db.prepare('SELECT * FROM replies WHERE contact_id = ? ORDER BY received_at').all(contactId)
    .map((reply) => ({ at: reply.received_at, from: 'Them', channel: reply.channel, text: reply.body, replyId: reply.id }));
  return [...outbound, ...inbound].sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * What came before a reply: their earlier replies (by received time) and every message we had sent when the reply was
 * saved (received times are typed by hand to the minute, so they cannot order our messages reliably).
 */
function conversationBefore(db, reply) {
  return timeline(db, reply.contact_id).filter((message) => (message.from === 'YMT'
    ? message.at <= reply.created_at
    : message.replyId !== reply.id && message.at <= reply.received_at));
}

// ------------------------------------------------------------------ follow-ups

/**
 * Whether a follow-up is due: only while the person never replied, nothing is waiting in the queue, the limit is not
 * reached, and `followup_after_days` passed since the last message we sent.
 */
export function followupState(db, contactId, now = new Date()) {
  const sent = sentOutbound(db, contactId);
  const last = sent.at(-1);
  const replied = db.prepare('SELECT 1 FROM replies WHERE contact_id = ?').get(contactId) !== undefined;
  const open = db.prepare(`SELECT 1 FROM approvals WHERE contact_id = ? AND status IN ('pending', 'approved') AND kind != 'company_brief'`).get(contactId) !== undefined;
  const done = sent.filter((message) => message.kind === 'approach_followup').length;
  const max = getNumericSetting(db, 'max_followups');
  const dueAt = new Date(Date.parse(last.sent_at) + getNumericSetting(db, 'followup_after_days') * DAY_MS).toISOString();
  const blocker = replied ? 'replied' : open ? 'in_queue' : done >= max ? 'limit' : null;
  return { due: blocker === null && dueAt <= now.toISOString(), blocker, due_at: dueAt, number: done + 1, max, last_sent_at: last.sent_at };
}

export async function draftFollowup(db, ai, user, contactId, mode, now = new Date()) {
  const first = firstApproachOf(db, contactId);
  const card = loadAcceptedCard(db, first.opportunity_id);
  const contact = findById(db, 'contacts', contactId);
  const assertDue = () => {
    const state = followupState(db, contactId, now);
    if (state.blocker === 'replied') throw conflict('This person replied: answer the reply instead of following up');
    if (state.blocker === 'in_queue') throw conflict('A message to this person is already waiting in the approval queue');
    if (state.blocker === 'limit') throw conflict(`The follow-up limit (${state.max}) for this person is reached`);
    if (!state.due) throw conflict(`A follow-up is due from ${state.due_at.slice(0, 10)}`);
    assertMayContact(db, findById(db, 'contacts', contactId), first.channel);
    return state;
  };
  const state = assertDue();
  let body = '';
  if (mode === 'ai') {
    const request = outreachRequest({
      card, contact, channel: first.channel,
      company: findById(db, 'companies', card.company_id),
      language: contact.preferred_language,
      senderName: user.display_name,
      proposedService: proposedServiceFor(db, card),
      followup: { number: state.number, previous: sentOutbound(db, contactId) },
    });
    body = parseDraft((await ai.call('outreach', request)).input, first.channel).body;
    assertDue();
  }
  const subject = first.channel === 'email' ? `Re: ${withoutMark(first.subject)}` : null;
  const message = composeMessage(db, { contact, channel: first.channel, language: contact.preferred_language, subject, body });
  return queueMessage(db, user, { kind: 'approach_followup', channel: first.channel, card, contact, subject: message.subject, content: message.content });
}

// ------------------------------------------------------------------ replies

/** Store a reply. Opt-out words make it pending at once, before (and regardless of) the AI analysis. */
export function saveReply(db, user, contactId, { channel, body, subject = null, receivedAt, source, gmailMessageId = null }) {
  if (!OUTREACH_CHANNELS.includes(channel)) throw badRequest(`Unknown channel: ${channel}`);
  const first = firstApproachOf(db, contactId);
  const text = body.trim().slice(0, MAX_REPLY_LENGTH);
  if (text === '') throw badRequest('The reply is empty');
  const lastSent = sentOutbound(db, contactId).filter((message) => message.sent_at <= receivedAt).at(-1) ?? first;
  const id = insert(db, 'replies', {
    contact_id: contactId, company_id: first.company_id, in_reply_to: lastSent.id, channel, source, gmail_message_id: gmailMessageId,
    subject, body: text, received_at: receivedAt, opt_out_state: hasOptOutWords(text) ? 'pending' : 'none', created_by: user ? user.id : null,
  });
  // A follow-up still waiting would ignore what the person just wrote.
  db.prepare(`UPDATE approvals SET status = 'rejected', review_note = 'The person replied', reviewed_at = ?
    WHERE contact_id = ? AND kind = 'approach_followup' AND status IN ('pending', 'approved')`).run(nowIso(), contactId);
  audit(db, user ? user.id : null, 'reply.received', 'replies', id, `${source}:${channel}`);
  return id;
}

function recordAnalysisError(db, replyId, message) {
  update(db, 'replies', replyId, { analysis_error: message });
}

/** Analyse a reply and draft the answer. AI problems are stored on the reply (shown with "Analyse again"). */
export async function analyzeReply(db, ai, replyId) {
  const reply = findById(db, 'replies', replyId);
  const problem = ai.problem('reply');
  if (problem) {
    recordAnalysisError(db, replyId, problem);
    return;
  }
  const first = firstApproachOf(db, reply.contact_id);
  const card = loadAcceptedCard(db, first.opportunity_id);
  const contact = findById(db, 'contacts', reply.contact_id);
  const owner = ownerOf(db, card);
  const request = replyRequest({
    card: { ...card, proposed_service: proposedServiceFor(db, card) ?? card.proposed_service },
    company: findById(db, 'companies', card.company_id),
    contact, channel: reply.channel, language: contact.preferred_language, senderName: owner.display_name,
    conversation: conversationBefore(db, reply),
    reply,
    answers: db.prepare('SELECT language, title, body FROM approved_answers WHERE active = 1 ORDER BY language, title').all(),
  });
  const outcome = await ai.call('reply', request)
    .then((result) => parseReplyAnalysis(result.input, reply.channel))
    .then((analysis) => ({ analysis }), (error) => {
      if (error instanceof AiError || error instanceof InvalidResultError) return { error: error.message };
      throw error;
    });
  if (outcome.error) {
    recordAnalysisError(db, replyId, outcome.error);
    return;
  }
  applyAnalysis(db, reply, { card, contact, owner, first, analysis: outcome.analysis });
}

function applyAnalysis(db, reply, { card, contact, owner, first, analysis }) {
  transaction(db, () => {
    const optOutState = analysis.optOut && reply.opt_out_state === 'none' ? 'pending' : reply.opt_out_state;
    update(db, 'replies', reply.id, {
      classification: analysis.classification, summary: analysis.summary, missing: JSON.stringify(analysis.missing),
      analysis_error: null, opt_out_state: optOutState,
    });
    if (analysis.missing.length > 0) {
      const due = new Date(Date.now() + MISSING_TASK_DAYS * DAY_MS).toISOString().slice(0, 10);
      insert(db, 'tasks', {
        company_id: card.company_id, assignee: owner.display_name, due_date: due,
        description: `Reply from ${contact.full_name} – find out: ${analysis.missing.join('; ')}`,
      });
    }
    // A new analysis replaces an answer draft that is still waiting; approved or sent ones are kept.
    db.prepare(`UPDATE approvals SET status = 'rejected', review_note = 'Replaced by a new draft', reviewed_at = ?
      WHERE reply_id = ? AND status = 'pending'`).run(nowIso(), reply.id);
    if (analysis.draft && optOutState !== 'pending') {
      const subject = reply.channel === 'email' ? analysis.draft.subject ?? `Re: ${withoutMark(reply.subject ?? first.subject)}` : null;
      queueMessage(db, owner, { kind: 'reply', channel: reply.channel, card, contact, subject, content: analysis.draft.body, replyId: reply.id });
    }
  });
}

/** The owner decides on a possible opt-out: confirm (do-not-contact list, waiting messages withdrawn) or dismiss. */
export function decideOptOut(db, user, replyId, decision) {
  const reply = findById(db, 'replies', replyId);
  if (reply.opt_out_state !== 'pending') throw conflict('This reply has no opt-out waiting for a decision');
  transaction(db, () => {
    if (decision === 'confirm') {
      if (!findById(db, 'contacts', reply.contact_id).opted_out_at) applyOptOut(db, user, reply.contact_id, `Reply of ${reply.received_at.slice(0, 10)}`);
      update(db, 'replies', replyId, { opt_out_state: 'confirmed' });
      // Nothing more will be sent to this person, so none of their replies is waiting for an answer any more.
      db.prepare(`UPDATE replies SET status = 'handled', handled_by = ?, handled_at = ? WHERE contact_id = ? AND status = 'new'`)
        .run(user.id, nowIso(), reply.contact_id);
    } else {
      update(db, 'replies', replyId, { opt_out_state: 'dismissed' });
    }
    audit(db, user.id, `reply.opt_out_${decision}ed`, 'replies', replyId);
  });
}

export function markReplyHandled(db, user, replyId) {
  const reply = findById(db, 'replies', replyId);
  if (reply.opt_out_state === 'pending') throw conflict('Confirm or dismiss the opt-out first');
  update(db, 'replies', replyId, { status: 'handled', handled_by: user.id, handled_at: nowIso() });
}

// ------------------------------------------------------------------ screens

/** Everything the conversation page shows for one person. */
export function conversationView(db, ai, contactId, now = new Date()) {
  const first = firstApproachOf(db, contactId);
  const contact = findById(db, 'contacts', contactId);
  const replies = db.prepare('SELECT * FROM replies WHERE contact_id = ? ORDER BY received_at').all(contactId)
    .map((reply) => ({ ...reply, missing: JSON.parse(reply.missing) }));
  const messages = db.prepare(`${SELECT_APPROVALS} WHERE a.contact_id = ? AND a.kind IN (${CONVERSATION_KINDS.map(() => '?').join(', ')})
    ORDER BY a.id`).all(contactId, ...CONVERSATION_KINDS);
  return {
    contact: { ...contact, channel_problem: contactChannelProblem(db, contact, first.channel) },
    company: findById(db, 'companies', contact.company_id),
    opportunity_id: first.opportunity_id,
    channel: first.channel,
    messages,
    replies,
    followup: followupState(db, contactId, now),
    opt_out_pending: hasPendingOptOut(db, contactId),
    ai_problem: ai.problem('reply') ?? ai.problem('outreach'),
  };
}

/** One row per person approached, for the Conversations list (an owner sees their own cards; admins see all). */
export function conversationRows(db, user, { all }, now = new Date()) {
  const rows = db.prepare(`SELECT a.contact_id, a.channel, a.sent_at AS first_sent_at, a.opportunity_id, k.full_name, k.job_title,
      k.opted_out_at, c.id AS company_id, c.name AS company_name, o.owner_id, u.display_name AS owner_name
    FROM approvals a JOIN contacts k ON k.id = a.contact_id JOIN companies c ON c.id = k.company_id
    JOIN opportunities o ON o.id = a.opportunity_id LEFT JOIN users u ON u.id = o.owner_id
    WHERE a.kind = 'first_approach' AND a.status = 'sent' ${all ? '' : 'AND o.owner_id = ?'} ORDER BY a.sent_at DESC`)
    .all(...(all ? [] : [user.id]));
  const lastReply = db.prepare('SELECT received_at, classification, summary FROM replies WHERE contact_id = ? ORDER BY received_at DESC LIMIT 1');
  const newReplies = db.prepare("SELECT COUNT(*) AS n FROM replies WHERE contact_id = ? AND status = 'new'");
  return rows.map((row) => {
    const followup = followupState(db, row.contact_id, now);
    const pending = hasPendingOptOut(db, row.contact_id);
    const fresh = newReplies.get(row.contact_id).n;
    return {
      ...row,
      last_reply: lastReply.get(row.contact_id) ?? null,
      new_replies: fresh,
      opt_out_pending: pending,
      followup,
      needs_answer: fresh > 0 || pending,
      followup_due: followup.due && row.opted_out_at === null && !pending,
    };
  });
}
