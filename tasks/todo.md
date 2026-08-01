# Play page -> Battle screen + Game Modes drawer (Model C)

Branch: `feat/android-play-battle-screen` - worktree `D:/AI Projects/fd-battle`

Owner-approved design (this session): the Play tab becomes a Clash-Royale-style
Battle screen. Game Modes moves into a drawer behind the trophy button, and
picking a mode there arms the BATTLE button. AI difficulty uses **Model C** -
the AI ticket arms immediately, and an Easy / Normal / Hard strip appears above
the dock while AI is armed.

This is a deliberate, owner-directed deviation from the approved handoff
(`handoffv3` ModeSelect spec). Flagged and accepted.

## Phase 1 - the screen (this PR)

- [x] `PlayLoadoutStore` - persist armed mode + AI difficulty via `KeyValueStore`
      (same pattern as `SettingsStore`). Fixes the existing defect where
      `AiDifficultyScreen.kt:58` uses plain `remember`, so difficulty resets to
      Normal on every visit and on rotation.
- [x] `ModeTicket.kt` - the ticket composable: main panel + stub, bleed art,
      per-mode accent, optional stat / progress / timer / pill.
- [x] `GameModesSheet.kt` - drawer overlay: scrim, handle, sectioned ticket list.
- [x] `BattleScreen.kt` - Play tab root: throne backdrop tinted by tier, tier
      crest + name, trophy road to next tier, dock (loadout slot / BATTLE /
      trophy slot with caret), Model C difficulty strip.
- [x] Wire `AppDestinations.MODE_SELECT` to `BattleScreen`; keep every existing
      gate - Ranked guest gate, `watchLiveEnabled` server flag, private room.
- [x] Re-export `diff_easy/normal/hard` with alpha (they ship opaque on
      `#101010`, so `AiDifficultyScreen.kt:129` renders them as black squares).
- [x] Loadout slot -> existing `INVENTORY` route (board/piece skins live there).
      A dedicated in-drawer picker is Phase 3.
- [x] Verify: `:app:compileDebugKotlin` + `:app:testDebugUnitTest` green.

### Owner change mid-build
Tournaments was pulled OUT of the Game Modes drawer: it is its own page,
reached from the Battle screen side rail, not a mode BATTLE can be armed with.
`ArmedMode` no longer contains it and the ticket was removed.

### Verified on device (emulator-5554, 1080x2424)
compileDebugKotlin green; 301 unit tests, 2 pre-existing failures confirmed
identical on base commit 2c14f70 (AuthRepositoryLogicTest, AvatarAssetsTest -
both untouched by this change). Battle screen, drawer, mode arming, and the
Model C difficulty strip all exercised by hand: arming Private Room switched
BATTLE to CREATE ROOM, arming AI revealed the Easy/Normal/Hard strip, and
tapping Hard updated BATTLE to "VS AI - HARD".

### Known follow-ups from this build
- `ModeSelectScreen.kt` is now dead code (referenced only in comments). NOT
  deleted - deletions need owner approval.
- The loadout slot renders a flat gold placeholder, not the equipped board
  pattern. Reading `equippedBoard` is Phase 3.
- Rail buttons have no badges yet (unread quests / claimable reward) - that
  state is not fetched by this screen.

## Deferred - stated, not silently dropped

- **Phase 2 - per-mode standings.** Tickets should read "47W / 31L" for Casual
  and "12W on Hard" for AI. `Match.mode` is already a first-class enum with
  `@@index([mode, endedAt])`, but `User` only stores global wins/losses, so this
  needs one new aggregate endpoint. Until then the tickets carry honest static
  subtitles, not fabricated numbers.
### Loadout drawer - DONE, verified against a real database
Built as its own drawer on the dock's left slot (owner: it should pull out like
Game Modes, not navigate away). Covers BOARD + SKIN; avatars and frames stay in
the profile's AvatarPickerDialog, which already has a real frame grid. With that
in place the Inventory screen, its route and all three of its entry points were
removed; OrdersScreen (same file) is untouched.

Verified end to end on emulator-5554 against local Postgres + Redis + the API on
:4000, signed in as player2@test.dama:
- drawer lists exactly the owned items (8 boards, 2 skins as granted in the DB)
- equipped state derives correctly (green ring + check on the equipped tile)
- tapping "Imperial Ebony Board" issued PATCH /api/users/me/equip, Postgres
  went from "Marble & Gold" to "Imperial Ebony Board", and the ring moved live
- a skin equip persisted the same way ("Crimson Legion Pieces")

