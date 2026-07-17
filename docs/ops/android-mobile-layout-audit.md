Here is the merged, triaged report.

---

# Android Mobile-Layout Audit — Merged Report

## (1) VERDICT

**Systemic, not isolated.** The "compressed web app" symptom on Private Room is one instance of a codebase-wide gap: **21 of 24 non-tab screens** are missing Android system-inset handling (`navigationBarsPadding()` / `statusBarsPadding()` / scrollability). Root cause: `AppNavHost` zeroes the Scaffold's window insets for every pushed (non-tab) route (`AppNavHost.kt:279`), so each such screen must supply its own insets — and almost none do. The correct pattern already exists in-repo (`MatchDetailScreen.kt:141`, `DmThreadScreen`, `OnlineMatchScreen`'s `MatchEndCard`, `GuildPreviewSheet`), it just wasn't applied consistently. Only tab-bar routes (Home, Profile, ModeSelect, GuildHall, Store-tab) are clean by inheritance.

---

## (2) CONFIRMED DEFECTS — ranked by severity

| # | Screen / file | Defect | Severity | Fix |
|---|---|---|---|---|
| 1 | **PrivateRoomScreen.kt:184, 517** | Outer Column + bottom Leave/Start button stack have no top or bottom inset; button jams on gesture bar (the reported bug) | **Critical** | `.statusBarsPadding()` on Column; `.navigationBarsPadding()` on button item |
| 2 | **CheckoutScreen.kt:140, 195** | "Place Order" CTA sits at very bottom, no `navigationBarsPadding()`; jams under gesture bar (closest twin of reported bug) | **Critical** | `.statusBarsPadding()` + `.navigationBarsPadding()` on scroll Column |
| 3 | **OfflineGameScreen.kt:73** | No `verticalScroll` at all + no insets; on short phones the board pushes Undo/Resign row off-screen, unreachable | **Critical** | Wrap in `.verticalScroll()` + `.statusBarsPadding()` + `.navigationBarsPadding()` |
| 4 | **ReplayViewerScreen.kt:108** | Not scrollable + no `navigationBarsPadding()`; transport controls (last row) clipped/unreachable when board+chrome exceed viewport | **Critical** | Wrap in `.verticalScroll()` + `.navigationBarsPadding()` |
| 5 | **LiveMatchBrowserScreen.kt:87, 131** | Outer Column no top inset; LazyColumn no bottom `contentPadding`; last live-match card jams | **Critical** | `.statusBarsPadding()` + LazyColumn `contentPadding = navBars` |
| 6 | **NotificationsScreen.kt:126** | LazyColumn zero `contentPadding`; file imports no inset API at all; last row + swipe-delete jam | **Critical** | `contentPadding = navigationBars.asPaddingValues()` |
| 7 | **DiscoverGuildsScreen.kt:179** | Scroll Column no `navigationBarsPadding()`; "Create a Guild" CTA + last row jam | **Critical** | `.navigationBarsPadding()` on scroll Column |
| 8 | **FriendsScreen.kt:216 + AddFriendScreen:518** | Both screens' scroll Columns missing `navigationBarsPadding()`; last section flush to gesture bar | **Critical** | `.navigationBarsPadding()` on both |
| 9 | **DmScreens.kt:102** (DmConversationListScreen) | LazyColumn no `contentPadding`; last conversation row jams (thread screen already correct) | **Critical** | `contentPadding` bottom = navBars |
| 10 | **InventoryScreen.kt:93, 121 + OrdersScreen:317, 360** | Inventory + Purchase History: no top/bottom insets on scroll content | **Critical** | `.statusBarsPadding()` + `.navigationBarsPadding()` (both) |
| 11 | **WalletScreen.kt:133** | Flat `.padding(20.dp)` all sides (not inset-aware); back button clips top, ledger crowds bottom | **Critical** | Directional padding + `.statusBarsPadding()` + `.navigationBarsPadding()` |
| 12 | **QuestsScreen.kt:113, 163** | No top inset; scroll Column no `navigationBarsPadding()`; last seasonal claim button jams | **Critical** | `.statusBarsPadding()` + `.navigationBarsPadding()` |
| 13 | **SeasonScreen.kt:161, 183** | No top inset; Reward Track tier-card row is last element with **zero** spacer — worst bottom-crowding case | **Critical** | `.statusBarsPadding()` + `.navigationBarsPadding()` |
| 14 | **StoreScreen.kt:256, 327** | No top inset; scroll Column no `navigationBarsPadding()` (Store as pushed route) | **Critical** | `.statusBarsPadding()` + `.navigationBarsPadding()` |
| 15 | **TournamentDetailScreen.kt:93, 120** | No top inset; scroll Column no `navigationBarsPadding()`; champion/bracket card jams | **Critical** | `.statusBarsPadding()` + `.navigationBarsPadding()` |
| 16 | **MatchmakingScreen.kt:274** | Cancel button uses fixed `padding(bottom=56.dp)` not inset; wrong on 3-button nav / large cutouts | **Critical** | `.navigationBarsPadding()` (add to, not replace, offset) |
| 17 | **OnlineMatchScreen.kt:172** | Board Column: no `statusBarsPadding()`/`navigationBarsPadding()` (top bar clips, chat panel crowds); `MatchEndCard` in same file is correct | **High** | `.statusBarsPadding()` + `.navigationBarsPadding()` |
| 18 | **AiDifficultyScreen.kt:69** | Scroll present (good) but no `statusBarsPadding()`; header clips under status bar on entry | **High** | `.statusBarsPadding()` (+ `.navigationBarsPadding()`) |
| 19 | **PublicProfileScreen.kt:136** | Scroll Column no `navigationBarsPadding()`; Report button + Openings card jam | **High** | `.navigationBarsPadding()` + `bottom=16.dp` |
| 20 | **AchievementsScreen.kt:104** | LazyColumn no bottom `contentPadding`; last achievement rows clip | **High** | `contentPadding` bottom = navBars |
| 21 | **LeaderboardScreen.kt:122** | Scroll Column zero bottom inset; pinned "Your Rank" card jams | **High** | `.navigationBarsPadding()` + `bottom=16.dp` |
| 22 | **SettingsScreen.kt:159** | Flat `.padding(20.dp)`, no `navigationBarsPadding()`; **destructive Delete Account row** sits under gesture bar (mis-tap risk) | **High** | `.navigationBarsPadding()` |
| 23 | **MyTicketsScreen.kt:82, 175** | List view + thread view both missing `navigationBarsPadding()` | **High** | `.navigationBarsPadding()` on both Columns |
| 24 | **TournamentsListScreen.kt:68, 91** | No top inset; scroll Column no `navigationBarsPadding()` (bespoke list, same rule) | **High** | `.statusBarsPadding()` + `.navigationBarsPadding()` |
| 25 | **GlobalSearchScreen.kt:82, 141** | Missing `navigationBarsPadding()` **and** `imePadding()` **and** LazyColumn `contentPadding`; results hide behind keyboard/gesture bar | **High** | `.navigationBarsPadding().imePadding()` + LazyColumn `contentPadding` |
| 26 | **PlayersCard (PrivateRoomScreen.kt:564)** | Structural: flat SeatRow list w/ 36dp letter-avatars vs mockup's 3-col VS grid, 64dp avatars, VS badge, "Waiting…" placeholder | **High** | Rebuild as 3-col VS grid per mockup 1682–1705 |
| 27 | **LegalScreen.kt:77** | Flat `.padding(20.dp)`, no `navigationBarsPadding()`; last paragraph crowds gesture bar | **Med** | `.navigationBarsPadding()` |
| 28 | **PublicProfileScreen.kt:143** | Double top inset: fixed `44.dp` + inherited `statusBarsPadding()` = content pushed too low | **Med** | Reduce fixed pad to ~`12.dp` |
| 29 | **OnboardingScreen.kt:117** | Fixed `padding(bottom=40.dp)` not inset-aware; Skip/Next crowd taller nav bars | **Med** | `.navigationBarsPadding()` |
| 30 | **LoginScreen.kt:125 / CreateAccountScreen.kt:139** | Flat vertical padding, no `navigationBarsPadding()`; mild (content scrolls) | **Low** | `.navigationBarsPadding()` |

