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
  });
}