Known, NOT an app bug: board thumbnails render blank in this local setup. The
art is served from WEB_ORIGIN (the Vite dev server), which binds ::1 only, while
the emulator's 10.0.2.2 maps to IPv4 loopback - so Coil cannot reach it. The API
on 0.0.0.0:4000 is reachable, which is why data loads but images do not. Same
code path the old Inventory screen used; in release WEB_ORIGIN is the real
https origin. To see thumbnails locally, start Vite bound to 0.0.0.0.
- **Phase 4 - Home de-duplication.** Home still renders its own hero + 2x2 mode
  grid, so two screens now offer the same four modes. Decide after this ships.
- **Daily-login track** on the Battle screen - needs the daily-login state
  fetched here; Home owns that call today.

## Notes

- Ranked stays gated behind a real account (`ModeSelectScreen.kt:69`). With the
  drawer arming the button, a guest never has Ranked armed - the gate fires on
  the ticket, where it can be explained, not on the primary CTA.
- Watch Live stays behind `ConfigRepository.watchLiveEnabled` (fail-closed).

---

# Archive - previous task

# Monetization dark-launch (feat/monetization-dark)

## Discovery (2026-07-12)
Investigated before planning — the dormant payment pipeline the task describes as
"needs building" is ALREADY fully built and correctly gated end-to-end:
- Server: `features.payments = DIAMOND_TOPUP_ENABLED && PAYMONGO keys present`.
  `/payments/checkout` throws notConfigured when off; `/payments/packs` returns
  `enabled: features.payments`; `/auth/providers` exposes `diamondTopUp: features.payments`.
- Web: `providers.diamondTopUp` (from `/api/auth/providers`) gates the Store "Currency"
  category button + TopUpModal, and AppLayout's diamond pill + top-up "+" button
  (desktop AND mobile drawer). TopUpModal (apps/web/src/features/store/TopUpModal.tsx)
  is a full v3 "Get Diamonds" implementation: live packs, checkout redirect, balance.
- `apps/web/src/features/orders/OrdersPage.tsx` + `GET /api/orders` (apps/server/src/
  modules/store.ts:102-153) already merge Order + settled Payment rows into receipts,
  with an HONEST method label "GCash / Maya / Card" (never the prototype's fabricated
  "App Store · Apple Pay"). Renders unconditionally from real data — a past purchaser
  always sees history; a non-purchaser sees the honest empty state. This already
  satisfies the task's "past-purchaser must always see real history" requirement,
  because it's driven by data presence, not a flag.
- `web-v3-delta-plan.md` W8 row 36 was marked BLOCKED-POLICY pending owner call —
  now unblocked, and turns out to already be implemented.

## Remaining real gaps
- [x] Create branch `feat/monetization-dark` from current HEAD.
- [x] Server: expose `DIAMOND_TOPUP_ENABLED` on `GET /api/config/public` too (bespoke
      field alongside the Config-row map, mirroring how admin-config.ts surfaces the
      locked env value for admins — same pattern, public route).
- [x] Tests: apps/server/test/payments-dark.test.ts — 7 tests: checkout 503
      NOT_CONFIGURED (and no Payment row created), checkout auth still enforced,
      packs `enabled:false`, providers `diamondTopUp:false`, /config/public
      DIAMOND_TOPUP_ENABLED:"false", admin PATCH stays LOCKED_FLAG. On-state note:
      env loads at import time so per-test toggling is impractical; the on-state's
      only server branch is skipping these guards (webhook logic is flag-independent).
- [x] Docs: payments.ts header comment — "Monetization dark-launch" runbook added.
- [x] Docs: web-v3-delta-plan.md W8 row 36 → IMPLEMENTED-DARK with full gate map.
- [x] Verify: server tsc clean; payments-dark 7/7; admin-config 6/6 (1 test updated
      for the new always-present key); FULL suite 38 files / 434 tests all green;
      web tsc clean; web build succeeds (zero web changes — already built+gated).
- [x] Commit (pathspec-only, exact files touched).

# Google Search Console connectivity check (2026-07-22)

- [x] Review repository MCP/config files without exposing credential values.
- [x] Locate the existing Claude Search Console MCP registration and credential path.
- [x] Run a read-only MCP tool call that proves Search Console API authorization.
- [x] Report whether Codex can reuse the connection and any configuration gap.

# Weekly Search Console report automation (2026-07-22)

- [x] Re-test property listing and a seven-day keyword query.
- [x] Confirm no existing Filipino Dama/Search Console automation would be duplicated.
- [x] Create an active weekly report for rankings, searches, keywords, pages, and indexing.
- [x] Add a permission preflight so reports never fabricate data when Google returns 403.
- [x] Re-check after access update: property now reports `siteFullUser` and analytics returns data.

