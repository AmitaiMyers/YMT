// The lead journey (25.11.2026): where a research card stands in YMT's flow and the one next action that moves it on.
// Agent finds it → review → approved → first message → waiting for a reply → replied → meeting → deal closed.
// Read-only: derived from cards, messages, replies, meetings and deals, so it never goes out of sync.

import { CONVERSATION_KINDS } from '../constants.js';
import { followupState } from '../conversations.js';

const REVIEW_STATUSES = ['draft', 'needs_review', 'manual_assignment', 'verify'];
const OPEN_MESSAGE = ['pending', 'approved'];
// A reply that ends the conversation: the next step is to close the deal (as lost).
const CLOSING_REPLIES = ['not_interested', 'opt_out'];
// Deal stages that mean the talks moved on even when no meeting is logged (e.g. a lead imported from another tracker).
const TALKING_STAGES = ['call', 'meeting'];
const CLOSING_STAGES = ['proposal', 'contract'];

function latest(rows, field) {
  return rows.reduce((best, row) => (best === null || row[field] > best[field] ? row : best), null);
}

/**
 * Before the first message: write it when a saved contact can be reached; choose a contact when the agent found a person
 * with a route or the company's general email/phone (or is still searching); otherwise nobody can be reached yet.
 */
function reachKind(db, opportunity) {
  const reachableContact = db.prepare(`SELECT 1 FROM contacts WHERE company_id = ? AND opted_out_at IS NULL
    AND (email IS NOT NULL OR linkedin_url IS NOT NULL OR phone IS NOT NULL)`).get(opportunity.company_id);
  if (reachableContact) return 'draft_message';
  const search = db.prepare('SELECT status FROM contact_searches WHERE opportunity_id = ?').get(opportunity.id);
  const searching = search !== undefined && ['queued', 'running'].includes(search.status);
  const proposal = db.prepare(`SELECT 1 FROM contact_proposals WHERE opportunity_id = ? AND status = 'proposed'
    AND (email IS NOT NULL OR linkedin_url IS NOT NULL)`).get(opportunity.id);
  const company = db.prepare('SELECT general_email, general_phone FROM companies WHERE id = ?').get(opportunity.company_id);
  return searching || proposal || company.general_email || company.general_phone ? 'pick_contact' : 'find_route';
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

  if (deal && CLOSING_STAGES.includes(deal.stage)) return { stage: 'meeting', since: deal.stage_changed_at, next: { kind: 'close', deal_id: dealId } };
  if (deal && TALKING_STAGES.includes(deal.stage)) return { stage: 'meeting', since: deal.stage_changed_at, next: { kind: 'schedule', contact_id: null, deal_id: dealId } };

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
  return { stage: 'approved', since: opportunity.decided_at, next: { kind: reachKind(db, opportunity) } };
}
