// Release 3 API: first approaches from research cards, the legal rules (admin), the do-not-contact list and opt-outs.

import { Router } from 'express';
import { parseBody, parseId } from '../validate.js';
import { findById, insert, removeById, audit } from '../db.js';
import { conflict } from '../http.js';
import { requireAdmin } from '../auth.js';
import { assertCanSee, isAdmin } from '../research/access.js';
import { draftFirstApproach, optOutContact } from '../outreach.js';
import { outreachRules, normalizeSuppression } from '../outreachRules.js';
import { OUTREACH_CHANNELS, SUPPRESSION_KINDS, LANGUAGES } from '../constants.js';

const DRAFT_MODES = ['ai', 'blank'];
const MAX_COUNTRIES = 100;

const APPROACH_SPEC = {
  contact_id: { type: 'id', required: true },
  channel: { type: 'string', required: true, enum: OUTREACH_CHANNELS },
  mode: { type: 'string', required: true, enum: DRAFT_MODES },
};
const RULES_SPEC = {
  cleared_countries: { type: 'list', required: true, maxItems: MAX_COUNTRIES, itemMax: 80 },
  ...Object.fromEntries(LANGUAGES.map((language) => [`opt_out_${language}`, { type: 'string', required: true, max: 300 }])),
};
const SUPPRESSION_SPEC = {
  kind: { type: 'string', required: true, enum: SUPPRESSION_KINDS },
  value: { type: 'string', required: true, max: 300 },
  reason: { type: 'string', max: 300 },
};
const OPT_OUT_SPEC = { reason: { type: 'string', required: true, max: 300 } };

export function outreachRoutes(db, { ai }) {
  const router = Router();

  router.post('/opportunities/:id/approaches', async (req, res) => {
    const opportunityId = parseId(req.params.id);
    assertCanSee(req.user, findById(db, 'opportunities', opportunityId));
    const values = parseBody(APPROACH_SPEC, req.body);
    const id = await draftFirstApproach(db, ai, req.user, { opportunityId, contactId: values.contact_id, channel: values.channel, mode: values.mode });
    res.status(201).json({ id });
  });

  router.get('/outreach/rules', (req, res) => res.json({ ...outreachRules(db), can_edit: isAdmin(req.user) }));

  router.put('/outreach/rules', requireAdmin, (req, res) => {
    const values = parseBody(RULES_SPEC, req.body);
    const countries = [...new Set(values.cleared_countries)];
    const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    upsert.run('outreach_cleared_countries', JSON.stringify(countries));
    for (const language of LANGUAGES) upsert.run(`outreach_optout_${language}`, values[`opt_out_${language}`].trim());
    audit(db, req.user.id, 'outreach.rules_updated', 'settings', null, countries.join(', '));
    res.json(outreachRules(db));
  });

  router.get('/suppressions', (req, res) => {
    res.json(db.prepare(`SELECT s.*, u.display_name AS created_by_name, k.full_name AS contact_name
      FROM suppressions s LEFT JOIN users u ON u.id = s.created_by LEFT JOIN contacts k ON k.id = s.contact_id
      ORDER BY s.created_at DESC`).all());
  });

  /** Any staff member can add to the list (an opt-out must be easy to record); only an admin can remove. */
  router.post('/suppressions', (req, res) => {
    const values = parseBody(SUPPRESSION_SPEC, req.body);
    const value = normalizeSuppression(values.kind, values.value);
    if (db.prepare('SELECT 1 FROM suppressions WHERE kind = ? AND value = ?').get(values.kind, value)) throw conflict('Already on the do-not-contact list');
    const id = insert(db, 'suppressions', { kind: values.kind, value, reason: values.reason, created_by: req.user.id });
    audit(db, req.user.id, 'suppression.added', 'suppressions', id, `${values.kind}:${value}`);
    res.status(201).json({ id });
  });

  router.delete('/suppressions/:id', requireAdmin, (req, res) => {
    const id = parseId(req.params.id);
    const row = findById(db, 'suppressions', id);
    removeById(db, 'suppressions', id);
    audit(db, req.user.id, 'suppression.removed', 'suppressions', id, `${row.kind}:${row.value}`);
    res.json({ ok: true });
  });

  router.post('/contacts/:id/opt-out', (req, res) => {
    optOutContact(db, req.user, parseId(req.params.id), parseBody(OPT_OUT_SPEC, req.body).reason);
    res.json({ ok: true });
  });

  return router;
}
