# FilipinoDama Royal — Production Build Design

**Date:** 2026-07-07
**Status:** Approved by owner (all sections)
**Supersedes:** the client-only prototype in this repo (preserved on branch `legacy/prototype`)

## 1. Summary

Replace the existing client-only FilipinoDama prototype with **FilipinoDama Royal**, the full
production, real-time multiplayer web game specified in [`handoff/`](../../../handoff/README.md).
The handoff folder is the authoritative spec set; this document records only the decisions,
divergences, and migration mechanics that the handoff leaves open.

The visual + UX source of truth is `handoff/FilipinoDama Royal.dc.html`. Rules source of truth is
`handoff/GAME_RULES.md`. Where they disagree: prototype wins for visuals/UX, GAME_RULES.md wins
for rules.

## 2. Decisions made (owner-confirmed)

| Decision | Choice |
|---|---|
| Local dev databases | **Docker Desktop** (owner installs) + handoff `docker-compose.yml` (Postgres 16 + Redis 7) |
| Production hosting | **Railway** — web static + Node server service + managed Postgres + managed Redis (see environment model below) |
| Environment model | **Two environments: Local + Production** (owner-confirmed divergence from `DEPLOYMENT.md` §1's three-tier model). `dev` remains an **integration branch** whose CI runs lint/typecheck/test/build but has **no deployed staging tier** — integration QA is done locally against docker-compose. Production Railway auto-deploys on merge to `main`. A managed staging tier can be added later without changing the branch model. |
| Object storage | **Cloudflare R2** (S3-compatible) for user avatar uploads — Railway has no managed S3. Reuses the handoff's existing `S3_ENDPOINT` / `S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` env contract unchanged; provisioned per-environment (a local bucket or MinIO for dev, an R2 bucket for prod). |
| Git remote | Existing empty private repo **`github.com/oxenjo30/filipinodama`** |
| Payments provider | **PayMongo** (GCash / Maya / cards) — replaces the handoff's Stripe default (details §5.1) |
| Transactional email | **Resend** — replaces raw `SMTP_URL` for verification/reset emails (details §5.2) |
| Build approach | **Scaffold + port engine**: monorepo from `handoff/scaffold/`; port the existing proven rules engine into `packages/game-engine` |

> **Post-launch systems** (`handoff/ADMIN_DASHBOARD.md` admin console, `handoff/ANTI_CHEAT.md` fair-play) are explicitly **out of scope** for the M1–M7 launch build, per the handoff's own "post-launch" framing. **Observability** (Sentry on web + server, structured Fastify logs to Railway's log drain, managed daily Postgres backups + a tested restore) is **in scope** and lands with `feat/pwa-polish` / the first production promotion, per `DEPLOYMENT.md` §9.

## 3. Migration & repo strategy

1. `git init` in the project root; remote = `oxenjo30/filipinodama`.
2. **First, write `.gitignore`** excluding `node_modules/`, `dist/`, `.env*` (keep `.env.example`),
   and the 98 MB `FilipinoDama Web Game Design.zip` — this must happen **before** the legacy
   commit so the zip never enters git history. (Done: the ignore and the legacy commit landed
   together in `2fa2dea`; the zip is confirmed untracked.)
3. **Before any deletion**, commit the current workspace as-is to branch **`legacy/prototype`**
   and push it. The old app is preserved forever there.
4. Create `main` (production) and `dev` (integration) branches off the legacy snapshot; enable
   branch protection (require green CI) on both. All feature work happens on `feat/<name>`
   branches off `dev`, per `handoff/GIT_WORKFLOW.md`.
5. Restructure the root into the handoff monorepo (pnpm workspaces + Turborepo):
   `apps/web`, `apps/server`, `packages/shared`, `packages/game-engine`, seeded from
   `handoff/scaffold/`. The scaffold's own configs (`.github/workflows/ci.yml`, `.gitignore`,
   `.env.example`, `pnpm-workspace.yaml`, `turbo.json`) become the root configs; the old
   single-app root configs (`package.json`, `tsconfig*.json`, `vite.config.ts`, `.oxlintrc.json`,
   `index.html`) are **removed** in the same `chore/scaffold` branch so the root is a clean
   monorepo, not a hybrid.
6. `handoff/` remains committed in the repo (docs + prototype + asset originals).
7. Old prototype files (`src/`, `index.html`, old Vite/TS configs, `package.json`,
   `scripts/`, `public/`) are deleted from `dev`/`main` only after the engine port is complete
   and its tests are green.
8. Game art is optimized (webp where possible) into `apps/web/public/assets/` per
   `handoff/ASSETS.md`; originals stay in `handoff/assets/`.
