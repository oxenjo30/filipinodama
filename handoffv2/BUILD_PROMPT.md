# BUILD_PROMPT.md — Master Agent Prompt

> Paste the section below (between the rules) into Claude Code as the initial instruction. It references the sibling docs in this folder; keep the whole `handoff/` folder in the repo root so the agent can read them.

---

You are building **FilipinoDama Royal**, a production, real-time multiplayer web game for Filipino Dama (Filipino Checkers). This is a real, deployable product — not a mockup or prototype.

## Your source of truth

1. **`handoff/FilipinoDama Royal.dc.html`** (copied into this repo) — the approved visual + UX design. Every screen, layout, color, font, animation, and piece of copy already exists there. Reproduce it faithfully in real React components. Do not redesign.
2. **The other files in `handoff/`** — read them ALL before writing code:
   - `ARCHITECTURE.md` — the stack, exact folder structure, and env you must produce.
   - `GAME_RULES.md` — the Dama ruleset your server engine must implement, plus its test matrix.
   - `DATABASE_SCHEMA.md` — the Prisma schema and Redis keys.
   - `API_SPEC.md` — REST + WebSocket contract.
   - `DESIGN_SYSTEM.md` — tokens, colors, fonts, components.
   - `ASSETS.md` — the image assets and where they map.
   - `GIT_WORKFLOW.md` — how you branch, test, and ship.
   - `ROADMAP.md` — the ordered list of feature branches to build.

## How you must work (critical)

- **One feature per branch.** Follow `ROADMAP.md` in order. For each item: create a branch `feat/<name>` off `dev`, build it, write tests, run the dev test suite, and only then open a PR into `dev`. Never commit straight to `main` or `dev`. See `GIT_WORKFLOW.md`.
- After a feature passes on `dev` and is manually verified, it is merged; when a milestone of features is stable on `dev`, promote `dev` → `main`, which triggers the production deploy.
- **Server-authoritative always.** The client sends *intents* (e.g. "I want to move C3→D4"). The server validates against the rules engine, mutates state, persists it, and broadcasts the authoritative result. The client renders what the server says. This applies to moves, timers, game results, matchmaking, and every currency change.
- **Never trust the client for money or outcomes.** Currency balances, item ownership, purchase success, trophy changes, and win/loss are all decided and recorded server-side. Diamonds are credited only by verified payment webhooks.
- **Typed end-to-end.** Put shared types (game state, DTOs, socket events, enums) in `packages/shared` and import them in both `apps/web` and `apps/server`.
- **Test the rules engine exhaustively.** It is the heart of the product. See the test matrix in `GAME_RULES.md`.

## Scope (build all of it — details in the roadmap)

Auth (email+password w/ verification, Google/Facebook OAuth, guest) · Home dashboard · Play vs AI (server-side minimax) · Online ranked + casual matchmaking (Redis queue, Elo/Glicko) · Private rooms (invite by code, host controls: lock, kick/ban, move-timer; spectators; room + in-game chat; rematch) · Live spectating · Leaderboards (global/friends/guild + rank tiers) · Learn (interactive step-by-step tutorials) · Store (board themes, piece skins, avatars, frames, emotes, bundles, Season Pass; cart + checkout; Gold + Diamond pricing) · Profile (editable, stats, trophy history, **match history + full replay**) · Friends (requests, presence, 1:1 chat w/ unread badges + notification sound, friend profiles) · Guilds (roster + online status, roles & permissions, join-request inbox, guild chat, weekly contributions, editable guild with min-trophy join gate, free to create) · Quests/Achievements (daily + seasonal, award Gold) · Season Pass (tiered rewards) · Notifications center (bell dropdown, grouped, inline actions, unread badges) · Inventory & Orders · Settings (incl. Delete Account with typed confirm, GDPR export) · Legal pages.

## Definition of done for the whole build

- Every screen from the prototype exists and matches visually on desktop **and** mobile.
- Every button, link, tab, and panel is wired to real behavior — no dead controls, no mocked balances.
- Two real browsers can matchmake, play a full legal game against each other in real time, and both see the correct authoritative result and trophy/gold changes.
- A real Stripe (test-mode) payment credits Diamonds via webhook and nothing else can.
- Rules-engine test suite is green and covers the matrix in `GAME_RULES.md`.
- No console errors. Lighthouse mobile ≥ 90 performance/accessibility. Installable PWA.
- `README` with setup, `.env.example`, `docker-compose up` for local Postgres+Redis, migrations, and seed data all work from a clean clone.

## Start sequence

1. Read every file in `handoff/`.
2. Scaffold the monorepo exactly as `ARCHITECTURE.md` specifies; get `docker-compose up` + a "hello" server + a blank themed web app running on `dev`.
3. Implement `packages/game-engine` with its full test suite (`GAME_RULES.md`) — this is branch #2 and everything depends on it.
4. Then follow `ROADMAP.md` branch by branch.

Confirm you have read all handoff docs and print your understanding of the currency model and the server-authoritative rule before writing any code.
