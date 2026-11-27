// "Don't suggest" list (research/blocked.js): any staff member can block a company – by hand, from a watch list or from
// its card after an approach failed – and remove it again. Every change is audited.

import { Router } from 'express';
import { parseBody, parseId } from '../validate.js';
import { findById, audit, transaction } from '../db.js';
import { badRequest } from '../http.js';
import { normalizeDomain } from '../research/classification.js';
import { blockCompany } from '../research/blocked.js';
import { assertCanSee } from '../research/access.js';

const MAX_BLOCK_AT_ONCE = 500;
const REASON = { type: 'text', max: 500 };
const BLOCK_SPEC = { name: { type: 'string', required: true, max: 200 }, website: { type: 'string', max: 300 }, reason: REASON };
const CARD_BLOCK_SPEC = { reason: REASON };
const ENTRIES_BLOCK_SPEC = { entry_ids: { type: 'list', required: true, minItems: 1, maxItems: MAX_BLOCK_AT_ONCE }, reason: REASON };

function parseIds(ids) {
  return ids.map((id) => {
    if (!/^[1-9]\d*$/.test(id)) throw badRequest('entry_ids must be company ids');
    return Number(id);
  });
}

export function blockedRoutes(db) {
  const router = Router();

  router.get('/blocked-companies', (req, res) => {
    res.json(db.prepare(`SELECT b.*, u.display_name AS blocked_by_name, c.website AS company_website,
        (SELECT MAX(o.id) FROM opportunities o WHERE o.company_id = b.company_id) AS card_id
      FROM blocked_companies b LEFT JOIN users u ON u.id = b.blocked_by LEFT JOIN companies c ON c.id = b.company_id
      ORDER BY b.created_at DESC, b.id DESC`).all());
  });

  router.post('/blocked-companies', (req, res) => {
    const values = parseBody(BLOCK_SPEC, req.body);
    if (values.website !== null && normalizeDomain(values.website) === null) throw badRequest(`website "${values.website}" is not a web address`);
    const id = blockCompany(db, { name: values.name, website: values.website, reason: values.reason, userId: req.user.id });
    res.status(201).json(findById(db, 'blocked_companies', id));
  });

  /** After a failed approach: block the card's company; its cards leave the board and the review. */
  router.post('/opportunities/:id/block', (req, res) => {
    const opportunity = findById(db, 'opportunities', parseId(req.params.id));
    assertCanSee(req.user, opportunity);
    const { reason } = parseBody(CARD_BLOCK_SPEC, req.body);
    const id = blockCompany(db, { companyId: opportunity.company_id, name: null, reason, userId: req.user.id });
    res.status(201).json(findById(db, 'blocked_companies', id));
  });

  /** Chosen watch-list companies: linked to their CRM company when they have one (so its cards are hidden too). */
  router.post('/watch-lists/:id/block', (req, res) => {
    const list = findById(db, 'watch_lists', parseId(req.params.id));
    const values = parseBody(ENTRIES_BLOCK_SPEC, req.body);
    const entryById = db.prepare(`SELECT e.*, o.company_id FROM watch_list_entries e LEFT JOIN opportunities o ON o.id = e.opportunity_id
      WHERE e.id = ? AND e.list_id = ?`);
    const entries = parseIds(values.entry_ids).map((id) => {
      const entry = entryById.get(id, list.id);
      if (!entry) throw badRequest(`Company #${id} is not in this list`);
      return entry;
    });
    const ids = transaction(db, () => entries.map((entry) => blockCompany(db, {
      companyId: entry.company_id, name: entry.name, website: entry.website, reason: values.reason, userId: req.user.id,
    })));
    res.status(201).json({ blocked: new Set(ids).size });
  });

  router.delete('/blocked-companies/:id', (req, res) => {
    const block = findById(db, 'blocked_companies', parseId(req.params.id));
    db.prepare('DELETE FROM blocked_companies WHERE id = ?').run(block.id);
    audit(db, req.user.id, 'company.unblocked', 'blocked_companies', block.id, block.name);
    res.json({ ok: true });
  });

  return router;
}