9. Toolchain: **Node 20 LTS** (pinned in CI and `package.json` `engines`, per
   `handoff/ARCHITECTURE.md` + `DEPLOYMENT.md` — the local machine has Node 24, so the build
   runs against an nvm-selected / Volta-pinned Node 20 to match CI and Railway; do not assume 24)
   · pnpm 9 via corepack · Docker Desktop (owner installs — build pauses at the first step that
   needs it, with exact instructions).

## 4. Architecture

Exactly as `handoff/ARCHITECTURE.md` specifies — React + TypeScript + Vite + Tailwind + Zustand +
React Router + Socket.IO client (mobile-first, installable PWA) · Node 20+ + Fastify + Socket.IO
(Redis adapter) · PostgreSQL 16 + Prisma · Redis 7 · JWT access/refresh in httpOnly cookies +
Google/Facebook OAuth + guest · Zod validation everywhere via `packages/shared` · Vitest +
Playwright. Non-negotiables inherited from the handoff:

- **Server-authoritative gameplay** — the client sends intents; the server validates against
  `packages/game-engine`, persists, and broadcasts. Client engine copy is for optimistic hints
  and offline AI only.
- **Ledger-based economy** — every trophy/gold/diamond change is an atomic DB transaction in an
  append-only ledger. No client-trusted balances or outcomes, ever.
- **Webhook-only diamond crediting** (see §5.1).

### 4.1 Engine port

The existing prototype engine (`src/game/` on `legacy/prototype`) already implements the hard
parts correctly (28 `it` blocks across 10 suites): complete-turn-sequence move generation
(illegal moves unrepresentable), mandatory capture, the maximum-capture rule with free choice
between tied routes, backward captures for men, flying kings, end-of-turn-only promotion, win by
elimination or blockade. It is ported into `packages/game-engine`, adapted to the scaffold's
public API, kept **pure, dependency-free, and serializable**, and extended until the **entire
`GAME_RULES.md` test matrix is green**, including deterministic replay. Coverage gate per
`handoff/TEST_STRATEGY.md` §3: **100% line / 95% branch** on the engine (non-negotiable, CI-enforced).

> Scope note: the legacy suite's 28 tests are a strong *starting* base but are **not** equivalent
> to the full `GAME_RULES.md` matrix (e.g. its explicit edge-case table + deterministic-replay
> requirement). The port is expected to *add* tests to reach the mandated coverage — treat the
> legacy suite as a proven foundation to extend, not as already-complete matrix coverage.

### 4.2 Visual constraints

Reproduce the `.dc.html` prototype 1:1 on desktop and mobile using the `DESIGN_SYSTEM.md` tokens
(already in `scaffold/apps/web/src/theme/tokens.css`). Standing owner rule: **opaque faction
portraits always render inside masked circular tokens/avatars — never as raw rectangles.**

## 5. Divergences from the handoff (documented per its substitution rule)

### 5.1 PayMongo replaces Stripe

- Diamond-pack checkout uses **PayMongo Checkout Sessions** (GCash, Maya, cards). Checkout is a
  server-created session returning a hosted redirect `url`; there is **no browser-side key**, so
  the web app has no PayMongo publishable key and the `@stripe/stripe-js` dependency is dropped.
- **Core invariant unchanged:** diamonds are credited exclusively by a **signature-verified
  PayMongo webhook** (`Paymongo-Signature` HMAC over the raw request body) at
  `/api/payments/webhook`. No REST or socket path may mint currency.
- **Authoritative crediting event (avoids double-credit):** a single successful PayMongo checkout
  emits **two** distinct events with **different event ids** — `checkout_session.payment.paid`
  **and** `payment.paid`. Crediting must fire on **exactly one** of them: we use
  **`checkout_session.payment.paid`** as the sole crediting event and ignore `payment.paid` for
  crediting. Idempotency key = the PayMongo **event id** stored on the ledger's `providerRef`;
  a replay of the same event credits zero times.
- **Refunds:** the `payment.refunded` event reverses the ledger grant (there is no
  `charge.refunded` in PayMongo).
- **Event-name mapping (supersedes `DEPLOYMENT.md` §6/§10 and `API_SPEC.md`, which name Stripe events):**

  | Purpose | Stripe (handoff) | PayMongo (this build) |
  |---|---|---|
  | Credit diamonds | `checkout.session.completed` | **`checkout_session.payment.paid`** (sole crediting event) |
  | (ignored duplicate) | `payment_intent.succeeded` | `payment.paid` — **not** used for crediting |
  | Refund | `charge.refunded` | `payment.refunded` |

