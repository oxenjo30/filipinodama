import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose.compiler)
    alias(libs.plugins.kotlin.serialization)
}

// Release signing — credentials live in a gitignored keystore.properties (never
// committed). Absent on CI / a fresh clone, in which case the release build is
// left unsigned (a debug build is unaffected). See docs for the upload key.
val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) keystorePropsFile.inputStream().use { load(it) }
}

android {
    namespace = "com.filipinodama.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.filipinodama.app"
        minSdk = 26
        targetSdk = 36
        // Play permanently reserves every uploaded versionCode (even deleted
        // ones), so each upload must bump it. 1 = uploaded then deleted; 2 =
        // first accepted internal-testing bundle; 3 = tablet width-cap build;
        // 4 = system-bar insets fix + new onboarding art; 5 = real 4xx error
        // messages + Match Detail scroll + Store Buy button + owner onboarding
        // banners + Profile overview logout; 6 = universal guild approval + Store
        // preview affordance; 7 = anonymous mode (no auto-guest; login gated to
        // rewards + Ranked; "Continue as guest" removed); 8 = smarter Hard AI +
        // offline vs-AI player cards (AI Opponent / Guest); 9 = loader always
        // fills to 100% before the board (no mid-jump); 10 = CRASH FIX — harden
        // EncryptedSharedPreferences init (was crashing launch on newer devices
        // e.g. Galaxy S25) + exclude the encrypted prefs from backup; 11 =
        // re-upload of the same crash fix (10 was already used on Play); 12 =
        // SPLASH loader now fills to 100% before Home (was jumping early) +
        // AI-difficulty/Mode-Select screens scroll (Start Match was unreachable)
        // + smaller AI cards + Login back button + Profile/Guild un-gated for
        // anonymous browsing + UNIVERSAL "Sign in required" modal replacing the
        // generic "not authenticated" error on gated actions (store/room/etc);
        // 13 = matchmaking now connects cross-platform (SocketClient polling+ws,
        // was websocket-only → mobile never authenticated → no human/AI match) +
        // tournament browsing un-gated (server attachUser; join still gated) +
        // store card redesigned (price on its own row above +/Buy, no more
        // cramped wrap) + AUDIO added (looping loading-screen music + board SFX:
        // move/capture/king/win/lose, gated by Sound/Music settings) + store
        // item preview now animates (bob + breathing glow) + joining a room now
        // prompts sign-in (realtime socket rejects anonymous); 14 = online Quick
        // Match now gated behind sign-in too (was letting a not-logged-in user
        // start a search that can never pair — the socket rejects anonymous, so
        // no human match AND no AI fallback; offline Play-vs-AI stays open) +
        // code/security-review hardening: bounded SFX audio thread pool + music
        // start/stop race fixed, plaintext-secure-store fallback now flagged +
        // kdoc corrected, RefreshAuthenticator startsWith + single-flight refresh,
        // cookie jar uses RFC-6265 Cookie.matches, Discover-Guilds join failure
        // surfaced instead of swallowed. (14 was built but NEVER uploaded — 15
        // supersedes it and contains everything in 14.) 15 = LATENCY: online
        // moves now apply OPTIMISTICALLY (your piece moves the instant you tap,
        // reconciled/rolled-back by the server's authoritative echo) so a laggy
        // connection no longer freezes the board waiting for the round-trip;
        // "Sending move…" hint while a move is in flight. (Pairs with a server-
        // side connectionStateRecovery change that deploys with the API.) 16 =
        // matchmaking no longer strands a player whose socket reconnected before
        // pairing (server resolves the CURRENT socket by userId + signals a
        // dropped player instead of silent-dropping — pairs with a server change)
        // + mobile no longer hangs on "Loading match…" for an abandoned/gone
        // match (exits on ENDED + an 8s resync timeout) + Home re-fetches the
        // active-match card on resume so a stale "Continue" card auto-clears +
        // Discover-Guilds join button now reads "Join" → "Request Sent ✓" with
        // real feedback (was silent); 17 = SESSION FIX — the app no longer logs
        // you out after close+reopen: the ~15-min access token expires while
        // closed and GET /api/auth/me returns 200 {user:null} (not 401) so the
        // 401-only refresh never fired and the 30-day refresh token went unused;
        // refreshMe() now proactively POSTs /api/auth/refresh + retries /me once
        // before concluding you're signed out.
        // 18 = UI batch (emote picker, guild preview, resign dialog, store cards,
        // sign-in CTA) — already on main. 19 = FINAL-REVIEW DEFECTS BATCH — DM send
        // no longer loses the draft or swallows a failure; Unlock Royal Pass gated
        // to sign-in like Claim + surfaces purchase failures; Private Room join no
        // longer hangs forever on a socket-connect failure (RoomError.ConnectFailed
        // + 8s timeout); DM/Guild/in-match chat composers clear the soft keyboard
        // (imePadding); guest predicate fixed to !isGuest in Daily/Quests/Season;
        // OnlineMatchScreen result CTAs clear the gesture bar; Avatar Picker sheet
        // is bottom-anchored; Report on a public profile prompts sign-in for an
        // anonymous user instead of a raw error.
        // 20 = UI & FUNCTIONALITY AUDIT FIXES — the dead Royal Pass premium "Claim"
        // button now works (one claim grants both free + premium tracks) and season
        // tier/end claims surface failures; season-end reward claim added (parity
        // with web "Claim All Rewards"); app-wide Snackbar surfaces previously-
        // swallowed social/guild/quest failures and a load ERROR is now distinct
        // from a genuine EMPTY (Friends / Guild Hall / Discover Guilds show a retry
        // state instead of the "nothing here" copy); Edit-Profile / Contact-Support /
        // Delete-Account / guild-preview dialogs scroll so their CTAs stay reachable;
        // the Messages inbox is reachable from Home and My Tickets (with staff
        // replies) is viewable from Settings; matchmaking gains the Red/Either/Blue
        // preferred-side picker and reports gain the Hate-Speech reason (web parity);
        // key icon controls get 48dp touch targets + screen-reader labels. Diamonds
        // stay dark (no external checkout wired). 21 = SYSTEMIC MOBILE-LAYOUT
        // pass: a shared screenInsets() convention applied to ~30 pushed screens
        // (their headers no longer tuck under the status bar and their bottom CTAs
        // — Leave, Place Order, Claim, Delete Account — clear the gesture bar
        // instead of jamming against it); Offline Practice + Replay Viewer are now
        // scrollable so their controls are reachable on short phones (were cut
        // off); the Store item card is left-aligned to match the mobile mockup
        // (the price no longer hugs the left under centered content); the Private
        // Room lobby's players card is rebuilt as the mockup's 3-column VS grid.
        // 22 = COMBINED build: the systemic mobile-layout pass (above) PLUS an
        // in-app "update available" nudge — a soft, dismissible dialog
        // (server-driven via the ANDROID_LATEST_VERSION config key vs
        // BuildConfig.VERSION_CODE) that opens the Play listing; dormant until an
        // admin sets that key (ships off by default, "0"). Owner directive: from
        // here on the versionName digits track the versionCode for easy counting —
        // versionCode 22 → versionName "0.1.22" (ending the historical off-by-one).
        // 21 was set on a branch but superseded by this 22 before any upload.
        // 23 = AI Difficulty cards match the mobile mockup: each difficulty card is
        // now a horizontal row (56dp emblem left + left-aligned title/desc/pips)
        // instead of a centered vertical column — the last two mockup-fidelity gaps
        // found by the audit (the other, Private Room's "Lock the room" toggle,
        // needs a server field and ships separately).
        // 24 = Private Room "Lock the room" toggle — the LAST mockup-fidelity gap.
        // The host can lock a room so the server turns away new joiners by code
        // (existing members unaffected); lock icon + label + switch in the room-code
        // card, dynamic subtitle, and a "that room is locked" message for a turned-
        // away joiner. Rooms are Redis-only so no DB migration (server adds
        // Room.locked + a room:lock event + a room:join gate).
        // 25 = UI polish batch 1: Home top bar trimmed to wallet + bell (the search
        // and never-in-mockup messages icons removed); Profile gains red "needs
        // action" count bubbles — a Messages quick-link (unread DMs) + the Friends
        // pill fixed to show pending friend-REQUESTS (it wrongly showed the DM
        // count); the Notifications unread card is opaque so the red swipe-to-delete
        // tray no longer bleeds through (it looked like a solid red card); and every
        // dialog adopts the shared royal panel (RoyalDialog.kt: purple gradient +
        // gold border) so no modal looks flat/off-brand.
        // 26 = Pull-to-refresh across 18 data screens (Home, Store, Wallet,
        // Inventory/Orders, Quests, Season, Tournaments, Daily Rewards,
        // Leaderboard, Live Matches, Friends, Discover Guilds, Guild Hall, DM
        // inbox, Notifications, My Tickets, Achievements, Profile). Pulling down
        // RE-FETCHES that screen's real data from the server (the same repository
        // call its entry LaunchedEffect runs) so the user gets late/updated data
        // — not a cosmetic spinner. Shared PullRefreshContainer (gold indicator).
        // 27 = Private Room 1:1 mockup-fidelity rebuild of the host lobby
        // (handoffv3 Mobile.dc.html PRIVATE ROOM section). "Copy Spectate Link"
        // is now the small rounded PILL from the mockup (was an oversized full-
        // width purple button) with a "▶ Spectator View" pill beside it; the
        // Spectators card gains its header subtitle + on/off switch + spectator
        // chips (avatar+name+✕); Match Settings ("Game Mode" / "Time Control" /
        // "Move Timer" chip rows) is merged INTO the players card under the VS
        // grid; the room-code row makes "Copy Code" the wide primary with
        // compact "Link"/"Invite" secondaries; and the card order matches the
        // mockup (Code → Players+Settings → Spectators → Invite → Chat). Game
        // Mode / Time Control / spectator-toggle are host-local visual controls
        // (no server field — same honest boundary as the web room page); only
        // Move Timer writes the authoritative settings.moveTimerSec. (27 was
        // uploaded to Play, so it is permanently reserved — 28 supersedes it.)
        // 28 = opening Settings mid-match then closing it no longer replays the
        // ~2s loading screen — MatchEntryGate's "already loaded" flag is now
        // rememberSaveable(key) so it survives the match composable leaving/re-
        // entering composition while Settings sits on top (a genuinely new match
        // still gets a fresh loader via a new back-stack-entry key). Also in 28:
        // the Notifications swipe-to-delete red tray is clipped to the card's
        // 16dp rounded shape, so the red no longer pokes out at the card corners
        // when the row is closed (owner-reported "red corners").
        // 29 = TWO shipped batches in one release. Ship 1: REAL-TIME notification
        // badge — the red "action needed" bubble appears the instant a
        // notification arrives (e.g. a friend request) with no refresh (server
        // emits notif:new to presence:<userId>, mobile/web subscribe); PULL-TO-
        // REFRESH fixed on loading/empty/error states (they weren't scroll
        // containers so the gesture never fired); the Home bell badge no longer
        // clips at the screen edge; the Edit-Avatar "Save Changes" button is
        // pinned + clears the gesture bar. Ship 2: Friends screen brought 1:1 to
        // the mockup — inline tier chip, unread-DM count bubble on the 💬 button,
        // Requests rows use compact ✓/✕ icon buttons, the Requests summary tile
        // is lavender, the Offline header drops its count; a DISCOVERABLE "⋯ →
        // Remove friend" menu (unfriend was swipe-only); 3-state presence dot
        // (online green / in-a-match amber / offline grey) driven by a real
        // rt:userMatch server flag; and the Profile "Messages" pill was removed
        // (mockup has no inbox — chat is per-person) with its unread signal
        // folded into the Friends pill's red bubble (friend requests + unread DMs).
        // 30 = one-tap EMOJI PICKER in guild chat + friend/DM chat composers: a
        // small 😊 button opens a popup grid of common chat emojis that insert
        // into the message draft (the text fields already accept typed emoji;
        // this adds a quick inserter without switching the keyboard).
        // 31 = Store page no longer has an "invisible bar" / dead gap between its
        // content and the bottom tab bar. The Store root was calling
        // .screenInsets() (status + nav-bar padding), but as a TAB screen the app
        // root already applies the top inset and the BottomTabBar applies the
        // bottom nav-bar inset — so Store was double-applying the bottom inset,
        // pushing content up and leaving the gap. Removed it to match Home and the
        // other tab screens. (No app change was needed for the "update available"
        // nudge — that feature is correct; it just needs the server config
        // ANDROID_LATEST_VERSION set to the latest live versionCode.)
        // 32 = COSMETICS batch. (1) Default profile FRAME for every player: a
        // free "filigree" house frame is granted+equipped at signup (server) and
        // backfilled to existing players, and frames now show on the surfaces
        // that dropped them (DM, private-room player cards, guild chat) — frameId
        // added to those DTOs. (2) Board + piece SKINS now actually RENDER in the
        // app: BoardView was hardcoded and never read the equipped skin; it now
        // varies the board tint + piece colours by the equipped board/skin
        // (BoardCosmetics.kt ports the web's procedural colour tables; your own
        // skin paints your colour in online play). (3) Chat message bubbles (DM +
        // guild) gained a border so they read against the dark background. (4)
        // Tapping an avatar in the DM header or a guild-chat message opens that
        // player's profile.
        // 33 = cosmetics + inventory corrections. The DEFAULT profile frame is now
        // the ROUND "laurel" (the v32 "filigree" default was a SQUARE border —
        // wrong for round avatars); the seed re-points frameless + old-square
        // users to laurel and hides it from the store (it's free now). The EMOTE
        // category is removed from the Store + Inventory (the in-match emote wheel
        // stays, on its own fixed set); no emoji glyphs remain on the Store or
        // Inventory pages (replaced with Material icons). The Inventory grid is
        // reworked to a denser 3-column tap-to-equip tile layout (the old cards
        // were oversized on phones). Server also auto-syncs ANDROID_LATEST_VERSION
        // from the live Play production track (update nudge, no manual admin step).
        // 47 = PLAY POLICY COMPLIANCE (deadline Aug 31 2026): (1) target Android 16
        // — compileSdk/targetSdk 35 → 36 (needs AGP 8.13 + Gradle 8.13, see the
        // version catalog + wrapper). (2) Play Billing 7.1.1 → 8.0.0. No source
        // change was needed for billing: BillingRepository already used the 8.0
        // API surface (PendingPurchasesParams builder, QueryPurchasesParams, the
        // KTX queryProductDetails suspend fn) and none of 8.0's removed methods.
        // Diamond top-up stays dark (DIAMOND_TOPUP_ENABLED off); this only clears
        // the two "app updates will be rejected" warnings on the Play console.
        // 48 = OFFLINE-BANNER FLASH FIX: the "You're offline — reconnecting…"
        // strip no longer flashes on app open. Root cause was Android's own
        // network-validation lag — ConnectivityObserver requires
        // NET_CAPABILITY_VALIDATED (correct: guards against captive portals),
        // but on a cold open Android hasn't finished its captive-portal probe,
        // so it briefly reports "not validated" on a perfectly good connection.
        // Fix: an asymmetric debounce (ConnectivityObserver.observeOnline /
        // Flow.debounceOffline) that only shows the banner after ~2.5s of
        // continuous offline, while clearing INSTANTLY on reconnect — the
        // on-open blip is swallowed, a real sustained outage still surfaces.
        // 49 = TWO LOGIN/MATCH UX FIXES. (1) Login keyboard no longer stays up
        // after the password vault autofills + Enter: the view-backed
        // AuthAutofillField had no imeOptions/editor-action, so Enter was a
        // no-op and the soft keyboard never hid (covering the bottom nav). Now
        // email → IME NEXT (advance to password), password → IME DONE (hide
        // keyboard + drop focus + submit); imeOptions is re-applied after the
        // password-visibility inputType toggle (setInputType resets it).
        // Applied to Login + Create Account. (2) RETURN-TO-MATCH: leaving a live
        // online match no longer strands you. A global "▶ Return to match" bar
        // (ActiveMatchStore + ReturnToMatchBanner, backed by GET
        // /api/matches/active) now shows on EVERY screen while a match is live
        // (was Home-card-only), and back/chevron on the match screen shows a
        // "Leave the match?" confirm (the game keeps running server-side, so
        // leaving is non-destructive — you can jump back from the bar).
        // 50 = TESTER-REPORT UX FIXES. (1) A11y contrast: secondary text on the
        // tester-named surfaces (Achievements subtext, the Home "Master the
        // Board" labels/quest counters, Mode Select mode descriptions) was
        // hardcoded to sub-WCAG-AA hex (#9A8BBF/#8B7CAE/#7C6DA3 ≈ 4:1); routed to
        // the AA-corrected Ink2 token (~5:1). (2) Store "can't afford" state: the
        // Buy button was always enabled regardless of balance (insufficient funds
        // only failed after tapping) — now, when price > your balance in that
        // item's currency, the price dims, a "Not enough gold/gems" hint shows,
        // and Buy is dimmed + disabled (+ add-to-cart stays enabled). Applied to
        // the store grid card and the Daily Deals row. Owned/Equipped green
        // states were already present and unchanged.
        // 51 = PLAY TAB REBUILT AS A BATTLE SCREEN (owner-approved redesign,
        // a deliberate deviation from the handoffv3 ModeSelect spec). The Play
        // tab no longer lists five equal-weight mode cards: it opens a Battle
        // screen whose identity is your rank tier, with Game Modes moved into a
        // drawer behind the trophy button. Picking a mode there ARMS the BATTLE
        // button, so the primary CTA never has to guess what it does — and the
        // Ranked account gate fires on the ticket, where it can be explained,
        // instead of on the biggest button on screen. AI difficulty uses the
        // owner's chosen "dock loadout" model: an Easy/Normal/Hard strip appears
        // above the dock only while AI is armed, and the choice now PERSISTS
        // (AiDifficultyScreen used a plain `remember`, so it reset to Normal on
        // every visit and on rotation). Tournaments is NOT a mode ticket — it is
        // its own page on the new side rail, alongside Quests and Daily Reward.
        // The dock's left slot opens a Loadout drawer (board theme + piece skin)
        // which REPLACES the Inventory screen; Inventory's route and all three
        // entry points are gone, with Settings and the post-purchase overlay
        // handing off into the drawer, and avatars/frames still equipped from
        // the profile's picker. Tickets now show your real per-mode record via
        // the new GET /api/matches/records, and offline AI games are recorded
        // (POST /api/matches/local accepts mode AI + difficulty) so "wins on
        // Hard" is real rather than invented. Also fixes diff_easy/normal/hard,
        // which shipped as opaque RGB on #101010 and rendered as black squares.
        // 52 = REALTIME + RELIABILITY batch. (1) SOCKET IDENTITY: SocketClient
        // handed back a NEW Socket whenever the cached one wasn't connected() —
        // but socket.io reconnects itself, so !connected() means "mid-backoff",
        // not "dead". Consumers cache the instance and guarded their listener
        // registration with a process-lifetime boolean, so the replacement got
        // ZERO listeners for the rest of the process: a ten-second network blip
        // followed by Quick Match hung on "Finding opponent…" forever while the
        // server paired you into a match you never entered — a disconnect
        // forfeit, losing trophies in RANKED. connect() now returns any existing
        // instance (only disconnect() replaces it) and every repository keys its
        // wiring on the socket INSTANCE rather than a sticky flag. (2) CROSS-
        // MATCH GUARD: match:moved / match:ended applied to whatever match was on
        // screen, because leaving a match screen never leaves the server-side
        // match room — a previous game's moves silently swapped the board under
        // you, and a stale ending showed a result card (with the win/lose text
        // evaluated against the wrong colour) for a match you weren't in.
        // match:chat already had the guard; the two handlers that mutate the
        // board did not. (3) LOGOUT: clearing cookies never ended the realtime
        // session — socket.io authenticates once, at handshake — so on a shared
        // device the next user drove the previous user's still-authenticated
        // socket, emitting matchmaking/moves/chat under their identity, with
        // their cached DMs and notifications visible. Sign-out now disconnects
        // the socket and resets every cached repository. (4) FROZEN BOARD: the
        // abandoned-match sweeper emits `state: null`, which a Kotlin default
        // doesn't cover, so the whole payload failed to decode and the board sat
        // on "Opponent's move…" with no result card and no timeout. (5) OFFLINE
        // BANNER: "You're offline — reconnecting…" lingered long after the
        // connection returned, because ConnectivityObserver only reports online
        // once Android sets NET_CAPABILITY_VALIDATED and that probe lags a real
        // reconnect by seconds. This is the MIRROR IMAGE of the v48 fix (a false
        // offline on open, same lag) and is NOT fixable by a debounce, since the
        // delay is in the OS's signal rather than ours; the banner now clears on
        // proof of life — our own server answering an HTTP request or a socket
        // CONNECT. Also in 52: the Play dock loadout slot gets its real icon.
        versionCode = 52
        versionName = "0.1.52"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // Google Sign-In (Credential Manager) server client ID — OPTIONAL local-dev
        // override only. Per the owner's shared-credentials directive (web and
        // mobile share API credentials, no mobile-specific keys/config), the app
        // resolves this from the SERVER at runtime via GET /api/auth/providers'
        // `googleClientId` field (see GoogleSignInHelper.resolveClientId) — the
        // same WEB OAuth client ID the server's GOOGLE_CLIENT_ID env var already
        // verifies token audience against. This BuildConfig field is used ONLY as
        // a fallback when the server value is unavailable (e.g. pointing a debug
        // build at a different client ID than whatever a shared dev server
        // currently returns); it is never required for normal operation. Supply
        // it via a Gradle property (gradle.properties, not checked in) or an
        // environment variable if you need the override:
        //   GOOGLE_SERVER_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
        // See apps/android/README.md for the Google Cloud Console app-registration
        // step (Android OAuth client + debug SHA-1) Google sign-in still depends on.
        val googleServerClientId = (project.findProperty("GOOGLE_SERVER_CLIENT_ID") as String?)
            ?: System.getenv("GOOGLE_SERVER_CLIENT_ID")
            ?: ""
        buildConfigField("String", "GOOGLE_SERVER_CLIENT_ID", "\"$googleServerClientId\"")
    }

    signingConfigs {
        // Only define the release signing config when the keystore.properties is
        // present (i.e. on the owner's machine). On CI / fresh clones it's absent
        // and the release build stays unsigned rather than failing the build.
        if (keystorePropsFile.exists()) {
            create("release") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            // Emulator-to-host-localhost alias; see README for physical-device overrides.
            buildConfigField("String", "BASE_URL", "\"http://10.0.2.2:4000\"")
            // Web origin for shareable room links (rooms.get scoped to the real
            // web dev server so a debug-build share link is still openable).
            buildConfigField("String", "WEB_ORIGIN", "\"http://10.0.2.2:5173\"")
        }
        release {
            buildConfigField("String", "BASE_URL", "\"https://api.filipinodama.com\"")
            // Real production web origin (apps/web) — used to build cross-platform
            // room share links (https://filipinodama.com/rooms?code=X), matching
            // apps/web/src/features/rooms/PrivateRoomPage.tsx's window.location.origin.
            buildConfigField("String", "WEB_ORIGIN", "\"https://filipinodama.com\"")
            // R8 ON (audit follow-up). The previous `false` was justified as
            // "enabling it needs keep rules … or the release crashes", but
            // proguard-rules.pro was an EMPTY placeholder — so that had never
            // actually been tried. Most dependencies ship their own consumer
            // rules; the real gaps (socket.io's reflective plumbing, and our
            // GENERATED kotlinx.serialization members) are now covered
            // explicitly. See that file's header for the per-dependency audit.
            //
            // What this buys: the shipped dex no longer carries 438 readable
            // first-party class names (AuthRepository, SecureStore, ApiClient …),
            // so reading and repackaging a modified client stops being a
            // copy-paste job — which matters wherever the server trusts a
            // client-reported value. It also produces mapping.txt, without which
            // production crash reports were un-symbolicated and untriageable.
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            // NOTE on the remaining Play upload warning (advisory-only, never
            // blocks an upload):
            //  - "no native debug symbols" — the app's ONLY native lib is the
            //     prebuilt, already-stripped androidx.graphics.path .so (Compose
            //     path rendering). It carries no symbols to bundle, so
            //     ndk { debugSymbolLevel } has nothing to attach and the warning
            //     persists regardless — left off to keep this config minimal. If
            //     first-party native code is ever added, revisit debugSymbolLevel.
            // Sign with the upload key when keystore.properties is present.
            if (keystorePropsFile.exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.activity.compose)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.androidx.material.icons.extended)
    implementation(libs.androidx.navigation.compose)
    debugImplementation(libs.androidx.ui.tooling)

    implementation(libs.androidx.security.crypto)

    implementation(libs.kotlinx.serialization.json)

    implementation(libs.retrofit.core)
    implementation(libs.okhttp.core)
    implementation(libs.okhttp.logging.interceptor)

    // socket.io drags in org.json:json:20090211 — a 2009 build that PREDATES the
    // fixes for CVE-2022-45688 and CVE-2023-5072, and it really was packaged
    // into the shipped APK (confirmed in the dex string table, not just the
    // POM). Runtime impact is near-zero, because Android's bootclasspath
    // org.json shadows the app-dex copy via parent-first delegation — so the
    // vulnerable code is dead. The cost is real anyway: every SCA scanner, Play
    // SDK Index check and security questionnaire flags two CVEs in the bundle,
    // for a library that can never execute. Exclude it.
    implementation(libs.socketio.client) {
        exclude(group = "org.json", module = "json")
    }

    implementation(libs.coil.compose)

    // Google Play Billing — real-money diamond top-up (dark behind
    // DIAMOND_TOPUP_ENABLED; see data/billing/BillingRepository.kt).
    implementation(libs.billing.ktx)

    // Sign-in with Google (Credential Manager) — native auth, mirrors the web's
    // Google OAuth. serverClientId is the WEB client ID (see GOOGLE_SERVER_CLIENT_ID
    // above); credentials-play-services-auth backs GetGoogleIdOption on-device.
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play.services.auth)
    implementation(libs.googleid)

    // Test-only — never shipped in the app APK. MockWebServer pre-approved
    // for exercising RefreshAuthenticator / AuthApi against a real (fake)
    // HTTP server rather than hand-rolled OkHttp mocks.
    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.okhttp.mockwebserver)
}
