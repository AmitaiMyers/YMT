// Human approval queue API. One item per request: there is intentionally no bulk endpoint.

import { Router } from 'express';
import { parseBody, parseId, parseOptionalEnum } from '../validate.js';
import { findById } from '../db.js';
import { editPendingApproval, approve, reject, markSent, SELECT_APPROVALS } from '../approvalQueue.js';
import { APPROVAL_STATUSES } from '../constants.js';

const EDIT_SPEC = {
  subject: { type: 'string', max: 300 },
  content: { type: 'text', required: true },
  recipient_email: { type: 'email' },
  recipient_phone: { type: 'string', max: 40 },
  recipient_linkedin: { type: 'url' },
};
const APPROVE_SPEC = { note: { type: 'string', max: 500 } };
const REJECT_SPEC = { note: { type: 'string', required: true, max: 500 } };


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
