# FilipinoDama Android Golden-Path Verification - Final Report

Branch: fix/android-golden-paths (base legacy/prototype, HEAD at start of this
pass b52590d). Verified against a live local dev server (apps/server,
pnpm dev, port 4000) plus Postgres/Redis in Docker (filipinodama-postgres-1,
filipinodama-redis-1) plus an Android emulator (AVD fd_golden_paths,
android-33 google_apis_playstore x86_64, API 33) running the debug APK
(apps/android/app/src/debug/.../app-debug.apk). Second-player automation via
apps/server/test/golden-path-client.mjs (a real REST + socket.io client, not
a browser).

This is a takeover session: paths 1-6 and 8 (install through AI match, and
the store/private-room paths) were already verified and PASSED by prior
agent runs; this session verified the remaining paths 7, 9, 10, 11,
confirmed and extended the inherited economy fix, and ran the full server
suite.

## 11-Path Result Table

| # | Path | Result | Evidence |
|---|------|--------|----------|
| 1 | Install to splash | PASS (inherited) | 02-splash.png |
| 2 | Onboarding | PASS (inherited) | 03-onboarding.png |
| 3 | Guest sign-in to home | PASS (inherited) | 03b-after-guest-tap.png, 04-guest-home.png |
| 4 | Home hub | PASS (inherited) | 04-guest-home.png |
| 5 | Play tab to mode select | PASS (inherited) | 05-play-tab.png, 06-ai-mode-select.png |
| 6 | AI match: board, moves, resign, result | PASS (inherited) | 07-ai-match-board.png through 09c-ai-result.png |
| 7 | Profile to match history to replay | FAIL | 47-profile.png (this session) plus 27-profile.png (inherited) |
| 8 | Store + private room full flow | PASS (inherited) | 36-store.png through 45-private-match-result-resign.png |
| 9 | In-match chat with the scripted client | PASS (this session) | 64-chat-check.png |
| 10 | Offline banner plus recovery | PASS (this session) | 67-offline-banner.png, 68-reconnected.png |
| 11 | Maintenance mode | FAIL (this session) | 70-maintenance-foreground.png |

9 of 11 PASS, 2 of 11 FAIL (both FAILs are pre-existing client-side gaps,
not regressions - see below).

## Path-by-path notes (this session's 4 paths)

### Path 7 - Profile / match history / replay: FAIL

The Profile tab renders a static stub: "Profile - Coming in Phase 2"
(47-profile.png). This is not a regression from this session - the
inherited screenshot 27-profile.png from an earlier phase shows the
identical stub. Source inspection confirms there is no match-history or
replay UI anywhere in the Android app (AppNavHost.kt has no such route; no
MatchHistory/Replay screen file exists). The server DOES have the data
layer ready - GET /api/matches in apps/server/src/modules/matches.ts line 80
is a paginated, filterable match-history endpoint - so this is purely a
missing Android client screen, not a missing capability. A curl against
/api/matches/history returned 401 unauthenticated, confirming the route
exists and is gated, corroborating the server side is ready and waiting on
a client.

### Path 9 - In-match chat with the scripted client: PASS

Hosted a private room (code XT4KAX), had golden-path-client.mjs join-room
join as player2@test.dama, started the match, then sent a match:chat
socket event as the guest. The message "gl hf -- scripted client here"
appeared live in the app's Quick Chat panel during the match
(64-chat-check.png).

Note: golden-path-client.mjs's own join-room command has a latent bug - it
emits match:chat with a { matchId, text } payload, but the server handler
(apps/server/src/realtime/match.ts line 727) expects { matchId, body,
emote }. Since body resolves to an empty string and emote is null, the
server's guard clause silently drops the message - this was caught when the
script's own chat send produced no visible message in the app. This is a
test-script bug, not a product bug: a one-off corrected script (payload
{ matchId, body }) sent from the same account reproduced the feature
working correctly end-to-end, proving the actual in-match chat feature is
functional. The script's join-room chat call is left as-is in the committed
file per the "reuse it" instruction from the task - flagging the field-name
mismatch here for whoever next touches the script.

### Path 10 - Offline banner plus recovery: PASS

Started a live Quick Match (bot opponent "Lam-ang"), then ran
adb shell svc wifi disable plus svc data disable on the emulator. Within
about 6 seconds the app's ConnectionLostBanner (OnlineMatchScreen.kt line
294) appeared: "Connection lost - reconnecting..." (67-offline-banner.png),
gated on ui.connectionLost && status == PLAYING. Re-enabling network
(svc wifi enable plus svc data enable) cleared the banner within about 6
seconds and returned the match to a fully interactive "Your move" state
(68-reconnected.png) - clean recovery, no stuck state, no crash.

### Path 11 - Maintenance mode: FAIL

The server has full maintenance-flag infrastructure: Config rows
MAINTENANCE_BANNER / MAINTENANCE_TEXT, admin-editable via
PATCH /api/admin/config/:key, and exposed unauthenticated at
GET /api/config/public (apps/server/src/modules/admin-config.ts). Flipped
MAINTENANCE_BANNER to true with a test message directly in the dev DB,
confirmed the server reflected it (curl /api/config/public showed
MAINTENANCE_BANNER: true), then backgrounded and re-foregrounded the
Android app. Result: the app rendered a completely normal Home screen with
no maintenance banner, no blocking screen, and no acknowledgement of the
flag (70-maintenance-foreground.png). Source-grepped the whole Android app
for MAINTENANCE, configPublic, ConfigApi, MaintenanceScreen - zero hits.
The client never calls /api/config/public at all. This is a real, verified
gap: the server-side switch exists and works, but flipping it does nothing
on Android. Flag was reverted to false / empty text immediately after the
test, confirmed via a follow-up curl.

