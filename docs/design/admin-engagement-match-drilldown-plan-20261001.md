# Player re-engagement and ranked-match drill-down plan — 2026-10-01

Status: proposed; no campaigns created, scheduled, or sent and no application code changed.

## Current evidence
- Campaigns supports draft, schedule, send, reach preview, and audit records. Audience options are all registered human players, active in seven days, or rank tier; bots, guests, and deleted accounts are excluded.
- Both immediate and scheduled sends call fanOutNotifications, which writes in-app announcement rows. Push/email channel selection is metadata only; external delivery is not implemented in this path.
- Due campaigns are checked every 60 seconds while the server runs. Atomic claiming prevents concurrent pollers from claiming the same row. Partial fan-out failures and abandoned sending jobs need delivery reconciliation before retry is safe.
- Admin bell alerts are operational report/support alerts. Player broadcasts belong in Campaigns.
- Analytics counts queue-created MATCHMAKING records with two non-bot participants, scoped by startedAt and mode. Historical LEGACY records must stay excluded from this exact counter.

## Proposed four-week campaign pilot
All times Asia/Manila, initially a test hypothesis rather than a proven best time. Week 1 starts after delivery verification and approval. Maximum one promotional message per player per seven days; suppress players who already returned before a reminder.

| Week | Proposed time | Audience | Title | Body |
| --- | --- | --- | --- | --- |
| 1 | Friday 7:00 PM | Inactive 7–30 days | Ready for another round of Dama? | Balik laro! Your next Dama match is waiting. Open FilipinoDama and play a ranked match this weekend. |
| 2 | Friday 7:00 PM | Active in last 7 days; exclude recent recipients | Make your next move | Ready to test your skills? Play a ranked match this weekend and continue your climb. |
| 3 | Friday 7:00 PM | Inactive 31–90 days | Come back for a fresh match | It's been a while! Return to FilipinoDama and challenge another player in a ranked match. |
| 4 | Friday 7:00 PM | Eligible players, frequency capped | Your next match awaits | A new round is waiting. Open FilipinoDama, find an opponent, and enjoy a game of Dama. |

Replace week 4 with a factual update announcement only when there is a verified player-facing release or event. Do not promise rewards, instant opponents, tournaments, or features that are unavailable. In-app announcements reach players when they open the app; genuinely bringing absent players back requires working opted-in push or email delivery.

## Campaign implementation sequence
- [ ] Verify actual player notification display/read behavior and mobile/web delivery paths.
- [ ] Make channel availability truthful; disable unsupported channels until implemented and verified.
- [ ] Add bounded inactive7to30d/inactive31to90d segments and preview the exact eligible audience. Decide treatment of accounts with no lastSeenAt explicitly.
- [ ] Add promotional opt-out and frequency caps; decide push versus email first, confirm provider/subscription availability, and test deliverability on real test recipients.
- [ ] Add CTA/deep link to the verified ranked-match entry route and ensure guests/sign-in redirects behave correctly.
- [ ] Add edit/cancel for scheduled campaigns and clear statuses for queued, sending, sent, failed, and partial delivery. Enforce safe retries with recipient-level idempotency and recovery of stuck jobs.
- [ ] Show Manila time explicitly while storing UTC; reject past schedules. Preview audience at send time because eligibility changes.
- [ ] Track eligible recipients, created notifications, provider delivery where available, reads/opens, return within 24h/7d, and subsequent ranked match starts. Reach is not delivery or CTR.
- [ ] Start with internal test recipients, then a small pilot. Compare with a held-out eligible group when audience size permits; report sample size and descriptive results for small cohorts.
- [ ] Review actual results weekly before changing cadence. Schedule real sends only after approved dates, audience, content, and verified channel are concrete.

## Ranked human-vs-human drill-down
Make the Ranked started/completed values in Analytics clickable. Open a full-width panel or dedicated detail page preserving the selected analytics window and exact same time boundary.

Columns: match ID; Red player display name/username/tag and profile link; Blue player identity/profile link; started date/time; ended date/time; duration; winner/draw; completion state; finish reason; available trophy changes. Label startedAt as match start, not queue-entry time: a separate exact queue-pairing timestamp is not currently stored.

Filters: 7/30/90 days inherited from Analytics, optional date range, player name/tag/ID, started/all versus completed, and outcome. Default newest first with deterministic startedAt + ID ordering and server pagination. Explicitly show Asia/Manila timestamps, expose UTC in details, and preserve filter state on back navigation. Handle loading, no results, API failure, deleted-player labels, unfinished matches, and draws.

Backend: proposed GET /api/admin/analytics/matchmaking-matches; require existing ECONOMY role like Analytics. Reuse one predicate builder for aggregates and rows: origin MATCHMAKING, mode RANKED, both seats non-bot and present, identical since/until boundary; completed adds endedAt not null. Return bounded pages and total; query only necessary fields with existing indexes. No schema migration expected for the basic list. Current rank is not historical rank; avoid presenting it as rank at match time.

Export: optional CSV of the filtered rows with a defined maximum and formula-injection protection. Do not expose email, tokens, IP addresses, or payment data. Player links reuse existing role-gated drawers. Match details must support ordinary matches rather than depending on the Anti-cheat page's flagged-only listing.

## Acceptance and rollout
- [ ] Aggregate count equals drill-down total using the same captured time boundary.
- [ ] Tests cover bots, missing seats, legacy/room/tournament/rematch/local origins, date boundaries, ended/unfinished matches, same-time ordering, invalid pagination, and role authorization.
- [ ] Verify real local data, desktop/tablet/mobile, keyboard access, time zones, and player/profile navigation.
- [ ] Independently review authorization, data exposure, scheduler idempotency, and delivery failure behavior.
- [ ] Build and test locally; user reviews locally before any code release or real campaign send.

Recommended priority: implement ranked drill-down first, while validating notification delivery; then truthful channel controls/targeting and the re-engagement pilot. No actual campaign schedule exists yet.
