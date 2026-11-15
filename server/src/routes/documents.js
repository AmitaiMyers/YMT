// Document templates, documents (quotes / agreements / meeting summaries) and built-in e-signatures.
//
// Signature model ("simple electronic signature"): when a document is finalized its text is frozen and
// hashed (SHA-256). Each signature stores the drawn image, signer name, IP, time and the hash it signed.
// Any later mismatch between content and hash is reported as tampering.

import { Router } from 'express';
import { createHash } from 'node:crypto';
import { parseBody, parseId, parseOptionalInt } from '../validate.js';
import { insert, update, findById, removeById, audit, nowIso, transaction } from '../db.js';
import { badRequest, conflict, notFound } from '../http.js';
import { LANGUAGES, TEMPLATE_KINDS, DOCUMENT_KINDS } from '../constants.js';
import { randomToken } from '../auth.js';
import { generateDocumentContent, PLACEHOLDERS } from '../generators.js';

const MAX_SIGNATURE_IMAGE_CHARS = 300_000;

const TEMPLATE_SPEC = {
  kind: { type: 'string', required: true, enum: TEMPLATE_KINDS },
  name: { type: 'string', required: true, max: 120 },
  language: { type: 'string', required: true, enum: LANGUAGES },
  subject: { type: 'string', max: 300 },
  body: { type: 'text', required: true },
};

const DOCUMENT_CREATE_SPEC = {
  template_id: { type: 'id', required: true },
  company_id: { type: 'id', required: true },
  deal_id: { type: 'id' },
  meeting_id: { type: 'id' },
  title: { type: 'string', required: true, max: 200 },
};

const DOCUMENT_UPDATE_SPEC = {
  title: { type: 'string', max: 200 },
  content: { type: 'text' },
  shareable: { type: 'bool' },
};

const SIGN_SPEC = {
  signer_name: { type: 'string', required: true, max: 120 },
  signer_email: { type: 'email' },
  signature_image: { type: 'text', required: true, max: MAX_SIGNATURE_IMAGE_CHARS },
};

export function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function assertSignatureImage(image) {
  if (!image.startsWith('data:image/png;base64,')) throw badRequest('signature_image must be a PNG data URL');
}

/** Create a draft document from a template. Shared with the post-meeting workflow. */
export function createDocumentFromTemplate(db, user, { templateId, companyId, dealId, meetingId, title }) {
  const template = findById(db, 'templates', templateId);
  if (!DOCUMENT_KINDS.includes(template.kind)) throw badRequest(`Template kind "${template.kind}" is an email template, not a document`);
  const content = generateDocumentContent(db, user, { template, companyId, dealId, meetingId });
  return insert(db, 'documents', {
    company_id: companyId, deal_id: dealId, kind: template.kind, title, language: template.language,
    content, created_by: user.id,
  });
}

function signaturesFor(db, documentId) {
  return db.prepare(`SELECT id, signer_name, signer_email, signer_role, signature_image, content_hash, signed_at
    FROM signatures WHERE document_id = ? ORDER BY signed_at`).all(documentId);
}

/** Document + signatures + integrity verdict. */
export function documentWithIntegrity(db, document) {
  const signatures = signaturesFor(db, document.id);
  const currentHash = sha256(document.content);
  const intact = document.content_hash === null
    || (document.content_hash === currentHash && signatures.every((s) => s.content_hash === currentHash));
  return { ...document, signatures, integrity_ok: intact, current_hash: currentHash };
}

function addSignature(db, document, signature, signerRole, ipAddress) {
  if (document.status === 'draft') throw conflict('Finalize the document before signing');
  assertSignatureImage(signature.signature_image);
  transaction(db, () => {
    insert(db, 'signatures', {
      ...signature, document_id: document.id, signer_role: signerRole, content_hash: document.content_hash, ip_address: ipAddress,
    });
    if (signerRole === 'client') update(db, 'documents', document.id, { status: 'signed' });
  });
}

