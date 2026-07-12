# FilipinoDama Mobile — Screen + Feature Inventory

Source file: `handoffv3/FilipinoDama Mobile.dc.html` (475,616 bytes).
Extraction method: file split on tag boundaries (`sed 's/></>\n</g'`) into a
5,067-line working copy, then read sequentially top-to-bottom. Markup runs
lines 1–3610; the `<script type="text/x-dc">` behavior block runs lines
3611–5067 (line numbers below refer to this split copy, not the original
minified single-line file — the file has no native line numbers since it is
effectively one logical document).

This is a component-state SPA: one `Component extends DCLogic` class holds a
single `state.screen` string. Every screen/modal in the markup is an
`<sc-if value="{{ isXxx }}">` block gated by a computed boolean
(`isXxx: scr==='xxx'`) computed from `state.screen` inside `renderVals()`.
There is no `history.pushState`/`popstate` handling anywhere in the file —
navigation is 100% in-component state, with explicit `‹` back buttons per
screen calling `this.go('target')`. This has a direct implication for the
native Android build: system/gesture back must be wired to mimic each
screen's specific back target (see NAVIGATION MODEL) rather than relying on
a generic back-stack, unless the Android app introduces its own back-stack
around these same target transitions.

---

## 1. NAVIGATION MODEL

**Model: hub-and-spoke with a persistent 5-item bottom tab bar**, not a
drawer, not a strict tab-preserves-state-per-tab model (there's a single
shared `screen` state machine, so switching tabs replaces the visible
screen rather than preserving independent navigation stacks per tab).

### Bottom Tab Bar
Defined at markup lines 3504–3514 (`<!-- ===== BOTTOM TAB BAR ===== -->`),
sourced from `tabDefs` (script lines 4081–4087):

| # | key | Label | Icon asset | Target on tap |
|---|-----|-------|-----------|----------------|
| 1 | `home` | Home | `sb-modes.png` | `go('home')` |
| 2 | `store` | Store | `ic-chest.png` | `go('store')` |
| 3 | `play` | Play | `logo-sun.png` (center item) | `go('mode')` — routes to Mode Select, not a `play` screen |
| 4 | `guild` | Guild | `me-guild.png` | `go('guild')` |
| 5 | `profile` | Profile | `sb-players.png` | `go('profile')` |

- Active-tab highlight: `activeTab` = `'home'|'store'|'guild'|'profile'|'play'|''`
  computed from `state.screen` (script line 4088); the `play` tab lights up
  while on `matchmaking`, `board`, `room`, `mode`, or `aidiff`.
- Active tab color `#f0cf72` (gold); inactive `#6f5f92` (muted violet), with
  `opacity:.5;filter:grayscale(.4)` on inactive icons; center "Play" icon gets
  an extra gold drop-shadow glow regardless of state.
- Tab bar container: `position:absolute;bottom:0`, height 78px, blurred glass
  background, gold top border, 5 equal-flex buttons.
- Visibility gate — `showTabs` (script line 5044) is **true** except when
  `screen` is one of: `splash, auth, onboard, board, result, matchmaking,
  settings, notifications, friends, spectate, pubprofile, addfriend,
  matchdetail, wallet, achievements, receipt`. (Note: `settings` isn't a
  distinct screen value in practice — Settings is a *tab* inside Profile
  reached via `screen:'profile', profTab:'settings'` — this exclusion entry
  appears to be dead/defensive code from an earlier iteration.)

### Global overlays (always available, independent of tab bar / screen)
Rendered outside/around the `SCREEN ROUTER` div, in this order in the DOM:
1. **Maintenance takeover** (`{{ maintenance }}`) — full-screen kill switch, z-index 200.
2. **Splash** (`{{ isSplash }}`) — tap-to-enter gate, first screen shown.
3. **Loading overlay** (`{{ loadingActive }}`) — imports the `Loading Screen` component during screen transitions that use `playWithLoader()`.
4. **Pull-to-refresh indicator** — spinner pinned near the status bar, driven by touch gesture on the `.mscroll` container (see DATA/BEHAVIOR §6).
5. **Toast** (`{{ toastStyle }}` / `{{ toastMsg }}`) — bottom-anchored confirmation snackbar with a green check icon.
6. **Sanction banner** (`{{ sanctionShow }}`) — top-dropping admin-issued warning/ban banner, dismissible, hidden on splash/onboard.
7. **Bottom Tab Bar** (see above).
8. **Friend Chat overlay** (`{{ chatOpen }}`) — full-screen 1:1 DM thread, layered above the tab bar (z-index 60).
9. **Report Player modal** (`{{ reportOpen }}`) — bottom sheet, z-index 120 (highest layer in the app).
10. **Gesture nav pill** — cosmetic home-indicator bar at the very bottom (z-index 45, non-interactive), mimicking iOS chrome.

### Screen reachability (non-tab screens, all reached via buttons/cards elsewhere)
Full ordered list of every `state.screen` value found (33 total), grouped by how they're entered:

- **Auth/onboarding flow (pre-home):** `splash → onboard → auth → home`
- **Tab-bar destinations:** `home, store, guild, profile` + `mode` (via Play tab)
- **From Home hub:** `mode` (Quick Match card... actually Quick Match → `matchmaking` directly), `dailyReward`, `tournaments`(strip→`tourdetail`), `live`, `leaderboard` (tap identity), `wallet` (tap currency chip), `notifications` (bell icon), global search (magnifier icon, overlay not a screen)
- **From Mode Select (`mode`):** `aidiff` (vs AI), `room` (Private Room), `matchmaking` (Ranked/Casual), Classic/etc.
- **From Store:** `checkout`, `wallet`(top-up), preview sheet, purchase confirm sheet, purchase success overlay
- **From Profile:** `inventory`, `friends`, `achievements`, `purchases`, `discover` (Discover Guilds), guild-create modal, contact-support sheet, info sheets (How to Play/FAQ/Terms), `settings` sub-tab (within Profile)
- **From Friends:** `addfriend`, chat overlay, `pubprofile` (via avatar tap)
- **From Guild:** edit-guild modal, guild-wars, guild-chat
- **From matches:** `board → result`, `spectate`, replay viewer overlay, `matchdetail`, `receipt`

---

## 2. SCREENS

Each screen below is numbered in first-appearance order in the file (not
strictly "nav order" since this is a hub-and-spoke app, not a linear tab
sequence — the Bottom Tab Bar order is documented in §1). Row lists are
top-to-bottom as they appear in the markup for that `sc-if` block. Repeated
list-item templates (`sc-for`) are described once per screen with their
per-item field shape rather than exploded per-instance.

### [SCREEN 1: Maintenance] — `{{ maintenance }}` (lines 97–111)
Full-screen kill-switch overlay, z-index 200, admin-controlled via `fdr.maintenance`.
1. Logo (sun icon)
2. Eyebrow: "✦ Scheduled maintenance ✦"
3. Heading: "The kingdom is being fortified"
4. Body: "FilipinoDama is briefly offline for a quick upgrade. Your progress, coins, and rank are safe."
5. Status pill: "Back by 2:00 PM PHT" (pulsing dot)
6. Button: "Check again" → `maintenanceRetry` (forces re-render/re-check)

### [SCREEN 2: Splash] — `{{ isSplash }}` (lines 113–129), default screen on load
1. Logo (sun icon, glowing animation)
2. Title: "FilipinoDama"
3. Subtitle: "Filipino Dama, reimagined"
4. Spinner + label: "Tap to enter"
5. Whole screen is tappable → `leaveSplash`

