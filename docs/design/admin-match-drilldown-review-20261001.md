# Admin ranked-match drilldown review — 2026-10-01

## Verdict

**APPROVE** for the reviewed local scope. This review covered the ranked matchmaking analytics drilldown, its shared server cohort, pagination and filters, returned identity fields, and the modal's keyboard and responsive behavior. It does not assert that unrelated repository code is free of defects.

## Reviewed paths

- `apps/server/src/modules/admin-analytics.ts`
- `apps/server/src/modules/admin-matchmaking.ts`
- `apps/server/test/admin-analytics-drilldown.test.ts`
- `apps/admin/src/pages/Analytics.tsx`
- `apps/admin/src/components/MatchmakingMatches.tsx`
- `apps/admin/src/index.css`

## Resolved findings

- **Query window bounded:** caller-supplied snapshots longer than 90 days are rejected. This prevents an ECONOMY admin from requesting an unbounded historical count and identity search.
- **Date filters made authoritative:** `startedFrom` and `startedTo` must be ordered and remain inside the captured analytics snapshot. The client uses the same snapshot for its Manila-time `datetime-local` bounds, validates before serialization, and does not issue a request for invalid values.
- **Outcome labels reconciled:** terminal outcome filters (`red`, `blue`, and `draw`) also require `endedAt`, so the API cannot return a row filtered as a win while presenting it as unfinished.
- **Modal behavior repaired:** focus enters the dialog, Tab remains trapped, Escape closes it, prior focus is restored, and body scrolling is restored on unmount.
- **Viewport clipping repaired:** the overlay is rendered through `createPortal(..., document.body)`, outside transformed page containers. Mobile uses `100dvh`, while the body scroll lock and focus references continue to operate on the same document.

## Security and data review

- Both aggregate and drilldown routes enforce the current server-side `ECONOMY` role.
- Aggregate counts and drilldown rows use the same human-versus-human, `MATCHMAKING`, captured-time-window predicate.
- Page size is capped at 100 and page number at 10,000; ordering is deterministic by `startedAt` and `id`.
- Returned player data is limited to ID, username, display name, tag, and deletion state. Email, authentication data, settings, and move history are not returned.
- The endpoint is read-only and introduces no permission, billing, or production-configuration changes.

## Campaign boundary follow-up

The separate campaign-readiness change received an independent backend review. That review corrected the exact seven-day boundary so the active and inactive segments do not overlap. It also confirmed that historical scheduled `push` or `email` rows are rejected by the scheduler and become `failed` without being silently delivered as in-app notifications. Existing historical draft/list metadata remains readable.

## Verification evidence

The root task reported **41/41 focused server tests passing**, including campaign, scheduler, and analytics drilldown coverage. The root task also reported successful admin typecheck and production build after the portal/mobile correction. Those commands were run by the root and implementation workers, not by this reviewer. This reviewer performed a final read-only source and diff inspection of the portal, focus lifecycle, body overflow restoration, authorization, filters, bounds, response shape, and pagination.

## Remaining delivery limitations

Campaign delivery remains intentionally inbox-only. Firebase/FCM, Web Push, marketing email delivery, campaign CTA routing, resumable fanout, and per-recipient campaign idempotency were not added in this phase. The admin UI identifies Push and Email as unavailable instead of claiming those channels deliver.
