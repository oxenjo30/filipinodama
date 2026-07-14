# Guild Wars — Weekly Contribution Ladder

Guild Wars is a **weekly contribution ladder**: every **ranked win** by a guild
member adds war points to their guild. Guilds are ranked weekly, and at reset the
**top-N guilds earn a gold pot split among their contributors** (bigger
contribution → bigger share). Wired across server, web, and mobile.

## How it works

1. A guild member wins a **RANKED** match → the server (in `settleMatch`) adds
   `WAR_POINTS_PER_WIN` to the guild's `weeklyPoints` and the member's
   `weeklyContribution`. (Bot-filled seats can't score — a bot has no user id.)
2. Guilds are ranked live by `weeklyPoints` (ties broken by oldest guild).
3. Each war week has a window (`GuildWarSeason`). When it closes, a reset poller
   (`runWarResetTick`, same setInterval-on-boot pattern as campaigns) settles it:
   - freezes a `GuildWarResult` row per guild (the "War Log" history),
   - pays the top-N guilds a gold pot, **split among contributors** proportional
     to `weeklyContribution`, via the server-authoritative ledger (`applyLedger`),
   - resets all war points, and opens the next week.

## Where it shows

- **Web** — `GuildsPage` "Weekly Guild War" card: week number, countdown, your
  guild's war rank + points, top-5 standings with reward tiers, your contribution.
- **Mobile** — `GuildHallScreen` → **Wars** tab: war-in-progress card (rank /
  points / countdown), standings with reward tiers, your contribution, a
  "⚔ Play Ranked" CTA, and last week's War Log.
- **Admin** — the existing guild views already show `weeklyPoints`; war standings
  read the same live data.

## Admin-tunable config (Config table, via config-service)

All amounts are read live from the `Config` table — set them in the admin Config
tab (or seed). Defaults apply if unset:

| Key | Default | Meaning |
|-----|---------|---------|
| `WAR_POINTS_PER_WIN` | `10` | War points a ranked win adds to the guild + member |
| `WAR_REWARD_TOP_N` | `3` | How many top guilds are paid gold at reset |
| `WAR_REWARD_POOL_GOLD` | `5000` | Gold pool for **rank 1**; each lower rank ≈ 60% of the one above |
| `WAR_WEEK_DAYS` | `7` | Length of a war week in days |

Reward-per-rank: rank 1 gets `WAR_REWARD_POOL_GOLD`, rank 2 ≈ 60%, rank 3 ≈ 36%,
etc., down to `WAR_REWARD_TOP_N`. Within a winning guild, each contributor's share
is floor-proportional to their contribution (the floor guarantees the split never
over-pays the pool).

## Notes

- **Server-authoritative**: points and gold are only ever written server-side
  (never trusted from a client). The award is guarded so a war hiccup never blocks
  match settlement.
- **Migration**: `20260714120000_guild_wars` adds `GuildWarSeason` +
  `GuildWarResult`. Runs on deploy (`prisma migrate deploy`). Reuses the existing
  `Guild.weeklyPoints` and `GuildMember.weeklyContribution` fields.
- **First week** opens automatically at server boot (the poller kicks once on
  start), so the ladder is live immediately.
