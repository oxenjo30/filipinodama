# Admin redesign implementation parity — 2026-10-01

This checklist maps the approved 27-frame Figma proposal to the existing admin application. It records presentation coverage separately from API behavior and visual verification. Existing routes, role gates, data sources, and action handlers remain authoritative.

## Shared implementation

- [x] Light `#f6f5f8` workspace, white bordered cards, 244 px plum sidebar, gold Cinzel brand, purple actions, Inter interface text, and JetBrains Mono numerics.
- [x] 76 px topbar with command entry, current build environment, notifications, role preview, and account actions.
- [x] Existing role-filtered navigation and all 16 routes retained.
- [x] Content entrance uses 240 ms ease-out; command/navigation panels use 180 ms; drawers use 280 ms from 56 px right.
- [x] `prefers-reduced-motion` removes translation and effectively disables transitions and stagger.
- [x] Responsive shell, login, cards, tables, fields, buttons, badges, modals, drawers, toasts, and common status treatments use shared styles.
- [ ] Complete the representative running-app screenshot review after local data access is available.

## Approved frame mapping

| # | Figma frame | Application flow | Implementation status |
| --- | --- | --- | --- |
| 1 | Overview (`4:18`) | `/overview` | Shared shell and current operational data/actions preserved |
| 2 | Players (`4:19`) | `/players` | Shared shell; saved views and timeline owned by the feature integration |
| 3 | Moderation (`4:20`) | `/moderation` | Queue, filters, detail, and current actions preserved |
| 4 | Anti-cheat (`4:21`) | `/matches` | Match list, analysis state, and current actions preserved |
| 5 | Support (`4:22`) | `/support` | Ticket queue, reply, resolve, and reopen preserved |
| 6 | Settings (`4:23`) | `/settings` | Flags, constants, infrastructure, gateways, and packs preserved |
| 7 | Analytics (`4:24`) | `/analytics` | Current time-window and gameplay dimensions preserved |
| 8 | Store & economy (`4:25`) | `/economy` | Catalog, currency, and current actions preserved |
| 9 | Financials (`4:26`) | `/financials` | Current totals, orders, receipts, and refunds preserved |
| 10 | Live ops (`4:27`) | `/liveops` | Seasons, quests, ladder, scheduled events, and lifecycle actions preserved |
| 11 | Tournaments (`4:28`) | `/tournaments` | Current list, editor, lifecycle, detail, and deep links preserved |
| 12 | Guilds (`4:29`) | `/guilds` | Current list, applications, roster, moderation, and deep links preserved |
| 13 | Campaigns (`4:30`) | `/campaigns` | Current composition, scheduling, sending, and history preserved |
| 14 | Admins (`4:31`) | `/admins` | Current grant, role change, revoke, and protections preserved |
| 15 | Audit (`4:32`) | `/audit` | Current append-only filters, refresh, and pagination preserved |
| 16 | Fraud & AML (`4:33`) | `/fraud` | Existing Phase 2 explanation retained; no risk data invented |
| 17 | Player drawer (`10:512`) | Player detail from `/players` | 560 px light drawer styling; existing identity, status, history, and actions retained |
| 18 | Login (`10:596`) | Signed-out admin entry | Split branded layout; existing authentication and error/busy behavior retained |
| 19 | Common states (`10:619`) | Shared UI and page-owned states | Loading, empty, error, retry, denial, toast, modal, and destructive styles retained |
| 20 | Command palette (`26:3573`) | Topbar search/command trigger | Wired to role-aware route commands and `Ctrl/Cmd+K` |
| 21 | Sample query (`26:3636`) | Command palette record results | Wired to existing player, guild, and tournament search endpoint and deep links |
| 22 | Saved views (`26:3699`) | Players saved-view panel | Feature integration; stored per authenticated admin in browser local storage, with no cross-device persistence |
| 23 | Active players (`26:3762`) | Applied Players saved view | Feature integration uses live player results rather than illustrative values |
| 24 | Save view (`26:3825`) | Players save-view form | Feature integration retains validation, save, cancel, apply, and clear behavior |
| 25 | Timeline (`26:3888`) | Player detail activity timeline | Feature integration links real activity to relevant admin destinations |
| 26 | Notifications (`26:3951`) | Topbar Alerts panel | Wired to current reports/support notifications and route destinations |
| 27 | Read notifications (`26:4014`) | Alerts after mark-all-read | Per-admin browser read state; underlying records remain unchanged |

## Verification record

- Figma context and screenshots were inspected for all 16 route frames plus the drawer, login, and common-state frames before implementation.
- Figma motion metadata was read for the Overview frame and mapped to the shared motion rules above.
- Admin TypeScript check: passed on the final integrated snapshot (`pnpm.cmd --filter admin typecheck`).
- Admin production build: passed on the final integrated snapshot (`pnpm.cmd --filter admin build`; 82 modules transformed).
- Running-app visual review: Login, Overview, command palette, Players drawer/timeline, and mobile Players renders were reviewed. Synthetic browser fixtures verified saved-view save/reload/apply/clear, timeline navigation to the exact Support ticket, notification mark-all-read persistence, and drawer reduced motion (0.00001 s). At 390 px, document horizontal overflow was absent. No fixture data is included in application source.
- Scoped ESLint check passed with the existing React Hooks plugin registered; eight existing warnings remain.
- Independent security review approved the reviewed scope with no remaining critical, high, or medium findings. See the separate security review report.
- After explicit approval, the loopback bridge restored local database access. Focused admin workspace/search integration tests passed 13/13 against guarded `dama_test`. Six existing migrations were applied to backed-up local `dama` with all 36 users preserved. An approved local-only test admin successfully signed in through the real browser (HTTP 200); player search/drawer and notifications/timeline (HTTP 200) were verified against local data. Remaining routes and mutating administrative workflows require user testing. Production was untouched.