### [SCREEN 3: Onboarding] — `{{ isOnboard }}` (lines 131–154)
1. Illustration (`{{ onbImg }}`, varies per step)
2. Title (`{{ onbTitle }}`)
3. Body copy (`{{ onbBody }}`)
4. Dot pagination (`{{ onbDots }}`, 3 dots)
5. Button: "Skip" → `skipOnboard` (sets `fdm.onboarded='1'`, jumps to home)
6. Button: `{{ onbCta }}` (dynamic label, e.g. "Next"/"Get Started") → `nextOnboard`

### [SCREEN 4: Sign in / Auth] — `{{ isAuth }}`, `data-screen-label="Sign in"` (lines 156–209)
1. Logo + "FILIPINO DAMA" wordmark
2. Heading `{{ authTitle }}` — "Welcome back" (signin) / "Create your account" (signup)
3. Subtitle `{{ authSub }}`
4. [Signup only] Field: "Display name" — input, placeholder "e.g. Datu Rico"
5. Field: "Email" — input, type=email
6. Field: "Password" — input, type=password, placeholder "••••••"
7. [Conditional] Inline error row with warning icon + `{{ authErr }}`
8. Button: `{{ authCta }}` ("Sign in" / "Create account") → `submitAuth`
9. Link: `{{ authSwitchLabel }}` (toggle signin/signup) → `authSwitch`
10. Divider: "or"
11. Button: "Continue as guest" → `guestAuth`
12. Legal footnote: "By continuing you agree to our Terms & Privacy Policy."

### [SCREEN 5: Home] — `{{ isHome }}` (lines 211–416)
1. Top bar: avatar (+ equipped frame overlay if any) + online-dot, name, tier badge "DATU III · #37" — whole block tappable → `go.leaderboard`
2. Wallet chip: gold amount (`walletGoldLabel`) / diamond amount (`walletGemLabel` with a "+") → `openWallet`
3. Search icon button → `openGlobalSearch`
4. Notification bell (badge count `{{ notifBadge }}`) → `openNotif`
5. Hero "Ready to climb?" card — "Ranked Season 12" eyebrow, "Quick Match" pill, trophy count "1,340" → whole card taps `go.matchmaking`
6. Daily Reward strip — chest icon, "Daily Reward" + "Ready" badge (conditional), streak label → `go.dailyReward`
7. Tournaments strip (always visible) — trophy icon, "Tournaments" + "Live" badge (conditional), label → `go.tournaments`
8. Section label: "Game Modes"
9. Mode grid (`sc-for modes`, 4 placeholder items) — each: icon, name, description → `m.go`
10. Section label: "Daily Quests"
11. Quest mini-list card (`sc-for homeQuests`, 2 items) — icon, name, progress bar, `q.prog`, gold reward → whole card taps `go.quests`
12. Season Pass banner — banner art, "Season N · Ends {{date}}" eyebrow, season name, "Level 4 of 10 · 62% to next reward", progress bar → `go.season`
13. "Watch Live" strip — eye icon tile, "Watch Live" + pulsing "Live" pill, "Spectate top matches happening now" → `go.live`
14. [Conditional, admin-controlled] "Live Events" section (`sc-for liveEvents`) — tag pill, title, description, optional time window
15. [Conditional, admin-controlled] "Tournaments" list section (`sc-for tournaments`) — status pill, name, format, prize pool, players-registered label → `tr.go`

### [SCREEN 6: Board / Match] — `{{ isBoard }}` (lines 417–505)
1. Back/resign-adjacent button `‹` → `resFinish` (note: this exits via the finish flow, not a plain back)
2. Header label: "Ranked · {{ seasonNumLabel }}"
3. Settings/guide button → `openSettings` (routes to `screen:'profile', profTab:'settings'`)
4. Opponent info bar — avatar, name "Ermitanyo", tier "Kabalyero II · 1,290 🏆", captured-piece count, countdown timer "05:00"
5. Turn indicator banner — "You must capture this turn." (forced-capture rule, conditional) or "Your turn" (conditional)
6. 8×8 board grid (`sc-for cells`, 64 cells) — each cell: piece image (conditional), move-dot indicator (conditional), capture-highlight ring (conditional); tap → `cell.tap`
7. Player (self) info bar — avatar+frame, name, tier "Datu III · 1,340 🏆", captured-piece count, countdown timer
8. Action row: "↺ Undo" → `undoMove`; "💡 Hint" → `showHint`; "⚑ Resign" → `resResign`
9. [Conditional overlay] "👑 King Promotion!" toast on promotion

### [SCREEN 7: Result / Victory] — `{{ isResult }}` (lines 507–563)
1. Full-bleed result art background (`{{ resArt }}`, filtered)
2. Eyebrow: "Match Complete"
3. Big result title `{{ resTitle }}` (Win/Loss styling driven by `resTitleGrad`/`resTitleGlow`)
4. Subtitle `{{ resSub }}`
5. Stat tiles (3-up): Moves / Your caps / Opp caps
6. Trophy delta pill (`{{ resTrophyText }}`) + Gold earned pill (`{{ resGoldText }}`)
7. Button: "↺ Rematch" → `resRematch`
8. Button: "▶ Watch replay" → `resReplay`
9. Button: "Back to Home" → `resHome`
10. Button: "Report opponent" (flag icon) → `resReport`

### [SCREEN 8: Matchmaking] — `{{ isMM }}` (lines 565–613)
Two sub-states, `mmSearch` and `mmFound`:
1. [Search] Spinner ring around glowing sun logo
2. [Search] "Finding opponent…"
3. [Search] "Matching you with a player near your rank across all devices"
4. [Search] Rank pill "Datu III · ~1,340"
5. [Search] Button: "Cancel" → `cancelMM`
6. [Found] "Match Found!" label
7. [Found] VS clash animation: your avatar/name/rating vs opponent avatar/name/rating, "VS" burst in the middle
8. [Found] "💻 Cross-play · opponent on Web" pill
9. [Found] "Preparing the board…" caption
Timing (from behavior code): search phase ~2000ms, found phase ~900ms more before transition to board (see DATA/BEHAVIOR).

### [SCREEN 9: Tournament Detail] — `{{ isTourDetail }}`, `data-screen-label="Tournament"` (lines 615–726)
1. Back button `‹` → `closeTourDetail`
2. Header label: "Tournament"
3. Hero card: status pill, name, format, "Prize pool" figure
4. Info tiles: "Entry" (Free or currency amount), "Starts" (date)
5. "Players registered" card with fill bar + `minTrophyLabel` note
6. CTA button (`{{ tourD.ctaLabel }}`, dynamic — register/view/etc.)
7. [If upcoming] "Registration is open" note card
8. [If has bracket] "Bracket" horizontal-scroll rounds (`sc-for tourRounds` → nested `sc-for matches`) — each match: player A name+score, divider, player B name+score, "▶ WATCH FINAL REPLAY" (conditional on final) → `mt.watch`
9. [If finished] "Champion" card — trophy icon + champion name

