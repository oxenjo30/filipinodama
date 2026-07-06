# FilipinoDama Royal — Scaffold

This is a **runnable starter** for the production build described in the sibling docs (`../BUILD_PROMPT.md`, `../ARCHITECTURE.md`, etc.). It boots empty but wired: monorepo, DB, a real (tested) game engine, shared types, and a themed web shell. The AI agent fleshes out each feature per `../ROADMAP.md`.

## What's already here

```
scaffold/
├─ package.json, pnpm-workspace.yaml, turbo.json   # monorepo
├─ docker-compose.yml                              # postgres + redis
├─ .env.example                                    # copy → .env
├─ .github/workflows/ci.yml                        # lint/typecheck/test/build + e2e
├─ packages/
│  ├─ shared/         # ✅ types, enums, socket event names, zod DTOs, rank tiers, constants
│  └─ game-engine/    # ✅ WORKING Filipino Dama engine (moves, mandatory+maximal capture,
│  │                  #    flying kings, promotion, outcomes) + AI (minimax) + Vitest suite
├─ apps/
│  ├─ server/         # Fastify + Socket.IO boot, prisma schema (full), seed, economy ledger
│  └─ web/            # React + Vite + Tailwind + PWA, theme tokens (verbatim), router skeleton
```

✅ = real, functioning code. Everything else is a stub with TODOs pointing at the roadmap.

## Run it

```bash
cp .env.example .env
pnpm install
docker-compose up -d
pnpm --filter server prisma migrate dev --name init
pnpm --filter server prisma db seed
pnpm test          # game-engine suite should pass
pnpm dev           # web :5173  ·  server :4000
```

## First branches (see ../ROADMAP.md)

1. `chore/scaffold` — make everything above install + boot + CI-green on your remote.
2. `feat/game-engine` — extend the engine's edge cases + finish the full test matrix in `../GAME_RULES.md`.
3. `feat/db-schema` → `feat/auth` → `feat/app-shell` → gameplay …

## Wiring notes baked into the stubs

- **Server-authoritative:** `apps/server/src/realtime/index.ts` shows the `match:move` validation pattern using `@dama/game-engine`. Never trust client moves/outcomes.
- **Economy:** `apps/server/src/economy/ledger.ts` is the ONLY way to change a balance — atomic transaction + append-only `LedgerEntry`. `purchaseItem()` shows the spend+grant pattern.
- **Diamonds:** credit them ONLY from the Stripe webhook (`modules/payments`, to be built) — never from a client call.
- **Assets:** copy the files in `../assets/` into `apps/web/public/assets/` (see `../ASSETS.md`).
- **Theme:** `apps/web/src/theme/tokens.css` + `tailwind.config.ts` are the exact prototype tokens — build screens against them to match `../FilipinoDama Royal.dc.html`.

## The rule
One feature = one `feat/*` branch → tested on `dev` → merged → `dev` promoted to `main` for production. Full details in `../GIT_WORKFLOW.md`.
