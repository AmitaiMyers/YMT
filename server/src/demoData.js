// Fictional demo data, shared by `npm run seed:demo` and the demo bootstrap. Callers decide when it may run.

import { insert, transaction } from './db.js';

/** Insert the demo companies, contacts, deals, meeting and network records, owned by `ownerId`. */
export function loadDemoData(db, ownerId) {
  const workflowId = db.prepare('SELECT id FROM workflows ORDER BY id LIMIT 1').get().id;
  const daysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString();
  const daysAhead = (days) => new Date(Date.now() + days * 86400000).toISOString();

  transaction(db, () => {
    const precision = insert(db, 'companies', {
      name: 'Precision Valves Ltd. (demo)', industry: 'Industrial valves', country: 'Israel', website: 'https://example.com/valves',
      employee_count: 180, annual_revenue_usd: 42000000, exports: 1, export_markets: 'USA, Germany', india_activity: 'exploring',
      is_client: 1, notes: 'Fictional demo company.',
    });
    const agri = insert(db, 'companies', {
      name: 'AgriDrip Systems (demo)', industry: 'Irrigation equipment', country: 'Israel', website: 'https://example.com/agri',
      employee_count: 95, annual_revenue_usd: 18000000, exports: 1, export_markets: 'Spain, Mexico', india_activity: 'none',
      is_client: 0, notes: 'Fictional demo company.',
    });

    insert(db, 'triggers', {
      company_id: agri, type: 'trade_show', description: 'they are exhibiting at an agriculture trade show in New Delhi',
      source_url: 'https://example.com/news/trade-show', detected_on: daysAgo(5).slice(0, 10), created_by: ownerId,
    });
    insert(db, 'triggers', {
      company_id: precision, type: 'job_posting', description: 'they posted a "Business Development Manager – India" role',
      source_url: 'https://example.com/jobs/123', detected_on: daysAgo(20).slice(0, 10), created_by: ownerId,
    });

    const dana = insert(db, 'contacts', {
      company_id: precision, full_name: 'Dana Cohen', job_title: 'VP Sales', department: 'sales', email: 'dana@example.com',
      preferred_language: 'he', verified: 1, verified_source: 'Company website team page', verified_by: ownerId, verified_at: daysAgo(10),
    });
    insert(db, 'contacts', {
      company_id: agri, full_name: 'Avi Mizrahi', job_title: 'Head of Asia Desk', department: 'asia_desk', email: 'avi@example.com',
      preferred_language: 'en', verified: 0,
    });

    const precisionDeal = insert(db, 'deals', {
      company_id: precision, workflow_id: workflowId, title: 'India market entry – valves', stage: 'meeting', owner_id: ownerId,
      deal_model: 'retainer', expected_value_usd: 60000, last_activity_at: daysAgo(3), stage_changed_at: daysAgo(3),
    });
    insert(db, 'deals', {
      company_id: agri, workflow_id: workflowId, title: 'Distributor search – irrigation', stage: 'outreach', owner_id: ownerId,
      deal_model: 'commission', expected_value_usd: 25000, last_activity_at: daysAgo(30), stage_changed_at: daysAgo(30),
    });

    insert(db, 'interactions', {
      company_id: precision, deal_id: precisionDeal, contact_id: dana, channel: 'phone', direction: 'outbound',
      summary: 'Intro call, interested in Pune industrial cluster', occurred_at: daysAgo(3), user_id: ownerId,
    });
    insert(db, 'meetings', {
      company_id: precision, deal_id: precisionDeal, title: 'Strategy meeting – India entry', scheduled_at: daysAhead(4),
      location: 'Client office, Haifa', attendees: 'Dana Cohen, YMT team',
    });

    insert(db, 'resources', {
      type: 'manufacturer', name: 'Pune Castings Pvt. (demo)', country: 'India', city: 'Pune', industries: 'Industrial valves, Castings',
      capabilities: 'Investment casting, CNC machining', certifications: 'ISO 9001', nda_signed: 1, rating: 4,
    });
    insert(db, 'resources', {
      type: 'expert', name: 'Ravi Sharma (demo)', country: 'India', city: 'Mumbai', industries: 'Irrigation equipment, Agritech',
      capabilities: 'Distribution networks in Maharashtra', nda_signed: 0, rating: 5,
    });

    loadDemoResearch(db, ownerId, daysAgo);
  });
}

