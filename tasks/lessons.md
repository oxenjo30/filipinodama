# Lessons

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
