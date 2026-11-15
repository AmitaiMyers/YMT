# YMT Group PWA – Design System & UX Architecture (Phase 1)

> Status: **proposal for review**. Nothing here is implemented yet. Phase 2 implements it in `client/`.

## 0. Design principles

1. **A person decides; the system prepares.** Every screen makes the *next human decision* obvious: approve, send, sign, follow up. AI-like automation never takes that decision away.
2. **Calm by default, loud only when it matters.** Most of the UI is neutral ink on paper. Color is kept for *state* (needs you / done / problem), never decoration.
3. **Bilingual from the root.** Every layout is written once with logical properties (`start`/`end`) and works in RTL Hebrew and LTR English, including mixed text on the same line.
4. **Confidential, and it looks it.** A restrained, document-like look with visible "who saw / who approved" trails and no third-party assets (fonts and icons are bundled, not loaded from a CDN).
5. **Fewer clicks for common work, extra friction for anything that can't be undone.** Logging a call takes about 5 seconds. Sending, finalizing or signing always needs a deliberate confirmation.

---

## 1. Aesthetic & layout – "Industrial Precision"

A clean, editorial B2B look: navy ink, paper-white surfaces, thin hairline borders, generous whitespace, and one warm **signal amber** used exclusively for "this is waiting for a human".

### 1.1 Color tokens (light theme)

All pairs below are measured; the ratio shown is against the background they are used on.

| Token | Hex | Use | Contrast |
|---|---|---|---|
| `--ink-900` (primary) | `#0F2A4A` | Sidebar, primary buttons, headings | 14.5 : 1 on white |
| `--ink-700` | `#1D4F8C` | Links, focus ring, selected tab | 8.2 : 1 on white |
| `--ink-500` | `#2E6FBF` | Charts, progress, info icons | 5.1 : 1 on white |
| `--ink-100` | `#C7D7EE` | Selected-row tint, chart track | 9.9 : 1 with ink-900 text |
| `--ink-50` | `#EEF4FB` | Info notices, hover rows | — |
| `--signal-500` (accent) | `#F59E0B` | "Needs you" fills: badge dot, queue count, pending stripe | 6.8 : 1 with slate-800 text |
| `--signal-800` | `#92400E` | Text on signal-50 | 6.7 : 1 on `#FFF7E6` |
| `--signal-50` | `#FFF7E6` | Pending/attention surfaces | — |
| `--success-700` | `#047857` | Approved/sent/signed | 5.5 : 1 on white |
| `--success-50` | `#ECFDF5` | Success surfaces | 5.2 : 1 with success-700 |
| `--danger-700` | `#B91C1C` | Reject, destructive, overdue | 6.5 : 1 on white |
| `--danger-50` | `#FEF2F2` | Error surfaces | 5.9 : 1 with danger-700 |
| `--canvas` | `#F7F8FA` | App background | — |
| `--surface` | `#FFFFFF` | Cards, sheets, inputs | — |
| `--line` | `#E2E8F0` | Hairline borders, dividers | — |
| `--text` | `#1E293B` | Body text | 13.8 : 1 on canvas |
| `--text-muted` | `#475569` | Secondary text | 7.1 : 1 on canvas |
| `--text-subtle` | `#64748B` | Meta (timestamps, hints) – **min 14px** | 4.8 : 1 on white |

**Semantic mapping (one color always means the same thing):**
`pending → signal` · `approved / sent / signed / won → success` · `rejected / overdue / lost / tamper → danger` · `info / neutral state → ink`. Status is **never conveyed by color alone**: every status badge also carries an icon and a word.

**Dark theme** (for evening and on-the-road use; follows the OS setting, with a manual override). It uses the same token names:
canvas `#0B1220`, surface `#111A2E`, line `#1F2A44`, text `#E2E8F0` (15.2 : 1), muted `#94A3B8` (7.3 : 1), link `#7EB3F2` (8.6 : 1), signal `#FBBF24` (10.4 : 1).

### 1.2 Typography

- **Family:** **Heebo** (variable, weights 400–700), self-hosted via `@fontsource-variable/heebo`. It is designed for Hebrew and Latin together, so mixed lines share one rhythm. Fallback: `system-ui, "Segoe UI", Arial`.
- **Numbers:** `font-variant-numeric: tabular-nums` in tables, KPIs and currency, so columns align.
- **Generated documents and emails** use the same sans family at 15px / 1.7 line height (not monospace). They read like a letter, not code.

