# YMT Group – Automation & IT PWA (MVP)

An internal Progressive Web App for YMT Group: **lead research**, **CRM pipeline** and **client service hub**,
bilingual (Hebrew RTL / English LTR), with a strict **human-in-the-loop** policy: the system never sends anything by itself.

## Quick start

Requirements: **Node.js 22.13+** (uses the built-in `node:sqlite`, so there is no native database driver to compile).

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
- **Generation** is deterministic and template-based (`server/src/generators.js`) – no LLM, per decision.
- **Validation** is declarative per route (`server/src/validate.js`): unknown fields, wrong types and missing required fields fail fast with a 400 and a precise message.
- **i18n:** `client/src/i18n/strings.js`. `npm run check:i18n` (runs automatically before every build) fails if any key used in the code is missing in Hebrew or English.

## Maintenance (no IT person needed)

- Add/disable staff: Settings → Users (admin).
- Change wording of emails, quotes, agreements, summaries, briefs: Settings → Templates.
- Change targets, reminder days, follow-up cap, share-link validity: Settings → General.
- Add a service type: Settings → Workflows.
- Backup: Settings → Data & privacy → *Back up now*, then copy `data/backups/*.db` to encrypted storage. Restore = stop the server and replace `data/ymt.db`.

## Deliberate MVP limits / next steps

- **No outbound email integration.** Approved emails are opened in the user's own mail client (`mailto:`) or copied; staff then confirm "sent". This is the strictest reading of the human-in-the-loop rule. A per-item SMTP/Graph "send" button could be added later behind the same approval check.
- **E-signature** is a *simple electronic signature* (drawn image + name + IP + time + document hash). It is not a qualified/advanced signature under the Israeli Electronic Signature Law; use a certified provider for contracts that need one.
- Contact discovery is manual entry with verification tracking – no scraping or third-party enrichment APIs.
- Meeting times are stored in UTC and shown in the browser's local time.
