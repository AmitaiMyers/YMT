// Human approval queue API. One item per request: there is intentionally no bulk endpoint.

import { Router } from 'express';
import { parseBody, parseId, parseOptionalEnum } from '../validate.js';
import { findById } from '../db.js';
import { editPendingApproval, approve, reject, markSent } from '../approvalQueue.js';
import { APPROVAL_STATUSES } from '../constants.js';

const EDIT_SPEC = {
  subject: { type: 'string', max: 300 },
  content: { type: 'text', required: true },
  recipient_email: { type: 'email' },
};
const APPROVE_SPEC = { note: { type: 'string', max: 500 } };
const REJECT_SPEC = { note: { type: 'string', required: true, max: 500 } };

const SELECT_APPROVALS = `
  SELECT a.*, c.name AS company_name, k.full_name AS contact_name, d.title AS deal_title,
    cu.display_name AS created_by_name, ru.display_name AS reviewed_by_name, su.display_name AS sent_by_name
  FROM approvals a
  LEFT JOIN companies c ON c.id = a.company_id
  LEFT JOIN contacts k ON k.id = a.contact_id
  LEFT JOIN deals d ON d.id = a.deal_id
  LEFT JOIN users cu ON cu.id = a.created_by
  LEFT JOIN users ru ON ru.id = a.reviewed_by
  LEFT JOIN users su ON su.id = a.sent_by`;

export function approvalRoutes(db) {
  const router = Router();

  router.get('/approvals', (req, res) => {
    const status = parseOptionalEnum(req.query.status, 'status', APPROVAL_STATUSES);
    const rows = status
      ? db.prepare(`${SELECT_APPROVALS} WHERE a.status = ? ORDER BY a.created_at DESC`).all(status)
      : db.prepare(`${SELECT_APPROVALS} ORDER BY a.created_at DESC LIMIT 300`).all();
    res.json(rows);
  });

  router.get('/approvals/:id', (req, res) => {
    const id = parseId(req.params.id);
    findById(db, 'approvals', id);
    res.json(db.prepare(`${SELECT_APPROVALS} WHERE a.id = ?`).get(id));
  });

  router.patch('/approvals/:id', (req, res) => {
    editPendingApproval(db, req.user.id, parseId(req.params.id), parseBody(EDIT_SPEC, req.body, { partial: true }));
    res.json({ ok: true });
  });

  router.post('/approvals/:id/approve', (req, res) => {
    approve(db, req.user.id, parseId(req.params.id), parseBody(APPROVE_SPEC, req.body).note);
    res.json({ ok: true });
  });

  router.post('/approvals/:id/reject', (req, res) => {
    reject(db, req.user.id, parseId(req.params.id), parseBody(REJECT_SPEC, req.body).note);
    res.json({ ok: true });
  });

  router.post('/approvals/:id/mark-sent', (req, res) => {
    markSent(db, req.user.id, parseId(req.params.id));
    res.json({ ok: true });
  });

  return router;
}
