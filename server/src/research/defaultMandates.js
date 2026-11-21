// YMT's mandates from the referral guide ("Six agent mandates") and the routing reference. GE1 is a draft for Tom
// and Tomer to confirm. Seeded once into an empty database, paused and without an owner until an admin assigns one.

const M = 1_000_000;

export const DEFAULT_MANDATES = [
  {
    code: 'SH1', name: 'India: market entry and distribution',
    target_countries: ['India'], need_types: ['market_entry_distribution'],
    accept_rule: 'An export-ready product business names India and an active distribution or market-entry initiative.',
    false_positives: ['General interest in Asia without a named India initiative (send to Verify)', 'An Indian company offering its services (a supplier, not a client)'],
    employees_min: 50, employees_max: 249, revenue_min_usd: 10 * M, revenue_max_usd: 100 * M,
    search_terms: ['India distributor', 'Indian market entry', 'India partnership', 'expands to India'],
    proposed_service: 'Map the route to market in India (with SHEPHA)',
  },
  {
    code: 'SH2', name: 'Japan: market entry and integration',
    target_countries: ['Japan'], need_types: ['market_entry_distribution', 'implementation_partner'],
    accept_rule: 'A proven B2B vendor names a Japan rollout or an integration-partner search.',
    false_positives: ['A translated or Japanese website alone, with no dated partner initiative'],
    employees_min: 10, employees_max: 249, revenue_min_usd: 1 * M, revenue_max_usd: 100 * M,
    search_terms: ['Japan launch', 'Japanese partner', 'systems integrator Japan', 'Japan rollout'],
    proposed_service: 'Assess local integration and shortlist partners in Japan',
  },
  {
    code: 'SH3', name: 'India or Japan: production or joint venture',
    target_countries: ['India', 'Japan'], need_types: ['production_jv'],
    accept_rule: 'A product owner names India or Japan and a manufacturing, contract-production or joint-venture initiative.',
    false_positives: ['A sales-channel request (belongs to SH1 or SH2)', 'An Indian factory advertising spare capacity (a supplier)'],
    employees_min: 50, employees_max: 999, revenue_min_usd: 10 * M, revenue_max_usd: 500 * M,
    search_terms: ['manufacturing partner India', 'joint venture Japan', 'contract manufacturing India', 'production facility India'],
    proposed_service: 'Compare production models and shortlist partners',
  },
  {
    code: 'OM1', name: 'Israel: business diagnostics and operating review',
    target_countries: ['Israel'], need_types: ['operating_review'],
    accept_rule: 'A local management team announces restructuring, integration or an operating review in Israel.',
    false_positives: ['A new CEO alone, with no announced review (send to Verify)'],
    employees_min: 10, employees_max: 249, revenue_min_usd: 1 * M, revenue_max_usd: 100 * M,
    search_terms: ['restructuring', 'operational review', 'merger integration', 'reorganisation'],
    proposed_service: 'A focused business diagnostic',
  },
  {
    code: 'OM2', name: 'Israel: sales, distribution and retention',
    target_countries: ['Israel'], need_types: ['domestic_sales_growth'],
    accept_rule: 'An established Israeli B2B company has a domestic channel, sales or customer-retention objective.',
    false_positives: ['Overseas sales objectives (route to an international mandate)', 'A routine product launch with no channel or retention objective'],
    employees_min: 50, employees_max: 249, revenue_min_usd: 10 * M, revenue_max_usd: 100 * M,
    search_terms: ['new sales channel Israel', 'distribution change', 'customer retention programme'],
    proposed_service: 'Review pipeline and channel performance',
  },
  {
    code: 'OM3', name: 'Israel: VP and C-suite executive search',
    target_countries: ['Israel'], need_types: ['executive_search'],
    accept_rule: 'A current official vacancy or succession search specifies a VP or C-suite mandate in Israel (Elad joins for assessment).',
    false_positives: ['An overseas country-manager role', 'A role that has already been filled', 'No openness to external search support (confirm separately)'],
    employees_min: 50, employees_max: 999, revenue_min_usd: 10 * M, revenue_max_usd: 500 * M,
    search_terms: ['VP Operations', 'Chief Executive Officer', 'VP Sales', 'CFO vacancy'],
    proposed_service: 'Define the leadership brief',
  },
  {
    code: 'GE1', name: 'Growth & Exit (draft – to confirm with Tom and Tomer)',
    target_countries: ['Israel'], need_types: ['growth_exit'],
    accept_rule: 'An Israeli company announces an acquisition search, an alliance or joint venture, an investment round, or preparation for sale.',
    false_positives: ['A completed deal with no next step'],
    employees_min: 50, employees_max: 999, revenue_min_usd: 10 * M, revenue_max_usd: 500 * M,
    search_terms: ['acquisition strategy', 'strategic alternatives', 'investment round', 'preparing for sale'],
    proposed_service: 'A 2–4 week growth and exit assessment',
  },
];
