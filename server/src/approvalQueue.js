// The human approval queue. The ONLY way generated text can leave the system is:
//   pending → approved (by a staff member) → marked sent (by a staff member, one item at a time).
// There is deliberately no bulk send and no automatic dispatch anywhere in the codebase.

import { insert, update, findById, audit, nowIso, transaction, getNumericSetting } from './db.js';
import { badRequest, conflict } from './http.js';
import { recordInteraction } from './timeline.js';
import { assertRecipientAllowed, assertMessageCompliant, ADVERTISEMENT_MARK } from './outreachRules.js';
import { MESSAGE_KINDS } from './constants.js';

/** Approval rows with the names a reviewer needs. */
export const SELECT_APPROVALS = `
  SELECT a.*, c.name AS company_name, k.full_name AS contact_name, d.title AS deal_title,
    cu.display_name AS created_by_name, ru.display_name AS reviewed_by_name, su.display_name AS sent_by_name
  FROM approvals a
  LEFT JOIN companies c ON c.id = a.company_id
  LEFT JOIN contacts k ON k.id = a.contact_id
  LEFT JOIN deals d ON d.id = a.deal_id
  LEFT JOIN users cu ON cu.id = a.created_by
  LEFT JOIN users ru ON ru.id = a.reviewed_by
  LEFT JOIN users su ON su.id = a.sent_by`;

export function enqueueApproval(db, userId, item) {
  const id = insert(db, 'approvals', { ...item, original_content: item.content, created_by: userId, status: 'pending' });
  audit(db, userId, 'approval.created', 'approvals', id, item.kind);
  return id;
}

/** Timeline summary for a message without a subject (LinkedIn, WhatsApp): its first real line. */
function firstLine(content) {
  const SUMMARY_MAX = 200;
  return content.split('\n').map((line) => line.trim()).find((line) => line !== '' && line !== ADVERTISEMENT_MARK).slice(0, SUMMARY_MAX);
}

function requireStatus(approval, expected, action) {
  if (approval.status !== expected) {
    throw conflict(`Cannot ${action}: item is "${approval.status}", expected "${expected}"`);
  }
}

export function editPendingApproval(db, userId, id, changes) {
  const approval = findById(db, 'approvals', id);
  requireStatus(approval, 'pending', 'edit');
  update(db, 'approvals', id, changes);
  audit(db, userId, 'approval.edited', 'approvals', id);
}

export function approve(db, userId, id, note) {
  const approval = findById(db, 'approvals', id);
  requireStatus(approval, 'pending', 'approve');
  assertRecipientAllowed(db, approval);
  assertMessageCompliant(db, approval);
  transaction(db, () => {
    update(db, 'approvals', id, { status: 'approved', reviewed_by: userId, reviewed_at: nowIso(), review_note: note });
    // An approved brief becomes the company's official brief; it is internal and never "sent".
    if (approval.kind === 'company_brief') {
      update(db, 'companies', approval.company_id, { approved_brief: approval.content, updated_at: nowIso() });
    }
    audit(db, userId, 'approval.approved', 'approvals', id);
  });
}

export function reject(db, userId, id, note) {
  const approval = findById(db, 'approvals', id);
  requireStatus(approval, 'pending', 'reject');
  update(db, 'approvals', id, { status: 'rejected', reviewed_by: userId, reviewed_at: nowIso(), review_note: note });
  audit(db, userId, 'approval.rejected', 'approvals', id);
}

/** Count follow-ups already sent or in the queue for a deal (used to enforce the touchpoint cap). */
export function followupsCommitted(db, dealId) {
  const deal = findById(db, 'deals', dealId);
  const queued = db.prepare(`SELECT COUNT(*) AS n FROM approvals
    WHERE deal_id = ? AND kind = 'followup_email' AND status IN ('pending', 'approved')`).get(dealId).n;
  return deal.followups_sent + queued;
}

/**
 * A staff member confirms they personally sent this approved message (from their own mailbox, LinkedIn or WhatsApp).
 * The system records the touchpoint in the timeline; it never sends anything itself. An opt-out that arrived after
 * the approval still blocks it.
 */
export function markSent(db, userId, id) {
  const approval = findById(db, 'approvals', id);
  if (!MESSAGE_KINDS.includes(approval.kind)) throw badRequest('Only messages can be marked as sent');
  requireStatus(approval, 'approved', 'mark as sent');
  assertRecipientAllowed(db, approval);

  transaction(db, () => {
    const sentAt = nowIso();
    update(db, 'approvals', id, { status: 'sent', sent_by: userId, sent_at: sentAt });
    recordInteraction(db, {
      company_id: approval.company_id,
      deal_id: approval.deal_id,
      contact_id: approval.contact_id,
      channel: approval.channel,
      direction: 'outbound',
      summary: approval.subject ?? firstLine(approval.content),
      occurred_at: sentAt,
      user_id: userId,
    });
    if (approval.reply_id) {
      update(db, 'replies', approval.reply_id, { status: 'handled', handled_by: userId, handled_at: sentAt });
    }
    if (approval.kind === 'followup_email') {
      const deal = findById(db, 'deals', approval.deal_id);
      if (deal.followups_sent >= getNumericSetting(db, 'max_followups')) {
        throw conflict('Follow-up limit for this lead has been reached');
      }
      update(db, 'deals', deal.id, { followups_sent: deal.followups_sent + 1 });
    }
    audit(db, userId, 'approval.marked_sent', 'approvals', id);
  });
}