**Clean (no defect):** HomeScreen, ProfileScreen, GuildHallScreen, ModeSelectScreen, MatchDetailScreen (all tab-inherited or already-fixed reference screens).

---

## (3) GROUPED BY DEFECT TYPE

**A. Missing bottom nav-bar inset** (dominant pattern — most screens): #1, #2, #5, #6, #7, #8, #9, #10, #11, #12, #13, #14, #15, #16, #17, #19, #20, #21, #22, #23, #24, #25, #27, #29, #30. → last element / primary CTA jams under the Android gesture/nav bar.

**B. Missing top status-bar inset** (pushed routes not covered by the app-root `statusBarsPadding()` where the screen adds its own fixed pad, or clips on first render): #1, #2, #5, #10, #11, #12, #13, #14, #15, #17, #18, #24. Plus inverse: **double top inset** #28.

**C. Not scrollable (content unreachable)** — the most dangerous class: #3 (OfflineGameScreen — no scroll, board pushes buttons off), #4 (ReplayViewerScreen — no scroll, transport controls off). Both can render primary controls completely unreachable on short devices.

**D. IME / keyboard overlap:** #25 (GlobalSearchScreen — no `imePadding()`; results hidden behind keyboard).

**E. Structural mockup mismatch:** #26 (PrivateRoom PlayersCard — flat list vs 3-col VS grid). (LiveMatch/Mode/AiDiff/Checkout/Inventory structures otherwise match; Store hero + SettingsCard substitutions are documented intentional deferrals, not defects.)

