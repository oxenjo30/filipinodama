# ANTI_CHEAT.md — Anti-Cheat & Fair Play System

How FilipinoDama Royal keeps ranked play honest. The foundation is that **the server is authoritative** (see `GAME_RULES.md`/`API_SPEC.md`) — the client cannot make an illegal move, edit the board, or change a balance. On top of that base, this system detects the cheating that *is* possible: engine assistance, timing manipulation, collusion, boosting, and multi-accounting.

Build incrementally: the **hard guarantees (§2)** ship with core gameplay (M3); **detection + enforcement (§4–6)** land alongside ranked/leaderboard (M5–M6) and feed the admin console (`ADMIN_DASHBOARD.md`).

---

## 1. Threat model

| # | Threat | What it looks like | Primary defense |
|---|--------|--------------------|-----------------|
| T1 | Illegal state / move injection | client sends moves the rules forbid, edits pieces/clock | **Server-authoritative engine** (hard block) |
| T2 | Currency/ownership forgery | client claims a purchase, grants itself diamonds/items | **Server-authoritative economy + ledger** (hard block) |
| T3 | Engine assistance ("bot help") | a human plays engine-perfect moves via an external solver | Move-quality + timing analysis |
| T4 | Timing manipulation | inhuman consistency, or stalling/lag-abuse to win on clock | Server clock + timing distribution analysis |
| T5 | Win-trading / collusion | two accounts feed rating/rewards to each other | Graph + result-pattern analysis |
| T6 | Boosting | a strong player logs into a weak account to inflate it | Device/session + play-style fingerprint |
| T7 | Multi-accounting / smurfing | one person, many accounts (queue dodging, farming) | Device/IP/payment clustering |
| T8 | Abandon/DC abuse | disconnecting to avoid a loss | Disconnect-grace + abandon = loss |
| T9 | API/bot abuse | scripted matchmaking/reward farming, spam | Rate limits + behavioral flags |

---

## 2. Foundation — the hard guarantees (must exist, not heuristic)

These make whole categories of cheating **impossible**, not just detectable:

- **Every move validated** against `@dama/game-engine` server-side; illegal intents return `match:illegal` and never mutate state. The client's engine copy is for UI hints only and is never trusted.
- **Server owns the clock.** Move timers and game clocks tick on the server; timeouts are decided server-side. Client countdowns are cosmetic.
- **Server owns outcomes.** Win/loss/draw, trophy deltas, and gold are computed and written server-side on `match:ended`. The client is told the result; it never reports it (except offline `LOCAL` games, which award nothing).
- **Server owns currency.** All balance changes go through the atomic ledger; diamonds only via verified Stripe webhook (see `DEPLOYMENT.md` §6). No client path can mint currency.
- **Full move list persisted** per match — the immutable evidence base for all post-hoc analysis and replay.
- **Rate limits** on moves, matchmaking, chat, and API calls (Redis token buckets).

> If these hold, T1/T2 are closed and T8 is contained. Everything below targets the *human-plausible* cheats T3–T7, T9.

---

## 3. Signals collected (per move / match / account)

Recorded on the server, attached to the match record or an analytics store — never trusting client-supplied metrics beyond raw inputs:

- **Per move:** server-side think time (ms), whether it matched the engine's `bestMove` at each difficulty depth, move rank among legal moves (how "good"), position complexity (branching factor), whether it was a forced move (only one legal — excluded from analysis), evaluation swing.
- **Per match:** mode, result, rating gap, total duration, disconnect events, timeout events, opponent id, engine-match rate, mean/variance of think time.
- **Per account:** device fingerprint hash, IP subnet (hashed), session/user-agent set, linked payment fingerprints, rating trajectory, win/loss streaks, opponents-graph, report count.