## Economy bug: broken to fix to evidence

Broken: purchaseItem() in apps/server/src/economy/ledger.ts always charged
item.priceGold / item.priceDiamonds (the full, struck-through base price),
even when the Store showed the item on a Daily Deal at a lower
item.salePrice. Field repro from the inherited run: Store displayed
"Crimson Legion Pieces - 1800 gold" (a -40% Daily Deal), the confirm sheet
also showed 1800, but confirming the purchase silently charged 3000 gold
(the base price) - a 1200-gold overcharge invisible to the player and
uncaught by any existing test.

Fix (apps/server/src/economy/ledger.ts): purchaseItem now computes
basePrice as before, but charges the sale price only when the item is
actually on sale AND the sale price is a genuine discount below the base
price (item.onSale is true, item.salePrice is set and greater than zero and
less than basePrice) - this guards against a stale/invalid salePrice that
is not actually lower than the base price.

Fix (apps/server/src/modules/store.ts): the fire-and-forget purchase
receipt email mirrored the same bug (computed the total from the base price
instead of what was actually charged); patched with the identical
sale-price-aware calculation so the receipt matches the real charge.

Fix (apps/server/test/helpers.ts): truncateAll() now also truncates the
Order table (the purchase-receipt/order row written by purchaseItem) so
purchase tests don't leak state across runs.

Evidence:
- New regression suite apps/server/test/economy-purchase.test.ts (3 tests,
  all passing): charges the discounted salePrice when on sale; charges the
  full base price when not on sale; ignores a stale/invalid salePrice that
  isn't actually below the base price (defends the guard clause).
- Exercised live in the app during the inherited run's store purchase path
  (38-purchased.png through 40-keep-browsing.png).
- Full server suite (below) is green with this fix in place.

## apps/android/app/src/debug/ - what it is

A legitimate, Android-standard debug-only source set, not test debris:

- AndroidManifest.xml merges a networkSecurityConfig override into debug
  builds only (the manifest merger keys off the src/debug source set;
  release builds never see this file).
- res/xml/network_security_config.xml allowlists cleartext (plain HTTP)
  traffic to 10.0.2.2, localhost, and 127.0.0.1 - the emulator's
  loopback-to-host addresses. Debug builds hardcode BASE_URL to
  http://10.0.2.2:4000 (app/build.gradle.kts); without this override,
  Android 9+'s default cleartext-blocking policy would fail every request
  with a CLEARTEXT communication not permitted error before it ever reached
  the local dev server. Release builds use https://api.filipinodama.com and
  keep the platform default (cleartext disabled).

This is exactly the run-related config the task anticipated, and it is
included in the commit.

## Server test suite

pnpm test in apps/server, run against an isolated DB (dama_test_gp, created
via CREATE DATABASE dama_test_gp OWNER dama in the same Postgres container,
migrated via the suite's own pretest hook) to avoid contention with other
agent runs sharing dama_test / dama_test_hwl / dama_test_gsi at the same
time. A local-only apps/server/.env.test (gitignored, not committed) was
pointed at dama_test_gp for the run and reverted to the original dama_test
afterward.

Result: 39 test files, 437 tests, all passed. (185 seconds wall clock.)
Includes the 3 new economy-purchase.test.ts tests confirming the Daily
Deals fix.

## Screenshot total

87 PNG screenshots plus 16 UI-hierarchy XML dumps captured across this
session in docs/android-golden-paths/, on top of the 45 inherited from
prior runs. Not all of this session's screenshots are "evidence" in the
narrow sense - several are navigation/coordinate-retry artifacts from
driving the app via adb shell input tap (blind taps needed uiautomator dump
to get reliable element bounds); they're left in place rather than pruned
since the task didn't ask for curation and they don't misrepresent
anything. The evidence screenshots cited in the table above are the ones
that matter.

## Cleanup performed

- Deleted the scratch chat-verification script
  (apps/server/test/_scratch-send-chat.mjs) after use - confirmed not
  present in the final apps/server/test/ listing.
- Reverted MAINTENANCE_BANNER / MAINTENANCE_TEXT in the dev DB to their
  original values (false / empty), confirmed via /api/config/public.
- Reverted local apps/server/.env.test to point back at dama_test (its
  original, gitignored value) after the isolated-DB test run.
- Emulator (fd_golden_paths) and dev server (pnpm dev, port 4000) shut down
  at the end of the session. The AVD was reused (not created this session)
  but was agent-created in a prior run, so it was deleted per the task's
  cleanup instruction.

## Unverified / known limitations

- Path 7 and Path 11 are documented FAILs, not unverified - they were
  actively tested and confirmed absent, not skipped.
- The scripted client's own in-flow chat call (join-room's text-vs-body
  mismatch) was not fixed in golden-path-client.mjs itself, since the task
  scope was verification, not hardening the test harness, and touching it
  risked scope creep on a file explicitly flagged "reuse it." Left as a
  documented known issue above for whoever next uses the script for
  chat-flow testing.
- Replay/spectate-from-history (part of Path 7) could not be exercised at
  all since there is no entry point to reach it - Watch Live (live
  spectate) is a different, already-passing feature and was not re-tested
  here since it's out of scope for the 4 remaining paths.
