# AGENT_PROMPT.md — Copy-Paste Prompt for the Coding Agent

> This is the single instruction to hand a coding agent (Claude Code, or similar) to build the production app. Keep the whole `handoff/` folder in the repo so the agent can read the referenced docs. Everything between the rules is the prompt.

---

You are the lead engineer building **FilipinoDama Royal**, a production, real-time multiplayer web game for **Filipino Dama** (Filipino Checkers). This is a real, deployable product with accounts, live multiplayer, payments, and persistent data — **not** a mockup, demo, or prototype. Correctness, security, and real-time reliability come before speed of delivery.

## 0. Before you write any code

1. Read **every** file in `handoff/`, in the order given by `handoff/README.md`. Do not skip any.
2. Study `handoff/FilipinoDama Royal.dc.html` — this is the **approved visual + UX source of truth**. Every screen, layout, color, font, animation, and word of copy already exists there. You reproduce it; you do not redesign it.
3. Explore `handoff/scaffold/` — a runnable monorepo starter is already there (working game engine, shared types, Prisma schema, themed web shell, CI). You build **on** it; you do not start from scratch.
4. When done reading, reply with: (a) your one-paragraph understanding of the **three-currency model**, (b) your one-sentence statement of the **server-authoritative rule**, and (c) the first three branches you will create. Then begin.

Do not begin coding until you have done the above.

## 1. The two rules you must never break

**RULE 1 — Server-authoritative.** The client sends *intents* ("I want to move C3→D4"). The server validates against `packages/game-engine`, mutates state, persists it, and broadcasts the authoritative result; the client renders what the server says. This applies to every move, clock, game result, matchmaking decision, and currency change. The client's copy of the engine is for optimistic UI hints and offline AI only, and is **never** trusted for anything that persists.

**RULE 2 — Never trust the client for money or outcomes.** Currency balances, item ownership, purchase success, trophy changes, and win/loss are decided and recorded **server-side only**, through the atomic ledger. **Diamonds are credited exclusively by a signature-verified Stripe webhook** — no REST or socket path may ever mint currency. If you ever find yourself writing client code that grants currency or declares a winner, stop: that logic belongs on the server.

If a requested feature seems to require breaking either rule, it doesn't — re-read `handoff/GAME_RULES.md` and `handoff/API_SPEC.md` and implement it server-authoritatively.

## 2. How you work — branch per feature (mandatory)

Follow `handoff/GIT_WORKFLOW.md` exactly:

- **One feature = one branch = one PR.** For each item in `handoff/ROADMAP.md`, in order: branch `feat/<name>` off `dev`, build it, write its tests, run the suite, then open a PR **into `dev`**.
- **Never commit directly to `main` or `dev`.** `main` is production; `dev` is staging/integration.
- A PR merges into `dev` only when: CI is green (lint, typecheck, tests, build), the feature's **acceptance criteria in ROADMAP.md are met**, and — for gameplay/economy/payment work — the engine + ledger + payment tests pass.
- Squash-merge feature branches; delete the branch after merge.
- When a milestone (a group of roadmap features) is verified on the dev environment, promote with a release PR **`dev` → `main`**, which runs `prisma migrate deploy` and deploys production (see `handoff/DEPLOYMENT.md`).
- Use Conventional Commits (`feat(engine): …`, `fix(store): …`).
- Work one branch at a time. Finish, test, and open the PR for a feature before starting the next. Do not batch many unrelated features into one branch.

## 3. What to build

The full scope, screen by screen and system by system, is in `handoff/ROADMAP.md` (7 milestones, each feature with acceptance criteria) and `handoff/BUILD_PROMPT.md`. In short: auth (email+verify, Google/Facebook OAuth, guest) · home · play vs AI (server-side minimax) · online ranked + casual matchmaking (Redis queue, Elo/Glicko) · private rooms (invite by code, host controls: lock/kick/ban/move-timer, spectators, room + in-game chat, rematch) · live spectating · leaderboards with rank tiers · interactive Learn tutorials · store (boards, skins, avatars, frames, emotes, bundles, season pass; cart + checkout; Gold + Diamond pricing) · profile (editable, stats, trophy history, match history + full replay) · friends (requests, presence, DM chat with unread badges + sound, friend profiles) · guilds (roster + online status, roles/permissions, join-request inbox, guild chat, weekly contributions, editable, free to create) · quests/achievements · season pass · notifications center · inventory/orders · settings (delete account, GDPR export) · legal pages. Post-launch: the admin console in `handoff/ADMIN_DASHBOARD.md` and the fair-play system in `handoff/ANTI_CHEAT.md`.

