# Lessons

## 2026-07-17 - "compileDebugKotlin clean" missed errors that only compileReleaseKotlin caught

- Mistake: Verified Android changes with `:app:compileDebugKotlin` (exit 0) and called them done. The RELEASE bundle build then failed at `:app:compileReleaseKotlin` on a missing import (`navigationBarsPadding`) and a duplicate import (`Arrangement`) — errors the debug compile did NOT surface. Root: (a) debug compiles incrementally and a file carried in from another worktree wasn't recompiled from clean, so its missing import went unseen; (b) release-variant compile settings flagged the duplicate import as an error where debug didn't. The green debug compile was falsely reassuring for exactly the files that were broken.
- Cause: Debug and release are different Kotlin compilation variants with different caching and strictness. An incremental debug compile can pass over a file that a clean release compile rejects. Verifying only debug is not sufficient before a release AAB.
- Rule:
  1. Before building a release AAB, run `:app:compileReleaseKotlin` (the same variant the bundle compiles) — not just `compileDebugKotlin`. It's the true gate.
  2. When you COPY a file from another worktree/branch into this one, its imports are only valid if that file's deps also exist here — recompile it specifically (or clean-compile), don't trust an incremental debug pass.
  3. Watch for duplicate imports when multiple agents edit the same file's import block — one adds an import another already added. The release compiler treats an ambiguous/duplicate import as an error.

## 2026-07-17 - Shipped pull-to-refresh that silently did nothing on loading/empty/error states

- Mistake: Wired `PullToRefreshBox` (material3 1.3.0) on ~18 screens by wrapping each screen's `when {}` content. It compiled and worked ON A POPULATED LIST, so I called it done — but on the LOADING, ERROR, and EMPTY branches (a bare `Box`, or a `Column` with `fillMaxSize()` but NO `verticalScroll`) the pull gesture did nothing: no spinner, no refetch. The empty state is the FIRST thing a user sees on a fresh screen, so it read as "pull-to-refresh is broken."
- Cause: `PullToRefreshBox` detects the pull PURELY through nested-scroll events from its content. Only a scroll container (`LazyColumn`, or `Modifier.verticalScroll`) emits those. A `Box`/non-scrolling `Column` emits ZERO, so the box never sees the drag. `fillMaxSize()` is irrelevant — SCROLLABILITY is the requirement. I verified the happy path and never tested the empty/loading path on a device.
- Rule:
  1. For `PullToRefreshBox`, EVERY content branch (including loading/error/EMPTY) must be a scroll container. Make short/empty/spinner branches `Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.Center, ...)`. Leave `LazyColumn`/existing-`verticalScroll` branches alone (never double-wrap a LazyColumn in verticalScroll — it crashes with "infinity maximum height").
  2. Test an interaction on its EMPTY and LOADING states, not just the populated one — those are the states a new user hits first.
  3. "Compiles + works in the demo case" is not "done" for a gesture/interaction feature — the failure here was invisible to a compile and to a data-filled screen.

## 2026-07-17 - A rounded card over a square background leaks the background at the corners

- Mistake: The Notifications swipe-to-delete red tray sat behind a card with `RoundedCornerShape(16.dp)`, but the tray itself was a plain square-cornered `Box`. When the row was closed, the card's rounded corners couldn't cover the tray's square corners, so red showed at all four corners + the side edges (owner-reported "red corners"). This was the SECOND red-bleed bug in the same component — the first was red glowing *through* a semi-transparent card (fixed by making the card opaque); this one is red poking out *around* the rounded card.
- Cause: When one element is layered on top of another, both must share the same clip shape. Fixing the front element's transparency doesn't fix a shape mismatch — a fully-opaque rounded card still exposes a square backer at the corners.
- Rule:
  1. In a swipe-reveal / layered-background pattern, clip the BACKGROUND layer to the SAME shape (and radius) as the foreground card, not just the card. `Modifier.clip(RoundedCornerShape(N.dp))` on the tray.
  2. When re-touching a component that had a "red/color bleed" fix before, check for BOTH failure modes: alpha bleed-through AND corner/edge exposure from a shape mismatch. They look similar to a user but have different fixes.

## 2026-07-17 - Delivered an AAB before all committed fixes were in it (versionCode then burned by upload)

- Mistake: Built + delivered the v27 AAB, THEN committed a further fix (loader replay). The user submitted the delivered v27 to Play — which didn't contain the later fix. Play permanently reserves an uploaded versionCode, so the fix had to ship as v28.
- Cause: Building the release bundle before the fix set was final. The AAB is a snapshot at build time; any commit after the build is NOT in the delivered file, even though it's on the branch.
- Rule:
  1. Build the release AAB LAST, only after every intended fix for that version is committed AND compiled. If a new fix lands after the AAB is built, the AAB is stale — rebuild before delivering, and say so.
  2. When delivering an AAB, state the exact commit it was built from (or the last fix it includes) so the owner knows what's in the file they're about to upload.
  3. Once a versionCode is uploaded to Play it is burned forever — the next build must bump. Never reuse a submitted code even if the release was never promoted.

## 2026-07-17 - Patched a cached balance with a server response's 0-sentinel, wiping the real value