| Role | Size / line height | Weight | Notes |
|---|---|---|---|
| Display (KPI number) | 32 / 40 | 700 | tabular |
| H1 page title | 24 / 32 | 700 | one per page |
| H2 card title | 18 / 26 | 600 | |
| H3 section label | 14 / 20 | 600 | uppercase is **not** used (it breaks Hebrew) |
| Body | 15 / 24 | 400 | default |
| Small / meta | 13 / 20 | 400 | muted color; never below 13px |
| Mono (hash, IDs) | 12 / 18 | 500 | `ui-monospace`, wrapped in `<bdi dir="ltr">` |

### 1.3 Spacing, grid, shape, elevation

- **4px base, 8pt rhythm:** `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`. Card padding is 24 (16 on mobile), the gap between cards is 24, and the gap between form fields is 16.
- **Layout:** sidebar 248px (collapses to a 64px icon rail at 1024–1279px and to a bottom tab bar under 768px). Content max-width 1200px. Reading-width text (documents, emails) max 72ch.
- **Radius:** `6` inputs and buttons · `10` cards · `16` sheets and dialogs · `999` badges and pills.
- **Elevation** (soft, cool shadows; borders do most of the work):
  `e0` hairline only · `e1` cards `0 1px 2px rgb(15 42 74 / .06)` · `e2` hover/dragging `0 6px 16px rgb(15 42 74 / .10)` · `e3` dialogs/toasts `0 16px 40px rgb(15 42 74 / .18)`.
- **Iconography:** Lucide (bundled, tree-shaken), 1.75px stroke, 16/20px. Direction-dependent icons (arrows, chevrons, "send") are mirrored in RTL; universal ones (check, clock, search) are not.

---

## 2. Interactivity & feedback

### 2.1 Motion tokens

| Token | Value | Used for |
|---|---|---|
| `--dur-instant` | 90ms | Press feedback, checkbox tick |
| `--dur-quick` | 160ms | Hover, focus, tab underline |
| `--dur-base` | 240ms | Panels, toasts, card enter/leave |
| `--dur-slow` | 360ms | Page-level transitions, success celebration |
| `--ease-standard` | `cubic-bezier(.2, 0, 0, 1)` | Most movement |
| `--ease-exit` | `cubic-bezier(.4, 0, 1, 1)` | Things leaving |
| `--ease-spring` | `cubic-bezier(.34, 1.56, .64, 1)` | Success check only |

Only `transform` and `opacity` are animated, so it runs at 60fps on mid-range phones. **`prefers-reduced-motion: reduce`** sets every duration to 0 and swaps slides for fades.

### 2.2 Component states (every interactive element defines all of these)

| State | Visual rule |
|---|---|
| Rest | Token colors, hairline border |
| Hover | Background shifts one step (e.g. ink-900 → ink-700), `e1 → e2` on cards, 160ms |
| Focus-visible | 2px `ink-700` ring with 2px offset (white gap). Never removed; keyboard only (`:focus-visible`) |
| Active / pressed | `scale(.98)`, 90ms |
| Disabled | 45% opacity, `cursor: not-allowed`, plus a **tooltip explaining why** (e.g. "Save your edits before approving") |
| Loading | The button keeps its width, its label is replaced by a spinner and a verb ("Approving…"), `aria-busy="true"`. Pages and lists use **skeletons** shaped like the real content, not a "Loading…" line |
| Success | A short inline check (spring, 360ms) plus a toast with a summary. Items that change status **animate out** of the current list (height collapse, 240ms) |
| Error | Field: red border, an icon and a message under the field (`aria-describedby`), focus moves to the first invalid field. Request: an inline banner in the card plus a toast with **Retry** |
| Empty | An illustrated-icon empty state with one sentence and **one** primary action ("No contacts yet → Add contact") |
| Offline | A top banner; actions that need the server are disabled and say why; already-loaded data stays visible |

### 2.3 Signature micro-interactions