### [SCREEN 10: Profile] — `{{ isProfile }}` (lines 728–944)
1. Header card: avatar+frame, tier badge "III", name, guild line, trophy count "1,340 · DATU III"
2. Button: "Edit" → `editProfile` (opens Edit Avatar modal)
3. Rank progress bar — "Datu III" label, "1,340 / 1,500", "160 trophies to Datu II"
4. Quick link: "🎒 Inventory" → `openInventory`
5. Quick link: "👥 Friends" (unread badge conditional) → `openFriends`
6. Stat tiles (4-up, `sc-for profStats`)
7. Tab switcher: "Overview" / "History" / "Settings" → `profTabOv` / `profTabHi` / `profTabSet`

   **Overview tab** (`{{ profOverview }}`):
   8. "Achievements" section header + "See all ›" → `openAchievements`
   9. Achievement grid (4-up, `sc-for profAch`) → tap opens Achievements
   10. Guild card — emblem, guild name, "Rank 4 · 28 members · #DK" → `openGuild`
   11. "Purchase History" card (receipt icon) → `openPurchases`
   12. "Discover Guilds" button (banner icon) → `openDiscover`
   13. "＋ Create a Guild" dashed button → `guildCreateOpen`
   14. "Contact Support" card (💬 icon) → `openContact`
   15. [Conditional] "My Reports" section (`sc-for myReports`) — accused name, status pill, type/when, excerpt quote

   **History tab** (`{{ profHistory }}`):
   16. Match list (`sc-for profMatches`) — result-color chip with letter, "vs {opp}", mode, trophy delta → `m.open` (Match Detail)

   **Settings tab** (`{{ profSettings }}`):
   17. Grouped settings rows (`sc-for setGroups` → nested `sc-for rows`) — each row: label, optional description, toggle switch → `r.toggle`
   18. Support group: "How to Play" → `openHowTo`; "Help & FAQ" → `openFaq`; "Terms & Privacy" → `openTerms`; "Contact Support" (Ticket badge) → `openContact`
   19. Button: "Log Out" → `logOut`
   20. Footer: "FilipinoDama · v1.0.0 (build 142)"

### [SCREEN 11: Inventory] — `{{ isInventory }}`, `data-screen-label="Inventory"` (lines 946–998)
1. Back button `‹` → `invBack`
2. Eyebrow "Your Collection" + title "Inventory"
3. Button: "Store" → `invToStore`
4. Stat tiles: "Items Owned" / "Equipped"
5. Category groups (`sc-for invGroups`) — group label + count, then item grid (`sc-for items`, 2-col): thumbnail, equip-flash checkmark (conditional), "EQUIPPED" badge (conditional), name, sub, action button (`it.btnLabel`) → `it.equip`

### [SCREEN 12: Notifications] — `{{ isNotif }}` (lines 1000–1059)
1. Back button `‹` → `notifBack`
2. Title: "Notifications"
3. "Mark all read" → `markAllRead`
4. [Empty state] Bell icon, "You're all caught up", "No new notifications right now. Match invites, quest updates, and guild news will show up here."
5. Grouped list (`sc-for notifGroups`, e.g. "Today"/"Earlier") → nested `sc-for items` — each row: swipeable (touch/pointer drag reveals red delete action), unread dot (conditional), icon, title, timestamp, body, optional CTA button (`n.onCta`)

### [SCREEN 13: Purchase History] — `{{ isPurchases }}`, `data-screen-label="Purchase History"` (lines 1061–1124)
1. Back button `‹` → `purchBack`
2. Title: "Purchase History"
3. [Empty state] Receipt emoji, "No purchases yet", "Items you buy from the store will show up here with the date and price.", Button "Browse Store" → `purchToStore`
4. Grouped list (`sc-for purchGroups`) — group label + gold/gem subtotal chips, then item rows (`sc-for items`): thumb/emoji, name, timestamp, price with currency icon

### [SCREEN 14: Store] — `{{ isStore }}` (lines 1126–1280)
1. Title "Store"
2. Gold chip (display only)
3. Diamond chip + "+" → `openTopUp`
4. Cart button (badge count conditional) → `openCheckout`
5. Featured hero banner — "Featured · New" tag, "Imperial Ebony Board", price, buy button (`storeHero.btnLabel`) → `storeHero.buy`
6. [Conditional] "Recently Purchased" horizontal scroll (`sc-for recentBuys`) — thumbnail/emote with green checkmark, name → `r.openIt`; "View All" link → `openInventory`
7. Category tabs, horizontal scroll (`sc-for storeTabs`) → `t.pick`
8. Section title `{{ storeGridTitle }}`
9. [Empty state] "Nothing here yet."
10. Item grid, 2-col (`sc-for storeGrid`) — thumbnail (image/frame-preview/emote variants), optional tag badge, "◎ Preview" → `it.openPreview`, name, sub, price, Buy button (`it.btnLabel`) → `it.buy`, optional add-to-cart icon button → `it.addCart`
11. [Conditional] "Daily Deals · Ends in {{countdown}}" section (`sc-for storeDeals`) — thumbnail, name, sub, discounted price + strikethrough old price, "% off" badge, "Buy" button → `d.buy`

### [SCREEN 15: Checkout] — `{{ isCheckout }}`, `data-screen-label="Checkout"` (lines 1282–1362)
1. Back `‹` → `checkoutBack`
2. Title "Checkout"
3. "Clear" (conditional on cart having items) → `clearCart`
4. [Empty state] Cart emoji, "Your cart is empty", "Browse the store and add boards, skins, and frames to your cart.", "Browse Store" button → `checkoutToStore`
5. Line items list (`sc-for cartItems`) — thumb/emote, name, sub, price, remove "×" button → `c.remove`
6. Order Summary card (`sc-for cartTotals`) — label + balance line + total (per-currency subtotal rows)
7. [Conditional] Shortfall warning + "Top up" button → `openTopUp`
8. Button: `{{ placeOrderLabel }}` (dynamic) → `placeOrder`
9. Footnote: "Items are delivered instantly to your inventory."

### [MODAL: Store Item Preview] — `{{ storePrevShow }}` (lines 1364–1417)
Bottom sheet. Close "✕" → `closeStorePreview`. 3D-flip preview stage for
skins (king/soldier sides), static image for boards/avatars, frame-on-avatar
composite for frames, big emoji for emotes. Name, sub-label, price (+
optional strikethrough old price). Buy button (`{{ prevBtnLabel }}`) →
`buyFromPreview`. Optional "add to cart" button → `addFromPreview`.

### [MODAL: Purchase Confirm] — `{{ buyConfirmShow }}` (lines 1419–1455)
Bottom sheet, "Confirm Purchase" eyebrow. Item card (thumb, name, sub,
price). "Your balance" row. Buttons: "Cancel" → `cancelBuy`; confirm
(`{{ bcConfirmLabel }}`) → `confirmBuyGo`.

### [MODAL: Contact Support] — `{{ contactShow }}` (lines 1457–1509)
Bottom sheet, "We usually reply within 24 hours". Close "✕" → `closeContact`.
- **Done state** (`contactDone`): checkmark, "Request Submitted", ticket ID, "Done" → `closeContact`.
- **Form state** (`contactFormShow`): Category chip-select (`sc-for contactCats`), Subject input, Message textarea (600-char counter), "Sent as {name} · {tag}" note, "Submit Request" → `submitContact`.

### [MODAL: Info Sheet] (How to Play / FAQ / Terms) — `{{ infoShow }}` (lines 1511–1532)
Bottom sheet. Title `{{ infoTitle }}` + sub `{{ infoSub }}`, close "✕" → `closeInfo`.
Content blocks (`sc-for infoBlocks`) — heading + paragraph, repeated.

### [MODAL: Get Diamonds / Top-Up] — `{{ topUpShow }}` (lines 1534–1573)
Bottom sheet. "Get Diamonds" title, balance line. Pack list (`sc-for topUpPacks`) — gem icon, amount, "diamonds" label, optional bonus label, optional tag badge (e.g. "Best Value"), price button → `p.buy`. Footer: "🔒 Secured by App Store · Restore purchases".

### [MODAL: Top-Up Confirm] — `{{ topUpConfirmShow }}` (lines 1576–1608)
Bottom sheet. Gem icon, total amount, optional bonus breakdown. Line items:
"Diamonds" / "Charged to". Buttons: "Cancel" → `cancelTopUpConfirm`; "Pay
{{price}}" → `confirmTopUp`. Footnote: "🔒 You won't be charged in this demo · instant delivery".

### [OVERLAY: Top-Up Processing] — `{{ topUpProcessing }}` (lines 1610–1621)
Spinner, "Processing payment…", "Securing your diamonds". No interactive elements (auto-advances).

