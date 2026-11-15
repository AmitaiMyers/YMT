# Founder checklist – from code to a live YMT app

These are the steps that need **you**: accounts, decisions, and things only a person in the company can do.
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
16. **Monthly:** go to Settings → Data & Privacy → *Back up now*, then copy the backup file to encrypted storage.

## Decisions to make (no rush)

- Digital signatures here are *simple electronic signatures*. If a client contract needs a qualified signature under Israeli law, use a certified provider for that contract.
- Outbound email: today you send from your own mailbox and click "mark as sent". Decide later whether you want a per-message *Send* button that still requires approval.
- Delete the demo data (if you loaded it) before going live: start from an empty database, or delete the two "(demo)" companies and resources.
