// Module 1 (lead research) + the Client 360° file.

import { visibleCompanySql } from '../research/visibility.js';
import { Router } from 'express';
import { parseBody, parseId, parseOptionalInt, parseOptionalEnum } from '../validate.js';
import { insert, update, findById, removeById, audit, nowIso } from '../db.js';
import { badRequest } from '../http.js';
import { requireAdmin } from '../auth.js';
import { LANGUAGES, INDIA_ACTIVITY, TRIGGER_TYPES, DEPARTMENTS } from '../constants.js';
import { generateCompanyBrief, generateOutreachEmail } from '../generators.js';
import { enqueueApproval } from '../approvalQueue.js';

const COMPANY_SPEC = {
  name: { type: 'string', required: true, max: 200 },
  industry: { type: 'string', required: true, max: 120 },
  country: { type: 'string', required: true, max: 80 },
  website: { type: 'url' },
  employee_count: { type: 'int', min: 0 },
  annual_revenue_usd: { type: 'int', min: 0 },
  exports: { type: 'bool' },
  export_markets: { type: 'string', max: 300 },
  india_activity: { type: 'string', required: true, enum: INDIA_ACTIVITY },
  is_client: { type: 'bool' },
  notes: { type: 'text', max: 5000 },
};

const TRIGGER_SPEC = {
  type: { type: 'string', required: true, enum: TRIGGER_TYPES },
  description: { type: 'string', required: true, max: 500 },
  source_url: { type: 'url', required: true }, // mandatory: every signal must be traceable
  detected_on: { type: 'date', required: true },
};

const CONTACT_SPEC = {
  full_name: { type: 'string', required: true, max: 120 },
  job_title: { type: 'string', max: 120 },
  department: { type: 'string', required: true, enum: DEPARTMENTS },
  email: { type: 'email' },
  phone: { type: 'string', max: 40 },
  linkedin_url: { type: 'url' },
  preferred_language: { type: 'string', enum: LANGUAGES },
  verified: { type: 'bool' },
  verified_source: { type: 'string', max: 300 },
};

const BRIEF_SPEC = { language: { type: 'string', required: true, enum: LANGUAGES } };

const OUTREACH_SPEC = {
  contact_id: { type: 'id', required: true },
  deal_id: { type: 'id' },
  language: { type: 'string', required: true, enum: LANGUAGES },
};

function withDefaults(values, defaults) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value ?? defaults[key] ?? null]));
}

/** Verification metadata is set by the server, never trusted from the client. */
function contactVerificationFields(contact, userId) {
  if (contact.verified === 1) {
    if (!contact.verified_source) throw badRequest('verified_source is required when marking a contact as verified');
    return { verified_by: userId, verified_at: nowIso() };
  }
  if (contact.verified === 0) return { verified_by: null, verified_at: null, verified_source: null };
  return {};
}

function buildCompanyFilter(query) {
  const conditions = [];
  const params = {};
  const add = (sql, key, value) => {
    if (value === null) return;
    conditions.push(sql);
    params[key] = value;
  };
  add('(name LIKE :q OR notes LIKE :q OR export_markets LIKE :q)', 'q', query.q ? `%${query.q}%` : null);
  add('industry = :industry', 'industry', query.industry || null);
  add('employee_count >= :min_employees', 'min_employees', parseOptionalInt(query.min_employees, 'min_employees'));
  add('employee_count <= :max_employees', 'max_employees', parseOptionalInt(query.max_employees, 'max_employees'));
  add('annual_revenue_usd >= :min_revenue', 'min_revenue', parseOptionalInt(query.min_revenue, 'min_revenue'));
  add('annual_revenue_usd <= :max_revenue', 'max_revenue', parseOptionalInt(query.max_revenue, 'max_revenue'));
  const exportsFilter = parseOptionalEnum(query.exports, 'exports', ['yes', 'no']);
  add('exports = :exports', 'exports', exportsFilter === null ? null : Number(exportsFilter === 'yes'));
  add('india_activity = :india_activity', 'india_activity', parseOptionalEnum(query.india_activity, 'india_activity', INDIA_ACTIVITY));
  const clientFilter = parseOptionalEnum(query.is_client, 'is_client', ['yes', 'no']);
  add('is_client = :is_client', 'is_client', clientFilter === null ? null : Number(clientFilter === 'yes'));
  conditions.push(visibleCompanySql('c'));
  return { where: `WHERE ${conditions.join(' AND ')}`, params };
}