/**
 * Fictional research cards based on YMT's training cases, so the review flow can be tried before an AI key is set.
 * SH2 and OM3 are assigned to `ownerId` and activated; one Vietnam initiative waits in the manual queue.
 */
function loadDemoResearch(db, ownerId, daysAgo) {
  const mandate = (code) => db.prepare('SELECT id, current_version_id FROM mandates WHERE code = ?').get(code);
  const sh2 = mandate('SH2');
  const om3 = mandate('OM3');
  for (const m of [sh2, om3]) db.prepare("UPDATE mandates SET owner_id = ?, status = 'active' WHERE id = ?").run(ownerId, m.id);

  const cards = [
    { company: 'Kesher Workflow Ltd. (demo)', site: 'kesher', employees: 95, sector: 'tech_comms', subsector: 'Industrial workflow software', model: 'software_ip',
      mandate: sh2, country: 'Japan', need: 'implementation_partner', verdict: 'match', status: 'draft', days: 6,
      quote: 'Kesher Workflow is inviting Japanese systems integrators to apply as implementation partners for its 2027 launch.',
      reason: 'A dated, Japan-specific call for implementation partners from a proven B2B vendor.' },
    { company: 'Ori Apparel (demo)', site: 'ori', employees: 95, sector: 'consumer_trade', subsector: 'Apparel', model: 'product_owner',
      mandate: sh2, country: 'Japan', need: 'market_entry_distribution', verdict: 'match', status: 'draft', days: 11,
      quote: 'Ori Apparel has published a request for distributors in Japan.', reason: 'A brand owner with a published distributor request for Japan.' },
    { company: 'Galil Precision (demo)', site: 'galil', employees: 140, sector: 'industry_manufacturing', subsector: 'Precision components', model: 'product_owner',
      mandate: om3, country: 'Israel', need: 'executive_search', verdict: 'weak', status: 'draft', days: 4,
      quote: 'Galil Precision is hiring a VP Operations for its plant in Karmiel.',
      reason: 'A current VP vacancy in Israel; openness to external search support is not yet confirmed.' },
    { company: 'Negev Robotics (demo)', site: 'negev', employees: 60, sector: 'industry_manufacturing', subsector: 'Robotics', model: 'product_owner',
      mandate: null, country: 'Vietnam', need: 'technology_scouting', verdict: 'match', status: 'manual_assignment', days: 9,
      quote: 'Negev Robotics is looking for vision-technology providers in Vietnam.', reason: 'A dated technology-scouting initiative in Vietnam (no mandate covers it yet).' },
  ];
  for (const card of cards) {
    const url = `https://example.com/demo/${card.site}`;
    const companyId = insert(db, 'companies', {
      name: card.company, industry: card.subsector, country: 'Israel', website: `https://example.com/${card.site}`, origin: 'research',
      israel_connection: 'hq_israel', hq_country: 'Israel', incorporation_country: 'Israel', model_primary: card.model, sector: card.sector,
      subsector: card.subsector, customer_types: '["business"]', employees_min: card.employees, employees_max: card.employees,
      employees_as_of: '2026', employee_count: card.employees, notes: 'Fictional demo company.',
    });
    const sourceId = insert(db, 'sources', { url, title: `${card.company}: announcement`, published_on: daysAgo(card.days).slice(0, 10), kind: 'web' });
    for (const [field, value, quote] of [
      ['israel_connection', 'hq_israel', 'headquartered in Israel'],
      ['employees', String(card.employees), `${card.employees} employees`],
      ['sector', card.sector, card.subsector],
    ]) {
      insert(db, 'facts', { company_id: companyId, field, value, source_id: sourceId, quote, entity_covered: card.company });
    }
    insert(db, 'opportunities', {
      company_id: companyId, mandate_id: card.mandate ? card.mandate.id : null, mandate_version_id: card.mandate ? card.mandate.current_version_id : null,
      owner_id: card.mandate ? ownerId : null, relationship_role: 'client', target_country: card.country, need_type: card.need,
      business_need: card.quote, evidence_source_id: sourceId, evidence_date: daysAgo(card.days).slice(0, 10), evidence_quote: card.quote,
      verdict: card.verdict, verdict_reason: card.reason, reason_to_act: 'Published within the last two weeks.',
      unknowns: JSON.stringify(['revenue']), flags: JSON.stringify(card.verdict === 'weak' ? ['weak_evidence'] : []), status: card.status,
    });
  }
}