- **Amounts are PHP centavos.** Packs price in ₱; PayMongo bills in centavos (₱100 = `10000`).
  The `Payment.currencyCode` default in the ported Prisma schema changes from `"usd"` to
  **`"php"`**, and `amountCents` holds centavos — so ledger/order records reconcile correctly.
- **Env vars (§7):** add `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET`, `PAYMONGO_PUBLIC_KEY`;
  **remove** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`, and
  `VITE_STRIPE_PUBLISHABLE_KEY` from `.env.example` + `ARCHITECTURE.md`. `DEPLOYMENT.md` §5's
  "only the Stripe publishable key goes behind `VITE_`" note no longer applies (no public
  payment key exists).
- Everything else in `API_SPEC.md` (endpoints `POST /api/payments/checkout`,
  `POST /api/payments/webhook`, `GET /api/payments/packs`) stands, adapted to the above.

### 5.2 Resend replaces raw SMTP

Verification and password-reset emails send through Resend. Env: add `RESEND_API_KEY`; keep
`EMAIL_FROM`; **remove** `SMTP_URL` from `.env.example` + `ARCHITECTURE.md`.

**Sending-domain verification is a hard prerequisite.** `EMAIL_FROM` is
`no-reply@filipinodama.gg` — a custom domain. Resend **refuses to send from an unverified
domain**, so until the `filipinodama.gg` domain is added in the Resend dashboard and its
**SPF + DKIM DNS records are published**, all verification and reset email silently fails (dev
*and* prod). This blocks the `feat/auth` register→verify flow. Added to §7 (M2) and the
pre-launch checklist. All other auth behavior per spec.

## 6. Execution model

Follow `handoff/ROADMAP.md` strictly in order (M1 Foundation → M7 Polish, ~30 feature branches).
One feature = one branch = one PR into `dev`; squash-merge; Conventional Commits; GitHub Actions
CI (lint, typecheck, test, build) gates every merge; milestone promotions are release PRs
`dev` → `main`.

**Deploy wiring:** the scaffold ships only `ci.yml`. Production deploy on merge to `main` uses
**Railway's native GitHub integration** watching `main` (simpler than the handoff's example
`deploy.yml`, which targets Fly/Cloudflare and does not exist yet). `prisma migrate deploy` runs
as Railway's pre-deploy/release command against prod Postgres **before** the new server serves
traffic (`DEPLOYMENT.md` §4/§8). Since there is no deployed `dev`/staging tier (§2), no
`deploy.yml` for a staging environment is created; if a staging tier is added later, it becomes a
second Railway environment watching `dev`.

Testing per `handoff/TEST_STRATEGY.md` §3: engine **100% line / 95% branch** · `economy` (ledger,
rating) and `modules/payments` **95%** — with explicit concurrency (no negative balances under
parallel spends) and idempotency (replayed webhook credits once) tests · the six golden-path
Playwright e2e flows green before the first production promotion.

## 7. Secrets & owner-provided credentials

No secret ever enters git. Local: `.env` (from `.env.example`). Production: Railway variables.

| Needed at | Credential |
|---|---|
| M1 (first run) | Docker Desktop installed |
| M2 `feat/auth` | **Resend API key** · **`filipinodama.gg` verified in Resend with SPF+DKIM DNS published** (email fails without it — see §5.2) · Google OAuth client id/secret · Facebook app id/secret |
| M6 `feat/payments` | `PAYMONGO_SECRET_KEY` + `PAYMONGO_WEBHOOK_SECRET` (+ `PAYMONGO_PUBLIC_KEY`), test then live; webhook endpoint registered in the PayMongo dashboard → `/api/payments/webhook` |
| M7 `feat/profile` | **Cloudflare R2** bucket + access key/secret + endpoint (avatar uploads; fills the `S3_*` env contract) |
| First prod promotion | Railway project + deploy token · production domain `filipinodama.gg` (web) + `api.filipinodama.gg` (server) · Sentry DSN (web + server) |

OAuth buttons render per the prototype from day one; until real OAuth creds are supplied the
providers are disabled server-side with a clear "not configured" response — never a dead button.

## 8. Definition of done (whole build)

Inherited verbatim from `handoff/BUILD_PROMPT.md`:

- Every prototype screen exists and matches visually, desktop + mobile.
- Every button, link, tab, and panel wired to real behavior — no dead controls, no mocked balances.
- Two real browsers can matchmake, play a full legal ranked game in real time, and both see the
  correct server-decided result and currency changes.
- A PayMongo test-mode payment credits diamonds via webhook, and nothing else can.
- Engine + economy + payment suites green; no console errors; Lighthouse mobile ≥ 90;
  installable PWA.
- From a clean clone: `docker-compose up`, migrations, seed, `pnpm dev` all work.
