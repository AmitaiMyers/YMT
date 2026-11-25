// The full migration export (25.11.2026): one CSV row per research card with everything the system knows about it –
// the company profile, the evidence, the agent's judgement, score, markets, contacts, suggestions, cited facts, the deal,
// messages, replies and meetings – so the data can move to another system. The first four columns ("Company", "Website",
// "Country", "Notes") are the ones the watch-list import recognises, so the file also loads back into this CRM; the card,
// profile and contact columns listed in shared/cardColumns.js rebuild the card when the company is sent to review.
// Values are stored codes (e.g. "hq_israel"); lists are joined with " | " and multi-part entries with " · ".

import { toCsv } from '../../../shared/csv.js';
import { scoreOpportunity, servicesMap } from './scoring.js';
import { journeyFor } from './journey.js';
import { LIST_SEPARATOR as LIST, CONTACTS_COLUMN } from '../../../shared/cardColumns.js';

const PART = ' · ';
const join = (values) => values.filter((value) => value !== null && value !== undefined && value !== '').join(PART);
const parseList = (json) => (json ? JSON.parse(json) : []);
const yesNo = (flag) => (flag === null ? '' : flag === 1 ? 'yes' : 'no');

/** A contact as the import reads it back (see CONTACT_SPEC in importCards.js). */
function contactData(contact) {
  return {
    full_name: contact.full_name, job_title: contact.job_title, department: contact.department, email: contact.email, phone: contact.phone,
    linkedin_url: contact.linkedin_url, country: contact.country, preferred_language: contact.preferred_language,
    preferred_channel: contact.preferred_channel, whatsapp_consent: contact.whatsapp_consent === 1, verified: contact.verified === 1,
    verified_source: contact.verified_source, verified_at: contact.verified_at, opted_out_at: contact.opted_out_at,
  };
}

