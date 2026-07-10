# Admin Design-Fidelity Pass — spec

**Goal:** Bring every admin console page to an AS-IS copy of the approved `handoffv2/FilipinoDama Admin.dc.html`
mockup — every element, field, control, label, and placement — swapping ONLY fabricated data for real data
(honest empty/disabled state in-slot where data isn't available) and honoring gold-only economy.

**Source of truth:** the extracted per-section mockup HTML in
`scratchpad/fidelity-audit-2/sec*.section.html` and the 11 audit reports. This spec encodes the CONFIRMED
gaps after 3 user decisions.

## User decisions (binding)
1. **Economy/Store → MERGE** into one page + one nav item "Store & economy" (catalog on top, grants+ledger row below).
2. **Extra controls → KEEP the useful ones** (live search/filter/sort that operate on real data stay; everything
   else re-fidelitied to the mockup). Do NOT remove search/filter/sort. DO fix labels, placeholders, missing
   elements, extra decorative elements, and structure.
3. **Backend gaps → BUILD FOR REAL** (Support priority+reopen, Admin status+disable, Campaign channel+schedule+status,
   LiveOps Scheduled Events). No faking.

## Global Constraints (every task inherits these)
- Gold-only economy: no Diamonds top-up/purchase controls; Diamonds may DISPLAY as earned balance. Currency
  selectors that the mockup shows as gold/diamonds render gold-only (locked), which is the sanctioned deviation.
- No fabricated data: where the mockup shows data we can't produce, render the element/slot with an honest
  empty/disabled state IN PLACE (never delete the slot).
- Minimal impact: touch only what fidelity requires. Do not refactor unrelated server logic. Preserve all existing
  functionality, auth gates, audit-logging, and tests.
- Additive migrations only. New Prisma columns/models are additive; never drop/alter existing data.
- Every server change: TDD (vitest buildApp()+inject against dama_test), and the truncateAll list in test/helpers.ts
  must include any new table (e.g. LiveEvent).
- `requireAdmin` role gates unchanged; new routes reuse existing min-role conventions.
- Keep audit-logging on every mutating admin route (reuse logAudit).

---

## PART A — Server (do first; client depends on these shapes)

### A1. Ticket priority + reopen
**Schema:** add `enum TicketPriority { LOW MEDIUM HIGH URGENT }` (mockup shows a priority chip; default MEDIUM).
Add `priority TicketPriority @default(MEDIUM)` to `Ticket`. Additive migration.
**Routes (apps/server/src/modules/admin-tickets.ts):**
- List + detail responses include `priority`.
- `PATCH /admin/tickets/:id/priority` { priority } → SUPPORT+; audit `ticket.priority`.
- `POST /admin/tickets/:id/reopen` → sets status OPEN, clears resolvedAt/resolvedBy; only when currently RESOLVED
  (else 409); audit `ticket.reopen`. Detail response exposes `canResolve` (status===OPEN) and `canReopen`
  (status===RESOLVED).
- Ticket list/detail also expose the user `tag` (already in userName snapshot "username#tag" — split or expose tag).
**Tests:** priority patch persists + audited; reopen flips RESOLVED→OPEN + audited; reopen on OPEN → 409;
canResolve/canReopen correct per status.

### A2. Admin status + enable/disable
**Schema:** add `adminDisabledAt DateTime?` to `User` (null = active admin; set = disabled admin, role retained but
login/admin access blocked). Additive.
**Auth:** `requireAdmin` must reject a disabled admin (adminDisabledAt != null) with 403 — EXCEPT never lock out the
last active SUPERADMIN (reuse the existing last-superadmin guard pattern). Add a test.
**Routes (admin-admins.ts):**
- List response per admin: `status` = "active" | "disabled" (derived from adminDisabledAt), plus existing role/lastSeen.
- `POST /admin/admins/:id/disable` and `/enable` (SUPERADMIN) → toggle adminDisabledAt; cannot disable self; cannot
  disable the last active SUPERADMIN (409); audit `admin.disable`/`admin.enable`.
- Keep existing role-change + grant + revoke routes.
- Stat tiles data: expose counts { activeAdmins, disabledAdmins, totalAdmins } (mockup's 3-tile row; "Pending invites"
  has no infra → the 3rd tile shows total admins, and the invites tile is honestly repurposed to "Disabled" OR the
  page renders active/disabled/total — see C-Admins).
**Tests:** disable sets timestamp + audited; disabled admin gets 403 from a guarded route; last-superadmin disable → 409;
enable clears it; self-disable → 400.

### A3. Campaign channel + schedule + status
**Schema:** add `channel String @default("in-app")` ("push"|"email"|"in-app"), `scheduledFor DateTime?` to `Campaign`.
`status` already exists (String; values "draft"|"scheduled"|"sent"). Additive.
**Routes (admin-campaigns.ts):**
- Create accepts channel + optional scheduledFor + explicit action: draft | schedule | send. draft→status "draft",
  schedule→status "scheduled" (requires scheduledFor), send→status "sent" (reach computed now).
- List response per campaign: channel, channelLabel, status, statusLabel, scheduledFor, reach, sentByName, createdAt.
- Reach preview endpoint stays (real segment count).
**Tests:** draft persists status draft + channel; schedule requires scheduledFor (400 if missing) + status scheduled;
send computes reach + status sent; list returns channel+status.

### A4. LiveEvent model (Scheduled Events)
**Schema:** new model `LiveEvent { id, name, type, status, scope, reward String, startsLabel String?, endsLabel String?,
color String?, createdById?, createdByName, createdAt, updatedAt }`. type/status/scope are strings (mockup selects).
status ∈ "scheduled"|"live"|"ended". Additive migration + add "LiveEvent" to truncateAll.
**Routes (new apps/server/src/modules/admin-events.ts, registered in index.ts):**
- `GET /admin/events` (ECONOMY+) list ordered createdAt desc.
- `POST /admin/events` create; `PATCH /admin/events/:id` edit; `POST /admin/events/:id/cancel` → status "ended".
- All audited (`event.create`/`event.update`/`event.cancel`).
**Tests:** create persists all fields + audited; edit updates; cancel sets ended + audited; list returns rows.

### A5. Season number field
**Schema:** add `number Int?` and `endsLabel String?` to `Season` (mockup season form: name + number + ends/status line).
Additive. admin-liveops season update route accepts name/number/endsLabel. Test: update persists number+endsLabel.

---

## PART B — Nav chrome (App.tsx + index.css)
- Rename nav item "Matches" → **"Anti-cheat"** (mockup navDefs). Route path may stay /matches; label only.
- **Merge Economy+Store nav**: single item "Store & economy" → route /economy rendering the merged page (see C-Economy).
  Remove the separate "Store catalog" nav item + /store route (redirect /store→/economy to avoid dead links).
- Verify VIEWING-AS select + account chip + logo lockup + nav groups already match (audit says they do) — no change.

---

## PART C — Client pages (re-fidelity each to its mockup section, honoring decisions)

Each page task: open `built-<Page>.tsx` + its `sec*.section.html`, and make the built page match the mockup element
order/labels/placement, keeping useful real-data controls (decision 2). Preserve all data fetching/mutations.

- **C-Overview:** rename "Revenue" panel → "Diamond revenue"; keep gold-only honest empty-state for the chart body but
  in the mockup's two-part footprint (chart-height block + total line), not a collapsed sentence.
- **C-Players:** name/tag subline shows tag only (not username+tag duplicated); add `overflow-x:auto` wrapper +
  min-width on table; KEEP search+filter (decision 2) but make search live/debounced (drop the extra Search button)
  and keep the count line only if it reads naturally — mockup has none, so move count into filter pills area or drop.
  Verify .fd-avatar renders the gold ring + colored fill.
- **C-Moderation:** keep filter bar (decision 2); restore empty-state exact copy "No open reports. Nicely done.";
  keep profile-report + reporter-note (real data) but ensure the flagged-quote box styling matches for DM reports.
- **C-Guilds:** keep search+sort (decision 2) but live search (drop extra Search button); guild cell single line
  (crest + name) — move leader/tag into the drawer, not the list row; keep drawer (real admin need).
- **C-Analytics:** RESTORE the 6 deleted mockup panels IN THEIR SLOTS as honest empty-states ("requires event
  tracking — not yet instrumented"): acquisition funnel, retention curve, weekly cohort grid, revenue-by-category,
  platform split, top regions — matching the mockup grid positions/ratios. Keep the real-data panels (gold economy,
  match outcomes, rank distribution, top cosmetics) appended AFTER the mockup layout, not displacing slots. Keep
  time-range pills + honesty footer.
- **C-Support:** wire priority chip (row + detail header) from A1; add Reopen button (canReopen) + keep Resolve
  (canResolve); ALWAYS render the reply composer (don't hide on resolved) — only toggle Resolve/Reopen buttons;
  show user tag in row + detail meta; filter chips driven by real statuses (Open/Resolved + All).
- **C-Matches:** table columns = mockup's 6 (Match, Mode, Flag reason, Confidence, Status, Action) — remove the extra
  Trophy Δ / Gold columns from THIS table (keep that data in the drawer). Status column = honest "—" (no case status
  yet); keep win/loss in the Match cell. Drawer: render the mockup's 4 KPI tiles (Avg accuracy / Move time / Moves /
  Priors) as honest "—", plus the MOVE-ACCURACY TIMELINE + DETECTION SIGNALS blocks as honest empty-states in-slot;
  keep the 4 decision buttons disabled w/ Phase-2 note; keep filter row (decision 2).
- **C-Economy (MERGED page):** one page: store-catalog panel on top (keep the larger real schema form + catalog, but
  align headers/columns toward mockup where cheap), then fd-2col row: Grant/compensation (left) + Ledger explorer
  (right). Keep player-id grant + ledger filters (decision 2 — real controls). Add the merged nav/route (Part B).
  Delete Store.tsx page usage (fold into Economy page component structure; keep the store components).
- **C-Tournaments:** restore exact field labels/placeholders (Tournament name / "e.g. Sunday Rapid Cup"; Bracket size
  (cap) 8/16/32/64/128/256; Min trophies to join (0 = open); Starts label); keep the lifecycle Actions bar (real
  state machine — decision 2 keeps useful controls) but ALSO ensure Edit is always present; keep gold-only currency
  locked; restore the subtitle text alongside the (kept) filter chips.
- **C-Settings:** add the tab switcher (Config & feature flags / API keys & integrations); flags = instant toggle
  (drop per-row Save + key/category subtext) OR keep Save if it's needed for the real config API — match mockup's
  instant toggle where the real API supports it; render economy-constants rows with REAL current values from the
  config API (not blank) with the mockup's label+key+numeric-input layout; add SUPERADMIN "Restricted" gated state.
  API-keys tab: honest read-only integrations list (real integrations we have: PayMongo dormant, Resend, DB) or an
  honest "no integrations configured" state — no fabrication.
- **C-Admins:** 3-tile stat row (Active admins / Disabled / Total) from A2; add Status column (active/disabled badge);
  add enable/disable Toggle button + keep Revoke; keep grant-flow (user chose grant over invite) but style the card
  to the mockup's invite-card chrome with honest copy describing grant.
- **C-Campaigns:** add channel chip selector (push/email/in-app); add Schedule input + Save-draft + Schedule + Send-now
  buttons (A3); add Estimated-reach card (auto from preview) + Live-preview notification card (right column); add
  Maintenance-mode card (wire to a real config flag if one exists, else honest disabled state); history table gets
  Channel + Status columns; add "Campaign history" header; restore exact composer copy/placeholders.
- **C-Audit:** already 1:1; keep the filter+refresh (decision 2). No change needed beyond confirming.

## Verification (per phase + final)
- Server: `pnpm --filter @fd/server test` (vitest) green; `prisma validate`; typecheck.
- Client: admin typecheck + build green.
- Final: whole-branch opus review; deploy; verify live (admin 200, new routes guarded 401, CSS/pages render).
