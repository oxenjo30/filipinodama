# Mobile UI & Functionality Gaps — Implementation Plan

> **For agentic workers:** Execute task-by-task. Each task ends with an independently compilable deliverable. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fix every finding from the Android UI & functionality audit — the critical dead Royal-Pass Claim button, the missing season-end claim flow, silent error swallows, error≠empty state confusion, dialog reachability, the orphaned Messages inbox, support-ticket viewing, matchmaking color pref, the missing Hate-Speech report reason, a11y touch targets/labels, and the latent Checkout lambda.

**Architecture:** Native Kotlin/Compose + Retrofit. Server contracts already exist for everything (verified in `apps/server/src/modules/seasons.ts`, `reports.ts`, `support` routes) — this is almost entirely mobile client wiring. Introduce ONE new shared primitive (an app-wide Snackbar host via a `CompositionLocal`) that the error-surfacing tasks consume; everything else is localized edits.

**Tech Stack:** Kotlin, Jetpack Compose (Material3), Retrofit, kotlinx.serialization, coroutines.

## Global Constraints

- **Owner directives (do NOT violate):** Damath is web-only — never add/expand Damath. Diamonds stay dark — never wire a diamond external-checkout path; the Checkout `onOpenTopUp` stays a guarded no-op or gets a safe placeholder, NOT a real diamond purchase flow. Shared credentials — never mint mobile-specific API keys/config. Store is gold-only.
- **1:1 fidelity:** Where web has an equivalent flow, mirror its behavior and copy, not a reinvention. Season-end claim mirrors web's "Claim All Rewards" flow; report reasons mirror web's 6-value list; My Tickets mirrors web's thread view.
- **No fabricated data / no dead controls:** every control wired to a real API or navigation; every failure surfaced; no placeholder handlers left behind.
- **Result types:** `SocialResult`/`EconomyResult`/`ProfileResult`/`SettingsResult` all have `.Success(data)` and `.Failure(message, code)`. Auth-code failures route to `onRequireSignIn()` via the existing `isAuthError(code)` helper (`ui/components`), NOT a generic error toast.
- **Server envelope:** all endpoints return `{ ok, data }`; Android APIs use `ApiEnvelope<T>`; repos unwrap in their `call {}` helper.
- **Build gate per task:** `apps/android` must pass `./gradlew compileDebugKotlin`. Do not mark a task done on a red compile.
- **Line numbers** below are from the current checkout (post-UGC-merge, base `a1c6b95`) and may shift as edits land; anchor by surrounding code, not the number alone.

---

### Task 1: Shared Snackbar host (foundation)

**Files:**
- Create: `apps/android/app/src/main/java/com/filipinodama/app/ui/components/AppSnackbar.kt`
- Modify: `apps/android/app/src/main/java/com/filipinodama/app/navigation/AppNavHost.kt` (Scaffold at ~L267; scope at ~L215)

**Interfaces:**
- Produces:
  - `val LocalSnackbar: ProvidableCompositionLocal<SnackbarController>` — a CompositionLocal any screen reads.
  - `class SnackbarController` with `fun show(message: String)` (fire-and-forget; launches on an internal scope). Backed by a `SnackbarHostState`.
  - `@Composable fun rememberSnackbarController(): SnackbarController` — builds one bound to a remembered `SnackbarHostState` + the composition scope.
- Consumes: nothing.

