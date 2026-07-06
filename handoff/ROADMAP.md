# ROADMAP.md — Ordered Feature Branches

Build in this order. Each row = one `feat/<branch>` PR into `dev` (see `GIT_WORKFLOW.md`). "Done when" is the acceptance gate for merging. Group boundaries (M1…M7) are the milestones you promote `dev` → `main`.

Legend: 🔴 blocks everything after it · 🟡 has dependencies · 🟢 independent-ish

---

## M1 — Foundation
| Branch | 🔴/🟡/🟢 | Done when |
|--------|--------|-----------|
| `chore/scaffold` | 🔴 | Monorepo from `ARCHITECTURE.md` builds; `docker-compose up` gives Postgres+Redis; blank themed web app + health-check server run; CI pipeline green on an empty PR. |
| `feat/theme-tokens` | 🔴 | `tokens.css` + Tailwind preset + `Frame`/`Button`/`Pill`/`Divider`/`RankBadge` components match `DESIGN_SYSTEM.md`; Storybook or a `/kitchen-sink` route renders them. |
| `feat/game-engine` | 🔴 | `packages/game-engine` implements `GAME_RULES.md`; **entire test matrix green**; pure + serializable; deterministic replay verified. |
| `feat/shared-types` | 🔴 | `packages/shared` exports GameState/DTOs/zod schemas/socket event names/enums; imported by web+server. |

## M2 — Identity & shell
| Branch | | Done when |
|--------|--|-----------|
| `feat/db-schema` | 🔴 | Prisma schema from `DATABASE_SCHEMA.md` migrates; seed script loads store catalog, quests, season, bots, sample matches. |
| `feat/auth` | 🔴 | Register+verify, login, guest, Google/Facebook OAuth, refresh rotation, `/auth/me`; protected routes; the prototype's auth modal reproduced. |
| `feat/app-shell` | 🟡 | Top nav + mobile nav + account menu + currency pills + bell, wired to real `me` data; router with all feature routes stubbed; responsive per `DESIGN_SYSTEM.md`. |
| `feat/economy-ledger` | 🔴 | `LedgerEntry` grant/spend service is atomic + updates balance cache; trophy/gold/diamond history endpoints; unit tests for concurrent spends. |

## M3 — Core gameplay (the heart)
| Branch | | Done when |
|--------|--|-----------|
| `feat/play-board-ui` | 🟡 | Interactive board renders GameState; all piece states (select/legal/capture/must-capture/promotion) match prototype; equipped board+skin render from assets. |
| `feat/ai-play` | 🟡 | `bestMove` (easy/normal/hard) wired to a full vs-AI game screen incl. difficulty select; offline-capable via client engine. |
| `feat/realtime-match` | 🔴 | Socket match loop: server-authoritative moves, clocks, resign/draw, `match:ended` writes Match + trophy/gold via ledger; reconnect resync. Two browsers can play a full legal ranked game. |
| `feat/matchmaking` | 🟡 | Redis queue by mode+rating, accept handshake, Elo/Glicko rating applied on result; match-found screen w/ rank badge. |
| `feat/winner-rematch` | 🟢 | Winner modal + rematch flow over sockets; per-win gold reward banked on claim. |

## M4 — Rooms & spectating
| Branch | | Done when |
|--------|--|-----------|
| `feat/private-rooms` | 🟡 | Create/join by code, lobby state, invite friend, start match. |
| `feat/room-host-controls` | 🟡 | Lock room, kick/ban, move-timer + forcedMaxCapture settings enforced server-side. |
| `feat/room-chat` | 🟡 | Room + in-game chat channel, rate-limited, live. |
| `feat/spectate` | 🟡 | Live read-only stream to spectators incl. late-join resync; "Watch Live" from home. |

## M5 — Social & guilds
| Branch | | Done when |
|--------|--|-----------|
| `feat/friends` | 🟡 | Requests (accept/decline), presence, friend profiles, suggested; notifications on request. |
| `feat/dm-chat` | 🟡 | 1:1 chat, unread badges (nav + mobile nav), message sound; `lastReadAt` tracking. |
| `feat/guilds` | 🟡 | Browse/create (free), roster + online status, roles & permissions, join-request inbox, editable guild w/ description + min-trophy gate. |
| `feat/guild-chat-contrib` | 🟡 | Guild chat + weekly points/contributions leaderboard. |

## M6 — Economy surfaces & progression
| Branch | | Done when |
|--------|--|-----------|
| `feat/store` | 🟡 | Catalog (boards/skins/avatars/frames/emotes/bundles), item preview + skin preview animation, cart, checkout; Gold + Diamond pricing; purchase = atomic spend + grant + order. |
| `feat/payments` | 🔴 | Stripe checkout for diamond packs; **webhook is the only diamond credit path**; test-mode payment credits correctly; refund path. |
| `feat/inventory-orders` | 🟢 | Owned cosmetics + equip; order history. |
| `feat/quests` | 🟡 | Daily + seasonal quests, progress tracking from match results, claim = atomic gold grant. |
| `feat/season-pass` | 🟡 | Tiered track, XP from play, free + premium rewards, buy pass with diamonds. |
| `feat/leaderboard` | 🟢 | Global/friends/guild scopes, rank tiers, podium (taller #1) per prototype. |

## M7 — Content, profile depth, polish
| Branch | | Done when |
|--------|--|-----------|
| `feat/profile` | 🟡 | Overview, editable profile (persisted), stats, trophy history, rank tiers. |
| `feat/match-history-replay` | 🟡 | History list w/ filters + full replay (step/auto/speed/jump/flip) reconstructed from `moves` via engine. |
| `feat/notifications-center` | 🟡 | Bell dropdown grouped Today/Earlier, inline friend-request actions, mark-all-read, live `notif:new`. |
| `feat/learn` | 🟢 | Interactive step-by-step tutorials on a mini-board (setup, movement, capture, promotion, king, strategy); completion persisted. |
| `feat/settings` | 🟢 | Audio/gameplay toggles, Delete Account (typed confirm → soft-delete), GDPR export, legal pages. |
| `feat/pwa-polish` | 🟢 | Installable PWA, offline shell, Lighthouse mobile ≥90, no console errors, e2e smoke of the golden path. |

---

## Golden-path e2e (must pass before first production promotion)
1. Register → verify → land on Home.
2. Buy a diamond pack (Stripe test) → diamonds credited via webhook only.
3. Buy a Gold board theme → equipped → renders in game.
4. Queue ranked → match a second browser → play a full legal game → correct winner, trophy + gold deltas, and a Match row.
5. Open Profile → Match History → replay that game move-for-move.
6. Create guild (free) → invite a friend → guild chat message delivered with unread badge.

## Cross-cutting acceptance (every PR)
- Matches the prototype visually on desktop + mobile.
- No dead buttons/links; no client-trusted currency or outcomes.
- Typecheck + lint + relevant tests green.