# Sample weekly Search Console report (2026-07-22)

- [x] Pull July 13-19 and July 6-12 Search Console datasets.
- [x] Compare rankings, queries, pages, devices, and countries.
- [x] Check sitemap and technical visibility signals.
- [x] Deliver a concise report with prioritized SEO actions and data caveats.

# SEO soft-404 recommendation fix (2026-07-22)

- [x] Confirm GitHub and Railway access paths available from Codex.
- [x] Inspect the affected blog route and production-serving configuration.
- [x] Identify the root cause of the Search Console soft-404 signal.
- [x] Patch the smallest code/config change needed. No code patch needed: current production already redirects the old URL to the indexed canonical article.
- [x] Verify the affected URL through the production-equivalent serving path.

# Copy MCP connections into Codex (2026-07-22)

- [x] Locate MCP config files used by Claude, VS Code, Cursor, and Codex.
- [x] Redact and compare discovered MCP server definitions without printing secrets.
- [x] Back up the current Codex MCP config.
- [x] Merge missing MCP server definitions into Codex config.
- [x] Verify Codex sees the copied MCP servers.

# Blog post image coverage (2026-07-22)

- [x] Inspect current blog article/card/SEO rendering paths.
- [x] Create relevant reusable blog image assets.
- [x] Add a single article-image resolver used by cards, article pages, and SEO metadata.
- [x] Render images on each blog post and blog listing card.
- [x] Verify every article resolves to an existing image and the web build/prerender passes.

# Publish blog image coverage (2026-07-22)

- [x] Re-read repository instructions and confirm publish scope.
- [x] Stage only the blog-image implementation files.
- [x] Commit the blog-image coverage change.
- [x] Merge latest `origin/main` without conflicts.
- [x] Push the merged result to GitHub.

# Blog article scroll position bug (2026-07-22)

- [x] Inspect the blog listing/card navigation path and article mount behavior.
- [x] Locate any existing app-level scroll restoration logic.
- [x] Identify why article navigation lands mid-article.
- [x] Patch the smallest scroll reset behavior for article route changes.
- [x] Verify build/prerender and inspect the affected diff.

# SEO outreach execution (2026-07-22)

- [x] Re-read the SEO demand-growth plan and Phase 3 outreach pack.
- [x] Verify the classroom PDF precondition is live before teacher outreach.
- [x] Re-check current contact channels for teacher/community targets.
- [x] Create an immediate outreach execution queue with ready-to-send copy.
- [x] Update the Phase 3 outreach tracker with ready/blocked statuses.
- [x] Send direct-email outreach to Magna Kultura and DepEd Tambayan via `support@filipinodama.com`.
- [ ] Submit TeacherPH contact form and MAPEH Facebook post through John’s authenticated accounts. Teach Pinas was sent by direct mailbox after Chrome confirmed the contact page.
- [ ] Accept the suggested follow-up automation card or manually send one follow-up on 2026-07-28 to 2026-07-29.

# Expanded promotion research (2026-07-22)

- [x] Map promotion channels beyond the first SEO/link outreach batch.
- [x] Research current Filipino gaming press, game-dev, tabletop, education, and culture targets.
- [x] Create `docs/seo/phase3/promotion-research-2026-07-22.md` with priority tiers and pitch angles.
- [x] Build a small press kit before sending to gaming media that request assets.
- [x] Send the next direct batch: PGDX, GDAP, Blooing, Gaming Pinas, Gaming Library, and UnGeek.
- [ ] Submit remaining manual/community items through John's authenticated accounts. PGDX contact form showed success after both email routes bounced; TeacherPH is staged but still needs last name, privacy consent, and Turnstile. PinoyGamer and Teach Pinas were sent after Chrome contact-page checks.

# Play hub SEO panel layout bug (2026-07-22)

- [x] Inspect the screenshot and identify which route/component owns the bottom panel.
- [x] Trace the layout relationship between the mode grid, right rail, and SEO panel.
- [x] Patch the smallest structure/style change so the panel follows the main play controls naturally.
- [x] Verify with build/typecheck and inspect the affected diff.

# Weekly Search Console action implementation (2026-07-27)

- [x] Inspect the web blog/content, sitemap, and redirect implementation that maps to the five SEO actions.
- [x] Improve the Dama-vs-checkers article title/snippet/content for comparison queries.
- [x] Improve the piece-count article snippet and immediate-answer section.
- [x] Refresh the backwards-movement article and add internal reinforcement.
- [x] Add board-numbering content and diagram support to the notation article.
- [x] Audit sitemap/internal links for clean URLs only and legacy URL handling.
- [x] Run relevant web verification and inspect the diff.
