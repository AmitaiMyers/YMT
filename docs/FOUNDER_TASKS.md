# Founder checklist – from code to a live YMT app

These are the steps that need **you**: accounts, decisions, and things only a person in the company can do.
**Click-by-click version (with every button name in English and Hebrew): open [`founder_tasks.html`](founder_tasks.html) in a browser.**
Estimated total: half a day spread over 1–2 weeks.

## Week 1 – Go live

1. **Choose where the data lives.** This decides your confidentiality story for NDA partners.
   - *Simplest:* a managed container host with an EU region and a persistent disk, such as Render (Frankfurt) or Fly.io (Amsterdam/Frankfurt).
   - *Most control:* a small VPS in Israel or the EU with Docker.
   - Write the answer down. It goes into `HOSTING_LOCATION` and is shown on the Data & Privacy page.
2. **Create the hosting account** with a company email (not a personal one) and turn on two-factor authentication.
3. **Deploy the container** from the GitHub repository (`amitaimyers/ymt`), branch `claude/ymt-group-pwa-mvp-45memd` (or `main` after you merge it):
   - Attach a **persistent disk at `/data`** (1 GB is plenty).
   - Set the environment variable `HOSTING_LOCATION`.
   - Confirm the host gives you an **https://** address.
4. **Choose the web address.** Either keep the host's address (e.g. `ymt-app.onrender.com`) or point a subdomain you own (e.g. `app.ymt-group.com`) at it through your domain provider's DNS settings.
5. **Create your admin account** from the host's shell:
   `node server/scripts/create-user.js --username <you> --name "<your name>" --password "<10+ characters>" --admin`
6. **Open the URL on your phone and on your computer, and install it** using the *Install app* button (on iPhone: Share → Add to Home Screen).

## Optional – Google Calendar

6b. **Connect Google Calendar** (about 30 minutes, once). Follow README → "Google Calendar": create a Google Cloud project, enable the Calendar API, set up the consent screen (Workspace → *Internal*; Gmail → *External* and *publish*), create a Web OAuth client with redirect `https://<your-app>/api/google/callback`, then add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PUBLIC_URL` and `TOKEN_ENCRYPTION_KEY` on Render. After that, each person clicks **Calendar → Connect Google Calendar**.

## Research pilot

6c. **Switch on the research agents** (about 20 minutes). Create an Anthropic Console account owned by YMT, create an API key and set a monthly spend limit there. Add `ANTHROPIC_API_KEY` on Render. Then in the app: **Research → Mandates** → open each mandate, choose its owner (Shir, Omer, Tomer) and set it Active; check the $20 monthly cap under AI settings. Go through the open questions with Tom in `docs/client-requirements-checklist.html`.
6d. **Have a lawyer confirm the outreach rules** (before the first real approach). In **Settings → Outreach rules**, show the lawyer the opt-out sentences (Hebrew and English), the "פרסומת" marking for recipients in Israel (email subject and WhatsApp) and the cleared countries (default: Israel only). Ask whether LinkedIn messages need the marking too and what is needed before adding countries (EU: GDPR, US: CAN-SPAM). An admin updates the rules; anyone can add a "do not contact" entry.
6e. **Write the approved answers and decide on Gmail reading** (about 45 minutes). In **Settings → Approved answers** add short texts in Hebrew and English the AI may use when answering replies: how YMT works, the next step (a 20-minute call), what a typical engagement includes, and your fee policy (or "we quote per project"). Anything not written there becomes a task instead of an answer. If owners use Google Workspace, enable the Gmail API and the `gmail.readonly` scope (README → Google, step 7); for personal Gmail accounts Google requires a security review first, so start with pasting replies.
6f. **Check the discovery questions** (about 15 minutes). In **Settings → Discovery form** read the 9 standard questions in Hebrew and English, reword them in YMT's voice, mark which are required, and add or deactivate questions. Then send yourself a link from any company file (tab **Discovery**) and fill it in on your phone to see what clients see.
6g. *Optional:* **Let the app read email replies from Gmail** (needs 6b). Google Cloud → enable the **Gmail API** → Google Auth Platform → Data Access → add `gmail.readonly`. Each owner: **Conversations → Connect Gmail to read replies**.

## Week 1 – Set it up for the team

7. **Settings → Users:** create an account for each team member. Hand over passwords in person or by phone, never by email.
8. **Settings → General:** set the monthly targets, the stale-lead days, and the company name used on documents.
9. **Settings → Templates:** rewrite the outreach, follow-up, quote and agreement templates in your own voice, in both Hebrew and English. **Have a lawyer review the agreement template.**
10. **Settings → Workflows:** check that the two default service types match how you sell. Rename them or add one.
11. **Network:** enter your 10–20 most-used manufacturers, suppliers and experts, with "NDA signed" ticked where it applies.
12. **Clients:** enter your current clients and open leads. Do this from your Excel trackers, one company at a time, adding contacts and a deal for each.

## Week 2 – Make it a habit

13. **Daily:** start the day in the **Inbox**. Approve or edit drafts, tick off tasks, and draft follow-ups for stale leads.
14. **After every meeting:** open *Calendar → Summarize* and complete the 3-step form while it's fresh.
15. **Weekly:** look at the **Dashboard** with the team (pipeline by stage, targets, revenue by deal model).
16. **Monthly:** go to Settings → Data & Privacy → *Download backup*, and keep the file in an encrypted folder (not in email).

## Decisions to make (no rush)

- Digital signatures here are *simple electronic signatures*. If a client contract needs a qualified signature under Israeli law, use a certified provider for that contract.
- Outbound email: today you send from your own mailbox and click "mark as sent". Decide later whether you want a per-message *Send* button that still requires approval.
- Delete the demo data (if you loaded it) before going live: start from an empty database, or delete the two "(demo)" companies and resources.

## Appendix – get the code on your own computer (Windows PowerShell)

First time (needs Git and Node.js 22):

```powershell
git clone https://github.com/amitaimyers/ymt.git C:\code\YMT; cd C:\code\YMT; git checkout claude/ymt-group-pwa-mvp-45memd
npm install; npm run user:create -- --username admin --name "Admin" --password "change-me-123" --admin; npm run seed:demo; npm run dev
```

Later, to get the newest version:

```powershell
cd C:\code\YMT; git checkout claude/ymt-group-pwa-mvp-45memd; git pull; npm install
```