export function documentRoutes(db) {
  const router = Router();

  // ------------------------------------------------------------ templates (editable by staff)
  router.get('/templates', (req, res) => {
    res.json(db.prepare('SELECT * FROM templates ORDER BY kind, language, name').all());
  });

  router.get('/templates/placeholders', (req, res) => res.json(PLACEHOLDERS));

  router.post('/templates', (req, res) => {
    const id = insert(db, 'templates', parseBody(TEMPLATE_SPEC, req.body));
    audit(db, req.user.id, 'template.created', 'templates', id);
    res.status(201).json({ id });
  });

  router.patch('/templates/:id', (req, res) => {
    const id = parseId(req.params.id);
    update(db, 'templates', id, { ...parseBody(TEMPLATE_SPEC, req.body, { partial: true }), updated_at: nowIso() });
    audit(db, req.user.id, 'template.updated', 'templates', id);
    res.json({ ok: true });
  });

  router.delete('/templates/:id', (req, res) => {
    const id = parseId(req.params.id);
    removeById(db, 'templates', id);
    audit(db, req.user.id, 'template.deleted', 'templates', id);
    res.json({ ok: true });
  });

  // ------------------------------------------------------------ documents
  router.get('/documents', (req, res) => {
    const companyId = parseOptionalInt(req.query.company_id, 'company_id');
    const select = `SELECT d.id, d.company_id, d.kind, d.title, d.language, d.status, d.shareable, d.created_at,
      c.name AS company_name FROM documents d JOIN companies c ON c.id = d.company_id`;
    res.json(companyId
      ? db.prepare(`${select} WHERE d.company_id = ? ORDER BY d.created_at DESC`).all(companyId)
      : db.prepare(`${select} ORDER BY d.created_at DESC LIMIT 300`).all());
  });

  router.post('/documents', (req, res) => {
    const values = parseBody(DOCUMENT_CREATE_SPEC, req.body);
    const id = createDocumentFromTemplate(db, req.user, {
      templateId: values.template_id, companyId: values.company_id, dealId: values.deal_id,
      meetingId: values.meeting_id, title: values.title,
    });
    audit(db, req.user.id, 'document.created', 'documents', id);
    res.status(201).json({ id });
  });

  router.get('/documents/:id', (req, res) => {
    const document = findById(db, 'documents', parseId(req.params.id));
    const company = findById(db, 'companies', document.company_id);
    res.json({ ...documentWithIntegrity(db, document), company_name: company.name });
  });

  router.patch('/documents/:id', (req, res) => {
    const id = parseId(req.params.id);
    const document = findById(db, 'documents', id);
    const changes = parseBody(DOCUMENT_UPDATE_SPEC, req.body, { partial: true });
    if (('content' in changes || 'title' in changes) && document.status !== 'draft') {
      throw conflict('Finalized documents cannot be edited; create a new version instead');
    }
    if ('content' in changes && !changes.content) throw badRequest('content cannot be empty');
    update(db, 'documents', id, changes);
    res.json({ ok: true });
  });

  router.post('/documents/:id/finalize', (req, res) => {
    const id = parseId(req.params.id);
    const document = findById(db, 'documents', id);
    if (document.status !== 'draft') throw conflict('Document is already finalized');
    update(db, 'documents', id, {
      status: 'finalized', content_hash: sha256(document.content), sign_token: randomToken(), finalized_at: nowIso(),
    });
    audit(db, req.user.id, 'document.finalized', 'documents', id);
    res.json({ ok: true });
  });

  /** A YMT staff member signs on behalf of YMT Group. */
  router.post('/documents/:id/sign', (req, res) => {
    const document = findById(db, 'documents', parseId(req.params.id));
    addSignature(db, document, parseBody(SIGN_SPEC, req.body), 'ymt', req.ip);
    audit(db, req.user.id, 'document.signed_ymt', 'documents', document.id);
    res.json({ ok: true });
  });

  router.delete('/documents/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (findById(db, 'documents', id).status !== 'draft') throw conflict('Only drafts can be deleted');
    removeById(db, 'documents', id);
    res.json({ ok: true });
  });

  return router;
}

/** Public (no login) signing page for the client. The link is shared manually by staff. */
export function publicSignRoutes(db) {
  const router = Router();
  const findByToken = db.prepare(`SELECT * FROM documents WHERE sign_token = ?`);

  function loadByToken(token) {
    const document = findByToken.get(token);
    if (!document) throw notFound('Signing link is invalid');
    return document;
  }

  router.get('/sign/:token', (req, res) => {
    const document = loadByToken(req.params.token);
    const { signatures, integrity_ok: integrityOk, ...rest } = documentWithIntegrity(db, document);
    res.json({
      title: rest.title, language: rest.language, content: rest.content, status: rest.status,
      content_hash: rest.content_hash, integrity_ok: integrityOk,
      company_name: findById(db, 'companies', document.company_id).name,
      signatures: signatures.map(({ signer_name, signer_role, signed_at, signature_image }) => ({ signer_name, signer_role, signed_at, signature_image })),
    });
  });

  router.post('/sign/:token', (req, res) => {
    const document = loadByToken(req.params.token);
    if (document.status === 'signed') throw conflict('This document has already been signed');
    addSignature(db, document, parseBody(SIGN_SPEC, req.body), 'client', req.ip);
    audit(db, null, 'document.signed_client', 'documents', document.id);
    res.json({ ok: true });
  });

  return router;
}
