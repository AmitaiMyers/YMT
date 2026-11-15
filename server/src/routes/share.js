// Secure, expiring, revocable read-only links to a client file for foreign partners.
// What is exposed is an explicit allow-list: no internal notes, contacts, revenue, triggers or timeline.

import { Router } from 'express';
import { parseBody, parseId } from '../validate.js';
import { insert, update, findById, audit, getNumericSetting } from '../db.js';
import { notFound } from '../http.js';
import { randomToken } from '../auth.js';
import { documentWithIntegrity } from './documents.js';

const SHARE_SPEC = {
  label: { type: 'string', required: true, max: 120 },
  days: { type: 'int', min: 1, max: 90 },
};

export function shareRoutes(db) {
  const router = Router();

  router.post('/companies/:id/share-links', (req, res) => {
    const companyId = parseId(req.params.id);
    findById(db, 'companies', companyId);
    const { label, days } = parseBody(SHARE_SPEC, req.body);
    const validDays = days ?? getNumericSetting(db, 'share_link_days');
    const token = randomToken();
    const id = insert(db, 'share_links', {
      token, company_id: companyId, label, created_by: req.user.id,
      expires_at: new Date(Date.now() + validDays * 86400000).toISOString(),
    });
    audit(db, req.user.id, 'share_link.created', 'share_links', id, label);
    res.status(201).json({ id, token });
  });

  router.post('/share-links/:id/revoke', (req, res) => {
    const id = parseId(req.params.id);
    update(db, 'share_links', id, { revoked: 1 });
    audit(db, req.user.id, 'share_link.revoked', 'share_links', id);
    res.json({ ok: true });
  });

  return router;
}

export function publicShareRoutes(db) {
  const router = Router();
  const findLink = db.prepare('SELECT * FROM share_links WHERE token = ? AND revoked = 0 AND expires_at > ?');

  router.get('/share/:token', (req, res) => {
    const link = findLink.get(req.params.token, new Date().toISOString());
    if (!link) throw notFound('This link is invalid, expired or has been revoked');
    const company = findById(db, 'companies', link.company_id);
    const documents = db.prepare(`SELECT * FROM documents WHERE company_id = ? AND shareable = 1 AND status != 'draft'
      ORDER BY created_at DESC`).all(company.id);
    res.json({
      label: link.label,
      expires_at: link.expires_at,
      company: { name: company.name, industry: company.industry, country: company.country, website: company.website },
      meetings: db.prepare(`SELECT title, scheduled_at, decisions FROM meetings
        WHERE company_id = ? AND status = 'done' ORDER BY scheduled_at DESC`).all(company.id),
      commitments: db.prepare(`SELECT description, assignee, due_date, done FROM tasks
        WHERE company_id = ? AND is_client_commitment = 1 ORDER BY done, due_date`).all(company.id),
      documents: documents.map((document) => {
        const full = documentWithIntegrity(db, document);
        return {
          title: full.title, kind: full.kind, language: full.language, status: full.status, content: full.content,
          integrity_ok: full.integrity_ok,
          signatures: full.signatures.map(({ signer_name, signer_role, signed_at }) => ({ signer_name, signer_role, signed_at })),
        };
      }),
    });
  });

  return router;
}
