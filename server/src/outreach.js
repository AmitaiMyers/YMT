// Release 3: the first approach to a confirmed decision maker of an accepted research card.
// The AI only drafts. The draft lands in the approval queue with the opt-out sentence and the legal marking already
// in place; the owner edits it, approves it, sends it from their own mail app / LinkedIn / WhatsApp and marks it sent.

import { findById, insert, update, audit, nowIso, transaction } from './db.js';
import { badRequest, conflict, notFound } from './http.js';
import { enqueueApproval, SELECT_APPROVALS } from './approvalQueue.js';
import { assertMayContact, contactChannelProblem, composeMessage, recipientCountry, suppressionKeys, RECIPIENT_FIELDS } from './outreachRules.js';
import { outreachRequest, parseDraft } from './research/tasks.js';
import { findVersion } from './research/mandates.js';
import { OUTREACH_CHANNELS } from './constants.js';

/** One first approach per person: a new one is allowed only after the earlier one was rejected. */
function assertNoOtherApproach(db, contactId) {
  const existing = db.prepare(`SELECT status, sent_at FROM approvals
    WHERE contact_id = ? AND kind = 'first_approach' AND status IN ('pending', 'approved', 'sent') ORDER BY id DESC LIMIT 1`).get(contactId);
  if (!existing) return;
  throw conflict(existing.status === 'sent'
    ? 'A first approach to this person was already sent. Follow-ups and replies are handled in the conversation.'
    : 'A first approach to this person is already waiting in the approval queue');
}

/** An accepted research card with its evidence source: what every outreach message is written from. */
export function loadAcceptedCard(db, opportunityId) {
  const card = db.prepare(`SELECT o.*, s.url AS evidence_url, s.title AS evidence_title
    FROM opportunities o JOIN sources s ON s.id = o.evidence_source_id WHERE o.id = ?`).get(opportunityId);
  if (!card) throw notFound(`Card #${opportunityId} does not exist`);
  if (card.status !== 'accepted') throw conflict('Outreach messages are drafted from accepted cards');
  return card;
}

/** The service the card's mandate offers (current version), or null for a card without a mandate. */
export function proposedServiceFor(db, card) {
  if (!card.mandate_id) return null;
  return findVersion(db, findById(db, 'mandates', card.mandate_id).current_version_id).proposed_service;
}

/** Put one message to a contact into the approval queue, linked to the card (and its deal) it came from. */
export function queueMessage(db, user, { kind, channel, card, contact, subject, content, replyId = null }) {
  const deal = db.prepare('SELECT id FROM deals WHERE opportunity_id = ?').get(card.id);
  const recipient = { email: contact.email, linkedin: contact.linkedin_url, whatsapp: contact.phone }[channel];
  return enqueueApproval(db, user.id, {
    kind, channel, opportunity_id: card.id, company_id: card.company_id, deal_id: deal ? deal.id : null, reply_id: replyId,
    contact_id: contact.id, language: contact.preferred_language, subject, content, [RECIPIENT_FIELDS[channel]]: recipient,
  });
}

function assertSendable(db, contactId, channel) {
  assertNoOtherApproach(db, contactId);
  assertMayContact(db, findById(db, 'contacts', contactId), channel);
}

/**
 * Draft a first message (mode "ai": from the card; mode "blank": the owner writes it) and queue it for approval.
 * Every rule is checked before the AI call and again after it, since a person can opt out while the AI writes.
 */
export async function draftFirstApproach(db, ai, user, { opportunityId, contactId, channel, mode }) {
  if (!OUTREACH_CHANNELS.includes(channel)) throw badRequest(`Unknown channel: ${channel}`);
  const card = loadAcceptedCard(db, opportunityId);
  const contact = findById(db, 'contacts', contactId);
  if (contact.company_id !== card.company_id) throw badRequest('This person does not work at the card\'s company');
  assertSendable(db, contactId, channel);

  let draft = { subject: channel === 'email' ? '' : null, body: '' };
  if (mode === 'ai') {
    const request = outreachRequest({
      card, contact, channel,
      company: findById(db, 'companies', card.company_id),
      language: contact.preferred_language,
      senderName: user.display_name,
      proposedService: proposedServiceFor(db, card),
    });
    const result = await ai.call('outreach', request);
    draft = parseDraft(result.input, channel);
    assertSendable(db, contactId, channel);
  }

  const message = composeMessage(db, { contact, channel, language: contact.preferred_language, subject: draft.subject, body: draft.body });
  return queueMessage(db, user, { kind: 'first_approach', channel, card, contact, subject: message.subject, content: message.content });
}

/** What the accepted card shows under "First approach": the company's people, per-channel availability, and approaches. */
export function outreachPanel(db, ai, card) {
  const contacts = db.prepare(`SELECT id, company_id, full_name, job_title, email, phone, linkedin_url, preferred_language, country,
      whatsapp_consent, opted_out_at, verified, verified_at, verified_source FROM contacts WHERE company_id = ? ORDER BY verified DESC, full_name`).all(card.company_id);
  return {
    ai_problem: ai.problem('outreach'),
    contacts: contacts.map((contact) => ({
      ...contact,
      recipient_country: recipientCountry(db, contact),
      channels: Object.fromEntries(OUTREACH_CHANNELS.map((channel) => [channel, contactChannelProblem(db, contact, channel)])),
    })),
    approaches: db.prepare(`${SELECT_APPROVALS} WHERE a.opportunity_id = ? AND a.kind = 'first_approach' ORDER BY a.id DESC`).all(card.id),
  };
}

/**
 * A person asked not to be contacted: mark them, put their details on the do-not-contact list, and withdraw every
 * message to them that is still waiting (pending or approved). Sent messages stay in the history.
 */
export function optOutContact(db, user, contactId, reason) {
  transaction(db, () => applyOptOut(db, user, contactId, reason));
}

/** The opt-out steps without their own transaction, for callers that already run one. */
export function applyOptOut(db, user, contactId, reason) {
  const contact = findById(db, 'contacts', contactId);
  if (contact.opted_out_at) throw conflict('This person is already opted out');
  const keys = suppressionKeys({ email: contact.email, phone: contact.phone, linkedin: contact.linkedin_url })
    .filter(([kind]) => kind !== 'domain'); // one person opting out does not block their whole company
  update(db, 'contacts', contactId, { opted_out_at: nowIso() });
  const exists = db.prepare('SELECT 1 FROM suppressions WHERE kind = ? AND value = ?');
  for (const [kind, value] of keys) {
    if (!exists.get(kind, value)) insert(db, 'suppressions', { kind, value, reason, contact_id: contactId, created_by: user.id });
  }
  db.prepare(`UPDATE approvals SET status = 'rejected', reviewed_by = ?, reviewed_at = ?, review_note = 'Recipient opted out'
    WHERE contact_id = ? AND status IN ('pending', 'approved') AND kind != 'company_brief'`).run(user.id, nowIso(), contactId);
  audit(db, user.id, 'contact.opted_out', 'contacts', contactId, reason);
}