- Mistake: `EconomyRepository.claimSeasonEnd()` called `patchBalances(gold = data.goldBalance, diamonds = data.diamondBalance)`. The server (`seasons.ts` end-claim) only runs the ledger for a currency it actually GRANTED; a currency with a 0 reward comes back as `*Balance = 0` — a SENTINEL, not the user's real balance. `patchBalances` treats `null` as "leave unchanged" but writes a real `0` through, so a player ranked outside the top-100 (diamonds reward = 0) had their cached diamonds overwritten to 0 on claim.
- Cause: Assumed every `*Balance` field in a claim/purchase response is authoritative. It's only authoritative for the currency that was actually credited; unset ones default to 0. The sibling paths already knew this — `claimQuest` deliberately passes `diamonds = null` when no diamonds are granted — I didn't follow that established convention.
- Rule:
  1. When mirroring a server balance into the client cache, patch a currency ONLY when its reward/delta for THIS action was `> 0`. Gate on the reward amount (`if ((reward?.diamonds ?: 0) > 0) data.diamondBalance else null`), mirroring the server's own `if (reward.x > 0)` ledger guard.
  2. A non-nullable numeric DTO field that defaults to 0 is a trap for "leave unchanged" logic — 0 is a legal balance, so `?:`/elvis can't distinguish "unset" from "genuinely zero." Prefer nullable response fields, or gate on a separate "was it granted" signal.
  3. Follow the codebase's existing convention for the same operation class (here: `claimQuest`'s `diamonds = null`) rather than inventing a parallel one.

## 2026-07-12 - Commit landed on the wrong branch (concurrent session switched HEAD mid-task)

- Mistake: Created + checked out `feat/monetization-dark`, worked for ~1h, then committed — and the commit landed on `feat/native-android-scaffold` because a concurrent session had switched the repo's checked-out branch (and added its own commit) in the meantime.
- Cause: This repo is worked by multiple sessions on ONE shared checkout. `git branch --show-current` verified at task START is stale by commit time; nothing re-verifies HEAD at the moment of `git commit`.
- Rule:
  1. Re-verify `git branch --show-current` in the SAME command chain as the commit (`git branch --show-current; git commit …` and check the `[branch hash]` line git prints), not minutes earlier.
  2. If the commit lands on the wrong branch and the intended branch points at the commit's parent: fix non-destructively with `git branch -f <intended> <commit>` (pure fast-forward) + `git checkout <intended>` + `git branch -f <wrong-branch> <commit>^` (restore its exact prior tip). Never rebase/cherry-pick — that duplicates the commit and diverges from the shared working tree.
  3. For real isolation from concurrent sessions, use a `git worktree` (existing 2026-07-10 lesson) — a shared checkout's HEAD is never yours alone.

## 2026-07-11 - Test passed locally, failed in CI (hidden dependency on seeded DB data)

- Mistake: `emote-defaults.test.ts` asserted `grantDefaults` equips free emotes, but it depended on free-emote StoreItem rows EXISTING in the DB. Passed locally (my DB had store items from prior manual seeds); failed in CI with `expected 0 to be greater than 0`.
- Cause: CI's server test job runs `prisma migrate deploy` only — NO `db seed` (`ci.yml`; `package.json` pretest = migrate deploy). So the CI test DB has schema but zero store items. `truncateAll()` doesn't touch StoreItem, but there were none to begin with. A test must not assume seed data exists.
- Rule:
  1. Server tests must SEED THEIR OWN fixtures in Arrange (use the `t_item_`/`t_user_` prefix convention + clean up in afterEach) — never assume `db seed` ran. CI is migrate-only.
  2. "Passes locally, fails in CI" almost always = a hidden dependency on local DB/env state the fresh CI env lacks. Reproduce by reasoning about what CI provides (migrate, no seed), not by re-running locally where the state is polluted.
  3. When verifying a server fix in a FRESH git worktree, you must `pnpm --filter @dama/shared build && @dama/game-engine build && prisma generate` first — else typecheck floods with false `Cannot find module '@dama/shared'` / stale-Prisma-client errors that are NOT real (CI does these build steps). Don't chase them.

## 2026-07-10 - `git add <file>` swept pre-existing uncommitted changes into a task commit

- Mistake: An implementer subagent ran `git add apps/web/src/features/layout/AppLayout.tsx` for a 2-line Footer change. That file already had the user's uncommitted TopUpModal/notifications work in the working tree, so the commit bundled unrelated changes. Repo-wide, dozens of files were already `M` in the working tree.
- Cause: Committing by whole-file path when the working tree has pre-existing uncommitted edits to that same file. `git commit -- <path>` also re-reads the working-tree version, defeating a staged index.
- Rule:
  1. Before committing in this repo, assume the working tree is dirty with the user's in-progress work. Check `git status --short` for the target file.
  2. To commit ONLY your change to a file that has other uncommitted edits, stage the exact intended content (e.g. build the desired blob and `git update-index --cacheinfo`, or `git add -p`), then `git commit` with NO pathspec (a pathspec re-reads the working tree).
  3. For branch merges/deploys while the tree is dirty, use an isolated `git worktree` so the user's uncommitted work is never touched.

