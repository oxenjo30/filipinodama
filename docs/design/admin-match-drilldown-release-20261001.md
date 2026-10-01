# Ranked match drill-down and campaign readiness release — 2026-10-01

## Behavior
Analytics Ranked H2H started/completed values open an accessible, paginated match list. Both players link to their records; match start/end times are labeled Asia/Manila with UTC detail. Duration, result, completion reason, and trophy changes are available. The list inherits the counter's captured window, with player, completion, outcome, and date filters bounded to that snapshot. Aggregate and list queries share the exact MATCHMAKING/non-bot cohort predicate. No database migration or dependency addition.

Campaigns defaults to actual in-app delivery. Push/email are disabled and rejected by the server; historical scheduled unsupported channels fail before fan-out. New inactive 7–30 and 30–90-day segments exclude bots, guests, and deleted accounts and do not overlap the active-seven-day boundary. No campaigns were created, scheduled, or sent in the app or production.

## Validation before release
- Admin typecheck and final production build passed (83 modules).
- Server typecheck and production build passed.
- Guarded loopback dama_test: 41/41 integration tests passed across analytics, drill-down, campaigns, and scheduler suites.
- Real local API/browser: empty ranked list, started/completed presets, and desktop/tablet/mobile bounds passed. Campaign in-app default, disabled unsupported channels, both inactive segments, and audience preview HTTP 200 passed. Browser fixture match links opened the real local test account drawer; the existing Players route consumes its open parameter.
- Browser-only populated fixtures: 27 rows across two pages, both player identities, expanded details, Manila/UTC timestamps, player search, pagination, invalid date blocked before request, and API failure/retry passed at 1600x1000, 1024x900, and 390x844. No fixture data enters application source or database.
- Visual inspection found transformed-parent clipping; body portal correction passed overlay top=0 and visible header checks at all three sizes. Desktop/mobile screenshots were reviewed.
- Independent source review approved after bounded query, date, outcome, audience boundary, scheduler channel, and portal fixes. See admin-match-drilldown-review-20261001.md.

## Limits and next phase
Local app data has zero recent exact ranked queue matches, so populated browser rendering used controlled fixtures while integration tests verified actual database selection. External campaign push/email, opt-out/frequency caps, CTA delivery across clients, recipient-level retry/idempotency and campaign conversion tracking remain planned. In-app reach means persisted inbox rows, not external delivery or click-through rate. Never automatically retry historical failed/partial campaigns without recipient-level reconciliation.

## Release and rollback
Release only the scoped admin/API source, focused tests, plan and review documents. Preserve unrelated checkout work and all credentials/QA artifacts. Verify GitHub CI plus admin/API Railway deployments on the released commit, published assets, API health, and unauthenticated endpoint rejection. If a regression appears, revert this scoped commit and redeploy; no migration rollback is needed. Authenticated production match-list interaction requires an authorized production admin session and is not claimed from anonymous smoke tests.
