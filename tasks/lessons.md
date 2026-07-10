# Lessons

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