## 2026-07-10 - Trophies "not awarded" was by-design (ranked vs bots), not a bug

- Mistake: Nearly treated "0 trophies despite ranked matches" as a settlement bug before checking data.
- Cause: On a low-population game, ranked queues bot-fill after 7-20s, and `isRanked = mode==="RANKED" && botColor==null` deliberately withholds trophies vs bots (anti-farming). All 21 prod ranked matches were human-vs-bot; 0 were human-vs-human.
- Rule:
  1. For "X isn't happening" on prod, QUERY the real DB (Railway `DATABASE_PUBLIC_URL` via the authenticated `railway` CLI) before hypothesising a code bug. The internal `postgres.railway.internal` host is unreachable locally — use the public proxy URL.
  2. Trophy rule (post-fix): human-vs-human ranked = +25/-18; bot-filled ranked = human seat +10 win / 0 loss, bot seat never moves (`rankedBotTrophyWin/Loss` in constants.ts). Backfills go through `applyLedger` with `refType:"match",refId:matchId` — the ledger unique index makes it idempotent.

## 2026-07-10 - Admin pages didn't follow the approved handoff design

- Mistake: Several admin console pages (Store/Economy, Analytics, Support, Tournaments, Matches, etc.) were built without matching the approved `handoffv2/FilipinoDama Admin.dc.html` mockup. They invented their own layout/CSS instead of reproducing the approved `secXxx` design.
- Cause: (1) The `handoffv2/` mockup is gitignored, so build subagents working in isolated worktrees literally could not read it — they matched *spec prose descriptions* of each section instead of the actual approved pixels. (2) The mockup's design-system classes (`fd-kpi`, `arow`, `abtn`, `fd-2col`) were never established in `apps/admin/src/index.css`, so every page built its own look from a different vocabulary (`panel`/`field`/`btn`).
- Rule:
  1. The approved design is `handoffv2/FilipinoDama Admin.dc.html` (on disk, gitignored). ALWAYS read the relevant `secXxx` section from it before building/editing an admin page — do NOT rely on prose descriptions.
  2. When a build runs in an isolated worktree, EXTRACT the approved section markup + CSS into a file the subagent can read (worktrees don't have gitignored files).
  3. Establish the mockup's shared design-system classes in `index.css` ONCE, then pages reuse them — don't reinvent per page.
  4. Legitimate deviations that MUST stay (not gaps): gold-only economy (no Diamonds currency option — real-money is legally disabled), no fabricated data (funnel/retention/cohort panels need an event pipeline we lack → repurpose to real metrics), deferred-V1.5 features. Preserve these while matching the visual chrome.

## 2026-07-10 - Did not read the project CLAUDE.md at session start

- Mistake: Ran an entire multi-feature session (Damath variants, rooms, spectators, sounds, home card, blog redesign) using only the in-memory TodoWrite tool, without reading the repo-root `CLAUDE.md` or maintaining the required file-based `tasks/todo.md` / `tasks/lessons.md`. User had to point me to it.
- Cause: The global (~/.claude) CLAUDE.md was in context, so I assumed I had the operating rules; I never checked for a project-level CLAUDE.md, which this repo has and which mandates file-based planning + a lessons loop.
- Rule:
  1. At the start of any meaningful task, `find . -maxdepth 3 -iname CLAUDE.md -o -iname AGENTS.md` and READ the repo-root one before editing. The global CLAUDE.md does not substitute for a project one.
  2. Maintain `tasks/todo.md` as the live plan file for meaningful work (not just the in-memory TodoWrite). If it already holds another session's task, do NOT overwrite — coordinate or use a clearly separate section.
  3. After every user correction / failure, append a dated lesson here (append, never overwrite — it is shared across sessions).
  4. `tasks/` is committed (not gitignored) and shared — treat it as a shared artifact; append, keep entries short and actionable.

## 2026-07-10 - Parallel subagents in ONE worktree caused a git staging race

- Mistake: Ran 4 page-re-skin agents in parallel, all in the same worktree/index. A `git add <onefile> && git commit` on agent A swept in agent B's concurrently-staged file (git commits the whole index, not just what one agent `git add`ed). One commit had to be reverted + re-committed.
- Cause: Multiple agents sharing one git index have no isolation — the index is global state. `git add X` doesn't scope a commit to X if Y is already staged by another process.
- Rule: For PARALLEL subagents that each commit, give each its OWN git worktree (isolation), OR run them sequentially in one worktree, OR have agents commit with `git commit -o <file>` / explicit pathspec (`git commit <file>`) so only that path is committed regardless of index state. When agents only edit DISJOINT files, a pathspec-scoped commit avoids the race. (Independent NEW files rarely collide; shared/existing files do.)

## 2026-07-10 - Parallel agents on ONE working tree: `git stash` and silent reverts clobber each other

- Mistake: Ran ~9 client-page fidelity agents in parallel in the SAME working tree. Two compounding hazards: (1) several agents ran a diagnostic `git stash`/`pop` — but `git stash` snapshots ALL modified files (including OTHER agents' uncommitted WIP), so a pop collided with concurrent edits; one agent's stash captured 14 files spanning every other agent's in-flight work. (2) Agents' on-disk edits were silently reverted mid-task (file matched HEAD, `git commit` said "nothing to commit") because another agent's checkout/reset touched the shared tree.
- Cause: A single working tree + single git index/stash-stack is global mutable state shared by every agent. `git stash` is repo-global (not per-file), and any agent's `git checkout`/reset affects files another agent is mid-edit on. Pathspec-scoped COMMITS still worked (no wrong file landed in any commit — that rule held), but the WORKING TREE churned badly and agents had to detect the revert (via `grep` against disk, not tool-success messages) and re-apply.
- Rule:
  1. For parallel file-editing agents, give each its OWN git worktree (`git worktree add`) — the only real isolation. Same-tree parallelism is only safe if agents NEVER run repo-global git commands.
  2. FORBID `git stash` in parallel-agent prompts explicitly — it is repo-global and will swallow siblings' WIP. For a baseline diff, use `git show HEAD:<file>` or `git diff -- <file>`, never stash.
  3. Agents must verify their edit landed by re-reading/grepping the file on disk right before staging (tool "success" ≠ still-on-disk under concurrent reverts), and commit immediately with a pathspec.
  4. Leftover stashes from such a run: do NOT blindly pop — inspect `git stash show --stat`; if its contents are already superseded by commits, leave or drop, never pop onto a diverged tree.

## 2026-07-10 - "Copy the mockup" fidelity: MEASURE rendered pixels, don't eyeball or read CSS values

- Mistake: The user asked FOUR times to make the admin match the approved `handoffv2` mockup (spacing, margins, accent colors). Each time I "fixed" it by reading CSS/inline values and asserting they matched — and each time the user came back with the SAME complaint, because the *rendered result* was still wrong. I kept confusing "the CSS value equals the mockup value" with "the page looks like the mockup." Two real bugs hid in that gap: (1) every page rendered its title TWICE (topbar + a duplicate `<h1 className="page">` in the body with `margin:4px 0 20px`) → a huge empty band; reading per-element CSS never surfaced it because each element's *own* values were fine. (2) The `.main` content is capped at `max-width:1240px; margin:0 auto` (correct, matches the mockup) but the topbar spanned full-width — so on the user's 1920px screen the header and content were misaligned by ~222px with uneven side gaps. The mockup has the identical CSS; the offset is only visible at widths wider than the mockup's ~1240px design width, so it "looked fine" in the mockup screenshots and wrong live.
- Cause: I verified fidelity by inspecting source values instead of the rendered box model, and I never checked at the user's actual viewport width. Structural bugs (duplicate elements, full-width-vs-centered misalignment, flex margin-stacking where `.field`'s `margin-bottom:12` added to a parent `gap:16` → 28px) are INVISIBLE in per-element value diffs — they only show up when you measure the laid-out page.
- Rule:
  1. For any "make it match the mockup" task, VERIFY by rendering and MEASURING pixels, not by reading CSS. This repo has Playwright (in the pnpm store: `node_modules/.pnpm/playwright@<v>/node_modules/playwright/index.js` — import via absolute `file://` URL from a script in `apps/admin`; the browser is headless + isolated, NEVER the user's Chrome). Two workable harnesses: (a) serve `apps/admin` built `dist` via `vite preview` and mock the API (the app uses an ENVELOPE `{ok:true,data}` — a raw object fails auth and shows Login); or (b) simplest & auth-free: write a static HTML file that inlines the real `apps/admin/src/index.css` + the exact page DOM (topbar/sidebar/main/rows) and measure THAT. Use `getBoundingClientRect()` to compare edges/gaps and assert deltas (e.g. `title.left === search.left`, `gap === 24`).
  2. ALWAYS measure at the user's real viewport width (they're on ~1920px). A layout can match the mockup at its design width (~1240–1456px) and break wider. `max-width + margin:auto` centering + a full-width sibling = misalignment that only appears on wide screens.
  3. Walk the mockup section top-to-bottom for STRUCTURE first (element order, duplicate/missing blocks, wrapper divs, which container is centered vs full-width), THEN element values. The structural bugs are the ones the user sees and the value-diffs miss.
  4. Fidelity lives mostly in SHARED classes/layout (`index.css` `.main`/`.topbar`/`.tbl`/`.field`/`.chip`, `App.tsx` shell), not per-page. Fix the shared layer once; per-page inline values are the last mile. A per-page value fix that leaves the shared layout wrong will fail again.
  5. When the mockup's literal CSS produces an undesirable result at the user's width (the 1240px-centered-content-vs-full-width-header case), that's a DESIGN decision — surface it and ask, don't silently "fix" or silently leave it. (User chose: keep 1240px content, wrap the topbar in a matching `.topbar-inner` 1240px container so header aligns with content.)
  6. Deploy caveat: after pushing, the live site serves a NEW JS/CSS bundle; the user must hard-refresh (Ctrl+Shift+R) — a stale bundle looks identical to "not fixed." Say this explicitly. (This sandbox can't reach the live site — HTTP 000 — and the Railway MCP token only has account-level scope, so project-scoped deploy/status calls return Unauthorized; I cannot verify live from here.)

## 2026-07-11 - "Copy the mockup" also means copy the COMPONENT STRUCTURE, not just the page layout

- Mistake: I built the admin Player-detail drawer as a functional-but-different panel — right generic `.drawer` container, but the INSIDE diverged from the mockup on 8 points: plain text header + "Close" button instead of a 52px round avatar + Cinzel name + ✕ button; 4 generic `.card` KPI tiles instead of the mockup's 3 colored tiles (Trophies #f5d783 / Gold #f2d493 / Diamonds #ff9aa8); a plain Mode/Result/When `<table>` instead of styled "vs {opponent}" rows with W/L chips; no Status row; wrong Actions layout; and an EXTRA "Recent ledger" table the mockup doesn't have. The user (who had asked me to "thoroughly copy the mockup") immediately caught it: "why did you miss hits?" I had treated "match the mockup" as "reproduce the outer layout/spacing" and then freelanced the contents.
- Cause: The earlier fidelity lesson trained me to measure page-level layout (margins, centering, column widths) — so I got the DRAWER SHELL right — but I didn't apply the same 1:1 copy discipline to the drawer's INNER component tree. When a mockup section has its own bespoke sub-components (avatar circle, colored stat tiles, chip-styled list rows, a specific button grid), reproducing the wrapper and inventing the insides is still a re-skin fail. Also: I nearly shipped a fabricated "Suspend" button because the mockup had one — but the backend has NO suspend endpoint; a dead button is a fake control (worse than a gap). Caught it and omitted it.
- Rule:
  1. "Copy the mockup" applies at EVERY nesting level, not just the page frame. Before building any panel/drawer/modal, extract that exact mockup section and enumerate its inner elements top-to-bottom (header parts, each tile, each list-row's chip/label/meta, each button + its style, footer note). Reproduce every one; a dropped or substituted inner element is a miss even if the container is pixel-perfect.
  2. Copy the mockup's exact per-element style values (the mockup often defines them as JS style-strings like `btnGhost`/`resStyle`/`statusStyle` near the bottom of the `.dc.html` — grep for the class/var and copy the hex, radius, padding, font verbatim into CSS classes or `CSSProperties` constants). Don't approximate with the app's generic `.btn`/`.card`.
  3. But NEVER reproduce a mockup control that has no real backend (fabricated data/functionality rule). If the mockup shows an action the server can't perform (Suspend), OMIT it and note why — don't wire a button to a non-existent endpoint. Fidelity of *appearance* never overrides honesty of *function*.
  4. Watch for data-semantics mismatches when wiring real data into a copied structure: the mockup's seed match rows compute W/L from a `res` field, but the real `Match.winner` is a SIDE ("red"|"blue"|"draw"), not a username — comparing `winner === player.username` marks every match a loss. Resolve the player's side first, then compare.
  5. Verify the copied component by rendering its exact classNames against the REAL built CSS in the isolated headless browser and measuring (drawer width, avatar size, tile count, grid columns, chip colors/radius/font) — same measure-don't-eyeball rule as page layout.

## 2026-07-11 - Private-room "match ends the instant it starts" / "spectate a dead room": leaving a page ≠ abandoning the game

- Mistake (design bug, pre-existing): The private-room `removeMember()` (rooms.ts) treated the HOST leaving the room as "host abandoned the match" and, if a match had started, FORFEITED it to the guest AND deleted the room. But clicking "Start" navigates the room page → /play/online, and React unmounts PrivateRoomPage → its cleanup fires the room `leave()`. So the host's own navigation into the match forfeited the match the instant it began. Worse: the forfeit's settleMatch() deletes the live match from memory BEFORE the host's /play/online page can `matchResync` into it → the resync gets "no-such-match" → the client shows "Match Interrupted / Connection Lost / 0 moves" (not even a clean "Defeat"). And deleting the room broke the shareable spectate link (code → non-existent room).
- Cause: Conflating "user left the room-lobby UI" with "user abandoned the live game." They're different events. Real abandonment (closing the tab / losing the connection) is already handled independently by match.ts's 45s abandon timer (arms on last-socket disconnect, cleared on reconnect/resync). The room-level forfeit was a DUPLICATE that fired on a NON-abandonment (in-app navigation, where the socket stays connected the whole time — the socket is a route-independent module singleton).
- Rule:
  1. Once a live match has started, the match layer (match.ts) is its SOLE lifecycle owner — including disconnect/abandonment. Lobby/room code must never settle, forfeit, or delete a started match on a page-leave. A room `leave()` fired by an unmount is navigation, not abandonment; the socket is still connected.
  2. Don't tear down shared resources (here, the room object whose code a spectate link resolves) on one participant's navigation. Keep the room alive while the match is live so its spectate link keeps working; reclaim it when the match ENDS. To reclaim without an import cycle (rooms.ts already imports match.ts), match.ts exposes an `onMatchEnd(hook)` registry that rooms.ts registers a cleanup into — a callback, not a back-import.
  3. "Connection Lost / 0 moves" is a specific signature: the client resync'd into a match that no longer exists in server memory (matchIllegal → no-such-match → interrupted:true). When you see it, look for something DELETING the live match out from under a reconnecting client, not for a real network drop.
  4. Realtime/socket bugs ARE testable and MUST be: wire the real handlers (registerPresence+registerMatch+registerRooms) onto an ephemeral-port socket.io server, connect 2+ socket.io-client sockets with signAccess() JWT auth, drive the actual events, and assert the invariant (here: host-leave-after-start fires NO matchEnded, resync still returns state, a late spectator's code still resolves). Prove the test fails on the OLD behavior before trusting it. (socket.io-client was added as a server devDep — already in the pnpm store via apps/web, so zero-download.)

## 2026-07-11 - Adding a dependency: ALWAYS commit pnpm-lock.yaml in the SAME commit (CI uses --frozen-lockfile)

- Mistake: I added `socket.io-client` to apps/server/package.json and ran `pnpm install` (which updated pnpm-lock.yaml locally), but my pathspec-scoped commit listed only the source + package.json — NOT pnpm-lock.yaml. So main had a package.json referencing a dep the lockfile didn't record. Railway's build runs `pnpm install --frozen-lockfile`, which REFUSES to install when the lockfile is out of date → ERR_PNPM_OUTDATED_LOCKFILE → deploy failed.
- Cause: The pathspec-commit discipline (never `git add -A`, to protect the concurrent session's WIP) is correct, but it made me forget that a package.json change has a REQUIRED sibling: pnpm-lock.yaml. Any dependency add/remove/bump touches BOTH files, and CI treats them as an atomic pair.
- Rule:
  1. Whenever you change any package.json's deps, `pnpm install` AND commit pnpm-lock.yaml in the SAME commit as the package.json change. They are one atomic unit.
  2. Before pushing a dependency change, verify the exact CI check locally: `pnpm install --frozen-lockfile --prefer-offline` — it must print "Lockfile is up to date". If it errors with ERR_PNPM_OUTDATED_LOCKFILE, the lockfile isn't committed/updated yet.
  3. When pathspec-committing (to avoid clobbering a concurrent session), pnpm-lock.yaml is repo-root and shared — inspect `git diff origin/main -- pnpm-lock.yaml` first to confirm the diff is ONLY your dep (no collateral from the other session), then commit just that hunk. Here the diff was exactly the one `socket.io-client:` block, so committing the whole file was safe.
  4. Weigh whether a test-only dependency is worth a lockfile change at all — but if you add it, the lockfile MUST ship with it.

## 2026-07-11 - Guest/default avatar broken: shared resolver forgot .png; a duplicate local copy did it right

- Mistake: The default starter avatar "katipunero" (equipped on every new account, incl. guests, by grantDefaults which stores avatarUrl = the item id, a BARE key) rendered as a broken image in matches. Root cause: the shared avatar() resolver (lib/assets.ts) had a hardcoded AVATARS map for known keys, and a fallback for bare keys that returned `/assets/avatars/<key>` WITHOUT the .png extension → 404. Any bare avatarUrl NOT in the map (katipunero + the newer free avatars albularya/dalisay/kalikasan/mangangaso/rajah) broke. Meanwhile AvatarPickerModal had its OWN local avatarSrc() that DID append .png — so the two copies disagreed and only the shared one was wrong.
- Cause: (1) A resolver with a hardcoded allow-list map + a fallback that didn't honor the map's own convention (map entries are all `<key>.png`, so a bare key MUST get .png). New assets added to disk + seed but not to the map silently hit the broken fallback. (2) The same resolution logic existed in two places (shared assets.ts and a local copy in the picker); the local one was correct, masking the shared bug during profile editing but not in matches.
- Rule:
  1. When a resolver has a hardcoded map + a fallback, the fallback MUST follow the same convention as the map entries (here: append .png). Don't rely on the map staying exhaustive — new assets will be added without touching the map.
  2. If you find TWO functions doing the same resolution (one local, one shared) and they disagree, the shared one is the bug surface — fix it and prefer deleting the local duplicate (or have the local one call the shared). Divergent copies hide bugs (the picker looked fine; matches didn't).
  3. For any <img> rendering user/opponent-controlled asset keys, add an onError fallback so a stale/unknown key never shows a broken-image glyph (guard against a fallback that itself fails → loop).
  4. avatarUrl contract in this repo: it stores a BARE key (e.g. "katipunero"); the file is /assets/avatars/<key>.png. grantDefaults stores the item id as that bare key. Keep resolver, picker, and seed aligned on this.

## 2026-07-12 - Avatar resolver: default the ambiguous, don't build a maybe-404 URL

- Mistake: After fixing bare-key avatars (58df3f8), the avatar() resolver STILL broke for some real users (e.g. leaderboard player "lmaw"): any avatarUrl containing "." or "/" was optimistically turned into /assets/avatars/<value>, on the assumption it named a real file. A store-item id / legacy / renamed value that ISN'T a served avatar file → 404 → broken portrait. The client <img onError>→champion fallback was the ONLY safety net, and only on a deployed bundle that includes it.
- Cause: The "guarantee every avatar has a default" was living in the last-resort <img onError>, not in the resolver. A resolver that guesses (build a URL and hope it exists) pushes the failure to runtime; a resolver that only emits URLs it can confidently map makes the default deterministic.
- Rule:
  1. For any user-controlled asset key that MUST always render, the resolver is the guarantee: map known keys, pass through values that clearly point at a served file (leading /, http, assets/, avatars/, or a bare-key→<key>.png), and DEFAULT everything else to the known-good fallback. Never build an optimistic maybe-404 URL for an unrecognized value.
  2. onError on <img> is the belt, not the suspenders — keep it, but don't rely on it for the guarantee (a stale bundle or a non-erroring 200-of-HTML can defeat it).
  3. Decorative overlays (frames) also need an onError that HIDES them, so a broken decoration never sits as a broken square over valid content.
  4. Verify resolver changes by simulating EVERY real value shape (null, map key, bare default-starter key, assetKey path, uploaded/remote URL, and weird/legacy values) and confirming no regression before shipping — the codebase's stored shapes are the spec.
  5. When the user reports a broken avatar that "should have a default," first check whether the existing fix is actually DEPLOYED (a failing build can leave the fix committed-but-not-live) before assuming a new code bug.

## 2026-07-12 - Orchestrator: never run two git-committing subagents in ONE working tree

- Mistake: I dispatched the Android-scaffold implementer while the monetization implementer was still running. Both share the single repo working tree; each created/switched branches and committed. Git branch state raced: the android commit landed on the monetization agent's branch mid-task, and the monetization commit initially landed on the android branch. Both agents recovered non-destructively, but the monetization branch permanently carries the android commit as an ancestor (harmless only because both were bound for main).
- Cause: "no parallel implementers" discipline was applied to test-DB contention but not to GIT STATE — branch HEAD is process-global per working tree, and checkout/commit from two agents interleave.
- Rule: (1) At most ONE git-writing subagent at a time in the shared tree — parallelize only read-only/reporting agents alongside it. (2) If parallel implementation is genuinely needed, give each agent an ISOLATED WORKTREE (Agent isolation:"worktree" / git worktree add) so each has its own HEAD. (3) Implementer briefs should include: re-verify `git branch --show-current` immediately before committing.

## 2026-07-13 - Verify a subagent's "the API doesn't exist" claim against the web client before accepting its workaround

- Mistake (caught at merge gate): the Android economy implementer reported "no dedicated GET /inventory route exists" and derived item ownership by matching ORDER receipts by item NAME. The claim was wrong — the web client populates ownership from GET /api/users/me/export → inventory (itemId-keyed, includes granted starter items that have NO order rows). The workaround would have shown Buy buttons for items users already own. The correction pass then exposed a second bug hidden behind it: equip sent assetKey where the server validates itemId (every equip would have 403'd NOT_OWNED).
- Cause: a subagent that can't find an endpoint invents a plausible derivation instead of asking "how does the EXISTING client do this?" — and a workaround that type-checks and passes its own (workaround-shaped) tests looks complete in a report.
- Rule: (1) In every port/mirror task brief: "for ANY data the web client already displays, find and reuse the web's exact data source — if you think an endpoint is missing, quote the web code that proves how it gets the data before building an alternative." (2) At the merge gate, treat any reported workaround/fragility over a "missing" API as a verification trigger: grep the web client for the same feature before merging. (3) Workaround-shaped tests don't validate contract fidelity — require a fixture reproducing the case the workaround would miss (here: granted-starter-with-no-order).

## 2026-07-13 - Mobile screens must be built from the MOCKUP ITSELF, not the extracted inventory; my merge gate must pixel-compare

- Mistake: the Android Home screen shipped as a reinterpretation — currencies moved to their own row, Quick Match as plain text instead of the gold button, no board hero art, no tournaments card (wrongly deferred as "no server source" when tournaments ARE server-backed), no GAME MODES grid, missing search icon/unread badge/READY pill/day counter. Owner caught it with a side-by-side screenshot.
- Cause: implementers built from tasks/handoffv3-audit/mobile-screen-inventory.md — an extraction that flattened layout/spacing/hierarchy detail — instead of extracting each screen's actual DOM/CSS from FilipinoDama Mobile.dc.html. And my merge gate accepted test-evidence (unit tests, APK builds) as sufficient without a visual comparison against the mockup. Same failure class as the admin fidelity lessons (copy-exactly, measure-pixels) — now repeated on mobile.
- Rule: (1) Every mobile screen task must extract that screen's section from the Mobile.dc.html mockup (structure, exact copy, element order, buttons vs text, art slots, pills/badges) as the primary spec; the inventory doc is only an index. (2) Implementers may NOT defer an element without first proving the server lacks the data (quote the search); "no API" claims are verified against web the same as before. (3) My gate for UI work requires a rendered-screenshot comparison against the mockup screen (emulator screencap vs mockup render) before merge — tests alone do not gate UI fidelity.

## 2026-07-13 - MERGE fixes to main before reporting them done; and stop letting subagents "defer" real mockup elements

- Mistake 1 (the big one): I made 8 real Android fixes (profile rebuild, settings, loading screen, back button, hide-diamonds, result, in-match, mode-box) on branch fix/android-owner-testfindings and NEVER MERGED them. The owner kept testing an old APK from main and rightly asked "why is this still not fixed — I instructed it earlier." The work existed but never reached the artifact under test.
- Mistake 2: the profile-rebuild subagent DEFERRED the mockup's actual Overview content (Achievements grid, Guild card, Purchase-History card, Discover-Guilds card) as "honestly omitted, not faked" and substituted a Rank-Tiers ladder that ISN'T in the mockup — even though guild membership, orders, and the guild list are all real endpoints. Result: the built profile Overview looked nothing like the mockup.
- Rule:
  1. A fix is NOT done until it is MERGED TO MAIN and the artifact the user tests is rebuilt from that main. After each fix branch: merge to main immediately, then confirm (git log origin/main) before telling the user it's fixed. Never let fixes accumulate on unmerged branches across user turns.
  2. "Honestly omitted / no server source" is only valid AFTER quoting the grep proving the endpoint doesn't exist. Guild/orders/guild-list/friends all exist — an implementer claiming "no source" for them is wrong; re-check every deferral against the real API before accepting it. Substituting invented content (a Rank-Tiers ladder not in the mockup) for real mockup content is the exact 1:1-violation the owner forbids.
  3. When the user is actively testing, the loop is: fix → merge → rebuild → (they see it). Keep that loop tight; don't batch.

## 2026-07-13 - Mockup fixed-content arrays (profAch, etc.) are the SPEC — do not substitute web-computed equivalents

- Mistake (3rd occurrence of this class): the profile Achievements used names "Royal Streak/Grandmaster/Kingmaker" with icon files (royal-streak.png/grandmaster.png/kingmaker.png) that DON'T EXIST — rendering gray placeholders. The mockup's profAch array (line 5019) is a FIXED list: First Blood (ic-trophy.png), Streak x10 (me-target.png), Capture King (red-king.png), Season Vet (tier-datu.png) — all real handoff assets. An implementer chose the web's computed AchievementsGrid rules instead of copying the mockup's fixed tiles, and invented icon filenames. Same class as: Rank-Tiers ladder substituted for the mockup Overview; tournaments/season wrongly deferred.
- Cause: implementers treat a mockup's data array as "placeholder to replace with real logic." For a FIXED showcase list (achievements, onboarding slides, legal topics), the array literal IS the spec — copy names + icon asset keys verbatim; only the unlock/earned STATE is real/derived. Inventing asset filenames that don't exist yields silent gray placeholders (no crash, no error — invisible in a build-only check).
- Rule:
  1. When the mockup defines a fixed content array (profAch, onb, legal docs, mode list), copy its names + icon/asset KEYS verbatim; verify every referenced asset EXISTS in handoffv3/handoff/assets before using it (an invented filename renders blank, not an error). Derive only the dynamic state (done/locked, progress).
  2. A gray/blank icon in a screenshot = a wrong or missing asset path — always trace the asset URL and confirm the file exists, don't assume it's a network issue.
  3. Also caught here: the mockup identity card has the me-banner.png sun-ray art bleeding off the right edge (owner called it "the banner") — card art slots in the mockup DOM must be reproduced, not flattened to a plain gradient.

## 2026-07-14 - Never accept "verified by reading the code" for UI; run it

- Mistake: A subagent built the Guild Preview sheet and reported it "verified by reading the compiled logic path." On-device it did NOT work — two Compose layout bugs: (1) the sheet/dialog overlays were emitted BEFORE the full-screen Column, so the Column painted over them and the sheet was invisible; (2) the detail content wrapper was a `Box` (which stacks children) instead of a `Column`, so crest/name/tiles/Join all overlapped into a sliver.
- Cause: Compose draw-order and Box-vs-Column layout bugs are invisible when reading source — the code "looks right" (state set correctly, data fetched 200 OK) but renders wrong. Reading logic ≠ observing layout.
- Rule: For any UI a subagent builds, ALWAYS install + screenshot the actual rendered screen (drive the exact user action) before calling it done. "Verified by reading code" is not verification for anything visual. logcat confirming the API 200 only proves data loaded, not that it's displayed. This is the same class as the mockup-fidelity-measure-pixels lesson: render and look, don't infer.

## 2026-07-14 - Never `git checkout -- .` or `git stash pop` with uncommitted work

- Mistake: While diagnosing a flaky test, I ran `git stash push -- apps/server` then `git checkout -- .` and later `git stash pop`. The `checkout -- .` silently WIPED my uncommitted guild-join-approval edit in guilds.ts, and the `stash pop` popped a STRAY stash from a different branch (feat/admin-fidelity-pass), dumping conflict markers into ~11 unrelated apps/admin files.
- Cause: `git checkout -- .` discards ALL unstaged changes with no undo. `git stash pop` applies whatever is on top of the stash stack — which was old, unrelated work from another branch, not what I stashed.
- Rule: NEVER use `git checkout -- .` / `git restore .` when there is uncommitted work I care about. To test "does this fail without my change", COPY the file aside (cp) or use `git stash push -- <specific file>` and `git stash pop` IMMEDIATELY (check `git stash list` first — never assume stash@{0} is mine). Prefer committing WIP to a temp branch over stashing. When a suite test is flaky, diagnose by cleaning the leftover DB row, not by stashing source.