export function companyRoutes(db) {
  const router = Router();

  // ------------------------------------------------------------ companies
  router.get('/companies', (req, res) => {
    const { where, params } = buildCompanyFilter(req.query);
    const rows = db.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM triggers t WHERE t.company_id = c.id) AS trigger_count,
        (SELECT MAX(detected_on) FROM triggers t WHERE t.company_id = c.id) AS latest_trigger,
        (SELECT COUNT(*) FROM contacts k WHERE k.company_id = c.id AND k.verified = 1) AS verified_contacts
      FROM companies c ${where} ORDER BY c.updated_at DESC LIMIT 500`).all(params);
    res.json(rows);
  });

  router.get('/companies/industries', (req, res) => {
    res.json(db.prepare(`SELECT DISTINCT industry FROM companies c WHERE ${visibleCompanySql('c')} ORDER BY industry`).all().map((row) => row.industry));
  });

  router.post('/companies', (req, res) => {
    const values = withDefaults(parseBody(COMPANY_SPEC, req.body), { exports: 0, is_client: 0 });
    const id = insert(db, 'companies', values);
    audit(db, req.user.id, 'company.created', 'companies', id);
    res.status(201).json({ id });
  });

  router.get('/companies/:id', (req, res) => {
    res.json(findById(db, 'companies', parseId(req.params.id)));
  });

  router.patch('/companies/:id', (req, res) => {
    const id = parseId(req.params.id);
    update(db, 'companies', id, { ...parseBody(COMPANY_SPEC, req.body, { partial: true }), updated_at: nowIso() });
    res.json({ ok: true });
  });

  router.delete('/companies/:id', requireAdmin, (req, res) => {
    const id = parseId(req.params.id);
    removeById(db, 'companies', id);
    audit(db, req.user.id, 'company.deleted', 'companies', id);
    res.json({ ok: true });
  });

  // ------------------------------------------------------------ client 360° file
  router.get('/companies/:id/overview', (req, res) => {
    const id = parseId(req.params.id);
    const byCompany = (sql) => db.prepare(sql).all(id);
    res.json({
      company: findById(db, 'companies', id),
      contacts: byCompany('SELECT * FROM contacts WHERE company_id = ? ORDER BY verified DESC, full_name'),
      triggers: byCompany('SELECT * FROM triggers WHERE company_id = ? ORDER BY detected_on DESC'),
      deals: byCompany(`SELECT d.*, w.name_he AS workflow_name_he, w.name_en AS workflow_name_en
        FROM deals d JOIN workflows w ON w.id = d.workflow_id WHERE d.company_id = ? ORDER BY d.created_at DESC`),
      interactions: byCompany(`SELECT i.*, u.display_name AS user_name, k.full_name AS contact_name
        FROM interactions i LEFT JOIN users u ON u.id = i.user_id LEFT JOIN contacts k ON k.id = i.contact_id
        WHERE i.company_id = ? ORDER BY i.occurred_at DESC`),
      meetings: byCompany('SELECT * FROM meetings WHERE company_id = ? ORDER BY scheduled_at DESC'),
      tasks: byCompany('SELECT * FROM tasks WHERE company_id = ? ORDER BY done, due_date'),
      documents: byCompany('SELECT id, kind, title, language, status, shareable, created_at FROM documents WHERE company_id = ? ORDER BY created_at DESC'),
      approvals: byCompany('SELECT id, kind, status, subject, created_at FROM approvals WHERE company_id = ? ORDER BY created_at DESC'),
      share_links: byCompany('SELECT * FROM share_links WHERE company_id = ? ORDER BY created_at DESC'),
    });
  });

  // ------------------------------------------------------------ triggers
  router.post('/companies/:id/triggers', (req, res) => {
    const companyId = parseId(req.params.id);
    findById(db, 'companies', companyId);
    const id = insert(db, 'triggers', { ...parseBody(TRIGGER_SPEC, req.body), company_id: companyId, created_by: req.user.id });
    update(db, 'companies', companyId, { updated_at: nowIso() });
    res.status(201).json({ id });
  });

  router.get('/triggers', (req, res) => {
    res.json(db.prepare(`SELECT t.*, c.name AS company_name FROM triggers t JOIN companies c ON c.id = t.company_id
      ORDER BY t.detected_on DESC LIMIT 200`).all());
  });

  router.delete('/triggers/:id', (req, res) => {
    removeById(db, 'triggers', parseId(req.params.id));
    res.json({ ok: true });
  });

  // ------------------------------------------------------------ contacts
  router.post('/companies/:id/contacts', (req, res) => {
    const companyId = parseId(req.params.id);
    findById(db, 'companies', companyId);
    const contact = withDefaults(parseBody(CONTACT_SPEC, req.body), { verified: 0, preferred_language: 'he' });
    const id = insert(db, 'contacts', { ...contact, ...contactVerificationFields(contact, req.user.id), company_id: companyId });
    res.status(201).json({ id });
  });

  /** People search for the meeting scheduler: any contact, with or without a company. */
  router.get('/contacts', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q.length < 2) {
      res.json([]);
      return;
    }
    const like = `%${q}%`;
    res.json(db.prepare(`SELECT k.id, k.full_name, k.email, k.phone, k.job_title, k.company_id, k.preferred_language,
        c.name AS company_name
      FROM contacts k LEFT JOIN companies c ON c.id = k.company_id
      WHERE k.full_name LIKE ? OR k.email LIKE ? OR c.name LIKE ?
      ORDER BY k.full_name LIMIT 20`).all(like, like, like));
  });

  router.patch('/contacts/:id', (req, res) => {
    const id = parseId(req.params.id);
    const changes = parseBody(CONTACT_SPEC, req.body, { partial: true });
    const merged = { ...findById(db, 'contacts', id), ...changes };
    const verification = 'verified' in changes ? contactVerificationFields(merged, req.user.id) : {};
    update(db, 'contacts', id, { ...changes, ...verification });
    res.json({ ok: true });
  });

  router.delete('/contacts/:id', (req, res) => {
    removeById(db, 'contacts', parseId(req.params.id));
    res.json({ ok: true });
  });

  // ------------------------------------------------------------ generators → approval queue
  router.post('/companies/:id/brief', (req, res) => {
    const companyId = parseId(req.params.id);
    const { language } = parseBody(BRIEF_SPEC, req.body);
    const { content } = generateCompanyBrief(db, req.user, companyId, language);
    const id = enqueueApproval(db, req.user.id, { kind: 'company_brief', company_id: companyId, language, content });
    res.status(201).json({ id });
  });

  router.post('/companies/:id/outreach', (req, res) => {
    const companyId = parseId(req.params.id);
    const { contact_id: contactId, deal_id: dealId, language } = parseBody(OUTREACH_SPEC, req.body);
    const { subject, content } = generateOutreachEmail(db, req.user, { companyId, contactId, dealId, language });
    const contact = findById(db, 'contacts', contactId);
    const id = enqueueApproval(db, req.user.id, {
      kind: 'outreach_email', company_id: companyId, deal_id: dealId, contact_id: contactId,
      language, subject, content, recipient_email: contact.email,
    });
    res.status(201).json({ id });
  });

  return router;
}