const COLUMNS = [
  // Watch-list import columns (keep first)
  ['Company', (r) => r.company.name],
  ['Website', (r) => r.company.website],
  ['Country', (r) => (r.company.country === 'unknown' ? '' : r.company.country)],
  ['Notes', (r) => join([r.card.mandate_code, r.journey ? r.journey.stage : r.card.status])],
  // The research card
  ['Card ID', (r) => r.card.id],
  ['Card status', (r) => r.card.status],
  ['Flow step', (r) => (r.journey ? r.journey.stage : '')],
  ['Next action', (r) => (r.journey ? r.journey.next.kind : '')],
  ['Agent', (r) => r.card.mandate_code],
  ['Agent name', (r) => r.card.mandate_name],
  ['Agent version', (r) => r.card.mandate_version],
  ['Owner', (r) => r.card.owner_name],
  ['Lead originator', (r) => r.card.originator],
  ['Found on', (r) => r.card.created_at],
  ['Agent run', (r) => r.card.run_id],
  ['Target country', (r) => r.card.target_country],
  ['Need type', (r) => r.card.need_type],
  ['Business need', (r) => r.card.business_need],
  ['Relationship role', (r) => r.card.relationship_role],
  ['Evidence URL', (r) => r.card.evidence_url],
  ['Evidence title', (r) => r.card.evidence_title],
  ['Evidence date', (r) => r.card.evidence_date],
  ['Evidence quote', (r) => r.card.evidence_quote],
  ['Agent verdict', (r) => r.card.verdict],
  ['Verdict reason', (r) => r.card.verdict_reason],
  ['Reason to act now', (r) => r.card.reason_to_act],
  ['Trigger', (r) => r.card.trigger_kind],
  ['Trigger strength', (r) => r.card.trigger_strength],
  ['Trigger still live', (r) => yesNo(r.card.trigger_live)],
  ['Trigger checked on', (r) => r.card.trigger_checked_at],
  ['Subsector fit', (r) => r.card.subsector_fit],
  ['Service code', (r) => r.card.service_code],
  ['Proposed service', (r) => r.card.proposed_service],
  ['Flags', (r) => parseList(r.card.flags).join(LIST)],
  ['Missing facts', (r) => parseList(r.card.unknowns).join(LIST)],
  ['Score', (r) => r.score.total],
  ['Tier', (r) => r.score.tier],
  ['Score parts', (r) => Object.entries(r.score.parts).map(([part, value]) => `${part}: ${value.level} ${value.points}/${value.max}`).join(LIST)],
  ['Decision', (r) => r.card.status],
  ['Decided by', (r) => r.card.decided_by_name],
  ['Decided on', (r) => r.card.decided_at],
  ['Decision reason', (r) => r.card.decision_reason],
  ['Decision note', (r) => r.card.decision_note],
  ['Come back on', (r) => r.card.defer_until],
  ['First opened on', (r) => r.card.opened_at],
  ['Review seconds', (r) => r.card.review_seconds],
  // The company
  ['Israel connection', (r) => r.company.israel_connection],
  ['HQ country', (r) => r.company.hq_country],
  ['Incorporation country', (r) => r.company.incorporation_country],
  ['Parent company', (r) => r.company.parent_company],
  ['Business unit', (r) => r.company.business_unit],
  ['Business model', (r) => r.company.model_primary],
  ['Secondary model', (r) => r.company.model_secondary],
  ['Sector', (r) => r.company.sector],
  ['Subsector', (r) => r.company.subsector],
  ['Industry', (r) => r.company.industry],
  ['Company added by', (r) => r.company.origin],
  ['Customer types', (r) => parseList(r.company.customer_types).join(LIST)],
  ['Customer markets', (r) => parseList(r.company.customer_markets).join(LIST)],
  ['Employees min', (r) => r.company.employees_min],
  ['Employees max', (r) => r.company.employees_max],
  ['Employees as of', (r) => r.company.employees_as_of],
  ['Revenue USD min', (r) => r.company.revenue_usd_min],
  ['Revenue USD max', (r) => r.company.revenue_usd_max],
  ['Revenue fiscal year', (r) => r.company.revenue_fiscal_year],
  ['Revenue basis', (r) => r.company.revenue_basis],
  ['Revenue as reported', (r) => r.company.revenue_original],
  ['Ownership', (r) => r.company.ownership],
  ['Proven export', (r) => r.company.export_proof],
  ['Registry number', (r) => r.company.registry_number],
  ['Description', (r) => r.company.description],
  ['Other names', (r) => r.aliases.join(LIST)],
  ['Is a client', (r) => yesNo(r.company.is_client)],
  ['Company notes', (r) => r.company.notes],
  ['Approved brief', (r) => r.company.approved_brief],
  ['Outreach owner', (r) => r.company.outreach_owner_name],
  // Older company fields (hidden in the Focused view, kept so nothing is lost)
  ['Employee count (old)', (r) => r.company.employee_count],
  ['Annual revenue USD (old)', (r) => r.company.annual_revenue_usd],
  ['Exports (old)', (r) => r.company.exports],
  ['Export markets (old)', (r) => r.company.export_markets],
  ['India activity (old)', (r) => r.company.india_activity],
  ['General email', (r) => r.company.general_email],
  ['General phone', (r) => r.company.general_phone],
  ['LinkedIn company page', (r) => r.company.linkedin_page_url],
  ['Contact page', (r) => r.company.contact_page_url],
  ['Routes source', (r) => r.company.routes_source_url],
  ['Markets', (r) => r.markets.map((m) => join([m.market, m.status, m.fit, m.note, m.source_url])).join(LIST)],
  // People
  ['Contacts', (r) => r.contacts.map((c) => join([c.full_name, c.job_title, c.department, c.email, c.phone, c.linkedin_url,
    c.country, c.preferred_language, c.preferred_channel, c.whatsapp_consent ? 'WhatsApp consent' : '',
    c.verified ? `role checked ${c.verified_at ?? ''} ${c.verified_source ?? ''}`.trim() : 'role not checked',
    c.opted_out_at ? `opted out ${c.opted_out_at}` : ''])).join(LIST)],
  [CONTACTS_COLUMN, (r) => (r.contacts.length === 0 ? '' : JSON.stringify(r.contacts.map(contactData)))],
  ['Decision-maker suggestions', (r) => r.proposals.map((p) => join([p.full_name, p.job_title, p.email, p.linkedin_url, p.status, p.dismiss_reason, p.source_url])).join(LIST)],
  // Evidence base
  ['Facts with sources', (r) => r.facts.map((f) => `${f.field} = ${f.value} [${f.url}]`).join(LIST)],
  // After the review
  ['Deal', (r) => (r.deal ? join([r.deal.title, r.deal.stage, r.deal.status, r.deal.deal_model]) : '')],
  ['Deal expected USD', (r) => (r.deal ? r.deal.expected_value_usd : '')],
  ['Deal actual USD', (r) => (r.deal ? r.deal.actual_revenue_usd : '')],
  ['Deal closed on', (r) => (r.deal ? r.deal.closed_at : '')],
  ['Messages sent', (r) => r.messages.filter((m) => m.status === 'sent').length],
  ['Messages', (r) => r.messages.map((m) => join([m.kind, m.channel, m.status, m.sent_at ?? m.created_at, m.subject])).join(LIST)],
  ['Replies', (r) => r.replies.map((p) => join([p.received_at, p.channel, p.classification, p.subject, p.summary])).join(LIST)],
  ['Meetings', (r) => r.meetings.map((m) => join([m.scheduled_at, m.status, m.title, m.location, m.attendees, m.summary, m.decisions])).join(LIST)],
];

