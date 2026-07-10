# Admin design-fidelity re-skin — match the approved handoffv2 mockup

**Goal:** Bring every admin console page up to the approved `handoffv2/FilipinoDama Admin.dc.html`
design. Audit (14 pages, avg 79/100) found the root cause is a missing shared design-system layer
in `index.css` — the same ~12 mockup classes are absent, so pages invented their own look.

**Preserve (NOT gaps — do not "restore"):** gold-only economy (no Diamonds currency option),
no fabricated data (funnel/retention/cohort → real-metric repurpose + honest footer), deferred V1.5.

## Phase 0 — Shared design-system layer in index.css (do FIRST; unblocks the rest)
- [ ] `fd-kpi` — KPI tile with per-tile value color override (green/amber/ink/gold) + a bottom trend/delta row (sub left, colored delta right)
- [ ] `fd-2col` — 1fr/1fr (and 1.35fr/1fr) two-column card-row grid, gap 14
- [ ] `abtn` / `btnGold` — gold gradient pill/button (+ full-width variant)
- [ ] `btnGhost` / `btnAmber` / `btnDanger` (+ Sm variants) — 3-tier moderation button hierarchy
- [ ] `fd-avatar` — 32–34px round avatar chip (gradient/color fill, gold border, initials or avatarUrl)
- [ ] `arow` — table/list row with gold hover wash + gold-tinted top border
- [ ] `fd-switch` / knob — real sliding toggle for feature flags
- [ ] `badge-rect` + rank-chip — rounded-rect badge variant + per-tier colored rank chip
- [ ] `card-header` — inner card header bar (title left, dim subtitle right, divider)
- [ ] `thead-raised` — thead #1e1338 wash
- [ ] `flag-banner` — pulsing danger alert bar (Matches)
- [ ] `quote-flagged` — red-tinted excerpt/quote box (Moderation)
- [ ] Verify: admin typecheck + build stay green after CSS additions

## Phase 1 — Matches (54, the only structural failure)
- [ ] Rebuild Matches.tsx to the approved secMatches anti-cheat review-queue shell (flag-banner, queue columns, per-row + drawer decision buttons rendered — disabled/"Phase 2" where the detection backend doesn't exist yet, honestly)
- [ ] Verify typecheck + build

## Phase 2 — Moderate layout pages
- [ ] Settings (62): fd-2col flags+constants row + real fd-switch toggles
- [ ] Economy (72): fd-2col grant+ledger row
- [ ] Admins (72): fd-avatar + KPI colors + invite/grant accent
- [ ] Support/Tickets (88 but moderate): wire Reopen action + priority display (needs a small server field + reopen path — scope check first)
- [ ] Verify each: typecheck + build

## Phase 3 — Trivial token-swap polish sweep (now that tokens exist)
- [ ] Overview + Analytics: colored KPI trend deltas (real prior-window counts, no pipeline)
- [ ] Players: fd-avatar + Joined column + rank chip + centered status
- [ ] Moderation: button hierarchy + quote-flagged box + badge-rect
- [ ] Store: row thumbnails
- [ ] Guilds: row action column
- [ ] Tournaments: per-tile KPI colors + Cinzel form title
- [ ] Audit: card-header + append-only count + thead-raised
- [ ] LiveOps: remaining token swaps
- [ ] Verify: full admin typecheck + build

## Ship
- [ ] Whole-branch review of the re-skin diff
- [ ] Merge + deploy + verify pages render on app.filipinodama.com

**Constraints (CLAUDE.md):** minimal impact (only touch what's needed for fidelity — no logic
changes to the working server), verify each phase (typecheck+build), gold-only + no-fabrication
preserved, get approval before merge/deploy.

---

# Blog page redesign (Damath session — separate task)

**Goal:** Redesign `apps/web/src/features/blog/BlogPage.tsx` — the /blog index is a flat, uniform
single-column list of identical text cards. Give it editorial hierarchy (featured hero article,
category-as-visual-system, elevated masthead, rhythm, tasteful motion) while preserving ALL
functionality and matching the existing gold/Cinzel/royal design system.

**Preserve exactly (do not break):** category filter tabs, search, pagination (8/page), both empty
states, scroll-to-top, and the whole sidebar (Play CTA, Featured-in-Store from /api/store/items,
"Your Last Match" for signed-in players). Visual/layout only — no logic/data changes.

- [x] Read current BlogPage; invoke design skill; dispatch a design subagent with a detailed brief
- [x] Subagent redesigns BlogPage.tsx (hero + category system + hierarchy + motion + reduced-motion)
- [x] Review the subagent's diff myself — all functionality markers present; empty states, filter/search/
      pagination, sidebar, scroll-to-top intact; motion has reduced-motion fallback + no content-gating
- [x] Verify: web typecheck (exit 0) + eslint (exit 0) + vite build (✓ built) all clean
- [x] Commit (pathspec-scoped, 5067461) + deploy → web SUCCESS on 5067461 at app.filipinodama.com/blog

**Constraints:** minimal impact (only BlogPage.tsx + its helpers), match existing design tokens (no new
palette), no functionality regressions, verify before "done", get approval before deploy.

## Article reader sidebar (ArticlePage.tsx — follow-up)

**Goal:** The /blog/:slug reader is a narrow centered column with a big empty right gap (looks like a
missing sidebar). User wants a sidebar matching the blog index. Add Play CTA + Featured in Store +
"More in {category}" rail to the right, two-column layout that collapses on mobile.

- [x] Convert ArticlePage layout to two-col grid (minmax(0,1fr) 300px, fd-two-col) — reading column left
- [x] Sidebar: Play CTA + Featured in Store (/api/store/items) + related-articles ("More in {category}")
- [x] Keep the ~720px prose measure (.fd-article, left-aligned in the column); collapses on mobile
- [x] Preserved: not-found / not-published states, link rewriting, SPA-click, SEO meta, CTA (all verified present)
- [x] Verify: tsc (0) + eslint (0) + build (✓); commit (pathspec) + deploy → confirm live

## Admin: dynamic player search (type-ahead) in Economy grants/ledger

**Goal:** The grant form + ledger filter require pasting a raw player ID. Add a debounced type-ahead
that searches players by name/tag/email as you type (backend GET /api/admin/users?q= already exists,
searches username/displayName/tag/email/id) and lets you pick from a dropdown → sets the userId.

**Coordination:** Economy.tsx is on the OTHER session's re-skin todo. User approved: build a NEW
reusable component (own file, no collision) + make MINIMAL functional edits to Economy.tsx (swap the
two 'Player ID' text inputs for the type-ahead). No visual re-skin — leave that to the other session.

- [x] Confirm backend search endpoint exists (GET /api/admin/users?q=…) — YES, no server work needed
- [x] Build apps/admin/src/components/PlayerSearch.tsx — debounced (250ms) query, dropdown of matches
      (name · tag · short-id), keyboard nav (↑↓/Enter/Esc), onSelect(id), removable chip; admin api + CSS vars
- [x] Wire into Economy.tsx: grant form Player input + ledger filter (import + 2 input swaps, minimal)
- [x] Verify: admin tsc (0) + build (✓); pre-existing CurrencyT-unused warning left alone (minimal impact)
- [ ] Commit (pathspec) + deploy admin service