---

## (4) RECOMMENDED FIX ORDER (most-impactful first)

1. **Ship a shared modifier** — add a `Modifier.screenInsets()` extension (= `.statusBarsPadding().navigationBarsPadding()`) and a LazyColumn `screenContentPadding()` helper. One definition, mechanical application everywhere; makes the rest a Sonnet pass. This is the real fix — the bug is a missing convention, not 26 unrelated bugs.

2. **Not-scrollable screens first (data-loss / unusable):** #3 OfflineGameScreen, #4 ReplayViewerScreen — these can make controls physically unreachable, not just ugly. Add `verticalScroll` + insets.

3. **The reported bug + its twins (bottom CTA jammed):** #1 PrivateRoomScreen, #2 CheckoutScreen, #16 MatchmakingScreen — user-visible, high-traffic, and #22 SettingsScreen (Delete Account under gesture bar = mis-tap on a destructive action).

4. **Remaining Critical inset gaps (apply shared modifier):** #5–#15 — the economy/store family (Store, Inventory, Wallet, Quests, Season, Tournaments) and social family (Discover, Friends, Notifications, DM list).

5. **High-severity inset gaps:** #17–#25 (OnlineMatch, AiDifficulty, PublicProfile, Achievements, Leaderboard, MyTickets, TournamentsList, GlobalSearch — GlobalSearch also needs `imePadding()`).

6. **Structural fix:** #26 PrivateRoom PlayersCard → rebuild as the mockup's 3-column VS grid. Higher effort, isolated, do after insets land.

7. **Med / Low polish:** #27 Legal, #28 PublicProfile double-inset, #29 Onboarding, #30 Login/CreateAccount.

**Verification for each batch:** run on one gesture-nav device (tall inset) and one 3-button-nav device, checking each screen's last element clears the system bar and top header clears the status bar. Steps 2–3 warrant manual device checks; step 4 onward can be verified in batches once the shared modifier is proven.