const CARD_SQL = `SELECT o.*, s.url AS evidence_url, s.title AS evidence_title, m.code AS mandate_code, m.name AS mandate_name,
    v.version AS mandate_version, u.display_name AS owner_name, d.display_name AS decided_by_name
  FROM opportunities o JOIN sources s ON s.id = o.evidence_source_id
  LEFT JOIN mandates m ON m.id = o.mandate_id LEFT JOIN mandate_versions v ON v.id = o.mandate_version_id
  LEFT JOIN users u ON u.id = o.owner_id LEFT JOIN users d ON d.id = o.decided_by`;

/**
 * @param {{ ownerId: number | null }} scope ownerId null = every card (admins)
 * @returns {{ csv: string, count: number }}
 */
export function exportCardsCsv(db, { ownerId }, now = new Date()) {
  const cards = ownerId === null
    ? db.prepare(`${CARD_SQL} ORDER BY o.id`).all()
    : db.prepare(`${CARD_SQL} WHERE o.owner_id = ? ORDER BY o.id`).all(ownerId);
  const services = servicesMap(db);
  const byCompany = {
    company: db.prepare(`SELECT c.*, u.display_name AS outreach_owner_name FROM companies c
      LEFT JOIN users u ON u.id = c.outreach_owner_id WHERE c.id = ?`),
    aliases: db.prepare('SELECT name FROM company_aliases WHERE company_id = ? ORDER BY name'),
    markets: db.prepare(`SELECT m.market, m.status, m.fit, m.note, s.url AS source_url FROM company_markets m
      LEFT JOIN sources s ON s.id = m.source_id WHERE m.company_id = ? ORDER BY m.market`),
    contacts: db.prepare('SELECT * FROM contacts WHERE company_id = ? ORDER BY full_name'),
    facts: db.prepare('SELECT f.field, f.value, s.url FROM facts f JOIN sources s ON s.id = f.source_id WHERE f.company_id = ? ORDER BY f.field, f.id'),
    replies: db.prepare('SELECT received_at, channel, classification, subject, summary FROM replies WHERE company_id = ? ORDER BY received_at'),
    meetings: db.prepare('SELECT scheduled_at, status, title, location, attendees, summary, decisions FROM meetings WHERE company_id = ? ORDER BY scheduled_at'),
  };
  const byCard = {
    proposals: db.prepare(`SELECT p.full_name, p.job_title, p.email, p.linkedin_url, p.status, p.dismiss_reason, s.url AS source_url
      FROM contact_proposals p JOIN sources s ON s.id = p.source_id WHERE p.opportunity_id = ? ORDER BY p.id`),
    deal: db.prepare('SELECT * FROM deals WHERE opportunity_id = ?'),
    messages: db.prepare('SELECT kind, channel, status, subject, created_at, sent_at FROM approvals WHERE opportunity_id = ? ORDER BY id'),
  };

  const rows = cards.map((card) => {
    const record = {
      card,
      company: byCompany.company.get(card.company_id),
      aliases: byCompany.aliases.all(card.company_id).map((a) => a.name),
      markets: byCompany.markets.all(card.company_id),
      contacts: byCompany.contacts.all(card.company_id),
      facts: byCompany.facts.all(card.company_id),
      replies: byCompany.replies.all(card.company_id),
      meetings: byCompany.meetings.all(card.company_id),
      proposals: byCard.proposals.all(card.id),
      deal: byCard.deal.get(card.id) ?? null,
      messages: byCard.messages.all(card.id),
      score: scoreOpportunity(db, card, services, now),
      journey: journeyFor(db, card, now),
    };
    return COLUMNS.map(([, value]) => value(record));
  });
  return { csv: toCsv(COLUMNS.map(([name]) => name), rows), count: rows.length };
}