### [OVERLAY: Top-Up Success] — `{{ topUpDoneShow }}` (lines 1623–1646)
Ring-burst success animation with spark particles. "Diamonds Added",
"+{{amt}}", new balance. Buttons: "Done" → `closeTopUpDone`; "View receipt" → `openReceipt`.

### [OVERLAY: Daily Claim Success] — `{{ drDoneShow }}` (lines 1648–1679)
Ring-burst animation. "Day {{n}} · {{label}}", amount(s) (gold + optional gem), "Come back tomorrow to keep your streak". Button: "Collect" → `closeDrDone`.

### [OVERLAY: Purchase Success] — `{{ buySuccessShow }}` (lines 1681–1717)
Ring-burst + checkmark badge animation. "Purchase Complete", item name,
"Added to your locker". Buttons: equip action (`{{ succEquipLabel }}`,
conditional) → `succEquipAction`(`succEquip`); "Keep Browsing" → `closeBuySuccess`.

### [SCREEN 16: Guild] — `{{ isGuild }}` (lines 1719–1858)
1. Back `‹` → `guildBack`
2. "✦ Edit" button (leader-only presumably) → `guildEditOpen`
3. Header: emblem, guild name, tag "#DK", "28 / 30 members", "Rank 4 · this season" pill
4. Description text + "min trophies +" pill
5. Guild level bar: "Guild Lvl 12", "18.4k / 25k XP"
6. Tab switcher (`sc-for gTab`) → `t.pick` — Roster / Chat / Wars

   **Roster tab** (`{{ gRoster }}`):
   7. Member list (`sc-for guildRoster`) — avatar+status dot, name, role badge, tier, trophy count → `m.open` (pubprofile)

   **Chat tab** (`{{ gChat }}`):
   8. Message thread (`sc-for guildChat`) — bubble aligned left/right by sender
   9. [Conditional] Blocked-composer notice (sanctioned users)
   10. Composer input + send button → `sendGuildMsg`

   **Wars tab** (`{{ gWars }}`):
   11. "War in progress" card — opponent, time remaining, "Play" → `playGuildWar`
   12. "War Log" list (`sc-for guildWars`) — opponent crest, score, status pill

### [MODAL: Edit Avatar] — `{{ avEditShow }}` (lines 1860–1932)
Bottom sheet. Close "✕" → `avatarEditClose`. Live preview (avatar + frame
composite). Avatar grid: "Upload" tile (file input) → `onUploadAvatar`, plus
preset options (`sc-for avatarOpts`) → `a.pick`. Frame grid (`sc-for
frameOpts`, incl. "None" option) → `f.pick`. "Save Changes" → `avatarEditSave`.

### [MODAL: Edit Guild] — `{{ guildEditShow }}` (lines 1934–1991)
Bottom sheet, "Leader settings · #DK". Close "✕" → `guildEditClose`. Crest
picker (`sc-for geEmblems`), Name input (24 char max), Description textarea
(140 char counter), "Minimum Trophies to Join" range slider (0–5000, step
100). "Save Changes" → `guildEditSave`.

### [MODAL: Create Guild] — `{{ guildCreateShow }}` (lines 1993–2061)
Bottom sheet, "Found your own order". Close "✕" → `guildCreateClose`. Crest
picker (`sc-for gcEmblems`), Name input (24 char), Tag input (2–4 letters,
5 char max, uppercase), Description textarea (140 char), Join Policy
chip-select (`sc-for gcPolicies`), "Founding cost: ✦ Free" note. Submit
(`{{ gcSubmitLabel }}`) → `guildCreateSubmit`.

### [Generic Stub screen] — `{{ isStub }}` (lines 2063–2069)
Fallback "coming soon"-style screen (icon, title, body) for any `screen`
value present in `stubMap` — **`stubMap` is empty in this file**, so this
path is currently unreachable / dead code; every screen is fully built out.

### [SCREEN 17: Discover Guilds] — `{{ isDiscover }}` (lines 2071–2109)
1. Back `‹` → `discoverBack`
2. Eyebrow "✦ Join an order ✦", title "Discover Guilds", subtitle "Browse active guilds recruiting near your rank, or found your own."
3. Search input (name/tag/region) + clear "×" (conditional)
4. [Empty state] "No guilds match "{{query}}"."
5. Guild list (`sc-for browseGuilds`) — emblem, name, tag, level badge, members/pts, Join button (`g.joinLabel`) → `g.join`; row tap → `g.open` (preview)
6. "＋ Create a Guild" dashed button → `guildCreateOpen`

### [MODAL: Guild Preview] — `{{ guildPreviewShow }}` (lines 2111–2153)
Bottom sheet. Emblem, name, level badge, tag + members. Description.
Stat tiles: Guild Points / War Record / Min. Trophies / Region. Language
row. Join button (`{{ guildPreview.joinLabel }}`) → `guildPreview.join`.

### [SCREEN 18: AI Difficulty] — `{{ isAiDiff }}` (lines 2155–2185)
1. Back `‹` → `aiDiffBack`
2. Eyebrow "✦ Train offline ✦", title "Play vs AI", subtitle
3. Difficulty cards (`sc-for aiLevels`, 3: presumably Easy/Normal/Hard) — icon, name, description, pip-strength indicator → `l.on` (select)
4. Button: "⚔ Start Match · {{aiDiffLabel}}" → `startMatch`

### [SCREEN 19: Mode Select] — `{{ isMode }}` (lines 2187–2215)
1. Back `‹` → `modeBack`
2. Eyebrow "✦ Choose your battle ✦", title "Game Modes", subtitle "Pick how you want to play. Ranked affects your trophies — everything else is just for fun."
3. Mode cards (`sc-for modeSelect`, 4) — icon tile, name + tag pill, description, meta line → `m.go`

### [SCREEN 20: Private Room] — `{{ isRoom }}` (lines 2217–2461)
1. Back `‹` → `roomExit`; friend-mode icon
2. Eyebrow "✦ Play with a Friend ✦", title "Private Room", subtitle

   **Choose sub-state** (`{{ roomIsChoose }}`):
   3. "Host a Room" card → `onCreateRoom`
   4. "Join with Code" card → `onOpenJoin`

   **Host sub-state** (`{{ roomIsHost }}`):
   5. Room Code display (6-char boxes)
   6. Buttons: `{{ copyLabel }}` → `onCopyCode`; "🔗 Link" → `onCopyLink`; "✉ Invite" → `onSendInvite`
   7. "Lock the room" toggle → `onToggleLock`
   8. Players card: host (you) vs guest slot — "Waiting…" state or joined guest with "Kick"/"Ban" buttons → `onKickGuest`/`onBanGuest`
   9. "Game Mode" chip row (`sc-for roomModes`) → `rm.on`
   10. "Time Control" chip row (`sc-for roomTimes`) → `rt.on`
   11. "Move Timer" chip row (`sc-for roomMoveTimers`) → `mt.on`
   12. Spectators card: toggle → `onToggleSpec`; spectator chip list (`sc-for spectators`) with per-person kick → `sp.kick`; "👁 Copy Spectate Link" → `onSpecShare`; "▶ Spectator View" → `onOpenSpectate`
   13. Invite Friends card (`sc-for roomFriends`) — avatar+status, name, invite button → `fr.invite`
   14. [Conditional, admin-flagged] Room Chat card — message thread, emote quick-buttons (`sc-for chatEmotes`), input + Send → `onRoomChatSubmit`
   15. Actions: "Leave" → `onRoomBack`; start button (`{{ roomStartLabel }}`) → `onStartRoom`

   **Join sub-state** (`{{ roomIsJoin }}`):
   16. 6-char code entry boxes (invisible input overlay) → `onJoinInput`
   17. [Conditional] Error message
   18. "Join Room" → `onSubmitJoin`; "‹ Back" → `onRoomBack`

   **Joining sub-state** (`{{ roomIsJoining }}`):
   19. Spinner, "Joining room…", "Connecting you to the match"

