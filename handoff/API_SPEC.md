# API_SPEC.md — REST + WebSocket Contract

Base REST path: `/api`. Auth via httpOnly access-token cookie (refresh rotates). All request/response bodies validated with **Zod schemas defined in `packages/shared`** and reused on both ends. Socket events use the constant names exported from `packages/shared/events.ts`.

Standard response envelope: `{ ok: true, data }` or `{ ok: false, error: { code, message } }`.

---

## REST endpoints

### Auth
```
POST   /api/auth/register        { email, password, username }         → sends verification email
POST   /api/auth/verify          { token }
POST   /api/auth/login           { email, password }                    → sets cookies
POST   /api/auth/guest                                                    → creates guest user + session
GET    /api/auth/oauth/:provider                                          → redirect (google|facebook)
GET    /api/auth/oauth/:provider/callback
POST   /api/auth/refresh                                                  → rotates refresh, new access
POST   /api/auth/logout
POST   /api/auth/password/forgot { email }
POST   /api/auth/password/reset  { token, password }
GET    /api/auth/me                                                       → current user + balances + equipped
```

### Users / profile
```
GET    /api/users/:id                    → public profile (stats, rank tier, guild)
PATCH  /api/users/me                      { displayName, bio, avatarUrl, countryCode }
POST   /api/users/me/avatar               (multipart) → S3 upload, returns url
PATCH  /api/users/me/equip                { board?, skin?, frame? }   (must own item)
DELETE /api/users/me                      { confirm:"DELETE" }         → soft-delete + purge schedule
GET    /api/users/me/export                                            → GDPR data dump (json)
GET    /api/users/me/ledger?currency=     → paginated currency history (trophy/gold/diamond history)
```

### Matches / replays
```
GET    /api/matches?userId=&mode=&result= → paginated match history
GET    /api/matches/:id                   → full match incl. moves[] (for replay)
POST   /api/matches/local                 → persist a finished LOCAL/offline game (client-reported, mode=LOCAL only, no trophy/gold)
```
> Online match creation/lifecycle happens over sockets, not REST. Only offline LOCAL games are posted directly (and never award ranked currency).

### Store / economy / payments
```
GET    /api/store/items                   → catalog grouped by type
POST   /api/store/purchase                { itemId } | { bundleId }    → server checks balance, atomic spend + grant item + ledger + order
GET    /api/orders                        → purchase history
POST   /api/payments/checkout             { packId }                   → creates Stripe Checkout session, returns url
POST   /api/payments/webhook              (raw body, Stripe-signed)    → ONLY place diamonds are credited
GET    /api/payments/packs                → diamond top-up packs
```

### Social
```
GET    /api/friends                       → friends + presence
GET    /api/friends/requests              → incoming/outgoing
POST   /api/friends/request               { toUserId }
POST   /api/friends/request/:id/accept
POST   /api/friends/request/:id/decline
DELETE /api/friends/:userId
GET    /api/friends/suggested
```

### Guilds
```
GET    /api/guilds?search=                → browse
POST   /api/guilds                        { name, tag, description }   → FREE to create
GET    /api/guilds/:id                    → detail + roster + online status
PATCH  /api/guilds/:id                    { name, description, minTrophies }   (leader/officer)
POST   /api/guilds/:id/join               → request or auto-join if meets minTrophies
GET    /api/guilds/:id/requests           → join-request inbox (officer+)
POST   /api/guilds/:id/requests/:rid/accept | /decline
PATCH  /api/guilds/:id/members/:uid/role  { role }                     (leader)
DELETE /api/guilds/:id/members/:uid       → kick (officer+)
GET    /api/guilds/:id/leaderboard        → weekly contributions
```

### Leaderboard
```
GET    /api/leaderboard?scope=global|friends|guild&season=  → ranked rows w/ rank tier
```

### Progression
```
GET    /api/quests                        → daily + seasonal w/ progress
POST   /api/quests/:id/claim              → atomic gold grant + ledger
GET    /api/season/current                → tiers + my progress + hasPass
POST   /api/season/claim                  { tier }                      → grant reward (checks xp / pass)
POST   /api/season/pass                                                  → buy premium pass (diamonds)
```

### Notifications
```
GET    /api/notifications                 → grouped, paginated
POST   /api/notifications/read-all
POST   /api/notifications/:id/read
```

### Learn
```
GET    /api/learn/lessons                 → lessons + completion state
POST   /api/learn/lessons/:id/complete
```

---

## WebSocket (Socket.IO) contract

Single authenticated namespace `/rt`. Auth handshake carries the access token; server attaches `userId`. Uses the **Redis adapter** for multi-instance broadcast. Presence heartbeat every ~20s.

### Presence
```
→ presence:ping
← presence:update      { userId, status }        (broadcast to friends/guild)
```

### Matchmaking
```
→ mm:join              { mode: 'casual'|'ranked' }
→ mm:leave
← mm:searching         { queuePos, eta }
← mm:found             { matchId, opponent, yourColor, settings }   // both players
→ mm:accept            { matchId }
← mm:cancelled         { reason }
```

### Match play (server-authoritative)
```
← match:state          { state: GameState }        // authoritative snapshot on join + after each move
→ match:move           { matchId, move: Move }      // INTENT — server validates via game-engine
← match:moved          { move, state }              // broadcast to both players + spectators
← match:illegal        { reason }                   // rejected intent (client rolls back)
← match:clock          { red, blue }                // periodic clock ticks
→ match:resign         { matchId }
→ match:draw:offer / match:draw:accept / match:draw:decline
← match:ended          { winner, reason, trophyDeltas, goldReward, newBalances }
→ match:rematch:offer / match:rematch:accept        → spins up a new match
```
Reconnect: on socket reconnect the client sends `match:resync {matchId}` and receives the current `match:state`.

### Private rooms
```
→ room:create          { settings }                 → { code }
→ room:join            { code }
→ room:leave
← room:state           { host, players, spectators, settings, locked, bans }
→ room:invite          { friendUserId }              → sends notification/DM
→ room:settings        { locked, moveTimerSec, forcedMaxCapture }   (host)
→ room:kick / room:ban { userId }                    (host)
→ room:spectate        { code }                       → join as spectator
→ room:start                                           (host) → creates match, emits mm:found-style payload
```

### Spectating
```
→ spectate:join        { matchId }
← match:state / match:moved / match:ended             (read-only stream)
→ spectate:leave
```

### Chat (DM / room / guild)
```
→ chat:send            { channelId, body }            → rate-limited
← chat:message         { channelId, message }         (to channel members)
→ chat:read            { channelId }                  → updates lastReadAt
← chat:unread          { channelId, count }           // drives unread badges + nav badge
← chat:notify          { channelId, fromName }        // triggers message sound when app backgrounded/other screen
```

### Notifications (live)
```
← notif:new            { notification }               // friend request, achievement, event, system → bell badge
```

## Rate limiting & abuse
- Chat: token-bucket per user (Redis). Move intents validated + clock-gated. Matchmaking double-join guarded by `mm:lock`. All mutations authorize by `userId` from the socket/session — never trust client-sent identity.
