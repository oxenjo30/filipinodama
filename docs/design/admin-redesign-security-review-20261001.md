# Admin Redesign Security Review — 2026-10-01

## Verdict

**APPROVE within the reviewed source scope.**

The review covered the local admin redesign changes for the command palette, notification center, saved player views, player timeline, record deep links, player drawer behavior, and the new admin workspace API routes. No remaining critical, high, or medium security or correctness finding was identified in those paths after remediation.

This is a scoped source review. It does not establish that the application or code outside the reviewed changes is free of defects.

## Findings resolved

| Severity | Finding | Resolution evidence |
| --- | --- | --- |
| Medium | Search exposed guild and tournament result categories below their intended admin roles. | The server now filters categories using the live database role, with a role-boundary test in `apps/server/test/admin-search.test.ts:121`. The palette also filters presentation by the effective preview role in `apps/admin/src/App.tsx:314` and `apps/admin/src/components/CommandPalette.tsx:37`. |
| Medium | Same-route command results did not reliably open the selected player, guild, or tournament. | The route consumers now react to search-parameter changes and consume the `open` target rather than reading it only on initial mount. |
| Medium | Player activity exposed economy events too broadly. | Orders, payments, and ledger rows now require the ECONOMY tier in `apps/server/src/modules/admin-workspace.ts:30-39`; moderation and audit events remain independently role-filtered, with the applied flags returned at line 61. |
| Medium | Resolved or dismissed report deep links could remain invisible behind the default OPEN filter. | Timeline links now carry the report status in `apps/server/src/modules/admin-workspace.ts:57`; Moderation validates and applies that status before paging and scrolling in `apps/admin/src/pages/Moderation.tsx:77-87`. |
| Medium | Authenticated routes lost their visible semantic page heading. | The shell restores a visible route heading and `<h1>` in `apps/admin/src/App.tsx:341`. |
| Low | Stale asynchronous responses could overwrite newer palette, notification, or timeline state. | Request sequence guards are present in `apps/admin/src/components/CommandPalette.tsx:32`, `NotificationCenter.tsx:16`, and `PlayerTimeline.tsx:13`. |
| Low | Saved-view data trusted malformed or locally modified storage records. | Saved filters are allow-listed and parsed into bounded records in `apps/admin/src/components/SavedViews.tsx:6-15`. |
| Low | Player drawer changes could retain prior-player state and lacked complete dialog/error behavior. | The drawer remounts per player in `apps/admin/src/pages/Players.tsx:231`, distinguishes detail-load failure at line 242, and provides modal dialog semantics and keyboard focus containment at line 343. |

## Security properties reviewed

- New workspace endpoints are read-only and guarded by the existing live database-backed `requireAdmin` checks.
- Query limits are validated and bounded before database access.
- Prisma structured queries are used; no SQL construction, unsafe deserialization, path traversal, or SSRF path was introduced.
- User and operational text is rendered through React text interpolation; no raw HTML sink was introduced.
- Generated links are fixed internal admin routes with encoded record identifiers.
- Notification, report, economy, and audit data are filtered at the server boundary rather than relying on hidden UI controls.
- Browser-persisted read state and saved views are scoped to the signed-in admin identifier; saved-view fields are length- and enum-bounded before use.

## Verification evidence and limits

- `git diff --check` passed during the final review.
- The root implementation agent reports that admin type checking, server type checking, and the admin production build passed. The security reviewer did not independently run those commands.
- The security reviewer did not independently execute the database-backed integration tests because the initial review environment could not reach the local Docker port. This is a limit of that independent review, rather than a missing dependency or an untested final integration.
- After explicit approval, the root implementation pass restored guarded access through the loopback bridge and ran the focused admin workspace/search suite against `dama_test`: 13/13 tests passed. That suite covers live database-role enforcement, role-filtered search results, bounded notification results, stable deep links, invalid limits, and unknown-player handling.
