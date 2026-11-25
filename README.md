# YMT Group – Automation & IT PWA (MVP)

An internal Progressive Web App for YMT Group: **lead research**, **CRM pipeline** and **client service hub**,
bilingual (Hebrew RTL / English LTR), with a strict **human-in-the-loop** policy: the system never sends anything by itself.

## Quick start

Requirements: **Node.js 22.13+** (uses the built-in `node:sqlite`, so there is no native database driver to compile). Check with `node -v`; on an older version `npm install` stops with an `EBADENGINE` error (Windows: install the `-x64.msi` from https://nodejs.org/dist/latest-v22.x/, then open a new terminal).

```bash
npm install
cp .env.example .env                       # optional: port, data folder, hosting description
npm run user:create -- --username admin --name "Admin" --password "choose-10+-chars" --admin
npm run seed:demo                          # optional: fictional demo data to explore
npm run dev                                # API on :3001, app on http://localhost:5173
```

Production (single process serves API + built app):

```bash
npm run build
NODE_ENV=production npm start             # http://localhost:3001 – put it behind HTTPS
```

`npm test` runs the API tests that guard the business rules below.

## Using it on phone and desktop

The app is an installable PWA. **Desktop (Chrome/Edge):** use the *Install app* button in the sidebar footer or under Settings → General. **Android:** the same button. **iPhone/iPad (Safari):** Share → *Add to Home Screen*; the app shows these steps when you tap *Install app*.
The home screen is the **Inbox**, which lists everything that needs you. Ctrl/⌘+K searches companies, deals and screens, and `?` lists the keyboard shortcuts. The UI design is documented in [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md).

## Deploying

The repository includes a `Dockerfile` that builds one container serving both the API and the app on port 3001.

1. Use any host that runs a container **and gives you a persistent disk**, mounted at `/data`. The SQLite database lives there; without a persistent disk, data is lost on every restart.
2. Set the environment variables: `HOSTING_LOCATION` (for example "Render, Frankfurt EU"). `TRUST_PROXY=1` is already set in the image and is correct behind a single HTTPS proxy.
3. The host must serve the app over **HTTPS**. Secure session cookies and PWA installation both require it.
4. Create the first admin in one of two ways:
   - **Demo hosting (Render):** set the Docker command to `npm run demo:start` and add the environment variables `ADMIN_USERNAME`, `ADMIN_PASSWORD` (at least 10 characters) and, optionally, `ADMIN_NAME`. On every start this creates that admin **only if the username doesn't exist yet** and loads the demo data **only into an empty database**, so restarts and redeploys are safe. Changing the variables later never changes an existing account; use Settings → Users for that.
   - **Without demo data:** from the host's shell, run `node server/scripts/create-user.js --username … --name "…" --password "…" --admin`.

A step-by-step founder checklist is in [`docs/FOUNDER_TASKS.md`](docs/FOUNDER_TASKS.md).

## Research pilot (Release 1)

Research agents find **Israeli companies with a dated business initiative** that fits one of YMT's mandates (SH1–SH3 for Shir, OM1–OM3 for Omer, GE1 for Tomer as a draft), build a company card from YMT's classification dictionary, and put it in the owner's **Research review** queue. **Draft only: nothing is sent to anyone.** The design is in [`docs/system-design.html`](docs/system-design.html); open questions for Tom are in [`docs/client-requirements-checklist.html`](docs/client-requirements-checklist.html).

**Switch it on (once):**

1. Create an account in the [Anthropic Console](https://console.anthropic.com/) owned by YMT, create an API key, and set a monthly spend limit there as a second guard.
2. On the host add `ANTHROPIC_API_KEY`. Without it, everything works except **Run**, which says what is missing. (`OPENAI_API_KEY` is optional, for comparing providers; the OpenAI adapter has not yet been tried with a real key.)
3. **Research → Mandates** (admin): open each mandate, choose its **owner** and set it **Active**. Mandates start paused and without an owner.
4. **AI settings** (same screen, admins): the monthly cap (default **$20**), and the provider and model per task (default Claude Sonnet 5.5). Prices per model are listed there; add a price before using a new model.

**View (Settings → General → View):** the app opens in the **Focused** view, which shows only what YMT works on now: lead research (review, mandates, watch lists, metrics, SHEPHA list, services), clients and contacts, deals and pipeline, outreach (approvals, conversations) and the calendar with meeting scheduling. It hides the Inbox, the old lead search, Documents, Suppliers & experts, the old Dashboard, the meeting prep sheet, the AI meeting-summary draft, the company brief and template email, the company tabs Triggers, Documents, Matches, Sharing and Discovery, and the old company fields India activity, Export markets and Exports (replaced by **status and fit per market** and **proven export**, which staff can also set by hand on the company's Overview). The home screen is Research review; its **My tasks** tab lists your open tasks (overdue first, with *Everyone* for the whole team), meetings that ended without a summary and deals with no recent activity. Nothing is deleted: an admin switches to **Full** and every screen is back for everyone. The list of hidden features is in `client/src/app/viewMode.jsx`.

**Lead flow (home of the Focused view):** a board with one column per step – To review, Approved, First message, Waiting for reply, Replied, Meeting, Closed – and **Run agent** at the top. Each card says the one thing to do next; open it and the **Next step** panel has the button that does it. Messages go out with one click, **Approve & send**: the app records the message and opens it in Gmail, WhatsApp or LinkedIn for you to press Send. The design is in [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) §6.

**Daily use:**

- **Run** a mandate and choose how many cards (1–20), or set it to run weekly on a chosen day. A run takes a few minutes; each card costs roughly $0.08–0.13.
- **Research review:** cards with a trigger come first, then the highest **score** (0–100, tier A ≥ 80, B ≥ 65; see below). Open a card, check the quoted evidence and the source of every fact, then **Accept / Verify / Defer / Reject** (keys A, V, D, R select; a click confirms). Reject needs a reason; Verify and Defer need a note. Verify creates a task; Defer asks for a come-back date (default 90 days) and creates a task for that day; Accept opens the card's deal. The next card opens automatically.
- **Score (spec of 22.11.2026):** subsector fit 25, trigger 25 (full up to 6 months, half at 6–12, none after), decision-maker access 20, fit to our service 20 (by the service's status in the catalogue), evidence quality 10; −10 when the company already sells in the market through one distributor. The AI only picks levels and cites evidence; the points are computed by code when the card is read, and the card shows every part. A job posting or distributor-search page counts only while still open: the card has **Still open / No longer open** buttons.
- **What the agent drops, and why:** companies on **SHEPHA's exclusion list** (Settings → SHEPHA exclusion list, an admin imports SHEPHA's Excel file; checked before any AI cost, never sent to the AI), no Israeli connection, no proven export, already present in the target market or it is its largest market, below the mandate's minimum size, and new companies below the **revenue floor** (SH1, SH3: $30M) unless they have a strong trigger from the last six months (then they enter, marked *Below revenue floor*). Every dropped company is listed with its reason under the run on the mandate page. Duplicates are found by website domain (sub-domains included), company number and other names.
- **Services catalogue (Settings → Services catalogue):** one catalogue of IL and GL services, each with a status (ready, in build, in review, not offered) that admins change; each mandate lists its service codes in its criteria.
- **Apollo and Lusha (Settings → Data sources):** an admin saves each account's API key (kept on the server, never shown again). Then **Watch lists → Find companies** searches by country, keywords and size and puts the companies in a watch list, and **Find with Apollo / Lusha** on a card adds up to 5 decision makers as suggestions to confirm. Every search uses credits on that account. Without a key, export a list from their website and import the file.
- **Watch lists:** import a company list from a public source (Excel or CSV with a header row, e.g. Companies Registrar open data or a trade-show exhibitor list; choose *Windows-1255* for Hebrew Excel files), map the columns and import; duplicates are skipped. When running a mandate, choose the watch list instead of *Open web search*: the agent checks only those companies, starting with the ones this mandate checked longest ago, so repeated runs work through the whole list. A mandate's weekly run can also use a watch list.
- **Decision makers (Release 2):** the **decision-maker search** runs for every new card before the review (≈ $0.03 a card), with the roles of the mandate's family (SH: international sales and business development; OM: CEO, VP Operations, VP Sales, VP HR); on Accept the company timeline records the decision with its evidence link. It proposes up to 3 people with their job title and the sentence and source that name them; a business email is kept only if the quoted source publishes it (personal mailboxes are dropped), a LinkedIn link only if the search returned it. **Nobody becomes a contact until the owner clicks *Save as contact*** (saved as verified, with the source as verification, and a preferred channel). A wrong suggestion is dismissed as *Not relevant* or *Wrong or outdated* (the second is counted in the metrics).
- **Deal:** Accept opens the card's one pipeline deal at the first stage (the stable link: a second deal for the same card is refused), with the mandate's default workflow and deal model (admins set them in the mandate settings). The deal page shows the research card it came from; the company file has a **Research** tab.
- **First approach (Release 3):** on an accepted card, pick a confirmed person and a channel (**Email**, **LinkedIn**, **WhatsApp**), then **Draft with AI** (≈ $0.01, written only from the card's evidence, in the person's language) or **Write it myself**. The draft waits in the approval queue (and on the card): edit the recipient and text, **Approve**, then send it yourself — email opens in your own mail app, LinkedIn: copy the text and open the profile, WhatsApp: opens click-to-chat with the text — and **mark it as sent** (logged on the company and deal timeline). One first approach per person; nothing is ever sent by the app. The person's role must have been checked against a public source (LinkedIn or the company website) in the last 30 days: the form asks where you checked and records **Role checked today**; editing other details of a contact does not renew the check.
- **Outreach rules (Settings → Outreach rules):** first approaches go only to recipients in countries an admin cleared (default: Israel); every message carries the opt-out sentence in its language; for recipients in Israel the email subject or WhatsApp message starts with "פרסומת"; WhatsApp only to people marked as having agreed, at an international number. **Do not contact** on a person (Contacts tab) or the do-not-contact list (email, phone, LinkedIn, whole domain) blocks every channel and withdraws messages still waiting. All checks run on the server again at approval and at "mark as sent". A lawyer should confirm the wording (see FOUNDER_TASKS 6d).
- **Conversations (Release 4):** everyone who got a first approach, with what needs you now: replies to answer and follow-ups that are due. Paste a reply (email, LinkedIn or WhatsApp) or let YMT read it from your **Gmail** (read-only, opt-in, see below). The AI (≈ $0.01 a reply) classifies it (interested, question, not now, not interested, opt-out, referral, out of office), summarises it and drafts an answer that goes through the approval queue like every other message. It may use only the card, the conversation and the **approved answers library** (Settings → Approved answers, edited by admins); every question those cannot answer is listed and becomes a task for the owner, and the draft says you will come back on it.
- **Opt-outs in replies:** words such as "remove", "unsubscribe" or "הסר" (and opt-outs the AI recognises) put the person on hold at once: nothing more can be approved to them until the owner clicks **Confirm opt-out** (do-not-contact list, waiting messages withdrawn) or **Not an opt-out**.
- **Follow-ups:** a first approach with no reply after *Follow up after (days)* (Settings → General, default 7) shows **Follow-up due**. The AI drafts a short follow-up on the same channel; the outreach rules apply (opt-out sentence, "פרסומת"), one message waits in the queue at a time, at most *Max follow-ups* per person, and a reply withdraws a waiting follow-up.
- **Meeting summaries with AI (Release 5):** in *Calendar → Summarize*, paste rough notes or a transcript (Zoom, Meet, Teams) and click **Draft with AI** (≈ $0.02). It fills in the summary, decisions, tasks (who, due date only when stated, client commitments marked) and a recap email, in the language you choose. Everything stays editable; nothing is saved until **Save summary**, the recap email still waits in the approval queue, and the notes themselves are not stored.
- **Client discovery form (Release 5):** on a company file, tab **Discovery**, create a personal link (optionally for a person and a deal) and send it yourself. The client answers without logging in, in Hebrew or English, once; the link expires and can be withdrawn. The answers appear on the company file and the deal, the timeline records them, and whoever sent the link gets a review task. Admins edit the questions (Hebrew and English, order, required, active) in **Settings → Discovery form**; answers keep the wording the client saw.
- Initiatives no mandate covers (e.g. Vietnam, China sourcing) wait in **Manual assignment** for an admin.
- **Calibration:** save a good match and a false positive as examples, change one criterion (each change is a new version), and **Compare** the two versions on the same examples.
- **Research metrics:** acceptance rate, duplicates, wrong-market matches, minutes per card (also per mandate version), cost per accepted card, the agent's drop reasons and wrong or outdated contacts, per mandate.

**Rules built in:** a candidate is kept only if its source URL came from the search itself and has a publication date within the mandate's freshness window (default 6 months); every company value needs a cited source or it is dropped and listed as missing; size bands are computed in code from YMT's dictionary; companies created by research appear in the regular company lists only after a card is accepted; the monthly cap is checked before every AI call and runs wait (not fail) when it is reached.

**What leaves YMT:** the mandate text, search queries and public company information (for the decision-maker search: the company's name, website and the stated initiative; for a first-message or follow-up draft: the card's evidence and the recipient's name and job title; for an answer: the messages exchanged with that person and the approved answers; for a meeting summary: the notes or transcript you paste) go to the AI provider. No client notes, contact details (email, phone), meetings or deals are sent. Settings → Data & privacy lists the provider when a key is set.

## Google Calendar (optional)

The Calendar page shows day, week and month views of YMT meetings and, for each staff member who connects their own Google account, their Google events. Meetings scheduled in YMT are added to the organizer's Google Calendar. **Google sends an invitation e-mail to an outside person only if the staff member ticks "Send a Google invitation" and confirms a dialog that names the recipient.** Without these settings the calendar works normally; only the Google features are hidden.

One-time setup (about 30 minutes, in [Google Cloud Console](https://console.cloud.google.com/)):

1. Create a project, e.g. "YMT App".
2. Go to **APIs & Services → Library** and enable **Google Calendar API**.
3. Set up the **OAuth consent screen** (Google Auth Platform):
   - **If you use Google Workspace:** choose audience **Internal**. Only your organisation's accounts can connect, and Google review is not needed.
   - **If you use personal Gmail accounts:** choose **External**, then **publish the app (In production)**. While the app is in "Testing" mode, Google expires the connection every 7 days. Until Google verifies the app, staff see a "Google hasn't verified this app" screen once (Advanced → Continue).
   - Scopes: `openid`, `email` and `https://www.googleapis.com/auth/calendar.events`. These allow events only: no e-mail, Drive or calendar settings.
4. Under **Clients**, create an **OAuth client** of type **Web application** with this **authorized redirect URI**: `https://<your-app-address>/api/google/callback`
5. Add these four environment variables on the host (all four, or none; a partial setup stops start-up with a clear message):

   | Variable | Value |
   |---|---|
   | `GOOGLE_CLIENT_ID` | from step 4 |
   | `GOOGLE_CLIENT_SECRET` | from step 4 |
   | `PUBLIC_URL` | the app address, e.g. `https://ymt-app.onrender.com` (no trailing slash) |
   | `TOKEN_ENCRYPTION_KEY` | a random secret of 32+ characters (Render's **Generate** button works). Keep it: changing it disconnects everyone. |

6. After the redeploy, each staff member opens **Calendar → Connect Google Calendar** once.
7. *Optional, Release 4 — read replies from Gmail:* in the same Google Cloud project enable the **Gmail API** and add the scope `gmail.readonly` to the consent screen. With Google Workspace and an *Internal* app this works at once; for Gmail accounts (*External* app) Google requires a security review for this scope before people outside the test users can connect. Each owner then opens **Conversations → Connect Gmail to read replies**. The server checks every 15 minutes (or **Check now**).

What leaves YMT: only the meeting title, time, place, organisation and person name, plus a link back to YMT, and only for people who connected Google. Gmail reading is read-only: YMT searches only for messages *from* addresses it sent a first approach or follow-up to, keeps only the new text of those replies, and never sends, labels or deletes anything. Notes, decisions and contact details stay in YMT. Google tokens are stored encrypted (AES-256-GCM). **Disconnect** revokes access at Google.

## What is in the MVP

| Module | Screens | Key rules |
|---|---|---|
| 1. Lead research | Lead research (criteria search, trigger log, research search links), company file → Contacts / Triggers / Overview (brief) | Triggers **require** a source URL. Marking a contact *verified* requires a verification source; who/when is recorded by the server. Briefs and outreach drafts go to the **approval queue**. |
| Approval queue | Approval queue | `pending → approved → sent`. Edits only while pending. Approve/reject/mark-sent are **one item at a time** – there is no bulk endpoint. "Sent" means a staff member sent it from their own mailbox (mail-app link / copy) and confirmed it; the system logs it in the timeline. |
| 2. CRM | Inbox (stale leads, overdue tasks), drag-and-drop Pipeline per workflow, Deal page, Dashboard | Stages: research → outreach → call → meeting → proposal → contract. Workflows per service type choose a subset of stages. Stagnant-lead reminders after *N* days (setting). **Max 3 follow-ups per lead** (setting may lower, never raise; queued drafts count). Unified timeline across phone / email / LinkedIn / meeting / note. Dashboard: stage distribution, upcoming meetings, open proposals, targets vs actual, revenue by deal model (commission, brokerage fee, % of future orders, retainer). |
| 3. Client service | Company 360° file, Meetings, Prep sheet, Post-meeting form, Documents, Suppliers & experts | Post-meeting form → summary + decisions + tasks + timeline entry + optional stage change + optional summary document + follow-up email **draft** (to approval queue). Printable prep sheet. Documents from editable templates; **finalize** freezes the text (SHA-256); signatures (drawn) by YMT and by the client via a link staff copy and send themselves; tampering is detected. Expiring, revocable **share links** for foreign partners expose an allow-list only (profile, meeting decisions, client commitments, documents marked shareable). Directory with industry-based matching to clients. |
| Settings | General, Workflows, Templates, Users (admin), Data & privacy, Audit log (admin) | Non-technical staff can edit targets, reminder days, workflows and all templates (placeholder list shown; an unknown placeholder gives a clear error instead of a half-filled text). |

## Architecture

```
client/   React 19 + Vite + Tailwind 4 + vite-plugin-pwa (installable on mobile & desktop, offline app shell)
          src/ui = design-system primitives · src/app = shell, navigation, PWA install · src/pages = screens
server/   Express 5 + node:sqlite (single file DB) – sync, small route modules, no ORM
shared/   enums.js – the single list of stages, statuses, channels… used by both sides
```

- **Data location:** everything lives in one SQLite file (`DATA_DIR/ymt.db`, default `./data`). No cloud services, no AI/LLM provider, no analytics. Settings → *Data & privacy* shows the file path, size, hosting description (`HOSTING_LOCATION`) and record counts; admins can create a backup (`VACUUM INTO`, written to `DATA_DIR/backups/`).
- **Security:** scrypt password hashes; HttpOnly + SameSite=strict session cookie (Secure when `NODE_ENV=production`), 12h sessions; login rate limit; Helmet headers; every API response is `Cache-Control: no-store` and the service worker caches **only the app shell**, never API data; audit log for logins, approvals, sends, shares, signatures, template and user changes.
- **Generation** of briefs, emails and documents is deterministic and template-based (`server/src/generators.js`). Only the research pilot uses an AI provider (`server/src/ai/`), and only when an API key is set.
- **Validation** is declarative per route (`server/src/validate.js`): unknown fields, wrong types and missing required fields fail fast with a 400 and a precise message.
- **i18n:** `client/src/i18n/strings.js`. `npm run check:i18n` (runs automatically before every build) fails if any key used in the code is missing in Hebrew or English.

## Maintenance (no IT person needed)

- Add/disable staff: Settings → Users (admin).
- Change wording of emails, quotes, agreements, summaries, briefs: Settings → Templates.
- Change targets, reminder days, follow-up cap, share-link validity: Settings → General.
- Add a service type: Settings → Workflows.
- Backup: Settings → Data & privacy → *Download backup* (admins). It saves a complete, consistent copy of the database to your computer; keep it in an encrypted folder. *Back up on server* also keeps a copy in `data/backups/`. Restore = stop the server and replace `data/ymt.db` with the backup file.

## Deliberate MVP limits / next steps

- **No outbound email integration.** Approved emails are opened in the user's own mail client (`mailto:`) or copied; staff then confirm "sent". This is the strictest reading of the human-in-the-loop rule. A per-item SMTP/Graph "send" button could be added later behind the same approval check.
- **E-signature** is a *simple electronic signature* (drawn image + name + IP + time + document hash). It is not a qualified/advanced signature under the Israeli Electronic Signature Law; use a certified provider for contracts that need one.
- Contact discovery is manual entry with verification tracking – no scraping or third-party enrichment APIs.
- Meeting times are stored in UTC and shown in the browser's local time.
