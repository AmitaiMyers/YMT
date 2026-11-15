// The human approval queue. The ONLY way generated text can leave the system is:
//   pending → approved (by a staff member) → marked sent (by a staff member, one item at a time).
// There is deliberately no bulk send and no automatic dispatch anywhere in the codebase.

import { insert, update, findById, audit, nowIso, transaction, getNumericSetting } from './db.js';
import { badRequest, conflict } from './http.js';
import { recordInteraction } from './timeline.js';

import { EMAIL_KINDS } from './constants.js';

export function enqueueApproval(db, userId, item) {
  const id = insert(db, 'approvals', { ...item, original_content: item.content, created_by: userId, status: 'pending' });
  audit(db, userId, 'approval.created', 'approvals', id, item.kind);
  return id;
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
  if (EMAIL_KINDS.includes(approval.kind) && !approval.recipient_email) {
    throw badRequest('Set a recipient email before approving an email draft');
  }
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
 * A staff member confirms they personally sent this approved message (from their own mailbox / LinkedIn).
 * The system records the touchpoint in the timeline; it never sends anything itself.
 */
export function markSent(db, userId, id) {
  const approval = findById(db, 'approvals', id);
  if (!EMAIL_KINDS.includes(approval.kind)) throw badRequest('Only email drafts can be marked as sent');
  requireStatus(approval, 'approved', 'mark as sent');

  transaction(db, () => {
    const sentAt = nowIso();
    update(db, 'approvals', id, { status: 'sent', sent_by: userId, sent_at: sentAt });
    recordInteraction(db, {
      company_id: approval.company_id,
      deal_id: approval.deal_id,
      contact_id: approval.contact_id,
      channel: 'email',
      direction: 'outbound',
      summary: approval.subject ?? approval.kind,
      occurred_at: sentAt,
      user_id: userId,
    });
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
