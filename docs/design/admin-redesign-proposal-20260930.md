# FilipinoDama admin redesign proposal — 2026-09-30

## Status and source

- Figma proposal: https://www.figma.com/design/9PwCK4SCCEMJIqGg0R8J0b?node-id=4-18
- Overview entry frame: node `4:18`.
- Scope: 19 editable desktop concept frames — the 16 current navigation destinations, plus player detail, login, and common states.
- Current status: repository audit, design composition, structural verification, and scoped visual review complete.
- This is a design proposal, not a running application or an exhaustive pixel handoff for every nested dialog. No admin application code changed.
- Mock data is illustrative. The overview has no revenue source today, and Fraud & AML remains the existing Phase 2 stub.

## Design direction

The proposal uses a light operational workspace with a plum navigation sidebar and restrained gold accents. Cinzel carries the FilipinoDama brand moments, Inter handles interface copy, and JetBrains Mono handles identifiers, amounts, dates, and operational metrics. Dense tables, filters, drawers, and actions remain readable without losing the product identity.

Editable Material 3 Community Kit button instances, updated May 19, 2026, were imported for controls. The Simple Design System search did not return a usable result. The official [shadcn dashboard blocks](https://ui.shadcn.com/blocks?category=dashboard) were used as a reference for dashboard density and composition, while the visual language remains FilipinoDama-specific.

## Product and interaction constraints

- Preserve the implemented role ladder and access rules: `SUPPORT`, `MODERATOR`, `ECONOMY`, and `SUPERADMIN`.
- Preserve the grouped sidebar and all current routes. Prototype navigation is complete with 242 links and no self-target links.
- Preserve global search across players, guilds, and cups, including links into their existing detail views.
- Preserve every existing action and its role gate. The redesign changes presentation and information hierarchy, not operator capability.
- Preserve loading, empty, error, permission-denied, success, confirmation, and destructive-action states.
- Keep data limitations explicit. Do not invent overview revenue, Fraud & AML results, unavailable matchmaking-pause controls, or backend behavior.

## Motion specification

Motion was applied directly in Figma to 80 descendant nodes using manual opacity and translation transitions with ease-out timing.

- The 16 main content sections enter with a 35 ms stagger, capped at 140 ms, over 240 ms.
- The 560 px player-detail drawer enters 56 px from the right over 280 ms.
- Login content enters over 280 ms.
- Common-state cards enter 6 px from their resting position over 200 ms.
- All 242 `NAVIGATE` prototype links use a 180 ms dissolve.
- Imported Material 3 hover interactions retain their existing 200 ms Smart Animate behavior.
- Frame timelines remain unchanged at two seconds.

Implementation must respect `prefers-reduced-motion`. In reduced-motion mode, remove translation and stagger and use either immediate state changes or opacity-only transitions. Motion must never delay access to controls or communicate state without a non-motion cue.

## Frame inventory and feature-preservation checklist

1. **Overview (`/overview`, SUPPORT)** — operational KPIs, period comparisons, activity/health summaries, and honest unavailable-revenue treatment.
2. **Analytics (`/analytics`, ECONOMY)** — time-window controls, rank and cosmetics reporting, regions, outcomes, match origins, and human-versus-human and bot metrics.
3. **Players (`/players`, SUPPORT)** — search/list, presence, player detail launch, match history, notify, mute/unmute, ban/unban, and economy grants under current role gates.
4. **Moderation (`/moderation`, MODERATOR)** — report queue, filters, report context, investigation detail, resolve/dismiss flow, mute, and ban actions.
5. **Support (`/support`, SUPPORT)** — ticket queue, priority display, ticket detail, replies, resolve, and reopen actions.
6. **Anti-cheat (`/matches`, MODERATOR)** — match list and flags, match detail, engine-analysis queue/status, player priors, verdict signals, and outcome/timing context.
7. **Store & economy (`/economy`, ECONOMY)** — catalog management, currency grants, item state/editing, and existing store/economy actions.
8. **Financials (`/financials`, ECONOMY)** — totals, today's activity, orders, average order value, diamonds, refunds table, receipt detail, and refund action.
9. **Fraud & AML (`/fraud`, ECONOMY)** — retain the visible Phase 2 placeholder and its payment-dependency explanation; no fabricated risk data.
10. **Live ops (`/liveops`, ECONOMY)** — seasons, quests, ladder, scheduled events, and their implemented lifecycle actions.
11. **Tournaments (`/tournaments`, ECONOMY)** — list/filter, create/edit, lifecycle controls, formats, brackets/standings, slots, ready windows, detail drawer, and global-search deep links.
12. **Guilds (`/guilds`, MODERATOR)** — list/search, applications, guild detail/roster, approve/reject, rename/edit, member moderation, disband, and global-search deep links.
13. **Campaigns (`/campaigns`, ECONOMY)** — segmented campaign composition, scheduling/sending, history/status, and the existing unavailable matchmaking-pause control.
14. **Settings (`/settings`, SUPERADMIN)** — feature flags, economy constants, infrastructure status, payment gateways, masked credentials, connection tests, live/sandbox mode, and diamond packs.
15. **Admins (`/admins`, SUPERADMIN)** — admin list, role vocabulary, grant/change/revoke access, confirmation, and current role protections.
16. **Audit log (`/audit`, SUPERADMIN)** — append-only records, action filtering, actor filtering, refresh, and pagination.
17. **Player detail** — reusable drawer/detail composition for identity, status, live presence, sanctions, balances/grants, history, and role-gated actions.
18. **Login** — admin authentication, error/loading states, and a restrained branded entry surface.
19. **Common states** — loading, empty, error, offline/retry, permission denied, success toast, confirmation, and destructive confirmation patterns.

## Review and handoff notes

- All 19 editable frames were structurally audited, with zero text nodes outside their frame boundaries.
- Screenshot review covered Overview, Players, Support, Settings, Analytics, the player-detail drawer, Live ops, Campaigns, Login, and the common-state board. The remaining frames were included in the structural audit but were not individually screenshot-reviewed.
- Prototype verification covered 242 links, with no link targeting its own frame.
- Motion metadata was read back from Figma after application. Rendered playback was not reviewed because `ffmpeg` was unavailable in the verification environment.
- Imported Figma library node IDs are session-sensitive. If an instance cannot be resolved in a later call, reimport it using its stable component key.
- A future implementation pass must map each approved frame back to the current API and permission checks and enumerate nested dialogs before coding.

## Approved four-feature prototype extension — 2026-10-01

The approved Figma proposal now contains 27 total frames. Eight frames were added for the command palette, saved views, player activity timeline, and notifications:

| Frame | Node | Purpose |
| --- | --- | --- |
| 20 · Command palette | `26:3573` | Search entry and grouped result state |
| 21 · Sample query — Isla | `26:3636` | Illustrative results for the fixed sample query |
| 22 · Saved views | `26:3699` | Player saved-view management |
| 23 · Active players | `26:3762` | Applied saved-view result state |
| 24 · Save view | `26:3825` | Save-view form state |
| 25 · Timeline | `26:3888` | Player drawer activity timeline |
| 26 · Notifications | `26:3951` | Three-item alerts panel |
| 27 · Read | `26:4014` | Alerts state after marking all as read |

### Interaction coverage

- The topbar search opens the command-palette entry state. It does not implement an actual `Ctrl+K` shortcut or free-text search in this prototype.
- The fixed sample query result for “Isla” links to the player activity timeline.
- Players includes Saved views. Saved-view flows cover apply, save, cancel, and clear.
- The player drawer includes an Activity timeline. Timeline entries link to Profile, Support, and Moderation destinations.
- Alerts contains three entries linking to Reports/Moderation, Support, and Settings.
- “Mark all read” transitions to the read state with an alert count of zero.

These are illustrative fixed states. The prototype does not persist searches, saved views, notification state, or timeline state.

### Verification and motion

- All 27 frames passed the text-boundary audit with zero text overflow.
- Four representative screenshots from the new feature set were visually reviewed.
- The feature set was verified with 169 feature links, followed by one additional row link.
- The final whole-file audit verified 446 `NAVIGATE` links with zero invalid destinations and zero self-target destinations.
- Feature panels use 240 ms motion; navigation uses the existing 180 ms dissolve.
- The reduced-motion requirements documented above apply to these frames as well.
