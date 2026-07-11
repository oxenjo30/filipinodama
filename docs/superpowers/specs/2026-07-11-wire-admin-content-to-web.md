# Wire admin-managed content → the player web app

**Goal:** Everything admins create/manage in the console should appear/work for players in `apps/web`.
An investigation found MOST content is already wired end-to-end (seasons, quests, store, guilds,
campaigns→notifications, sanctions enforcement, public config). Only THREE real gaps remain — the
newest features. This spec covers closing them.

## Already wired (no work — confirmed by investigation)
- Campaigns/announcements → `GET /api/notifications` → `NotificationsMenu.tsx` (bell). ✅
- Seasons → `GET /api/season/current` → `SeasonPage.tsx` (reads same Season row, admin edits reflect). ✅
- Quests → `GET /api/quests` → `QuestsPage.tsx`. ✅
- Store items → `GET /api/store/items` → `StorePage.tsx`. ✅
- Guilds → player `guilds.ts` routes share the rows admin moderates → `GuildsPage.tsx`. ✅
- Moderation/sanctions → enforced at `auth/guards.ts` (ban) + `lib/mute.ts` (mute). ✅
- Public config → `GET /api/config/public` (allow-list) → maintenance banner in `AppLayout.tsx`. ✅

## Global Constraints
- Gold-only economy: tournament entry fees/prizes in gold (already so); no diamonds top-up.
- Player routes require auth where appropriate (join/leave, my-tickets) via `requireAuth`; public
  read-only lists may be open or authed consistently with sibling modules.
- Additive only: new player routes + new web pages. Do NOT change admin routes or existing player routes.
- Ownership checks: a player can only see THEIR tickets (mirror the `notif.userId !== me` guard pattern).
- Match the existing web design system (gold/Cinzel/royal, the shared components) — no new palette.
- Preserve all existing functionality. TDD the new server routes (vitest buildApp+inject).

---

## GAP 1 — Tournaments → web "Cups" page  (web-only; player API already exists)
Player routes exist + are solid (`apps/server/src/modules/tournaments.ts`): `GET /api/tournaments`
(list, filter by status), `GET /api/tournaments/:id` (detail + entries + bracket grouped by round +
myEntry), `POST /api/tournaments/:id/join`, `.../leave`. Build the web UI:
- **Create** `apps/web/src/features/tournaments/TournamentsPage.tsx` — list of OPEN/RUNNING/UPCOMING cups:
  name, format, entry fee (gold), prize pool, registered/cap, min-trophies, starts label; Join/Leave
  button wired to the join/leave routes (guest-blocked → prompt sign-in), with the confirm + balance
  checks the API enforces surfaced as UI states.
- **Create** a detail/bracket view (same page or `TournamentDetail.tsx`) consuming `GET /:id` — show
  entries list + bracket by round + the player's own entry/placement.
- **Add a nav entry** (`apps/web/src/features/nav`) — "Cups"/"Tournaments" link; add the route in the
  web router. Match how other nav items are registered.
- Verify: web typecheck + build; join/leave happy path reasoned through; guest path blocked.

## GAP 2 — Scheduled Events (LiveEvent) → web  (new player route + web section)
Admin manages via `admin-events.ts` (LiveEvent model). No player route, no web consumer.
- **Server:** new module `apps/server/src/modules/events.ts` — `GET /api/events` returning
  currently-relevant events (status in ["scheduled","live"], not "ended"), ordered soonest-first,
  selecting display fields (`name`, `type`, `reward`, `startsLabel`, `endsLabel`, `color`). Read-only;
  no auth needed (or authed to match siblings — check store.ts convention). Register in `index.ts`
  near the other player modules. TDD: returns live/scheduled events, excludes ended, shape correct.
- **Web:** surface events to players — a home-page "Events"/"Live now" section or banner
  (`apps/web/src/features/home/`), consuming `GET /api/events`. Check whether `home/updates.ts` is a
  hardcoded stand-in a real events feed should replace/augment. Each event: color dot, name, window
  (startsLabel–endsLabel), reward text.
- Verify: server test green; web typecheck + build; empty state when no events.

## GAP 3 — Support tickets → players view their threads  (new player routes + web UI)
Players can FILE tickets (`POST /support/tickets`) but can't VIEW them. Staff replies create a
`support_reply` notification (140-char preview) that dead-ends.
- **Server (`apps/server/src/modules/support.ts`):** add `GET /support/tickets` (list mine — the
  authed user's tickets: id, subject, category, status, priority, updatedAt) and
  `GET /support/tickets/:id` (thread: messages with `isStaff` flag, ownership-guarded — 404/403 if not
  the filer). TDD: player sees only their tickets; sees staff replies; another user gets 403/404;
  status+priority exposed.
- **Web:** a "My Tickets" list + thread view — extend `apps/web/src/features/contact/ContactPage.tsx`
  or a new `TicketsPage.tsx`. Show status (Open/Resolved) + priority; render the message thread
  (player left, staff right). Deep-link the existing `support_reply` notification (carries
  `data.ticketId`) to the thread. (Player reply-back is optional/stretch — read view is the core gap.)
- Verify: server tests green; web typecheck + build; ownership guard tested.

## Execution order (by player impact)
1. GAP 1 Tournaments web page (highest — a full gold economy feature players can't see).
2. GAP 2 LiveEvent player route + web section.
3. GAP 3 Support ticket viewing.

## Verification (each gap + final)
- Server: `pnpm --filter @fd/server test` green; typecheck.
- Web: typecheck + build green.
- Final: whole-branch review; deploy; the admin creates X → it appears in web.
