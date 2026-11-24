// Gathers what the score needs for one card from the database (the score itself is pure: see score.js).

import { findById } from '../db.js';
import { normalizeDomain } from './classification.js';
import { computeScore } from './score.js';
import { loadServices } from './catalogue.js';
import { parseVersion } from './mandates.js';

export function servicesMap(db) {
  return new Map(loadServices(db).map((service) => [service.code, service]));
}

/** People who count for decision-maker access: the agent's proposals (verified when found) and confirmed company contacts. */
function peopleFor(db, opportunity) {
  const proposals = db.prepare(`SELECT status, email, linkedin_url, NULL AS phone, created_at AS verified_at
    FROM contact_proposals WHERE opportunity_id = ? AND status != 'dismissed'`).all(opportunity.id);
  const contacts = db.prepare(`SELECT 'confirmed' AS status, email, linkedin_url, phone, verified_at
    FROM contacts WHERE company_id = ? AND verified = 1 AND verified_at IS NOT NULL AND opted_out_at IS NULL`).all(opportunity.company_id);
  return [...proposals, ...contacts];
}

export function scoreOpportunity(db, opportunity, servicesByCode, now = new Date()) {
  const company = findById(db, 'companies', opportunity.company_id);
  const version = opportunity.mandate_version_id ? parseVersion(findById(db, 'mandate_versions', opportunity.mandate_version_id)) : null;
  const facts = db.prepare('SELECT f.field, s.url FROM facts f JOIN sources s ON s.id = f.source_id WHERE f.company_id = ?').all(company.id);
  return computeScore({
    opportunity, now, facts, servicesByCode,
    people: peopleFor(db, opportunity),
    companyDomain: normalizeDomain(company.website),
    mandateServiceCodes: version ? version.service_codes : [],
  });
}