### [SCREEN 21: Spectate] — `{{ isSpectate }}` (lines 2463–2528)
1. Back `‹` → `onLeaveSpectate`
2. "Live" pulsing pill
3. Viewer count pill (`{{ spectViewers }}`)
4. Blue player info bar (avatar, name, tier, capture count)
5. Turn indicator: "Blue to move · Move {{spectMove}}"
6. Read-only 8×8 board (`sc-for spectCells`, 64 cells, no tap handlers)
7. Red player info bar
8. Footnote: "🔒 Spectating — you can watch but not move pieces"
9. Button: "Leave Spectator View" → `onLeaveSpectate`

### [SCREEN 22: Live Match Browser] — `{{ isLive }}` (lines 2530–2568)
1. Title "Watch Live" + pulsing "Live" pill
2. Subtitle "Tune in to matches happening right now across FilipinoDama."
3. Match cards (`sc-for liveMatchesM`) — mode badge, viewer count, red player name+rating, "VS", blue player name+rating, move count, "▶ Watch" → `m.watch`

### [SCREEN 23: Quests] — `{{ isQuests }}` (lines 2570–2656)
1. Back `‹` → `questBack`
2. Gold-earned chip (`{{ questGold }}`)
3. Eyebrow "✦ Progression ✦", title "Quests", subtitle "Complete goals to earn gold. Daily quests reset at midnight; seasonal goals run all season."
4. "Daily Quests" header + optional "Ready"-style badge + "RESETS 08:14" pill
5. Daily quest rows (`sc-for dailyQuests`) — icon, title, description, progress bar + current label, gold reward, claim button (`q.btnLabel`) → `q.claim`
6. "Seasonal Goals" header + optional ready badge + "SEASON OF THE RAJAH" pill
7. Seasonal quest rows (`sc-for seasonQuests`) — same shape as daily

### [SCREEN 24: Daily Reward] — `{{ isDailyReward }}` (lines 2658–2725)
1. Back `‹` → `drBack`
2. Progress pill (`{{ drProgLabel }}`)
3. Eyebrow "✦ Login Streak ✦", title "Daily Reward", subtitle "Log in every day to claim escalating rewards. Miss a day and the streak restarts at Day 1."
4. Streak progress bar + `{{ drStreakLabel }}`
5. Days 1–6 grid (`sc-for drDays`, 3-col) — day label, icon, amount, checkmark (claimed) or "Today" badge (next)
6. Day 7 "Grand Reward" card — chest icon, gold + gem amounts, claimed check / "Today" badge
7. Claim button (`{{ drClaimLabel }}`) → `drClaim`

### [SCREEN 25: Leaderboard] — `{{ isLeaderboard }}` (lines 2727–2793)
1. Back `‹` → `lbBack`
2. Eyebrow "✦ LEADERBOARD ✦"
3. Tab row (`sc-for lbTabs`, 3 — likely Global/Friends/Guild) → `t.on`
4. "Ends" countdown line (`{{ lbEnds }}`)
5. Podium (top 3, `sc-for lbPodium`) — medal, avatar, name, tier, rating
6. Ranked table header: Rank / Player / `{{ lbMetric }}`
7. Rank rows (`sc-for lbRanks`, 7) — rank number, name, tier, rating → `r.open` (pubprofile)
8. "Your rank" pinned row — rank, name+"YOU" badge, tier+percentile, rating

### [SCREEN 26: Friends] — `{{ isFriends }}` (lines 2795–2961)
1. Back `‹` → `friendsBack`
2. Eyebrow "✦ YOUR CIRCLE ✦", title "Friends"
3. "＋ Add" button → `friendAdd`
4. Summary stat tiles (`sc-for friendSummary`, 3)
5. Search input "Search by name or tier…" → `friendSearch`
6. [Conditional] "Requests · {{n}}" section (`sc-for friendRequests`) — avatar, name, mutual-friends note, Accept "✓" → `r.accept`, Decline "✕" → `r.decline`
7. [Conditional] "Online · {{n}}" section (`sc-for friendsOnlineList`) — swipeable rows (reveal 🔔 Mute / 🗑 Delete on swipe) → `f.mute`/`f.del`; avatar+status dot, name+tier+muted-icon, status label, "💬" message button (unread badge) → `f.message`, invite/challenge button → `f.invite`; row tap → `f.openProfile`
8. [Conditional] "Offline" section (`sc-for friendsOfflineList`) — same shape, no message button
9. [Empty: search] "No matches found" — "No friends match "{{query}}". Try a different name or tier."
10. [Empty: no friends] "Build your circle" — "You haven't added any friends yet. Add players to challenge them to matches and climb together." + "＋ Add a Friend" → `friendAdd`

### [SCREEN 27: Add Friend] — `{{ isAddFriend }}`, `data-screen-label="Add friend"` (lines 2963–3001)
1. Back `‹` → `addFriendBack`
2. Eyebrow "✦ FIND PLAYERS ✦", title "Add a friend"
3. Search input "Search by name or player tag (#ABCD)…" → `onAddFriendQuery`
4. Tip: "Tip: share your tag so friends can add you back."
5. Results list (`sc-for afResults`) — avatar, name+tag, tier+rating → `p.openProfile`; state: "Sent ✓" pill (if already sent) or "＋ Add" button → `p.add`

### [OVERLAY: Global Player Search] — `{{ gsOpen }}` (lines 3003–3036)
Full-screen search overlay (fixed, z-index 96) invoked from Home's magnifier
icon. Search input "Search players by name or tag…" → `gsInput`; close "✕"
→ `gsClose`. Results (`sc-for gsResults`) — avatar, name+tag, tier+rating,
"View ›" → `p.open`. Empty state: "No players found" / "Try a different name or tag."

### [OVERLAY: Replay Viewer] — `{{ isReplayOpen }}` (lines 3038–3072)
Full-screen (fixed, z-index 95). Back `‹` → `closeReplay`. Title
`{{ replayTitle }}`, result badge `{{ replayResult }}`. Read-only board
(`sc-for replayCells`, king marker "♛" conditional). Move counter label.
Transport controls: "◀" → `replayBack`; play/pause (`{{ replayPlayIcon }}`)
→ `replayTogglePlay`; "▶" → `replayFwd`. "Move {{n}}" counter.

### [SCREEN 28: Player Public Profile] — `{{ isPubProfile }}`, `data-screen-label="Player profile"` (lines 3074–3149)
1. Back `‹` → `closePubProfile`
2. Avatar, name, tag + tier
3. Status pill (online/offline/in-match, colored)
4. Stat tiles (`sc-for pubStatRows`, 4)
5. Guild card + "Favorite move" card
6. "Match replays" list (`sc-for pubRecent`) — result chip, "vs {opp}", mode+delta, "▶ Replay" → `m.watch`
7. "Badges & achievements" chip list (`sc-for pubBadges`)
8. Buttons: "＋ Add friend" → `pubAddFriend`; "💬 Message" → `pubMessage`
9. "Report player" (flag icon) → `pubReport`

### [SCREEN 29: Match Detail] — `{{ isMatchDetail }}`, `data-screen-label="Match detail"` (lines 3151–3184)
1. Back `‹` → `closeMatchDetail`
2. Result banner: `{{ mdResultLabel }}`, mode, trophy delta pill
3. Opponent row (tap) → `mdOpenOpp` (pubprofile)
4. "Match stats" table (`sc-for mdRows`, 7) — key/value pairs

