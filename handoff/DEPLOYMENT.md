# DEPLOYMENT.md — Environments, CI/CD & Production Deploy

How FilipinoDama Royal goes from a feature branch to production. Pairs with `GIT_WORKFLOW.md` (branch model) and `ARCHITECTURE.md` (topology).

---

## 1. Environments

| Env | Branch | Purpose | Data | Stripe |
|-----|--------|---------|------|--------|
| **Local** | `feat/*` | development on your machine | docker-compose PG+Redis | test keys |
| **Dev / Staging** | `dev` | integration + QA before prod | managed dev PG+Redis | test keys |
| **Production** | `main` | live users | managed prod PG+Redis | **live keys** |

Each env has its **own** database, Redis, secrets, S3 bucket, OAuth app credentials, and Stripe account/keys. Nothing is shared between dev and prod.

Recommended hostnames:
- Dev: `dev.filipinodama.gg` (web) · `api.dev.filipinodama.gg` (server)
- Prod: `filipinodama.gg` (web) · `api.filipinodama.gg` (server)

---

## 2. What runs in production

Three long-lived pieces + two managed services (see `ARCHITECTURE.md`):

1. **web** — static build (`apps/web` → `dist/`), served from a CDN / static host.
2. **server** — Node service (`apps/server`), REST + Socket.IO. **Scale horizontally**; all instances share state through the **Redis adapter** (see §7).
3. **Postgres** (managed) — source of truth.
4. **Redis** (managed) — matchmaking queue, presence, socket pub/sub, rate limits.
5. **Object storage** (S3/R2) — user avatar uploads.

---

## 3. Build commands

```bash
# web  → static assets in apps/web/dist
pnpm --filter web build

# server → apps/server/dist (Node ESM)
pnpm --filter server build
pnpm --filter server prisma generate   # runs in postinstall too
```

Container images (one per app) or a platform buildpack both work. Node 20+, pnpm 9.

---

## 4. Database migrations (critical order)

Migrations are created in dev and **applied on deploy** — never edited by hand in prod.

```bash
# during development (creates a migration file, applies to dev DB)
pnpm --filter server prisma migrate dev --name add_guild_min_trophies

# on deploy (applies pending migrations, no prompts) — runs in the release step
pnpm --filter server prisma migrate deploy
```

Rules:
- `migrate deploy` runs **before** the new server image starts serving traffic.
- Keep migrations **backward-compatible** for zero-downtime: expand → deploy → contract. Add columns/tables first, ship code that writes both old+new if needed, then remove old columns in a later migration.
- Seed data (`prisma db seed`) is run **once** per fresh environment, not on every deploy. Store catalog / quest / season updates go through idempotent `upsert` seeds or an admin migration, not a destructive reseed.

---

## 5. Secrets & config

- No secrets in the repo. `.env.example` is the contract; real values live in each platform's secret store, scoped per environment.
- Rotate `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` carefully (rotating refresh secret invalidates all sessions — acceptable during a maintenance window).
- `VITE_*` vars are **baked into the web build** and are public by design — never put a secret behind a `VITE_` prefix. Only the Stripe *publishable* key goes there.
- OAuth: register separate Google/Facebook apps for dev and prod with the correct callback URLs (`OAUTH_CALLBACK_BASE`).

---

## 6. Stripe payments (production)

1. Use **live** `STRIPE_SECRET_KEY` + `STRIPE_PUBLISHABLE_KEY` in prod.
2. Create a webhook endpoint in the Stripe dashboard pointing at `https://api.filipinodama.gg/api/payments/webhook` for events: `checkout.session.completed`, `payment_intent.succeeded`, `charge.refunded`.
3. Put the endpoint's signing secret in `STRIPE_WEBHOOK_SECRET`.
4. The webhook route must read the **raw request body** and verify the signature before trusting anything. **Diamonds are credited ONLY inside this verified handler** (via the ledger). No client call ever grants diamonds.
5. Make the handler **idempotent** — key on the Stripe event id / `providerRef` so retried webhooks don't double-credit.
6. Test locally with the Stripe CLI: `stripe listen --forward-to localhost:4000/api/payments/webhook`.

---

## 7. Scaling & realtime

- Run **2+ server instances** behind a load balancer with **sticky sessions** (Socket.IO polling fallback needs affinity) OR force WebSocket-only transport.
- Attach the Redis adapter so broadcasts (match moves, chat, presence) reach clients on any instance:
  ```ts
  import { createAdapter } from "@socket.io/redis-adapter";
  const pub = new Redis(process.env.REDIS_URL!);
  const sub = pub.duplicate();
  io.adapter(createAdapter(pub, sub));
  ```
- Live match state lives in Redis (`match:<id>:state`) so any instance can serve a reconnecting player; it is persisted to Postgres at match start, on end, and periodically.
- Set connection/room limits and per-user rate limits (chat, moves) to protect instances.

---

## 8. Release: dev → production

Promotion happens by merging `dev` → `main` (see `GIT_WORKFLOW.md`). On push to `main`, the deploy pipeline:

1. Runs full CI (lint, typecheck, **game-engine + payment tests**, build, e2e).
2. Builds web + server artifacts/images.
3. Runs `prisma migrate deploy` against **prod** Postgres.
4. Rolls out the new server instances (health-checked), then publishes the web build to the CDN.
5. Tags the release: `git tag vX.Y.Z && git push --tags`.

### Example GitHub Actions deploy job (add to `.github/workflows/deploy.yml`)
```yaml
name: Deploy
on:
  push:
    branches: [dev, main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: ${{ github.ref_name == 'main' && 'production' || 'dev' }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter server prisma migrate deploy
        env: { DATABASE_URL: ${{ secrets.DATABASE_URL }} }
      - run: pnpm build
      # platform-specific publish steps, e.g.:
      # - run: flyctl deploy --config apps/server/fly.toml
      # - run: npx wrangler pages deploy apps/web/dist
        env: { FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }} }
```
> `environment:` maps to a GitHub Environment holding that env's secrets, so the same workflow deploys dev on `dev` pushes and prod on `main` pushes with the right credentials.

---

## 9. Health, monitoring, backups

- **Health check:** `GET /health` (already in the scaffold) — wire it to the platform's health probe; fail deploy if it doesn't return `{ ok: true }`.
- **Logs:** Fastify structured logs → the platform log drain.
- **Errors:** add Sentry (or similar) to both web and server.
- **DB backups:** enable managed automated daily backups + point-in-time recovery on prod Postgres. Test a restore before launch.
- **Redis** is ephemeral by design — losing it drops queues/presence/live-match cache but not persisted data; live matches resync from the last Postgres snapshot.

---

## 10. Pre-launch checklist

- [ ] Golden-path e2e (in `ROADMAP.md`) green against a prod-like build.
- [ ] Live Stripe webhook verified end-to-end; a real test purchase credits diamonds exactly once.
- [ ] OAuth callback URLs registered for the prod domain.
- [ ] `robots.txt`, favicon, PWA manifest, and social/OG tags set.
- [ ] Rate limits + CORS locked to the prod web origin.
- [ ] DB backups + restore tested; Sentry receiving events.
- [ ] Legal pages (privacy, terms), Delete-Account, and GDPR export working.
- [ ] Secrets present in the prod environment; no `VITE_`-exposed secret.
- [ ] Load test the socket match loop with N concurrent games; confirm Redis adapter broadcasts across instances.
