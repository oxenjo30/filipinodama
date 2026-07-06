# Online Multiplayer — Wiring Plan

The app ships with a **local-only** room service (`src/online/roomService.ts`) that
never pretends to be online (`online: false`, joins reject with a clear message).
The UI for Create/Join Room is already built against `src/online/roomTypes.ts`,
so going live is a service swap, not a UI rewrite.

## Reusable infrastructure (from the previous project)

Located in `D:\AI Projects\Clash Royale`:

- **Firebase project `dama-90740`** — RTDB at
  `https://dama-90740-default-rtdb.asia-southeast1.firebasedatabase.app`,
  Auth, Hosting, Functions (Node 20). Public web config is in
  `dama/js/firebase-config.js`.
- **Cloud Functions**: `presence.js`, `elo.js`, `stats.js`, `daily.js`,
  `tournament-*.js` — presence tracking and ELO are directly reusable.
- **`database.rules.json`** — existing RTDB security rules to adapt.
- **Emulator config** in `firebase.json` (RTDB 9000, Auth 9099, Functions 5001).

> ⚠️ **Security**: `dama/dama-90740-firebase-adminsdk-fbsvc-9252a2df6e.json` in the
> old project folder is a **service-account private key**. It was never copied
> here and must never be committed. Rotate it in the Firebase console before
> shipping anything online.

## Implementation steps

1. `npm i firebase` and add `src/online/firebaseClient.ts` with the public web
   config (safe to commit — it's a client identifier, enforced by RTDB rules).
2. Implement `FirebaseRoomService` satisfying `RoomService`:
   - `createRoom` → push to `rooms/{code}` (6-char code from `generateRoomCode`),
     host claims the red seat, `status: 'waiting'`.
   - `joinRoom` → transaction on `rooms/{code}/players/blue` (fail if taken).
   - `sendMove` → append the full `MoveSequence` to `rooms/{code}/moves`.
     **Sync move events, not board snapshots** — RTDB strips `null`s from nested
     arrays (the old project's `normalizeBoard` bug); replaying sequences through
     the pure engine avoids that class of bug entirely and validates every move
     on both clients.
   - Presence via `onDisconnect()` + the existing presence function.
3. Match store: add an `online` mode where the opponent's sequences arrive from
   the subscription and local input is locked while it's their turn.
4. Invite links: route `/room/join?code=XXXXXX` (the Join page already reads a
   code field — prefill from the query string).
5. Rematch handshake: `rooms/{code}/rematch/{side} = true`, both true → reset.
6. Ranked/leaderboard: reuse the ELO + stats functions; the Leaderboard page
   already renders the future columns (rank, player, wins, losses, rating, streak).
7. Spectators, chat/emoji reactions, disconnect forfeit timers — later.

## Flip-the-switch checklist

- [ ] `roomService.online === true` only when the Firebase service is active
- [ ] Remove the "not connected yet" banners (they key off `roomService.online`… wire that check when swapping)
- [ ] Enable Ranked + Public visibility options on Create Room
- [ ] Adapt RTDB rules: only seat owners may append moves, code-gated reads
- [ ] Rotate the leaked admin SDK key
