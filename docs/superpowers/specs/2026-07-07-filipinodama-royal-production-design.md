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
| Production hosting | **Railway** — web static + Node server service + managed Postgres + managed Redis, auto-deploy from `main` |
| Git remote | Existing empty private repo **`github.com/oxenjo30/filipinodama`** |
| Payments provider | **PayMongo** (GCash / Maya / cards) — replaces the handoff's Stripe default |
| Transactional email | **Resend** — replaces raw `SMTP_URL` for verification/reset emails |
| Build approach | **Scaffold + port engine**: monorepo from `handoff/scaffold/`; port the existing proven rules engine into `packages/game-engine` |

## 3. Migration & repo strategy

1. `git init` in the project root; remote = `oxenjo30/filipinodama`.
2. **Before any deletion**, commit the current workspace as-is to branch **`legacy/prototype`**
   and push it. The old app is preserved forever there.
3. Create `main` (production) and `dev` (integration). All feature work happens on
   `feat/<name>` branches off `dev`, per `handoff/GIT_WORKFLOW.md`.
4. Restructure the root into the handoff monorepo (pnpm workspaces + Turborepo):
   `apps/web`, `apps/server`, `packages/shared`, `packages/game-engine`, seeded from
   `handoff/scaffold/`.
5. `handoff/` remains committed in the repo (docs + prototype + asset originals).
   **Never committed:** `node_modules/`, `dist/`, and `FilipinoDama Web Game Design.zip`
   (98 MB — stays local only; added to `.gitignore`).
6. Old prototype files (`src/`, `index.html`, old Vite/TS configs, `package.json`,
   `scripts/`, `public/`) are deleted from `dev`/`main` only after the engine port is complete
   and its tests are green.
7. Game art is optimized (webp where possible) into `apps/web/public/assets/` per
   `handoff/ASSETS.md`; originals stay in `handoff/assets/`.
8. Toolchain: Node 24 (present) · pnpm via corepack · Docker Desktop (owner installs — build
   pauses at the first step that needs it, with exact instructions).

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
parts correctly with 26 passing tests: complete-turn-sequence move generation (illegal moves
unrepresentable), mandatory capture, the maximum-capture rule with free choice between tied
routes, backward captures for men, flying kings, end-of-turn-only promotion, win by elimination
or blockade. It is ported into `packages/game-engine`, adapted to the scaffold's public API,
kept **pure, dependency-free, and serializable**, and extended until the **entire
`GAME_RULES.md` test matrix is green**, including deterministic replay. Coverage gate: 100%
statements on the engine per `handoff/TEST_STRATEGY.md`.

### 4.2 Visual constraints

Reproduce the `.dc.html` prototype 1:1 on desktop and mobile using the `DESIGN_SYSTEM.md` tokens
(already in `scaffold/apps/web/src/theme/tokens.css`). Standing owner rule: **opaque faction
portraits always render inside masked circular tokens/avatars — never as raw rectangles.**

## 5. Divergences from the handoff (documented per its substitution rule)

### 5.1 PayMongo replaces Stripe

- Diamond-pack checkout uses **PayMongo Checkout Sessions** (GCash, Maya, cards).
- The handoff's core invariant is **unchanged**: diamonds are credited exclusively by a
  **signature-verified PayMongo webhook** (`Paymongo-Signature` HMAC, raw-body verification) at
  `/api/payments/webhook`. No REST or socket path may mint currency. Replays credit once
  (idempotency keyed on PayMongo event id). Refund path via PayMongo Refunds API reverses the
  ledger grant.
- `API_SPEC.md` payment endpoints are adapted accordingly; everything else in the spec stands.

### 5.2 Resend replaces raw SMTP

Verification and password-reset emails send through Resend. Env: `RESEND_API_KEY` +
`EMAIL_FROM`. All other auth behavior per spec.

## 6. Execution model

Follow `handoff/ROADMAP.md` strictly in order (M1 Foundation → M7 Polish, ~30 feature branches).
One feature = one branch = one PR into `dev`; squash-merge; Conventional Commits; GitHub Actions
CI (lint, typecheck, test, build) gates every merge; milestone promotions are release PRs
`dev` → `main` which trigger the Railway production deploy + `prisma migrate deploy`.

Testing per `handoff/TEST_STRATEGY.md`: engine matrix 100% · ledger + payment logic ≥95% with
explicit concurrency (no negative balances under parallel spends) and idempotency (replayed
webhook credits once) tests · the six golden-path Playwright e2e flows green before the first
production promotion.

## 7. Secrets & owner-provided credentials

No secret ever enters git. Local: `.env` (from `.env.example`). Production: Railway variables.

| Needed at | Credential |
|---|---|
| M1 (first run) | Docker Desktop installed |
| M2 `feat/auth` | Resend API key · Google OAuth client id/secret · Facebook app id/secret |
| M6 `feat/payments` | PayMongo test (then live) secret + webhook signing keys |
| First prod promotion | Railway project + tokens, production domain |

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
