// The lead journey (25.11.2026): where a research card stands in YMT's flow and the one next action that moves it on.
// Agent finds it → review → approved → first message → waiting for a reply → replied → meeting → deal closed.
// Read-only: derived from cards, messages, replies, meetings and deals, so it never goes out of sync.

import { CONVERSATION_KINDS } from '../constants.js';
import { followupState } from '../conversations.js';

const REVIEW_STATUSES = ['draft', 'needs_review', 'manual_assignment', 'verify'];
const OPEN_MESSAGE = ['pending', 'approved'];
// A reply that ends the conversation: the next step is to close the deal (as lost).
const CLOSING_REPLIES = ['not_interested', 'opt_out'];

function latest(rows, field) {
  return rows.reduce((best, row) => (best === null || row[field] > best[field] ? row : best), null);
}

/**
 * @returns {{ stage: string, since: string, next: { kind: string, [key: string]: unknown } } | null}
 *   null for cards that left the flow (rejected or deferred)
 */
export function journeyFor(db, opportunity, now = new Date()) {
  if (opportunity.status === 'rejected' || opportunity.status === 'deferred') return null;
  if (REVIEW_STATUSES.includes(opportunity.status)) {
    return { stage: 'review', since: opportunity.created_at, next: { kind: opportunity.status === 'manual_assignment' ? 'assign' : 'decide' } };
  }

  const deal = db.prepare('SELECT * FROM deals WHERE opportunity_id = ?').get(opportunity.id) ?? null;
  if (deal && deal.status !== 'open') {
    return { stage: 'closed', since: deal.closed_at ?? deal.created_at, next: { kind: 'done', outcome: deal.status, deal_id: deal.id } };
  }
  const dealId = deal ? deal.id : null;

  const meetings = db.prepare(`SELECT * FROM meetings WHERE status != 'cancelled'
    AND (deal_id = ? OR (company_id = ? AND created_at >= ?))`).all(dealId, opportunity.company_id, opportunity.decided_at);
  if (meetings.length > 0) {
    const meeting = latest(meetings, 'scheduled_at');
    if (meeting.status === 'done') return { stage: 'meeting', since: meeting.scheduled_at, next: { kind: 'close', deal_id: dealId } };
    const upcoming = meeting.scheduled_at > now.toISOString();
    return {
      stage: 'meeting',
      since: meeting.created_at,
      next: upcoming ? { kind: 'meeting_upcoming', meeting_id: meeting.id, at: meeting.scheduled_at } : { kind: 'summarize', meeting_id: meeting.id },
    };
  }

  const messages = db.prepare(`SELECT id, kind, status, contact_id, created_at, sent_at FROM approvals WHERE opportunity_id = ?
    AND kind IN (${CONVERSATION_KINDS.map(() => '?').join(', ')})`).all(opportunity.id, ...CONVERSATION_KINDS);
  const open = latest(messages.filter((message) => OPEN_MESSAGE.includes(message.status)), 'created_at');
  const sendNext = open ? { kind: 'send', approval_id: open.id, message_kind: open.kind, approved: open.status === 'approved' } : null;
  const sent = messages.filter((message) => message.status === 'sent');
  const contactIds = [...new Set(sent.map((message) => message.contact_id))];

  const replies = contactIds.length === 0 ? [] : db.prepare(`SELECT id, contact_id, status, classification, received_at FROM replies
    WHERE contact_id IN (${contactIds.map(() => '?').join(', ')})`).all(...contactIds);
  if (replies.length > 0) {
    const reply = latest(replies, 'received_at');
    const unanswered = replies.find((row) => row.status === 'new');
    const next = sendNext
      ?? (unanswered ? { kind: 'answer', contact_id: unanswered.contact_id }
        : CLOSING_REPLIES.includes(reply.classification) ? { kind: 'close', deal_id: dealId, suggested: 'lost' }
          : { kind: 'schedule', contact_id: reply.contact_id, deal_id: dealId });
    return { stage: 'replied', since: reply.received_at, next };
  }

  if (sent.length > 0) {
    const last = latest(sent, 'sent_at');
    if (sendNext) return { stage: 'waiting', since: last.sent_at, next: sendNext };
    const followup = followupState(db, last.contact_id, now);
    return {
      stage: 'waiting',
      since: last.sent_at,
      next: followup.due
        ? { kind: 'followup', contact_id: last.contact_id, number: followup.number }
        : { kind: 'wait', contact_id: last.contact_id, due_at: followup.blocker === 'limit' ? null : followup.due_at },
    };
  }

  if (sendNext) return { stage: 'message', since: open.created_at, next: sendNext };
  const confirmed = db.prepare('SELECT COUNT(*) AS n FROM contacts WHERE company_id = ? AND opted_out_at IS NULL').get(opportunity.company_id).n;
  return { stage: 'approved', since: opportunity.decided_at, next: { kind: confirmed > 0 ? 'draft_message' : 'pick_contact' } };
}
