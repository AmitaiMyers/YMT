// Expert & supplier directory, with simple industry-based matching to a client.

import { Router } from 'express';
import { parseBody, parseId, parseOptionalEnum } from '../validate.js';
import { insert, update, findById, removeById } from '../db.js';
import { RESOURCE_TYPES } from '../constants.js';

const RESOURCE_SPEC = {
  type: { type: 'string', required: true, enum: RESOURCE_TYPES },
  name: { type: 'string', required: true, max: 200 },
  country: { type: 'string', required: true, max: 80 },
  city: { type: 'string', max: 80 },
  industries: { type: 'string', required: true, max: 300 },
  capabilities: { type: 'text', max: 3000 },
  certifications: { type: 'string', max: 300 },
  contact_name: { type: 'string', max: 120 },
  email: { type: 'email' },
  phone: { type: 'string', max: 40 },
  website: { type: 'url' },
  nda_signed: { type: 'bool' },
  rating: { type: 'int', min: 1, max: 5 },
  notes: { type: 'text', max: 3000 },
};

export function directoryRoutes(db) {
  const router = Router();

  router.get('/resources', (req, res) => {
    const type = parseOptionalEnum(req.query.type, 'type', RESOURCE_TYPES);
    const q = req.query.q ? `%${req.query.q}%` : null;
    const country = req.query.country || null;
    const rows = db.prepare(`SELECT * FROM resources
      WHERE (:type IS NULL OR type = :type)
        AND (:country IS NULL OR country = :country)
        AND (:q IS NULL OR name LIKE :q OR industries LIKE :q OR capabilities LIKE :q OR certifications LIKE :q OR city LIKE :q)
      ORDER BY rating DESC NULLS LAST, name`).all({ type, country, q });
    res.json(rows);
  });

  router.get('/resources/countries', (req, res) => {
    res.json(db.prepare('SELECT DISTINCT country FROM resources ORDER BY country').all().map((row) => row.country));
  });

  router.post('/resources', (req, res) => {
    const values = parseBody(RESOURCE_SPEC, req.body);
    res.status(201).json({ id: insert(db, 'resources', { ...values, nda_signed: values.nda_signed ?? 0 }) });
  });

  router.patch('/resources/:id', (req, res) => {
    update(db, 'resources', parseId(req.params.id), parseBody(RESOURCE_SPEC, req.body, { partial: true }));
    res.json({ ok: true });
  });

  router.delete('/resources/:id', (req, res) => {
    removeById(db, 'resources', parseId(req.params.id));
    res.json({ ok: true });
  });

  /** Resources whose industry list mentions the client's industry. */
  router.get('/companies/:id/matches', (req, res) => {
    const company = findById(db, 'companies', parseId(req.params.id));
    res.json(db.prepare(`SELECT * FROM resources WHERE industries LIKE ? ORDER BY nda_signed DESC, rating DESC NULLS LAST`)
      .all(`%${company.industry}%`));
  });

  return router;
}
