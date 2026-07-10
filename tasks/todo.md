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
