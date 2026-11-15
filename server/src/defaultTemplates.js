// Default document/email templates, inserted once on first start.
// Staff edit them later in Settings → Templates. Placeholders use {{name}}; the list of
// available placeholders per kind is exported from generators.js (PLACEHOLDERS).

export const DEFAULT_TEMPLATES = [
  // ---------------------------------------------------------------- company brief
  {
    kind: 'company_brief', language: 'he', name: 'תקציר חברה', subject: null,
    body: `תקציר מנהלים – {{company_name}}

תחום: {{industry}} | מדינה: {{country}}
עובדים: {{employee_count}} | מחזור שנתי (USD): {{annual_revenue_usd}}
ייצוא: {{exports}} | שווקי ייצוא: {{export_markets}}
פעילות בהודו: {{india_activity}}
אתר: {{website}}

טריגרים עדכניים:
{{triggers_list}}

אנשי קשר רלוונטיים:
{{contacts_list}}

היסטוריית קשר: {{interaction_count}} אינטראקציות, אחרונה: {{last_interaction}}

הערות:
{{notes}}`,
  },
  {
    kind: 'company_brief', language: 'en', name: 'Company brief', subject: null,
    body: `Executive brief – {{company_name}}

Industry: {{industry}} | Country: {{country}}
Employees: {{employee_count}} | Annual revenue (USD): {{annual_revenue_usd}}
Exports: {{exports}} | Export markets: {{export_markets}}
India activity: {{india_activity}}
Website: {{website}}

Recent triggers:
{{triggers_list}}

Relevant contacts:
{{contacts_list}}

Contact history: {{interaction_count}} interactions, latest: {{last_interaction}}

Notes:
{{notes}}`,
  },
  // ---------------------------------------------------------------- outreach
  {
    kind: 'outreach_email', language: 'he', name: 'פנייה ראשונית', subject: '{{company_name}} – הזדמנויות צמיחה בהודו',
    body: `שלום {{contact_name}},

שמי {{sender_name}} מ-{{our_company}}. אנו מלווים חברות תעשייה ישראליות בכניסה לשוק ההודי ובחיבור ליצרנים וספקים באסיה.

{{trigger_hook}}

אשמח לשיחה קצרה של 20 דקות כדי להבין את תוכניות הצמיחה שלכם ולבדוק אם נוכל לעזור.

בברכה,
{{sender_name}}
{{our_company}}`,
  },
  {
    kind: 'outreach_email', language: 'en', name: 'Initial outreach', subject: '{{company_name}} – growth opportunities in India',
    body: `Dear {{contact_name}},

My name is {{sender_name}} from {{our_company}}. We help industrial companies enter the Indian market and connect with manufacturers and suppliers across Asia.

{{trigger_hook}}

I would welcome a short 20-minute call to learn about your growth plans and see whether we can help.

Best regards,
{{sender_name}}
{{our_company}}`,
  },
  // ---------------------------------------------------------------- follow-up
  {
    kind: 'followup_email', language: 'he', name: 'מעקב', subject: 'מעקב: {{deal_title}}',
    body: `שלום {{contact_name}},

רציתי לחזור לפנייתי הקודמת בנוגע ל{{deal_title}} (פנייה {{followup_number}} מתוך {{max_followups}}).
האם יש זמן נוח לשיחה קצרה בשבועות הקרובים?

בברכה,
{{sender_name}}
{{our_company}}`,
  },
  {
    kind: 'followup_email', language: 'en', name: 'Follow-up', subject: 'Following up: {{deal_title}}',
    body: `Dear {{contact_name}},

I wanted to follow up on my previous note regarding {{deal_title}} (touchpoint {{followup_number}} of {{max_followups}}).
Would there be a convenient time for a short call in the coming weeks?

Best regards,
{{sender_name}}
{{our_company}}`,
  },
  // ---------------------------------------------------------------- post-meeting follow-up
  {
    kind: 'meeting_followup_email', language: 'he', name: 'סיכום פגישה ללקוח', subject: 'סיכום פגישה: {{meeting_title}}',
    body: `שלום {{contact_name}},

תודה על הפגישה ב-{{meeting_date}}. להלן סיכום עיקרי הדברים:

החלטות:
{{decisions_list}}

משימות להמשך:
{{tasks_list}}

{{summary}}

בברכה,
{{sender_name}}
{{our_company}}`,
  },
  {
    kind: 'meeting_followup_email', language: 'en', name: 'Meeting summary to client', subject: 'Meeting summary: {{meeting_title}}',
    body: `Dear {{contact_name}},

Thank you for the meeting on {{meeting_date}}. Here is a summary of what we agreed:

Decisions:
{{decisions_list}}

Action items:
{{tasks_list}}

{{summary}}

Best regards,
{{sender_name}}
{{our_company}}`,
  },
  // ---------------------------------------------------------------- documents
  {
    kind: 'quote', language: 'he', name: 'הצעת מחיר', subject: null,
    body: `הצעת מחיר

לכבוד: {{company_name}}
תאריך: {{today}}
נושא: {{deal_title}}

מודל התקשרות: {{deal_model}}
היקף משוער (USD): {{expected_value_usd}}

תוקף ההצעה: 30 יום מתאריך זה.

{{our_company}}`,
  },
  {
    kind: 'quote', language: 'en', name: 'Price quote', subject: null,
    body: `Price quote

To: {{company_name}}
Date: {{today}}
Subject: {{deal_title}}

Engagement model: {{deal_model}}
Estimated value (USD): {{expected_value_usd}}

This quote is valid for 30 days from the date above.

{{our_company}}`,
  },
  {
    kind: 'agreement', language: 'he', name: 'הסכם התקשרות', subject: null,
    body: `הסכם התקשרות

בין: {{our_company}} ("החברה")
לבין: {{company_name}} ("הלקוח")
תאריך: {{today}}

1. מהות השירות: {{deal_title}}.
2. מודל תמורה: {{deal_model}}.
3. סודיות: הצדדים מתחייבים לשמור בסודיות כל מידע שיועבר ביניהם, לרבות מידע של שותפים זרים.
4. תוקף: ההסכם בתוקף מיום החתימה.

חתימות הצדדים מצורפות להלן.`,
  },
  {
    kind: 'agreement', language: 'en', name: 'Engagement agreement', subject: null,
    body: `Engagement agreement

Between: {{our_company}} ("the Company")
And: {{company_name}} ("the Client")
Date: {{today}}

1. Scope of service: {{deal_title}}.
2. Compensation model: {{deal_model}}.
3. Confidentiality: both parties shall keep confidential all information exchanged, including information of foreign partners.
4. Term: this agreement is effective from the date of signature.

Signatures of the parties are attached below.`,
  },
  {
    kind: 'meeting_summary', language: 'he', name: 'סיכום פגישה', subject: null,
    body: `סיכום פגישה – {{meeting_title}}

לקוח: {{company_name}}
תאריך: {{meeting_date}}
משתתפים: {{attendees}}

החלטות:
{{decisions_list}}

משימות:
{{tasks_list}}

סיכום:
{{summary}}`,
  },
  {
    kind: 'meeting_summary', language: 'en', name: 'Meeting summary', subject: null,
    body: `Meeting summary – {{meeting_title}}

Client: {{company_name}}
Date: {{meeting_date}}
Attendees: {{attendees}}

Decisions:
{{decisions_list}}

Action items:
{{tasks_list}}

Summary:
{{summary}}`,
  },
];
