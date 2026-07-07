# ARCHITECTURE.md — Stack, Structure & Deployment

## Tech stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Frontend | **React 18 + TypeScript + Vite** | PWA-installable, mobile-first |
| Styling | **Tailwind CSS** + CSS variables for theme tokens | Tokens mirror `DESIGN_SYSTEM.md` |
| Client state | **Zustand** | Lightweight; one store per domain (auth, game, economy, social) |
| Routing | **React Router v6** | |
| Realtime | **Socket.IO client** | Match, room, chat, presence |
| Backend | **Node 20 + TypeScript + Fastify** | REST + Socket.IO server |
| ORM | **Prisma** | Schema in `DATABASE_SCHEMA.md` |
| Primary DB | **PostgreSQL 16** | Source of truth for all persistent data |
| Cache/RT | **Redis 7** | Matchmaking queue, presence, socket pub/sub (adapter), rate limits |
| Auth | **JWT** (access + refresh, httpOnly cookies) + OAuth (Google/Facebook) + guest | |
| Payments | **Stripe** (or PayMongo/GCash for PH) | Diamonds credited via verified webhook only |
| File storage | **S3 / Cloudflare R2** | User avatars + any user uploads; static cosmetics ship with the app |
| Validation | **Zod** | Shared schemas in `packages/shared` |
| Testing | **Vitest** (unit) + **Playwright** (e2e) | Rules engine coverage is mandatory |
| Container | **Docker + docker-compose** | Local Postgres + Redis; app images for deploy |
| Hosting | **Fly.io / Render / Railway** | Web static + Node service + managed PG + Redis |
| CI | **GitHub Actions** | lint, typecheck, test, build on every PR |

> Any substitution is allowed only if documented in the PR description with justification. Do NOT swap the server-authoritative model or the payment-verification model.

## Monorepo layout (pnpm workspaces + Turborepo)

```
filipinodama-royal/
├─ handoff/                     # this docs folder — keep it in the repo
├─ apps/
│  ├─ web/                      # React + Vite client
│  │  ├─ public/
│  │  │  └─ assets/             # ALL images from ASSETS.md land here (pieces, boards, avatars, frames, icons)
│  │  ├─ src/
│  │  │  ├─ main.tsx
│  │  │  ├─ App.tsx             # router + theme provider
│  │  │  ├─ theme/              # tokens.css (from DESIGN_SYSTEM.md), tailwind preset
│  │  │  ├─ lib/                # api client, socket client, hooks, formatters
│  │  │  ├─ stores/             # zustand: auth, game, economy, social, notifications
│  │  │  ├─ components/         # shared UI: Frame, Button, Pill, Avatar, RankBadge, Board, Piece …
│  │  │  ├─ features/           # one folder per domain, each with its screens + components
│  │  │  │  ├─ auth/            # login, signup, verify, reset, guest
│  │  │  │  ├─ home/
│  │  │  │  ├─ play/            # PlayHub, AiSetup, Game (board), local match
│  │  │  │  ├─ matchmaking/
│  │  │  │  ├─ rooms/           # create/join, lobby, host controls, chat, spectate
│  │  │  │  ├─ spectate/
│  │  │  │  ├─ leaderboard/
│  │  │  │  ├─ learn/           # lessons list + interactive tutorial player
│  │  │  │  ├─ store/           # catalog, cart, checkout, item preview
│  │  │  │  ├─ profile/         # overview, edit, stats, trophy history, match history + replay
│  │  │  │  ├─ friends/         # list, requests, chat, friend profile
│  │  │  │  ├─ guilds/          # browse, my guild, roster, roles, join-requests, chat, edit
│  │  │  │  ├─ quests/          # daily + seasonal achievements
│  │  │  │  ├─ season/          # season pass track
│  │  │  │  ├─ notifications/   # bell dropdown center
│  │  │  │  ├─ inventory/       # owned cosmetics + equip
│  │  │  │  ├─ orders/          # purchase history
│  │  │  │  └─ settings/        # settings, delete account, legal
│  │  │  └─ index.css
│  │  └─ vite.config.ts
│  └─ server/                   # Fastify + Socket.IO
│     ├─ src/
│     │  ├─ index.ts            # bootstrap: http + socket + plugins
│     │  ├─ config/             # env loader (zod-validated), constants
│     │  ├─ db/                 # prisma client, seed.ts
│     │  ├─ redis/              # client, presence, matchmaking queue, pubsub adapter
│     │  ├─ auth/               # jwt, oauth, guards, session
│     │  ├─ modules/            # feature modules: routes + services + socket handlers
│     │  │  ├─ users/  economy/  matches/  matchmaking/  rooms/  chat/
│     │  │  ├─ friends/  guilds/  store/  payments/  quests/  seasons/
│     │  │  ├─ notifications/  leaderboard/  replays/  ai/
│     │  ├─ realtime/           # socket namespace + room orchestration, tick loop
│     │  ├─ economy/            # ledger service (atomic grant/spend), rating (elo/glicko)
│     │  ├─ payments/           # stripe service + webhook verification
│     │  └─ lib/                # logger, errors, rate-limit, validators
│     └─ prisma/
│        ├─ schema.prisma       # from DATABASE_SCHEMA.md
│        └─ migrations/
├─ packages/
│  ├─ shared/                   # TS types, zod schemas, socket event names, enums, constants
│  └─ game-engine/              # PURE, framework-free Filipino Dama rules engine + AI
│     ├─ src/
│     │  ├─ board.ts  moves.ts  captures.ts  promotion.ts  outcome.ts  ai.ts  index.ts
│     └─ test/                  # exhaustive Vitest suite (see GAME_RULES.md)
├─ docker-compose.yml           # postgres + redis for local dev
├─ .github/workflows/ci.yml
├─ .env.example
├─ turbo.json
├─ pnpm-workspace.yaml
└─ README.md
```

