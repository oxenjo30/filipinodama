# FilipinoDama Royal — Engineering Handoff

This folder is the complete build package for turning the **FilipinoDama Royal** prototype into a real, deployable, production web application. Hand this entire folder to an AI coding agent (Claude Code recommended) or a human team.

The current prototype lives at `../FilipinoDama Royal.dc.html` (single-file React design). It is the **visual + UX source of truth** — every screen, interaction, and piece of copy has been designed and approved there. The production build must match it 1:1 visually while replacing all mocked data/state with real backend systems.

---

## What this app is

A premium, mobile-first, real-time multiplayer web game for **Filipino Dama** (Filipino Checkers). Regal Filipino-heritage aesthetic (deep purple + gold, marble-and-gold board). Includes accounts, ranked matchmaking, private rooms with chat/spectating, guilds, friends, a three-currency economy, a cosmetics store with real payments, seasons, quests, learning tutorials, and full match history + replay.

---

## Read these in order

| # | Document | What it covers |
|---|----------|----------------|
| 1 | **[BUILD_PROMPT.md](./BUILD_PROMPT.md)** | The master instruction prompt to give the AI agent. Start here. |
| 1b | **[AGENT_PROMPT.md](./AGENT_PROMPT.md)** | Single self-contained copy-paste prompt for the coding agent (workflow + guardrails + phases). |
| 2 | **[ARCHITECTURE.md](./ARCHITECTURE.md)** | Tech stack, monorepo layout, complete file/folder structure, env vars, deployment. |
| 3 | **[GAME_RULES.md](./GAME_RULES.md)** | The complete Filipino Dama ruleset the server engine must implement, with edge cases + test matrix. |
| 4 | **[DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)** | Full Prisma schema (Postgres) + Redis key design. |
| 5 | **[API_SPEC.md](./API_SPEC.md)** | REST endpoints + WebSocket event contract. |
| 6 | **[DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md)** | Colors, fonts, tokens, component styles, animations, responsive rules. |
| 7 | **[ASSETS.md](./ASSETS.md)** | Inventory of all image assets (pieces, boards, avatars, frames, icons) + where they map. |
| 8 | **[GIT_WORKFLOW.md](./GIT_WORKFLOW.md)** | Branch-per-feature → dev testing → merge to main → push to production flow. |
| 9 | **[ROADMAP.md](./ROADMAP.md)** | Ordered list of feature branches with acceptance criteria for each. |
| 10 | **[DEPLOYMENT.md](./DEPLOYMENT.md)** | Environments, CI/CD, migrations, Stripe webhook, scaling, release + pre-launch checklist. |
| 11 | **[ADMIN_DASHBOARD.md](./ADMIN_DASHBOARD.md)** | Internal admin/moderation console: roles, sections, API surface, audit log. |
| 12 | **[TEST_STRATEGY.md](./TEST_STRATEGY.md)** | Test pyramid, coverage gates, per-layer test plan, golden-path e2e. |
| 13 | **[ANTI_CHEAT.md](./ANTI_CHEAT.md)** | Fair-play system: threat model, hard guarantees, detection signals, enforcement, data model. |
| 14 | **[SYSTEM_STATES.md](./SYSTEM_STATES.md)** | Landing, login, forgot, onboarding, consent, offline, 404, error, maintenance — triggers, z-index layering, acceptance. |
| — | **[scaffold/](./scaffold/)** | Runnable monorepo starter — boots empty but wired (see `scaffold/README.md`). |

---

## Non-negotiable principles

1. **Server-authoritative gameplay.** The client never decides move legality, game outcome, or currency balances. Ever.
2. **Match the prototype visually.** Colors, fonts, spacing, copy, animations are already decided — see `DESIGN_SYSTEM.md` and the `.dc.html` file.
3. **One feature = one branch = one PR.** Nothing merges to `main` without passing dev tests. See `GIT_WORKFLOW.md`.
4. **Payments are verified server-side only** via webhooks. Diamonds are only ever credited by a confirmed payment event.
5. **Typed end-to-end.** Shared types package consumed by both client and server.

---

## Currency model (memorize this)

| Currency | Symbol | How you get it | What it does | Spendable? |
|----------|--------|----------------|--------------|------------|
| **Trophies** | 🏆 | Won/lost on ranked results | Ranked rating → drives rank tiers + leaderboard | **No** |
| **Gold** | 🪙 | Wins, daily challenge, quests | Soft currency — buy most Store cosmetics | Yes |
| **Diamonds** | 💎 | **Real-money top-up only** | Premium currency — premium cosmetics + Season Pass | Yes |

All currency grants and spends are **atomic DB transactions written to an append-only ledger.**
