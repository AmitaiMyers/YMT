// Fixed lists from the lead-finding agent specification (22.11.2026) that the prompts and the score share.

export const FOCUS_AREAS = ['software', 'defence and dual-use (the whole field)', 'plastics and metal manufacturing'];

export const PRIORITY_SUBSECTORS = [
  'Industry & manufacturing: polymers, plastics & additives; advanced & recycled materials; industrial equipment & heat transfer; '
    + 'valves, flow control & precision components; packaging; lighting & electrical; fire & safety systems',
  'Technology & communications: industrial / OT cybersecurity; enterprise software (ERP); financial-crime & regtech software; climate & weather data',
  'Health & life sciences: medical devices; dental',
  'Energy, resources & environment: renewable energy & agrivoltaics; oil & gas equipment; water & wastewater (lower priority)',
  'Construction & real estate: building materials & surfaces; infrastructure contractors',
  'Defence & dual-use: the whole field (vehicles and systems, software, subcontractors, dual-use)',
];

// Sectors where SHEPHA has experience: a fit mark for India.
export const SHEPHA_SECTORS = ['medical', 'energy', 'cyber', 'water'];

// Who to look for, by mandate family (spec keyword list; Israel roles per decision 23).
export const CONTACT_KEYWORDS = {
  SH: ['VP', 'VP Marketing & Sales', 'VP Business Development', 'Asia-Pacific Market Development', 'Head of APAC / Asia Sales', 'International Sales',
    'B2B Sales Leader', 'Revenue Growth', 'Global Business Development', 'Strategic Partnerships'],
  OM: ['CEO', 'VP Operations', 'VP Sales', 'VP HR'],
  GE: ['CEO', 'CFO', 'Chairman', 'VP Business Development'],
};

export function contactKeywordsFor(mandateCode) {
  const family = mandateCode ? mandateCode.slice(0, 2) : 'SH';
  return CONTACT_KEYWORDS[family] ?? CONTACT_KEYWORDS.SH;
}

/** Target country → market key of the per-market fit (Israel has none). */
export function marketOf(country) {
  const key = country.trim().toLowerCase();
  if (key === 'india') return 'india';
  if (key === 'japan') return 'japan';
  if (key === 'thailand' || key === 'vietnam' || key === 'viet nam') return 'thailand_vietnam';
  if (key === 'china') return 'china';
  return null;
}