### Why `packages/game-engine` is isolated
The engine is **pure TypeScript with zero dependencies on Fastify, Prisma, or React.** The server imports it to validate/apply moves and to run the AI; the client imports it only for optimistic UI hints and local (offline) AI play. Because it's pure, it is trivially and exhaustively unit-testable — which is required.

## Environment variables (`.env.example`)

```
# server
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://dama:dama@localhost:5432/dama
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=change-me
JWT_REFRESH_SECRET=change-me
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d
CORS_ORIGIN=http://localhost:5173

# oauth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
FACEBOOK_CLIENT_ID=
FACEBOOK_CLIENT_SECRET=
OAUTH_CALLBACK_BASE=http://localhost:4000

# payments
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PUBLISHABLE_KEY=   # exposed to web build

# storage
S3_ENDPOINT=
S3_BUCKET=dama-uploads
S3_ACCESS_KEY=
S3_SECRET_KEY=

# email (verification / reset)
SMTP_URL=
EMAIL_FROM="FilipinoDama Royal <no-reply@filipinodama.gg>"

# web (VITE_ prefixed — safe to expose)
VITE_API_URL=http://localhost:4000
VITE_SOCKET_URL=http://localhost:4000
VITE_STRIPE_PUBLISHABLE_KEY=
```

## Local dev

```bash
pnpm install
docker-compose up -d            # postgres + redis
pnpm --filter server prisma migrate dev
pnpm --filter server prisma db seed
pnpm dev                        # turbo runs web (5173) + server (4000)
```

## Deployment topology (production)

- **web** → static build served from CDN (Fly/Render static site or Cloudflare Pages).
- **server** → single Node service (scale horizontally; Socket.IO uses the **Redis adapter** so multiple instances share rooms/presence).
- **Postgres** + **Redis** → managed instances.
- Migrations run on deploy (`prisma migrate deploy`).
- Stripe webhook endpoint publicly reachable at `/api/payments/webhook` (raw body, signature-verified).
- Promotion to production happens only when `main` is updated — see `GIT_WORKFLOW.md`.
