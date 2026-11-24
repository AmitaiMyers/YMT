// YMT's six mandates as worded in the lead-finding agent specification (22.11.2026, Tom's mandate table), plus GE1
// (kept by decision 6). Seeded into an empty database, paused and without an owner until an admin assigns one; an
// existing database receives them as a new version (see applySpec2211 in mandates.js).

const M = 1_000_000;

const COMMON_FALSE_POSITIVES = [
  'An Indian or other local company or factory offering its services or capacity (a supplier, not a client)',
  'No proven export, the company was sold or closed, or its operations moved abroad',
  'A trade show the company did not itself confirm, or an industry-level trend',
];

export const DEFAULT_MANDATES = [
  {
    code: 'SH1', name: 'India: entry, distribution, commercial partnerships, expansion',
    target_countries: ['India'], need_types: ['market_entry_distribution'],
    accept_rule: 'An export-ready product business names a current India initiative (a distributor or partner search, an India trade show '
      + 'or delegation it confirmed, an India office or hire, an Indian regulatory registration). Companies already selling in India through '
      + 'one distributor that want to expand also count, at a lower priority. The early trigger is a preference, not a requirement.',
    false_positives: [
      'General interest in Asia without a named India initiative (Verify, not Reject)',
      'India is already the company\'s largest market, or it has its own subsidiary, office, plant or JV in India (Reject)',
      'A signed distributor or MoU covering India and no wish to expand (Defer: fits, but not now)',
      ...COMMON_FALSE_POSITIVES,
    ],
    employees_min: 50, employees_max: 249, revenue_min_usd: 10 * M, revenue_max_usd: 100 * M, revenue_floor_usd: 30 * M,
    search_terms: ['India distributor', 'Indian market entry', 'India partner', 'expands to India', 'India trade show', 'BIS certification', 'CDSCO registration'],
    proposed_service: 'Connection to a distributor or local partner in India, with SHEPHA',
    service_codes: ['GL-2', 'GL-3', 'GL-4', 'GL-6', 'GL-7'],
  },
  {
    code: 'SH2', name: 'Japan: entry, distribution, integration partner',
    target_countries: ['Japan'], need_types: ['market_entry_distribution', 'implementation_partner'],
    accept_rule: 'A proven B2B vendor names a launch in Japan or a search for a Japanese partner or systems integrator.',
    false_positives: ['A translated or Japanese website alone, with no dated partner initiative', ...COMMON_FALSE_POSITIVES],
    employees_min: 10, employees_max: 249, revenue_min_usd: 1 * M, revenue_max_usd: 100 * M, revenue_floor_usd: 1 * M,
    search_terms: ['Japan launch', 'Japanese partner', 'systems integrator Japan', 'Japan rollout'],
    proposed_service: 'Check local integration and build a partner list in Japan',
    service_codes: ['GL-12', 'GL-2', 'GL-3'],
  },
  {
    code: 'SH3', name: 'India or Japan: production, subcontractors, JV',
    target_countries: ['India', 'Japan'], need_types: ['production_jv'],
    accept_rule: 'A product owner names a manufacturing, contract-production or joint-venture initiative in India or Japan.',
    false_positives: ['A sales-channel request (belongs to SH1 or SH2)', 'The company already has a JV or plant in that country (Reject)', ...COMMON_FALSE_POSITIVES],
    employees_min: 50, employees_max: 999, revenue_min_usd: 10 * M, revenue_max_usd: 500 * M, revenue_floor_usd: 30 * M,
    search_terms: ['manufacturing partner India', 'joint venture Japan', 'contract manufacturing India', 'production facility India'],
    proposed_service: 'Compare production models and find partners',
    service_codes: ['GL-13'],
  },
  {
    code: 'OM1', name: 'Israel: operational diagnosis, reorganisation, integration',
    target_countries: ['Israel'], need_types: ['operating_review'],
    accept_rule: 'Local management names an examination of its operating model: restructuring, integration or an operating review in Israel.',
    false_positives: ['A new CEO alone, with no announced review (Verify)'],
    employees_min: 10, employees_max: 249, revenue_min_usd: 1 * M, revenue_max_usd: 100 * M, revenue_floor_usd: null,
    search_terms: ['restructuring', 'operational review', 'merger integration', 'reorganisation'],
    proposed_service: 'A focused business diagnosis',
    service_codes: ['IL-2'],
  },
  {
    code: 'OM2', name: 'Israel: sales growth, distribution, customer retention',
    target_countries: ['Israel'], need_types: ['domestic_sales_growth'],
    accept_rule: 'An established Israeli B2B company has a channel, sales or customer-retention goal in Israel.',
    false_positives: ['A sales goal abroad (belongs to an international mandate)', 'A routine product launch with no channel or retention goal'],
    employees_min: 50, employees_max: 249, revenue_min_usd: 10 * M, revenue_max_usd: 100 * M, revenue_floor_usd: null,
    search_terms: ['new sales channel Israel', 'distribution change', 'customer retention programme'],
    proposed_service: 'A pipeline and channel review',
    service_codes: ['IL-13'],
  },
  {
    code: 'OM3', name: 'Israel: VP and C-suite recruitment',
    target_countries: ['Israel'], need_types: ['executive_search'],
    accept_rule: 'A current official vacancy or succession search for a VP or C-suite role in Israel (Elad joins for assessment).',
    false_positives: ['A role already filled', 'A role abroad (country manager)'],
    employees_min: 50, employees_max: 999, revenue_min_usd: 10 * M, revenue_max_usd: 500 * M, revenue_floor_usd: null,
    search_terms: ['VP Operations', 'Chief Executive Officer', 'VP Sales', 'CFO vacancy'],
    proposed_service: 'Defining the role',
    service_codes: ['IL-8'],
  },
  {
    code: 'GE1', name: 'Growth & Exit',
    target_countries: ['Israel'], need_types: ['growth_exit'],
    accept_rule: 'An Israeli company announces an acquisition search, an alliance or joint venture, an investment round, or preparation for sale.',
    false_positives: ['A completed deal with no next step'],
    employees_min: 50, employees_max: 999, revenue_min_usd: 10 * M, revenue_max_usd: 500 * M, revenue_floor_usd: null,
    search_terms: ['acquisition strategy', 'strategic alternatives', 'investment round', 'preparing for sale'],
    proposed_service: 'A growth and exit assessment',
    service_codes: ['GL-10'],
  },
];
