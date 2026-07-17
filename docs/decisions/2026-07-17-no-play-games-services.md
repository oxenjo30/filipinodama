# Decision: Do not adopt Google Play Games Services (PGS)

- **Date:** 2026-07-17
- **Status:** Accepted
- **Scope:** Android app (`apps/android`)

## Decision

We will **not** integrate Google Play Games Services — not its leaderboards, achievements, saved games, or Play Games sign-in (v2).

## Context

PGS is Google's optional, **free** (no usage fees) backend for Android games: Google-hosted leaderboards and achievements shown in a native Google UI overlay, cloud saves, a Play Games identity/sign-in layer, and a friends graph. The question raised was whether to use it for our leaderboard/ranking.

## Why we are declining

Our ranking is **not** a cosmetic score table — it is a server-authoritative, cross-platform economy spine:

| Our system | Play Games Services |
| --- | --- |
| Ranking = **trophies**, computed server-side from ranked matches (win +10) | Score = whatever number the client submits |
| **Cross-platform**: web + Android share one ladder and one account (server is the single source of truth; see the shared-credentials directive) | **Android + Google-account only** — web players can't appear; keyed to a Google identity, not our account |
| Feeds **season-end rewards, tier rewards, guild standings, and bot/guest filtering** | Display list only — no reward logic, no economy hooks |
| Anti-cheat: trophies move only through validated server writes | Client-submitted scores are trivially spoofable without a separate server validation path |

Adopting PGS leaderboards would create a **parallel, Android-only, Google-account-keyed** copy of a ladder we already own authoritatively and cross-platform. It cannot *replace* ours (it would fracture cross-platform ranking and bypass our reward + anti-cheat logic), and running it *alongside* ours means two leaderboards that can disagree — worse for players than one.

The same duplication argument applies to PGS achievements (we already have `AchievementsScreen` backed by our own data) and PGS sign-in (it introduces a mobile-specific identity path that the shared-credentials directive rules out; our existing Google Sign-In via Credential Manager does not require PGS).

This mirrors the reasoning behind the single-region / shared-infra decision (see `docs/ops/singapore-region-migration-runbook.md`): shared wallet/leaderboard/matchmaking must stay behind one authoritative system.

## Consequences

- No PGS SDK dependency, no Play Console PGS configuration, no second leaderboard to reconcile.
- PGS is **not** required to publish on Google Play; publishing and our current auth are unaffected.
- **Revisit only** if the product pivots to Android-only, single-platform play (removing the cross-platform + server-authority constraints that make PGS a poor fit today).