- **Approval card:** pending cards have a 3px signal stripe on the start edge. Approving collapses the card with a green check and decrements the queue counter in the sidebar (number tick animation). Rejecting opens an inline note field first; the card cannot be rejected without a note (as today).
- **Edit vs. generated:** while editing a draft, changed lines get a faint signal underline, and a "Show changes" toggle shows a diff against the original generated text, so the reviewer knows exactly what they changed.
- **Pipeline board:** cards can be **dragged** between stages (the card lifts with `e2` and tilts 1°, and the target column glows ink-50). A keyboard alternative is always present: focus a card, press Space to pick it up, ←/→ to move, Space to drop, with live-region announcements. Stages not in the deal's workflow are shown as disabled drop zones.
- **Idle heat:** card "days idle" chips move from neutral to signal to danger as they approach and pass `stale_days`. They are calm until action is needed.
- **Optimistic updates** for reversible actions (stage move, task done, share toggle): the UI updates instantly, rolls back with an error toast if the server refuses, and offers an **Undo** toast for 6s.
- **No optimism for irreversible actions** (approve, mark sent, finalize, sign, revoke): these always wait for the server and use a **confirmation dialog that restates the consequence** ("This email will be logged as sent to dana@… . You must send it from your own mailbox."). This replaces today's `window.confirm`.
- **Signature pad:** pressure-like smoothing (quadratic curves), a baseline guide line, and a "Clear" control. After signing, the stroke "settles" (opacity 1 → .9) and the document seal (hash) animates in.
- **KPI tiles** count up from 0 on first load (360ms; skipped when motion is reduced). Target bars fill from the start edge, which is the *right* edge in RTL.

### 2.4 Feedback channels

- **Toasts** (bottom-end, stacked, auto-dismiss 5s, pause on hover/focus) are announced through an `aria-live="polite"` region; errors use `assertive`.
- **Inline banners** carry the explanation of a policy or an error inside the relevant card.
- **The sidebar badge counts** (Approvals, Reminders) are the app's "heartbeat". They refresh when the window regains focus.

---

## 3. Usability – the zero-friction journey

### 3.1 Information architecture (re-grouped around *work*, not modules)

```
TODAY            Inbox ①  (approvals + overdue tasks + stale leads, one prioritized list)
                 Calendar  (meetings: today / this week; prep & summary entry points)
FIND & WIN       Leads     (research search, trigger log)
                 Pipeline  (board per workflow)
CLIENTS          Clients   (360° files)
                 Documents
                 Network   (suppliers & experts)
MANAGE           Dashboard
                 Settings
```

**Inbox** is the new home screen for staff, and the Dashboard becomes management's view. The Inbox answers "what do I have to do now?" with items ranked by urgency: approvals waiting > overdue client commitments > meetings in the next 24h needing prep > stale leads. It has one primary action per row.

### 3.2 Core journeys (target: ≤ 3 interactions to the decision point)

| Journey | Today | Proposed flow |
|---|---|---|
| Morning check | Visit Approvals, Reminders, Meetings separately | Open app → **Inbox** shows everything ranked → act inline |
| Research → first outreach | Leads → company → Contacts tab → Draft → Approvals tab → find item | Company page **"Next step" panel** suggests "Draft outreach to Dana (verified)" → opens the draft in a **side sheet** → edit → Approve, without leaving the page |
| After a meeting | Meetings → find meeting → Complete page | Calendar shows "Summarize" on past meetings; the form is a **3-step sheet** (What happened → Tasks → Follow-up), with auto-saved drafts |
| Follow-up stale lead | Reminders → deal → pick contact → draft → Approvals | The stale row in the Inbox has **"Draft follow-up (2 of 3)"** → side sheet with the draft → Approve |
| Sign a quote | Documents → doc → finalize → copy link | Same, plus a progress **stepper** (Draft → Final → YMT signed → Client signed) showing where it is |

### 3.3 Cognitive-load rules

- **One primary button per view region.** Secondary actions go to the overflow menu (`⋯`).
- **Progressive disclosure:** company forms show 5 essential fields first, with "More details" for the rest. Long tabs on the company page become a **sticky sub-nav** with a summary header (status, owner, next meeting, open items).
- **Command palette (Ctrl/⌘ + K):** jump to any company, deal or screen, or run "New company", "Log call", "Schedule meeting". It is bilingual and searches names in both scripts.
- **Keyboard shortcuts** for navigation only (`g i` Inbox, `g p` Pipeline, `/` search, `?` help). There are deliberately **no single-key shortcuts for approve/send/sign** (human-in-the-loop requires a deliberate act).
- **Smart defaults:** the language of a draft defaults to the contact's preferred language; dates default to today; the owner defaults to me.
- **Plain language** for every policy message, written in the user's language, explaining *why* (e.g. "Limit reached – 3 follow-ups is our maximum per lead").