**Behavior:** Root hosts ONE `SnackbarHost(hostState)` inside the Scaffold content (so it floats above screen content but below the bottom bar), and provides the controller via `CompositionLocalProvider(LocalSnackbar provides controller)` wrapping the `NavHost`. `SnackbarController.show` calls `hostState.currentSnackbarData?.dismiss()` then `hostState.showSnackbar(message)` on its scope so a new error replaces a stale one rather than queueing. Default `LocalSnackbar` value is a no-op controller (so previews / tests don't crash).

- [ ] **Step 1: Write `AppSnackbar.kt`** — `SnackbarController(hostState, scope)` with `show(msg)`; `LocalSnackbar` compositionLocalOf with a no-op default; `rememberSnackbarController()`.
- [ ] **Step 2: Host it in `AppNavHost`** — remember a controller from the existing `scope`; add `snackbarHost = { SnackbarHost(controller.hostState) }` to the `Scaffold` (Material3 Scaffold supports `snackbarHost`); wrap the `TabletWidthCap { NavHost {...} }` body in `CompositionLocalProvider(LocalSnackbar provides controller)`.
- [ ] **Step 3: Compile** — `./gradlew compileDebugKotlin` → BUILD SUCCESSFUL.
- [ ] **Step 4: Commit** — `feat(android): app-wide Snackbar host via LocalSnackbar CompositionLocal`.

---

### Task 2: Royal Pass premium Claim — wire the dead button + surface free-claim result (CRITICAL)

**Files:**
- Modify: `apps/android/app/src/main/java/com/filipinodama/app/ui/screens/economy/SeasonScreen.kt`

**Context:** `POST /api/season/claim {tier}` grants the free reward AND the premium reward together when the user `hasPass` (server `seasons.ts:163-164`). There is NO separate premium endpoint. The premium `TierActionButton` (~L418) currently passes `onClaim = {}` — a dead button. The free claim (~L215) discards its result silently.

**Interfaces:**
- Consumes: `LocalSnackbar` (Task 1); `EconomyRepository.claimSeasonTier(tier): EconomyResult<SeasonClaimResponse>`; existing `isAuthError(code)`, `onRequireSignIn`.
- Produces: nothing.

**Behavior:** Extract the claim into a single `claimTier(tier)` handler used by BOTH the free and premium `TierActionButton`s. It: gates on `signedIn` (→ `onRequireSignIn()`), sets `busyTier`, calls `claimSeasonTier`, and on `Failure` routes auth-codes to `onRequireSignIn()` else `snackbar.show(message)`; on `Success` calls `load()`. The premium button must reflect the premium reward's claim state — the server returns one `claimed` set per tier, so both buttons share `tier.unlocked/tier.claimed` (a tier is claimed as a whole). Pass `onClaim = { claimTier(tier.tier) }` to the premium `TierActionButton` at ~L418.

- [ ] **Step 1** — read `LocalSnackbar.current`; add `val snackbar = LocalSnackbar.current`.
- [ ] **Step 2** — replace the inline free-claim lambda (~L211-217) with a call to a shared `claimTier(tier)` local function that handles signedIn gate, busy, Success→load, Failure→auth?onRequireSignIn:snackbar.show.
- [ ] **Step 3** — change the premium `TierActionButton` (~L418) `onClaim = {}` → `onClaim = { claimTier(tier.tier) }`.
- [ ] **Step 4: Compile** → BUILD SUCCESSFUL.
- [ ] **Step 5: Commit** — `fix(android): wire dead Royal Pass premium Claim + surface season claim failures`.

---

### Task 3: Season-end claim flow on mobile (HIGH)

**Files:**
- Modify: `apps/android/app/src/main/java/com/filipinodama/app/data/economy/EconomyApi.kt` (add 2 endpoints + DTOs)
- Modify: `apps/android/app/src/main/java/com/filipinodama/app/data/economy/EconomyRepository.kt` (add 2 methods)
- Modify: `apps/android/app/src/main/java/com/filipinodama/app/ui/screens/economy/SeasonScreen.kt` (end-of-season banner + claim)

**Context — server contract (`seasons.ts:280-320`):**
- `GET /api/season/end-status` → `{ ended: Boolean, season?: {id,name,endsAt}, claimed?: Boolean, reward?: {rank,gold,diamonds,seasonId} }`.
- `POST /api/season/end-claim` → grants once; `409 ALREADY_CLAIMED` / `400 SEASON_NOT_ENDED` on misuse; success returns the granted reward + balances.

**Interfaces:**
- Produces:
  - `EconomyApi.seasonEndStatus(): ApiEnvelope<SeasonEndStatusResponse>` (`@GET("api/season/end-status")`)
  - `EconomyApi.claimSeasonEnd(): ApiEnvelope<SeasonEndClaimResponse>` (`@POST("api/season/end-claim")`)
  - DTOs `SeasonEndStatusResponse(ended, season?, claimed?, reward?)`, `SeasonEndReward(rank, gold, diamonds, seasonId)`, `SeasonEndClaimResponse(...)` matching the server JSON.
  - `EconomyRepository.seasonEndStatus()` / `claimSeasonEnd()` returning `EconomyResult<...>`.
- Consumes: `LocalSnackbar`.

**Behavior (UI):** In `SeasonScreen`, after the current-season load, also fetch `seasonEndStatus()`. When `ended && !claimed && reward != null`, render an "🏆 Season Ended — Claim your rewards" banner at the top of the reward track showing final rank + gold (+diamonds only if `> 0`) with a "Claim All Rewards" button. On click: gate signedIn, call `claimSeasonEnd()`, Success→refresh end-status + `snackbar.show("Season rewards claimed!")`, Failure→auth?onRequireSignIn:snackbar.show(message). When `claimed`, show a passive "Season rewards claimed" confirmation instead of the button. Mirror web's copy where available.

- [ ] **Step 1** — add the 2 endpoints + DTOs to `EconomyApi.kt` (verify field names against the server `ok({...})` payloads).
- [ ] **Step 2** — add `seasonEndStatus()` + `claimSeasonEnd()` to `EconomyRepository.kt` via the existing `call {}` helper; `claimSeasonEnd` should `patchBalances` if the response carries balances (match the daily-login/pass pattern).
- [ ] **Step 3** — add the end-of-season banner + claim UI to `SeasonScreen` (state: `endStatus`, load in a `LaunchedEffect`).
- [ ] **Step 4: Compile** → BUILD SUCCESSFUL.
- [ ] **Step 5: Commit** — `feat(android): season-end reward claim (end-status + end-claim) parity with web`.

---

### Task 4: Surface swallowed social/guild/quest failures + make error≠empty (HIGH)

**Files:**
- Modify: `ui/screens/social/FriendsScreen.kt` (loads L92/96/100; actions L124/137/151/163; empty-state L253)
- Modify: `ui/screens/profile/PublicProfileScreen.kt` (friend action L239; block/unblock Failure L260-267)
- Modify: `ui/screens/social/GuildHallScreen.kt` (discarded results L205/214/350/407/416; error≠empty L119/159/125)
- Modify: `ui/screens/economy/QuestsScreen.kt` (claim Failure L98-100)
- Modify: `ui/screens/social/DiscoverGuildsScreen.kt` (preview-sheet Join L444; error≠empty L91)

**Context:** These action handlers discard `Failure` (some don't even capture the result — GuildHall). Load failures render as genuine-empty. Auth-code failures must route to `onRequireSignIn()` (each screen already has that callback), everything else to `snackbar.show()`. For error≠empty: add a screen-local `loadError: Boolean` (or reuse existing) set on load Failure, and render a distinct "Couldn't load — Retry" branch BEFORE the empty branch. Copy the existing good pattern from `PublicProfileScreen`/`QuestsScreen`/`LeaderboardScreen`.

**Interfaces:**
- Consumes: `LocalSnackbar` (Task 1); each screen's existing `onRequireSignIn`; `isAuthError(code)`.

- [ ] **Step 1: FriendsScreen** — capture each action's `SocialResult`; on Failure → auth?onRequireSignIn:snackbar.show. Add `loadFailed` state set true when any of the 3 loads fail; render a "Couldn't load your friends — Retry" branch before the `friends.isEmpty()` empty copy.
- [ ] **Step 2: PublicProfileScreen** — surface the friend-action Failure (L239) and the block/unblock Failure (add the missing `else` → snackbar.show / auth route).
- [ ] **Step 3: GuildHallScreen** — convert L205/214/350/407/416 from fire-and-discard to `when (val r = Repo.x(...))` capturing the result; Failure→auth?onRequireSignIn:snackbar.show; keep the optimistic local update but revert or refresh on Failure. Add a distinct guild-load error branch so a fetch failure does NOT render "You are not in a guild yet" (L426) or "No pending requests" (L398) — introduce `guildLoadError`/`requestsError` flags.
- [ ] **Step 4: QuestsScreen** — replace the silent claim-Failure swallow (L98-100) with auth?onRequireSignIn:snackbar.show(message).
- [ ] **Step 5: DiscoverGuildsScreen** — surface the preview-sheet Join Failure (L444) with the same pattern the row-Join already uses (L201-208); add a browse-load error flag so a failed `loadBrowse` (L91) does not render the "be the first to found one" empty copy — distinct "Couldn't load guilds — Retry".
- [ ] **Step 6: Compile** → BUILD SUCCESSFUL.
- [ ] **Step 7: Commit** — `fix(android): surface swallowed social/guild/quest failures + distinguish load-error from empty`.

---

### Task 5: Dialog/sheet reachability — add verticalScroll (MEDIUM)

**Files:**
- Modify: `ui/screens/social/DiscoverGuildsScreen.kt` (`GuildPreviewSheet` content Column ~L338)
- Modify: `ui/screens/profile/EditProfileDialog.kt` (root Column ~L66)
- Modify: `ui/screens/settings/ContactSupportDialog.kt` (root Column ~L60)
- Modify: `ui/screens/settings/DeleteAccountDialog.kt` (root Column ~L57)

**Context:** These dialogs/sheets lack `verticalScroll`, so a large accessibility font or the soft keyboard can push the primary CTA off-screen (the versionCode-12 bug class). Add `.verticalScroll(rememberScrollState())` to each root/content Column. Preserve existing padding/background/border ordering (scroll goes AFTER background/border/padding so the scrollable area is inside the padded card, matching `ReportPlayerDialog.kt:105`'s already-correct placement).

- [ ] **Step 1** — add `verticalScroll` to each of the 4 Columns; import `androidx.compose.foundation.verticalScroll` + `rememberScrollState` where missing.
- [ ] **Step 2: Compile** → BUILD SUCCESSFUL.
- [ ] **Step 3: Commit** — `fix(android): scrollable Edit-Profile / Contact-Support / Delete-Account / guild-preview so CTAs stay reachable`.

---

### Task 6: Messages inbox entry point + My Tickets viewing (MEDIUM)

**Files:**
- Modify: `ui/screens/HomeScreen.kt` (add a Messages affordance next to search/notifications) OR `navigation/BottomTabBar.kt` — pick the least-invasive per current layout; prefer a Home header icon since the bottom bar is a fixed 5-tab mockup.
- Modify: `navigation/AppNavHost.kt` (thread an `onOpenMessages` nav callback to Home → `navigate(AppDestinations.DM_LIST)`)
- Create: `ui/screens/settings/MyTicketsScreen.kt` (or a dialog) — lists `SettingsRepository.myTickets()` with subject/category/status/updatedAt/msgCount
- Modify: `ui/screens/settings/SettingsScreen.kt` (add a "My Tickets" NavRow next to "Contact Support" ~L224) and register the route.

**Context:** `DM_LIST = "social/messages"` is registered (`AppNavHost.kt:445`) but nothing navigates to it. `SettingsApi.myTickets()` (`@GET api/support/tickets`) has zero call sites; DTO `TicketSummary(id, subject, category, status, priority, createdAt, updatedAt, msgCount)`.

**Interfaces:**
- Consumes: `AppDestinations.DM_LIST`, `SettingsRepository.myTickets()`, `LocalSnackbar`.

**Behavior:** (a) Add a Messages entry point on Home (an icon button in the header that `navigate(DM_LIST)`), reusing the existing `RoundIconButton` affordance. (b) Build `MyTicketsScreen` with loading/error/empty/populated states (copy the good LeaderboardScreen pattern); each row shows subject + status pill + updatedAt + msgCount. Register a `MY_TICKETS` destination and a NavRow in Settings. If the ticket thread/detail is out of scope for this pass, the list alone (so users can see status + reply count) satisfies the audit's "can never see a reply or ticket status"; make that scope boundary explicit in a comment.

- [ ] **Step 1** — Home Messages entry point + nav wiring to `DM_LIST`.
- [ ] **Step 2** — `MyTicketsScreen` with real `myTickets()` load + full state handling.
- [ ] **Step 3** — `MY_TICKETS` destination + Settings NavRow.
- [ ] **Step 4: Compile** → BUILD SUCCESSFUL.
- [ ] **Step 5: Commit** — `feat(android): reach Messages inbox from Home + My Tickets list (support ticket status/replies)`.

---

### Task 7: Matchmaking color pref + Hate-Speech report reason (MEDIUM/LOW)

**Files:**
- Modify: `ui/screens/game/MatchmakingScreen.kt` (add Red/Blue/Either picker before joining the queue)
- Modify: `data/match/MatchRepository.kt` (`joinQueue` already accepts `colorPref`; thread the chosen value — it defaults `"either"`)
- Modify: `data/social/ReportApi.kt` (`REPORT_REASONS` L39-45 — add `HATE_SPEECH`)

**Context:** `MatchmakingScreen.kt:62` calls `joinQueue(mode)` always sending `colorPref="either"`; the wire DTO `MmJoinRequest(mode, colorPref)` already carries it. Web offers Red/Blue/Either. Report reasons: server accepts `HATE_SPEECH`; mobile omits it (5 vs web's 6).

**Behavior:** Add a compact Red/Blue/Either segmented control on the pre-search matchmaking UI; pass the selection into `joinQueue(mode, colorPref)`. Mirror web's labels/order. Add `HATE_SPEECH → "Hate speech"` to `REPORT_REASONS` so mobile has all 6 (keep the existing default reason unless web's default should also be adopted — match web's `HARASSMENT` default only if it doesn't regress the mobile UX; otherwise leave mobile default and just add the reason).

- [ ] **Step 1** — color picker UI + thread `colorPref` into `joinQueue`.
- [ ] **Step 2** — add `HATE_SPEECH` to `REPORT_REASONS`.
- [ ] **Step 3: Compile** → BUILD SUCCESSFUL.
- [ ] **Step 4: Commit** — `feat(android): matchmaking color preference + Hate-Speech report reason (web parity)`.

---

### Task 8: a11y pass + Checkout latent lambda (LOW)

**Files:**
- Modify: `ui/screens/HomeScreen.kt` (`RoundIconButton` 36dp → ≥48dp target), `ui/screens/social/GuildHallScreen.kt` (accept/decline L714-715: 36dp + no label), `ui/screens/profile/AvatarPickerDialog.kt` (close L138 34dp + no label), `ui/screens/social/DiscoverGuildsScreen.kt` (search-clear L151 20dp + no label)
- Modify: informative-icon `contentDescription`s (guild crest, rank badge) — add labels where the icon conveys info; leave truly decorative ones `null`.
- Modify: `ui/screens/StoreScreen.kt` (`onOpenTopUp` latent lambda ~L157) — leave as a documented guarded no-op (diamonds are dark); do NOT wire a diamond purchase. Optionally show a "coming soon" snackbar instead of nothing, but ONLY if it can never appear while the flag is off.

**Context:** 54 `contentDescription = null` across 28 files; named sub-48dp targets. Owner directive: diamonds dark — `onOpenTopUp` must not become a real purchase path.

**Behavior:** Wrap the named clickable glyph boxes so the touch target is ≥48dp (min-size the clickable area, keep the visual glyph size) and add `Modifier.semantics { contentDescription = "..." }` or use `IconButton` where it fits. Add contentDescription to informative images. This task is best-effort on the informative-icon sweep — prioritize the 4 named small targets + guild crest/rank badge; note in the commit what was covered vs deferred (do not silently claim all 54 fixed).

- [ ] **Step 1** — fix the 4 named small touch targets (≥48dp + semantic labels).
- [ ] **Step 2** — add contentDescription to the named informative icons (guild crest, rank badge).
- [ ] **Step 3** — confirm/annotate the Checkout `onOpenTopUp` stays a safe guarded no-op.
- [ ] **Step 4: Compile** → BUILD SUCCESSFUL.
- [ ] **Step 5: Commit** — `fix(android): a11y touch targets + labels on key controls; document Checkout top-up no-op`.