### [SCREEN 30: Achievements] — `{{ isAchievements }}`, `data-screen-label="Achievements"` (lines 3186–3220)
1. Back `‹` → `achBack`
2. Eyebrow "✦ MILESTONES ✦", title "Achievements"
3. Completed-count pill (`{{ achDoneLabel }}`)
4. Achievement list (`sc-for achList`, 8) — icon, name, "Unlocked" badge (conditional), description, progress bar (conditional on in-progress)

### [SCREEN 31: Purchase Receipt] — `{{ isReceipt }}`, `data-screen-label="Receipt"` (lines 3222–3277)
1. Back `‹` → `closeReceipt`
2. Gem icon, "Payment received", date
3. Line items: Order ID, Diamonds, Bonus (conditional), Total credited, Account (name+tag), Amount paid
4. "Receipt emailed" notice — "Sent to {{email}}"
5. Button: "Back to wallet" → `closeReceipt`
6. Footnote: "FilipinoDama · This is a demo receipt, no real charge was made."

### [SCREEN 32: Wallet] — `{{ isWallet }}`, `data-screen-label="Wallet"` (lines 3279–3334)
1. Back `‹` → `walletBack`
2. Eyebrow "✦ YOUR WALLET ✦", title "Balance"
3. Balance tiles: Gold / Diamonds
4. "Buy diamonds" section — pack list (`sc-for topUpPacks`) same shape as Top-Up modal → `p.buy`
5. [Conditional] "Recent activity" list (`sc-for walletTxns`) — name, timestamp, signed currency amount

### [SCREEN 33: Season Pass] — `{{ isSeason }}` (lines 3336–3480ish, continues to line ~3482)
1. Back `‹` → `seasonBack`
2. Eyebrow "✦ RANKED SEASON ✦"
3. Hero card: banner art, season name, season-number pill, "Ends {{date}}"
4. Level bar: `{{ seasonLevelLabel }}` / `{{ seasonMaxLabel }}`, XP label, fill bar
5. Tab row: "⚔ Reward Track" / "🏆 Standings" → `seasonTabRewardsBtn` / `seasonTabRankingBtn`

   **Reward Track tab** (`{{ seasonTabRewards }}`):
   6. [If not owned] "Unlock the Royal Pass" banner — "Claim the premium reward on every level — exclusive skins, frames & bonus gems." + price button (900💎) → `unlockRoyal`
   7. [If owned] "Royal Pass Active" banner with "ACTIVE" badge
   8. "Reward Track" header + optional claimable-count badge
   9. Horizontal tier scroll (`sc-for seasonTiers`) — level number, Free-track tile (icon/emoji, label, claim button) + Premium-track tile (same shape) → `t.free.claim` / `t.prem.claim`
   10. Footnote explaining free vs. Royal Pass rewards

   **Standings tab** (`{{ seasonTabRanking }}`):
   11. "Season Standings" header
   12. Ranked rows (`sc-for seasonBoard`, 5) — medal (top 3) or rank number, avatar, name, tier, rating
   13. "Your row" pinned card — rank, avatar, name+"YOU" badge, rating

---

## 3. DATA / BEHAVIOR

### 3.1 localStorage keys

**`fdm.*` namespace** (auth/session flags):
| Key | Holds |
|---|---|
| `fdm.auth` | Auth/session marker (referenced but not directly inspected in this pass — used alongside `fdm.authEmail`) |
| `fdm.authEmail` | Last-used auth email, for pre-filling / guest-vs-signed-in checks |
| `fdm.onboarded` | `'1'` once the user has skipped/finished onboarding (`skipOnboard`) |

**`fdr.*` namespace** (persisted game/record data — 34 keys):
| Key | Holds |
|---|---|
| `fdr.wallet` | `{ gold, diamonds, owned[] }` — currency balances + owned store items |
| `fdr.daily` | `{ streak, last }` — daily login streak counter + last-claimed date |
| `fdr.profile` | `{ displayName, playerTag, favFaction, bio, myAvatar, myFrame }` |
| `fdr.recentBuys` | Array of recently purchased items (Store "Recently Purchased" rail) |
| `fdr.purchaseLog` | Full purchase history log (Purchase History screen) |
| `fdr.purchases` | Related purchase records (possibly a superset/alt of purchaseLog — both are read) |
| `fdr.myReplays` | Array of saved replay records (up to 20, unshifted on each `endMatch`) |
| `fdr.notifDismissed` | Array of dismissed/swiped-away notification IDs |
| `fdr.chatMuted` | Map of muted chat/friend IDs → bool |
| `fdr.friends` | Friend roster + requests |
| `fdr.guilds` | Guild directory (Discover Guilds browse list) |
| `fdr.guildOverride` | Admin/local override of the user's own guild data |
| `fdr.guildApplications` | Pending guild-join applications |
| `fdr.season` | Season config (name, dates, tiers) |
| `fdr.leaderboard` | Leaderboard standings data |
| `fdr.tournaments` | Tournament list + bracket data |
| `fdr.events` | Admin-controlled "Live Events" home-screen entries |
| `fdr.econ` | Economy/config table (e.g. `reward.daily.gold`) — admin-tunable economy values |
| `fdr.flags` | Feature flags |
| `fdr.grants` / `fdr.grantsApplied` | Admin-issued grants to the player + applied-state tracking (prevents double-apply) |
| `fdr.sanctions` | Active moderation sanctions against the player (drives the Sanction Banner + chat-blocked states) |
| `fdr.reports` | Player-submitted reports (My Reports list on Profile) |
| `fdr.reportNotifSeen` | Seen-state for report-status-change notifications |
| `fdr.refundNotifSeen` | Seen-state for refund notifications |
| `fdr.tickets` | Contact Support tickets |
| `fdr.storeItems` | Store catalog (admin-controlled item list/prices) |
| `fdr.diamondPacks` | Top-up pack definitions (amounts, bonuses, prices) |
| `fdr.topupReceipts` | Diamond top-up receipt records |
| `fdr.questDefs` | Quest/goal definitions (daily + seasonal) |
| `fdr.dailyRewards` | Daily-login reward ladder definition |
| `fdr.room` | Active private-room state (for rejoin/persistence) |
| `fdr.liveViewers` | Per-match live viewer-count bump tracking (spectate/live browser) |
| `fdr.pushNotifs` | Push-style notification feed source data |
| `fdr.pushNotifsSeenM` | Seen-state tracking for the above (mobile-specific suffix) |
| `fdr.maintenance` | Maintenance-mode toggle + message (admin-controlled kill switch) |

### 3.2 Key behavioral functions (representative, grouped)

**Navigation core**
- `go(screen)` — sets `state.screen`; refreshes wallet automatically when navigating to `store` or `inventory`.
- `playWithLoader(context, cb)` — shows the Loading Screen import, then invokes `cb` (used for all match-entry transitions).