### 3.4 Accessibility (WCAG 2.2 AA target)

- Contrast as specified in §1.1. Focus is always visible. Target size is **≥ 44×44px** on touch, ≥ 32px on pointer.
- **ARIA patterns:**
  - Tabs: `role="tablist"` / `tab` / `tabpanel` with arrow-key navigation.
  - Dialogs: `role="dialog"`, `aria-modal`, focus trap, return focus on close, Esc closes.
  - Mobile menu: `aria-expanded` / `aria-controls`.
  - Tables: `<caption>` and `scope` on headers.
  - Pipeline: `aria-roledescription="draggable card"` plus live announcements.
  - Toasts: live regions.
  - Status badges: icon + text, never color alone.
- **Forms:** visible labels (never placeholder-only), the required marker is announced, errors are linked with `aria-describedby`, and an error summary at the top is focused on submit failure.
- **RTL / bidi:**
  - Logical CSS only (`ms/me/ps/pe/start/end`).
  - English names, emails, URLs and hashes inside Hebrew text are wrapped in `<bdi>` so punctuation stays in place (fixes, for example, the "(YMT :אחראי)" artifact seen today).
  - `dir` is set per generated document from its language, independent of the UI language.
- **Skip link** ("Skip to content"), `<main>` / `<nav>` landmarks, and a page `<title>` per route announced on navigation.
- `lang` attribute on mixed-language blocks for correct screen-reader pronunciation.

### 3.5 Gaps in the current UI that Phase 2 fixes

| Current | Issue | Fix |
|---|---|---|
| `window.confirm` / `window.prompt` | Not styled, not bilingual-aware, poor accessibility | Accessible `ConfirmDialog` / `PromptDialog` |
| `Tabs` component | No `tablist/tab` roles, no arrow keys | ARIA tabs pattern |
| "Loading…" text | Layout jump, no sense of progress | Skeletons |
| Success = silent reload | User unsure the action worked | Toasts + animated list changes |
| Mobile nav button | Missing `aria-expanded` | Fixed; bottom tab bar under 768px |
| Pending queue only on its own page | Users must remember to check | Sidebar counters + Inbox |
| Mixed Hebrew/English lines | Punctuation jumps | `<bdi>` isolation |
| No focus styles beyond browser default | Weak keyboard visibility | Token focus ring |

---

## 4. Front-end architecture for Phase 2

```
client/src/
  design/         tokens.css (all CSS variables, light + dark), motion.css
  ui/             primitives: Button, IconButton, Input, Select, Textarea, Checkbox, Field,
                  Badge, StatusBadge, Card, Tabs, Dialog, ConfirmDialog, Sheet, Toast, Tooltip,
                  Skeleton, EmptyState, Table, Menu, CommandPalette, Stepper, KpiTile, ProgressBar
  ui/hooks/       useToast, useConfirm, useHotkeys, useOptimistic, useReducedMotion, useFocusTrap
  features/       inbox/, leads/, pipeline/, clients/, meetings/, documents/, network/, settings/
  app/            AppShell (sidebar / rail / bottom bar), routes, providers
```

- **Primitives own all visual decisions.** Feature code never writes raw colors or sizes, only tokens and variants (enforced by review, with a token-usage grep in `check:*` scripts).
- **The existing contracts stay:** `api.js`, `useLoad`, `useAction`, `EntityForm` (re-skinned onto the new `Field` primitives), i18n with the completeness check, and shared enums. The server API is unchanged.
- **New dependencies (small, maintained, no CDN):** `@fontsource-variable/heebo`, `lucide-react`, `@dnd-kit/core` (accessible drag and drop for the pipeline). Dialogs, toasts, tooltips and the command palette are built in-house on native `<dialog>` + small hooks, to avoid a heavy UI kit.
- **Quality gates:** Playwright smoke run in both languages, an axe-core accessibility check per page (no serious/critical violations), and visual screenshots at 390 / 1024 / 1440px.
