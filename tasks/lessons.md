# Lessons

## 2026-07-10 - Admin pages didn't follow the approved handoff design

- Mistake: Several admin console pages (Store/Economy, Analytics, Support, Tournaments, Matches, etc.) were built without matching the approved `handoffv2/FilipinoDama Admin.dc.html` mockup. They invented their own layout/CSS instead of reproducing the approved `secXxx` design.
- Cause: (1) The `handoffv2/` mockup is gitignored, so build subagents working in isolated worktrees literally could not read it — they matched *spec prose descriptions* of each section instead of the actual approved pixels. (2) The mockup's design-system classes (`fd-kpi`, `arow`, `abtn`, `fd-2col`) were never established in `apps/admin/src/index.css`, so every page built its own look from a different vocabulary (`panel`/`field`/`btn`).
- Rule:
  1. The approved design is `handoffv2/FilipinoDama Admin.dc.html` (on disk, gitignored). ALWAYS read the relevant `secXxx` section from it before building/editing an admin page — do NOT rely on prose descriptions.
  2. When a build runs in an isolated worktree, EXTRACT the approved section markup + CSS into a file the subagent can read (worktrees don't have gitignored files).
  3. Establish the mockup's shared design-system classes in `index.css` ONCE, then pages reuse them — don't reinvent per page.
  4. Legitimate deviations that MUST stay (not gaps): gold-only economy (no Diamonds currency option — real-money is legally disabled), no fabricated data (funnel/retention/cohort panels need an event pipeline we lack → repurpose to real metrics), deferred-V1.5 features. Preserve these while matching the visual chrome.