**Matchmaking / match lifecycle**
- `enterMatchmaking(ctx)` — sets `screen:'matchmaking'`, phase `'search'`; after 2000ms flips to `'found'`; after another ~900ms (2900ms total) calls `playWithLoader` → `screen:'board'`.
- `cancelMM()` — clears matchmaking timers, returns to home.
- `startAI(diff)` — sets AI difficulty, plays with loader into board.
- `endMatch(result)` — builds a replay record (`rp<timestamp>`, opponent, W/L, mode, move log, initial board), unshifts into `fdr.myReplays` (capped at 20), sets `screen:'result'`.
- `rematchMatch()` — replays with loader using the last matchmaking context.
- `tapCell`, `undoMove`, `showHint` — board interaction (cell selection/move execution, undo, hint) — implementation bodies live further in the script (not exhaustively traced in this pass; flagged below as it exceeds this inventory's screen/element scope).

**Store / economy**
- `addToCart`, `removeFromCart`, `clearCart`, `placeOrder` — cart lifecycle; `placeOrder` validates gold/diamond balance, deducts, marks items owned, records recent buys, shows purchase-success overlay.
- `askBuy`, `cancelBuy`, `confirmBuyGo`, `buyStore`, `buyFromPreview` — direct-buy confirmation flow outside the cart.
- `askTopUp`, `cancelTopUpConfirm`, `confirmTopUp`, `topUpBuy` — diamond top-up flow (demo/no real charge).
- `_saveWallet`, `refreshWallet` — persistence + resync of `fdr.wallet`.
- `_recordRecent`, `_showBuySuccess` — post-purchase side effects (recent-buys rail, success overlay content).
- `openReceipt`, `closeReceipt` — receipt screen for top-ups.

**Daily / quests / season**
- `claimDaily()` — validates not-already-claimed-today via `state.drLast`, resolves reward from `_drLadder` (7-entry ladder: gold 200 → gold 400 → gem 10 → gold 700 → gem 20 → gold 1200 → chest {gold 2000, gem 50}), applies to wallet, persists via `_saveDaily`.
- `claimQuest`, `claimSeasonReward`, `unlockRoyalPass`, `setSeasonTab` — quest/season-pass claim + tab switching.

**Guild**
- `applyGuild`, `submitGuildCreate`, `saveGuildEdit`, `playGuildWar`, `sendGuildMsg`, `_myGuild`, `_mergeGuilds` — guild membership, creation, editing, war participation, chat.

**Social / friends / chat**
- `sendFriendRequest`, `openChat`, `closeChat`, `sendChat`, `pushChat`, `muteChat`, `deleteChat`, `_friendRoster`, `_friendsStore`, `_saveFriends` — friend + 1:1 chat lifecycle.
- `openReportM`, `setReportCatM`, `submitReportM`, `closeReportM` — player-report modal flow (used from Result screen, Public Profile, and Chat header).

**Private room / spectate / live**
- `createRoom`, `resetRoom`, `_clearRoom`, `_genCode`, `copyRoomCode`, `copyRoomLink`, `inviteFriendToRoom`, `sendRoomInvite`, `kickGuest`, `banGuest`, `toggleLock`, `setRoomMode`, `setRoomTime`, `setRoomMoveTimer`, `toggleSpec`, `kickSpectator`, `copySpectateLink`, `roomEmote`, `sendRoomChat`, `startRoomMatch`, `startRoomMatchLobby`, `startGuestTrickle` (simulates a guest joining, presumably for demo purposes), `startSpecTrickle` (simulates spectators trickling in), `_syncRoom`.
- `openSpectate`, `leaveSpectate`, `_spectBoard`, `_specPool`, `_bumpViewer`, `_readViewers`, `_viewerId` — spectator mode + viewer-count simulation, persisted via `fdr.liveViewers`.
- `openLiveBrowser`, `watchLiveM`, `_liveMatchesM` — live match browser listing.

**Replays**
- `openReplay`, `closeReplay`, `replayStep`, `replayTogglePlay`, `_replayInit`, `_replaySnapshots`, `_snapsFromRec` — replay playback/scrubbing.

**Notifications**
- `markAllRead`, `markNotifsRead`, `dismissNotif`, `notifCta`, `_syncRefundNotifs`, `_syncReportNotifs` — notification read/dismiss state, plus auto-generated notifications for refunds and report-status changes.

**Auth / profile / settings**
- `submitAuth`, `guestAuth`, `setAuthMode`, `onAuthField`, `_emailOk`, `logOut` — auth flow + email validation.
- `avatarEditOpen/Close/Save`, `onUploadAvatar`, `pickDraftAvatar`, `pickDraftFrame`, `equipItem`, `_profEquip`, `_saveProfile`, `_avatarSrc`, `_frameSrc`, `_avatarList`, `_frameList` — avatar/frame customization + equip persistence.
- `toggleSet`, `setTheme` — settings toggles (sound/music/haptics/confirm/autoPromote/hints/forceCap) and board theme (`'wood'` default).

**Admin-driven / dynamic content readers** (all pull from `fdr.*` JSON, meaning an admin panel writes these and the mobile app is a pure reader — this is the live tie-in point for the real backend):
`_econ`, `_flags`, `_events`, `_tournaments`, `_leaderboard`, `_season`, `_questDefs`, `_dailyRewards`, `_diamondPacks`, `_maintenance`, `_guildOverride`.

### 3.3 Gesture / mobile-specific behaviors

1. **Pull-to-refresh** (`_ptStart`/`_ptMove`/`_ptEnd`, wired to `onTouchStart/Move/End` on the `.mscroll` screen container):
   - Disabled entirely on `splash`, `onboard`, `board`, `matchmaking` screens.
   - Only arms when the scroll container is already at `scrollTop<=0`.
   - Drag distance is damped by 0.5× and capped at 92px; the container translates down live during the drag (no transition while dragging).
   - On release: if pulled past 58px, snaps to a 52px "refreshing" position, shows a spinning indicator for 1000ms, then springs back with a `.32s cubic-bezier(.25,.9,.3,1)` transition. Below the 58px threshold it just springs back with no refresh action.
   - Visual: a circular badge (`ptrIndStyle`) fades in/out based on pull distance and rotates/spins (`ptrSpinStyle`) — see `scraps/mobile-ptr.png` for the visual reference (matches code exactly).

2. **Swipe-to-reveal actions** on list rows — two independent implementations sharing the same drag-threshold logic (horizontal drag >8px and greater than vertical drag arms it; vertical drag >8px without horizontal cancels it so vertical scroll isn't hijacked):
   - `_fswDown/_fswMove/_fswUp` — Friends screen rows (online + offline lists). Reveals a 132px-wide "🔔 Mute / 🗑 Delete" action tray on swipe-left; snaps open past -66px drag, otherwise closes; only one row can be open at a time (`_fswOpen` tracks the currently-open row and auto-closes it when another row starts dragging).
   - `_nswDown/_nswMove/_nswUp` — Notifications screen rows, same drag mechanics, reveals a red delete/archive action.

3. **No native back-button/history integration.** No `popstate` or `history.pushState` calls anywhere in the file. All "back" behavior is explicit per-screen `‹` buttons calling `go('target')` or a dedicated close handler (`closeXxx`). **Native-build implication:** the Android app's system/gesture back must be explicitly mapped per screen to the same target each screen's `‹` button uses (documented per-screen above), since there is no back-stack to fall back on.

4. **Tap/press feedback** — `.mtap` class (`transform:scale(.95);filter:brightness(1.15)` on `:active`) applied to virtually every interactive element; `.mcard` class (`scale(.97)` on `:active`) for large tappable cards. Not a gesture per se, but a systemic interaction-affordance convention worth preserving 1:1 in Compose (e.g. via a shared `Modifier.pressScale()`).

5. **Custom draggable range slider** — native `<input type="range">` used for "Minimum Trophies to Join" (Edit/Create Guild modals), styled via `accent-color`. In native Compose this maps to a `Slider` composable.

6. **`.mscroll` hidden-scrollbar convention** — `overflow-y:auto` with `scrollbar-width:none` / `::-webkit-scrollbar{display:none}` on all scrollable panes (main screen router, bottom sheets, chat threads) — i.e. scrolling works but no visible scrollbar chrome, consistent with native mobile scroll behavior (no extra work needed for Android, just don't add a scrollbar).

### 3.4 Visual system confirmation (vs. expected spec)

Confirmed via direct CSS/asset inspection — matches the expected design system exactly, no deviations found:
- Background: deep royal purple — `body{background:#0a0612}`, screen gradients running `#0f0720`/`#1e1338`/`#1c1338` etc.
- Gold ornament accents: `#E8B84B` / `#f0cf72` / `#efc25a→#c9971f` gradients used throughout for CTAs, borders, highlights.
- Player colors: crimson/red (`#ff5a6a`, `#d93b52`/`#a51e35`, `rgba(217,59,82,*)`) for the "red"/self side in some contexts and opponent in others (side is contextual, not fixed to color=player); royal blue (`#5a96ff`, `#2e6bc6`-family, `#8fb3ff`) for the "blue" side. Both Board and Spectate screens use this same red-vs-blue convention.
- Fonts: Google Fonts import confirms exactly Cinzel (weights 600/700/800/900, headings/titles), Inter (400–800, body/UI), JetBrains Mono (600/700, numeric/currency/countdown values) — no other font families appear anywhere in the file.

---

## 4. SCRAPS CROSS-REFERENCE

| PNG | Screen it depicts | Notes |
|---|---|---|
| `mobile-splash.png` | Splash (not checked this pass — filename is unambiguous) | — |
| `mobile-board.png` | **Actually the Splash screen** (sun logo, "FilipinoDama" wordmark, "Filipino Dama, reimagined") | Filename appears mismatched/legacy — content does not show the game board. Flagged, not corrected (per instructions, exact copy only, no guessing beyond what's visible). |
| `mobile-board2.png` | Not opened this pass | [NEEDS-MANUAL-REVIEW] — not inspected; presumed alternate board state |
| `mobile-check.png` | Not opened this pass | [NEEDS-MANUAL-REVIEW] — not inspected |
| `mobile-header.png` | Home screen top bar (avatar/name/tier, notif bell w/ badge, wallet chips) | Matches current code structurally; screenshot lacks the search-icon button and shows only 2 wallet chips without the "+" affordance — earlier draft state, code is authoritative per the 1:1 handoff rule. |
| `mobile-notif.png` | Notifications screen | Matches code exactly — "Today"/"Earlier" groups, unread dots, "Accept" CTA on match-invite notification, "Mark all read". |
| `mobile-ptr.png` | Home screen with pull-to-refresh spinner mid-gesture | Confirms the PTR visual (circular spinner near status bar) matches `ptrIndStyle`/`ptrSpinStyle` in code. |
| `01-mobile-profile.png` / `02-mobile-profile.png` | Profile screen (Overview) | `01` matches structurally but shows only 2 tabs ("Overview"/"Match History") vs. the final code's 3 tabs ("Overview"/"History"/"Settings") and is missing the Inventory/Friends quick-link row present in code — earlier draft; code is authoritative. `02` not opened this pass — [NEEDS-MANUAL-REVIEW]. |
| `01-mobile-settings.png` / `02-mobile-settings.png` | Settings (Profile → Settings tab), presumed | Not opened this pass — [NEEDS-MANUAL-REVIEW]. |
| `01-guild.png` / `02-guild.png` / `03-guild.png` | Guild screen (Roster/Chat/Wars tabs), presumed | Not opened this pass — [NEEDS-MANUAL-REVIEW]. |

All un-reviewed scraps are earlier-draft reference material per the file
naming convention observed in the ones that were checked (numbered variants
= design iterations); the `.dc.html` file itself remains the authoritative
1:1 source per the handoff rule, so these were treated as lower priority
within this extraction pass. Recommend a follow-up pass opens the remaining
7 PNGs if a design-history audit (rather than a build inventory) is needed.

---

## 5. SUMMARY TABLE

| Metric | Count |
|---|---|
| Total distinct `state.screen` values (`isXxx` gates) | 33 |
| Full-screen views documented above (§2) | 33 screens + 11 modal/overlay sub-components (Store Preview, Purchase Confirm, Contact Support, Info Sheet, Top-Up sheet, Top-Up Confirm, Top-Up Processing, Top-Up Success, Daily Claim Success, Purchase Success, Edit Avatar, Edit Guild, Create Guild, Guild Preview, Global Search, Replay Viewer, Report Player) = 44 distinct addressable views/overlays total |
| Bottom tab bar items | 5 (Home, Store, Play, Guild, Profile) |
| Global overlay/chrome layers (maintenance, splash, loading, PTR, toast, sanction, tab bar, chat, report, gesture pill) | 10 |
| `localStorage` keys — `fdm.*` | 3 |
| `localStorage` keys — `fdr.*` | 34 |
| Component methods/functions identified | 218 |
| Markup line range (split copy) | 1–3610 |
| Script/behavior line range (split copy) | 3611–5067 |

### Per-screen element-row counts (as enumerated in §2; approximate — repeated `sc-for` template items counted once per template, not once per rendered instance)

| Screen | Rows documented |
|---|---|
| Maintenance | 6 |
| Splash | 5 |
| Onboarding | 6 |
| Sign in / Auth | 12 |
| Home | 15 |
| Board / Match | 9 |
| Result / Victory | 10 |
| Matchmaking | 9 |
| Tournament Detail | 9 |
| Profile | 20 |
| Inventory | 5 |
| Notifications | 5 |
| Purchase History | 4 |
| Store | 11 |
| Checkout | 9 |
| Store Item Preview (modal) | ~7 |
| Purchase Confirm (modal) | ~4 |
| Contact Support (modal) | ~9 |
| Info Sheet (modal) | ~4 |
| Get Diamonds / Top-Up (modal) | ~4 |
| Top-Up Confirm (modal) | ~5 |
| Top-Up Processing (overlay) | ~3 |
| Top-Up Success (overlay) | ~4 |
| Daily Claim Success (overlay) | ~4 |
| Purchase Success (overlay) | ~4 |
| Guild | 12 |
| Edit Avatar (modal) | ~5 |
| Edit Guild (modal) | ~5 |
| Create Guild (modal) | ~7 |
| Discover Guilds | 6 |
| Guild Preview (modal) | ~6 |
| AI Difficulty | 4 |
| Mode Select | 3 |
| Private Room | 19 |
| Spectate | 9 |
| Live Match Browser | 3 |
| Quests | 7 |
| Daily Reward | 7 |
| Leaderboard | 8 |
| Friends | 10 |
| Add Friend | 5 |
| Global Player Search (overlay) | ~4 |
| Replay Viewer (overlay) | ~7 |
| Player Public Profile | 9 |
| Match Detail | 4 |
| Achievements | 4 |
| Purchase Receipt | 6 |
| Wallet | 5 |
| Season Pass | 13 |
| **Total element rows documented** | **≈340** |

---

## NEEDS-MANUAL-REVIEW items

1. `tapCell`, `undoMove`, `showHint` full implementations (board move-execution
   logic, forced-capture rule enforcement, hint algorithm) — these function
   bodies live in the script section but were not traced line-by-line in this
   pass since the task scope is screen/element/behavior *characterization*,
   not full game-logic transcription. Byte range: within split-copy lines
   3611–5067 (script section), exact offsets not captured.
2. Scraps not opened this pass: `mobile-board2.png`, `mobile-check.png`,
   `02-mobile-profile.png`, `01-mobile-settings.png`, `02-mobile-settings.png`,
   `01-guild.png`, `02-guild.png`, `03-guild.png`. Filesystem paths:
   `D:\AI Projects\FilipinoDama\handoffv3\scraps\<name>`.
3. Exact byte offsets (vs. split-copy line numbers) were not computed for
   any row in this document — all line references above are against the
   5,067-line `sed`-split working copy stored at
   `C:\Users\johnr\AppData\Local\Temp\claude\d--AI-Projects-FilipinoDama\4d46f08b-9bed-4d5e-8cae-4e16f39bda4b\scratchpad\mobile-split.txt`,
   not the original minified file. If byte-accurate offsets into the
   original `.dc.html` are required, that needs a second pass with a
   byte-offset-preserving extraction method.