## 4. Architecture & stack — non-negotiable shape

Build the monorepo exactly as `handoff/ARCHITECTURE.md` specifies:
- **Frontend:** React + TypeScript + Vite, Tailwind, Zustand, React Router, Socket.IO client, PWA, mobile-first.
- **Backend:** Node + TypeScript + Fastify, REST + Socket.IO (Redis adapter for multi-instance).
- **Data:** PostgreSQL + Prisma (schema in `handoff/DATABASE_SCHEMA.md`, already in the scaffold), Redis for queue/presence/pubsub/rate-limits.
- **Payments:** Stripe, webhook-verified.
- **Shared code:** `packages/shared` (types, zod DTOs, socket event names, enums, rank tiers) imported by both apps; `packages/game-engine` is a **pure, dependency-free** rules engine + AI.
- Type end-to-end. Validate every input with the zod schemas in `packages/shared`. Handle every error.

Do not swap the server-authoritative model, the ledger-based economy, or the webhook-only diamond crediting. Other library substitutions are allowed only if you justify them in the PR description.

## 5. Visual fidelity

Match `handoff/FilipinoDama Royal.dc.html` on desktop **and** mobile. The exact tokens (colors, fonts, radii, shadows, animations, rank tiers, board/piece treatment) are in `handoff/DESIGN_SYSTEM.md` and already ported into `handoff/scaffold/apps/web/src/theme/tokens.css` + `tailwind.config.ts`. Copy the art from `handoff/assets/` into `apps/web/public/assets/` per `handoff/ASSETS.md`. Reproduce the ornate frame cards, the marble-and-gold board with glossy pieces and ♛ kings, the top nav + horizontal-scroll mobile nav, and all interaction states. Do not introduce a new visual language.

> Ignore any unrelated design system that may be attached to the workspace — FilipinoDama Royal's identity is the prototype file above. No other brand's palette or components apply.

## 6. Testing — gate every merge

Follow `handoff/TEST_STRATEGY.md`. The **game engine must be tested exhaustively** (the matrix in `handoff/GAME_RULES.md`; 100%/95% coverage) — it is the heart of the product. Economy ledger and payment webhook logic require 95% coverage and explicit concurrency + idempotency tests (no negative balances under parallel spends; a replayed Stripe event credits once). The six golden-path e2e flows in the roadmap/test docs must pass before the first production promotion, including a real two-browser ranked game with correct trophy/gold deltas and a persisted match + replay.

## 7. Definition of done (whole build)

- Every prototype screen exists and matches visually on desktop + mobile.
- Every button, link, tab, and panel is wired to real behavior — **no dead controls, no mocked balances**.
- Two real browsers can matchmake, play a full legal ranked game in real time, and both see the correct server-decided result and currency changes.
- A Stripe test-mode payment credits diamonds via webhook, and nothing else can.
- Engine + economy + payment test suites are green; no console errors; Lighthouse mobile ≥90; installable PWA.
- From a clean clone: `docker-compose up`, migrations, seed, `pnpm dev` all work per `handoff/scaffold/README.md`.

## 8. When you're unsure

- Prices, exact rank-tier thresholds, and the promotion-during-capture rule are marked "confirm against the prototype" in the docs — verify them against `handoff/FilipinoDama Royal.dc.html` before finalizing seed data or engine edge cases; don't guess.
- If a doc and the prototype disagree, the **prototype wins for visuals/UX**, and **GAME_RULES.md wins for rules**. Flag the conflict in your PR.
- Prefer asking a concise question over inventing product behavior that isn't in the docs or prototype.

Start now: confirm your understanding per §0, then create branch `chore/scaffold` to get `handoff/scaffold/` installing, booting, and CI-green on the remote, followed by `feat/game-engine` and the rest of `handoff/ROADMAP.md`.
