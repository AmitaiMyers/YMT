// The one deal of a research card (decision 21): Accept opens it with the agent's defaults. Shared by the review
// decision and the watch-list import, which can also put the deal at the stage it reached elsewhere.

import { insert, findById, audit, nowIso } from '../db.js';
import { badRequest } from '../http.js';
import { recordInteraction } from '../timeline.js';

const FALLBACK_DEAL_MODEL = 'retainer';
const TITLE_MAX = 120;

/** Open the one deal of a card (the stable link). Returns the deal id. */
export function openDeal(db, opportunity, { title, workflowId, dealModel, expectedValue }, userId) {
  const workflow = findById(db, 'workflows', workflowId);
  if (!workflow.active) throw badRequest('Workflow is inactive');
  const stages = JSON.parse(workflow.stages);
  const dealId = insert(db, 'deals', {
    company_id: opportunity.company_id, workflow_id: workflow.id, title, stage: stages[0],
    owner_id: opportunity.owner_id ?? userId, deal_model: dealModel, expected_value_usd: expectedValue ?? 0, opportunity_id: opportunity.id,
  });
  recordInteraction(db, {
    company_id: opportunity.company_id, deal_id: dealId, channel: 'note', direction: 'internal', user_id: userId,
    occurred_at: nowIso(), summary: `Deal opened from research card: ${opportunity.business_need}`,
  });
  audit(db, userId, 'deal.created_from_research', 'deals', dealId, `opportunity ${opportunity.id}`);
  return dealId;
}

/** Decision 21: Accept opens a "Not started" deal with the mandate's defaults. Returns the card's deal id (existing or new). */
export function openDefaultDeal(db, opportunity, userId) {
  const existing = db.prepare('SELECT id FROM deals WHERE opportunity_id = ?').get(opportunity.id);
  if (existing) return existing.id;
  const mandate = opportunity.mandate_id ? findById(db, 'mandates', opportunity.mandate_id) : null;
  const workflowId = mandate && mandate.default_workflow_id !== null ? mandate.default_workflow_id
    : db.prepare('SELECT id FROM workflows WHERE active = 1 ORDER BY id LIMIT 1').get().id;
  return openDeal(db, opportunity, {
    title: `${mandate ? `${mandate.code}: ` : ''}${opportunity.business_need}`.slice(0, TITLE_MAX),
    workflowId, dealModel: mandate && mandate.default_deal_model !== null ? mandate.default_deal_model : FALLBACK_DEAL_MODEL, expectedValue: 0,
  }, userId);
}
