# Monetization dark-launch (feat/monetization-dark)

## Discovery (2026-07-12)
Investigated before planning — the dormant payment pipeline the task describes as
"needs building" is ALREADY fully built and correctly gated end-to-end:
- Server: `features.payments = DIAMOND_TOPUP_ENABLED && PAYMONGO keys present`.
  `/payments/checkout` throws notConfigured when off; `/payments/packs` returns
  `enabled: features.payments`; `/auth/providers` exposes `diamondTopUp: features.payments`.
- Web: `providers.diamondTopUp` (from `/api/auth/providers`) gates the Store "Currency"
  category button + TopUpModal, and AppLayout's diamond pill + top-up "+" button
  (desktop AND mobile drawer). TopUpModal (apps/web/src/features/store/TopUpModal.tsx)
  is a full v3 "Get Diamonds" implementation: live packs, checkout redirect, balance.
- `apps/web/src/features/orders/OrdersPage.tsx` + `GET /api/orders` (apps/server/src/
  modules/store.ts:102-153) already merge Order + settled Payment rows into receipts,
  with an HONEST method label "GCash / Maya / Card" (never the prototype's fabricated
  "App Store · Apple Pay"). Renders unconditionally from real data — a past purchaser
  always sees history; a non-purchaser sees the honest empty state. This already
  satisfies the task's "past-purchaser must always see real history" requirement,
  because it's driven by data presence, not a flag.
- `web-v3-delta-plan.md` W8 row 36 was marked BLOCKED-POLICY pending owner call —
  now unblocked, and turns out to already be implemented.

## Remaining real gaps
- [x] Create branch `feat/monetization-dark` from current HEAD.
- [x] Server: expose `DIAMOND_TOPUP_ENABLED` on `GET /api/config/public` too (bespoke
      field alongside the Config-row map, mirroring how admin-config.ts surfaces the
      locked env value for admins — same pattern, public route).
- [x] Tests: apps/server/test/payments-dark.test.ts — 7 tests: checkout 503
      NOT_CONFIGURED (and no Payment row created), checkout auth still enforced,
      packs `enabled:false`, providers `diamondTopUp:false`, /config/public
      DIAMOND_TOPUP_ENABLED:"false", admin PATCH stays LOCKED_FLAG. On-state note:
      env loads at import time so per-test toggling is impractical; the on-state's
      only server branch is skipping these guards (webhook logic is flag-independent).
- [x] Docs: payments.ts header comment — "Monetization dark-launch" runbook added.
- [x] Docs: web-v3-delta-plan.md W8 row 36 → IMPLEMENTED-DARK with full gate map.
- [x] Verify: server tsc clean; payments-dark 7/7; admin-config 6/6 (1 test updated
      for the new always-present key); FULL suite 38 files / 434 tests all green;
      web tsc clean; web build succeeds (zero web changes — already built+gated).
- [x] Commit (pathspec-only, exact files touched).
