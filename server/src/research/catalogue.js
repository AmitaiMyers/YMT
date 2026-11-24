// The one service catalogue (decision 29, 24.11.2026): YMT Consulting (IL-*) from the services design document and
// YMT Development Partnerships (GL-*), plus the three codes added by decision 30 (GL-12, GL-13, IL-13).
// Status per the services document; the spec's own services are "available for sale today" (ready).

import { insert } from '../db.js';

export const DEFAULT_SERVICES = [
  ['IL-1', 'IL', 'Introduction call', 'שיחת היכרות', 'ready'],
  ['IL-2', 'IL', 'Business assessment', 'אבחון עסקי', 'in_build'],
  ['IL-3', 'IL', 'Business-strategic support', 'ליווי עסקי-אסטרטגי', 'ready'],
  ['IL-4', 'IL', 'Focused project', 'פרויקט ממוקד', 'ready'],
  ['IL-5', 'IL', 'Processes and organisational structure', 'הטמעת תהליכים ומבנה ארגוני', 'ready'],
  ['IL-6', 'IL', 'Marketing and branding', 'שיווק ומיתוג', 'ready'],
  ['IL-7', 'IL', 'Automation and digitisation', 'אוטומציה ודיגיטציה', 'ready'],
  ['IL-8', 'IL', 'Human capital: assessment, placement, workshops', 'הון אנושי: אבחון, השמה, סדנאות', 'ready'],
  ['IL-9', 'IL', 'Pension and insurance', 'פנסיה וביטוח', 'in_build'],
  ['IL-10', 'IL', 'Financing, banks and grants', 'מימון, בנק ומענקים', 'in_build'],
  ['IL-11', 'IL', 'Sourcing suppliers and import', 'איתור ספקים ויבוא', 'in_build'],
  ['IL-12', 'IL', 'Business community', 'קהילת עסקים', 'in_build'],
  ['IL-13', 'IL', 'Sales growth in Israel', 'צמיחת מכירות בישראל', 'ready'],
  ['GL-1', 'GL', 'Market-readiness assessment', 'אבחון מוכנות לשוק', 'in_review'],
  ['GL-2', 'GL', 'Connection to a distributor or local partner', 'חיבור למפיץ / שותף מקומי', 'ready'],
  ['GL-3', 'GL', 'Target-market survey', 'סקירת שוק יעד', 'ready'],
  ['GL-4', 'GL', 'B2B meetings for a trade show or delegation', 'פגישות B2B לתערוכה / משלחת', 'ready'],
  ['GL-5', 'GL', 'Sourcing manufacturers and suppliers abroad', 'איתור יצרנים וספקים במזרח', 'in_build'],
  ['GL-6', 'GL', 'India market entry end to end', 'כניסה לשוק ההודי מקצה לקצה', 'ready'],
  ['GL-7', 'GL', 'Managing an existing distribution network', 'ניהול ערוץ הפצה קיים', 'ready'],
  ['GL-8', 'GL', 'Ongoing business development in Asia-Pacific', 'פיתוח עסקי מתמשך באסיה-פסיפיק', 'in_review'],
  ['GL-9', 'GL', 'Two-way consulting', 'ייעוץ דו-כיווני', 'in_review'],
  ['GL-10', 'GL', 'Operations improvement / preparation for exit', 'שיפור אופרציה / הכנה לאקזיט', 'in_review'],
  ['GL-11', 'GL', 'Subcontractors in defence', 'קבלני משנה בדיפנס', 'not_offered'],
  ['GL-12', 'GL', 'Japan market entry', 'כניסה לשוק היפני', 'ready'],
  ['GL-13', 'GL', 'Local production or JV in India or Japan', 'ייצור מקומי או JV בהודו או ביפן', 'ready'],
].map(([code, line, nameEn, nameHe, status], index) => ({ code, line, name_en: nameEn, name_he: nameHe, status, sort: index + 1 }));

/** Adds the codes that are missing; never changes a status an admin has set. */
export function seedServices(db) {
  const exists = db.prepare('SELECT 1 FROM services WHERE code = ?');
  for (const service of DEFAULT_SERVICES) {
    if (!exists.get(service.code)) insert(db, 'services', service);
  }
}

export function loadServices(db) {
  return db.prepare('SELECT * FROM services ORDER BY sort').all();
}