Forced moves and trivially-only-capture positions are **excluded** from engine-match scoring (a mandatory capture isn't skill).

---

## 4. Detection

### 4.1 Engine-assistance (T3)
- **Move-match analysis:** over non-forced moves, compute the % matching the engine's top choice at increasing depths. A human's match rate has a characteristic distribution; sustained near-perfect play (esp. in complex positions) across many games is the flag — not any single game.
- **Accuracy vs. complexity:** legitimate players get worse in complex positions and under time pressure; a solver stays flat. Flag inverted/flat curves.
- Compute per-match, then aggregate a rolling **suspicion score** per account (Bayesian/EWMA) so one lucky game doesn't trip it and consistent assistance accumulates.

### 4.2 Timing (T4)
- **Think-time distribution:** humans have high variance and position-dependent timing; bots relay near-constant intervals or suspiciously fast optimal moves in deep positions. Flag low-variance + high-quality combinations.
- **Clock/lag abuse:** detect deliberate stalling patterns and repeated near-timeout wins; server clock already prevents actually cheating the timer.

### 4.3 Collusion / win-trading (T5)
- Build an **opponents graph**; look for pairs/clusters with abnormal result skew (one always loses to the other), rapid rating/reward transfer, tight temporal clustering (many games back-to-back), and shared device/IP/payment fingerprints.
- Rooms are watched too (private-room farming for quests/season XP) — repeated same-pair private matches feeding progression get flagged and can be excluded from rewards.

### 4.4 Boosting & multi-accounting (T6/T7)
- **Fingerprint clustering:** hashed device + IP subnet + payment instrument link accounts; a cluster sharing logins with divergent skill signatures suggests boosting/smurfing.
- **Play-style fingerprint:** timing + opening + move-choice profile; a sudden profile shift on one account (someone else playing) is a boosting signal.

### 4.5 Bot/API abuse (T9)
- Anomalous request cadence, headless-client signatures, farming loops → rate-limit escalation + flags.

---

## 5. Enforcement (graduated, mostly automated with human review for bans)

| Suspicion | Action | Automated? |
|-----------|--------|------------|
| Low / single anomaly | log only; raise account suspicion score | yes |
| Elevated | **shadow review queue** in admin console; recent suspect matches surfaced with replay + signal overlay | yes → human |
| High (engine-match) | **rating hold** (games don't count), void the flagged matches (reverse trophy/gold via ledger), quiet notice | human-confirmed |
| Confirmed collusion/boost | reverse ill-gotten rewards, reset affected rating, temp suspension | human |
| Repeat / blatant | ranked ban, device-cluster ban, permanent ban | human (`MODERATOR`+) |

Principles:
- **No permabans purely on a heuristic score** — automated actions are reversible (rating hold, match void, reward clawback); irreversible bans require human confirmation with the evidence bundle.
- **Match void is exact and idempotent** — reverses the specific ledger deltas once (shared logic with admin "void match").
- **Silent where possible** — don't tell cheaters exactly which signal caught them (avoid teaching evasion). Player-facing messaging is generic ("unusual activity").
- **Appeals path** — sanctioned users can appeal via support; the audit log + evidence bundle back the decision.

---

## 6. Admin integration

Feeds the **Matches & anti-cheat** section of `ADMIN_DASHBOARD.md`:
- Review queue sorted by suspicion score with the match replay + per-move engine-match/timing overlay.
- Account detail shows suspicion trajectory, fingerprint cluster, opponents graph, prior sanctions.
- One-click, audited actions: rating hold, void match(es), clawback, suspend, ban cluster. Every action writes an `AuditLog` entry with the evidence reference.

## 7. Data model (additions)

```prisma
model CheatSignal {
  id         String   @id @default(cuid())
  userId     String
  matchId    String?
  kind       String            // engine_match | timing | collusion | multi_account | api_abuse
  score      Float             // 0..1 contribution
  details    Json              // per-move match %, variance, graph refs, fingerprint ids
  createdAt  DateTime @default(now())
  @@index([userId, createdAt])
  @@index([kind, score])
}

model AccountRisk {
  userId       String   @id
  suspicion    Float    @default(0)   // rolling EWMA over signals
  ratingHold   Boolean  @default(false)
  clusterId    String?                 // device/payment fingerprint cluster
  lastReviewAt DateTime?
  updatedAt    DateTime @updatedAt
}

model DeviceFingerprint {
  id        String   @id @default(cuid())
  userId    String
  hash      String                     // hashed device+UA signature
  ipSubnet  String?                    // hashed / truncated
  createdAt DateTime @default(now())
  @@index([hash])
  @@index([userId])
}
```
(Sanctions reuse the moderation/sanction model from `ADMIN_DASHBOARD.md`; voids reuse the match-void path.)

## 8. Architecture & performance

- **Inline (blocking) checks** stay cheap: move legality, clock, rate limits — they run in the match loop.
- **Analysis is asynchronous:** on `match:ended`, enqueue an **analysis job** (BullMQ/Redis queue) that replays the persisted move list through the engine, computes signals, and updates `CheatSignal` + `AccountRisk`. Never block gameplay on analysis.
- Engine re-analysis reuses `@dama/game-engine` (`bestMove`/`legalMoves`) at several depths — the same pure package the game runs on, so scores are consistent.
- Cache per-position engine evaluations where reused; cap analysis depth/time per match.

## 9. Privacy & fairness

- Fingerprints and IPs are **hashed/truncated**; retain only what's needed for clustering, with a retention window. Document this in the privacy policy.
- Bias guard: exclude forced moves; account for skill (a genuinely strong player is not a cheater — the signal is *inhuman consistency*, not *high quality alone*).
- Human-in-the-loop for anything punitive and irreversible; full audit trail; clear appeals.
- Comply with data-export/delete (GDPR): anti-cheat records are included in export and purged on account deletion except where retention is legally required for abuse prevention.

## 10. Definition of done

- Illegal moves, forged outcomes, and client-minted currency are impossible (foundation tests in `TEST_STRATEGY.md`).
- Finished ranked matches enqueue async analysis; signals + suspicion scores populate; no gameplay latency impact under load.
- A win-trading pair and an engine-assisted account in seeded test data both surface in the admin review queue.
- Rating hold, match void, and reward clawback are reversible, idempotent, and audited.
- No punitive irreversible action fires without human confirmation; appeals + audit trail exist.
