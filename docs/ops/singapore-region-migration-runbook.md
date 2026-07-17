# Singapore Region Migration — Runbook

**Goal:** Relocate the entire production stack (Postgres + Redis + API) from US-West to **Singapore** (`southeast-asia`), so PH/Asia players get ~15–40 ms latency instead of ~180 ms. Single-region move — Singapore *replaces* US-West (not multi-region; see "Why single region" below).

**Status:** PLANNED. Not yet executed. Decided 2026-07-17 to schedule fresh (not do it on a night when Railway's control plane was flaky).

**Downtime:** A few minutes, during the Postgres volume migration only. Redis + API moves are ~zero downtime.

**BETA STATUS (2026-07-17):** The app is still in BETA — only testers (closed/internal testing track) can download and play. There is NO general-public player base yet. This makes the downtime window a non-issue: a few minutes with only testers online is fine (just tell them). No need to hunt for a low-traffic window or post a public maintenance notice. The move can be done any time the platform is calm. It ALSO confirms single-region-in-Singapore is right for this stage (a handful of testers, not thousands across continents — multi-region would be premature).

---

## Why single region (not multi-region), recorded for future me

The game has **global shared state** that two independent databases would break:
- **Wallet** (gold/diamonds/trophies) — one balance per player; two DBs = double-spend / lost money. This shatters the money-safety DB-gate the realtime-scale work built.
- **Leaderboard** — one global ladder; two DBs disagree.
- **Matchmaking** — a PH player and a US player must be poolable together; separate Redis/DBs split the player pool so they can never match.

So multi-region for THIS game requires: one primary DB (all writes) + regional **read-replicas** + **shared Redis**. That's Option 1 — a real project, worth it only when there's a real US player base with latency complaints. Until then: **single region in Singapore** (fast for the Asia core, simple, safe). Grow into read-replicas later. See [[realtime-redis-scale-shipped]].

---

## Railway facts (learned the hard way 2026-07-16/17)

- Project: **Filipino Dama** `6a022d60-ab0d-43bf-b7b1-863ae17a316c`, env **production** `ec3d152d-6756-4c2c-aa8f-23f7fe9372e5`.
- Services: `filipinodama` (API) `7884b5f7-...`, `Redis` `c5e77052-...`, `Postgres` `cedc847c-...`, `web` `2b14458b-...`, `admin` `d8e17311-...`.
- **Region friendly names for `scale_service`:** `us-west`, `us-east`, `eu-west`, `southeast-asia`. (There is ALSO a legacy `sfo` alias for US-West — the API currently sits on `us-west` after cleanup; watch for `sfo` reappearing and zero it.)
- **Private network is environment-scoped, dual-stack (IPv4+IPv6)** — `*.railway.internal` hostnames stay the same after a region move, so `DATABASE_URL`/`REDIS_URL` need NO change.
- **Region change of a volume-backed service triggers a volume migration = downtime** for that service. Stateless service region change = zero downtime.
- Postgres public proxy for backups: `hopper.proxy.rlwy.net:10263` (user `postgres`, db `railway`). Redis internal: `redis.railway.internal:6379`.
- Health check: `https://api.filipinodama.com/health` → `{"ok":true}`. **Check it via PowerShell** (`Invoke-WebRequest`), NOT git-bash curl (local schannel TLS-revocation quirk gives false ERR). Never use `--ssl-no-revoke`.
- pg_dump/restore: none installed locally; use `docker run --rm postgres:18 ...` (version-matched to the PG18 server).
- Baseline row counts (as of 2026-07-17, post-UGC): User=90, Match=75, LedgerEntry=113, Order=8, Payment=8, InventoryItem=1204, StoreItem=61, migrations=**24** (24th = `20260716120000_add_block_model`, Block table present).

---

## Pre-flight (do first, low-traffic window)

1. **Announce/anticipate downtime** — pick a low-traffic time; optionally post a maintenance notice.
2. **Fresh backup** (must include the Block table added 2026-07-17):
   ```bash
   SCRATCH=<a real dir>; mkdir -p "$SCRATCH/pgbackup"
   docker run --rm -v "$SCRATCH/pgbackup:/backup" postgres:18 sh -c \
     "PGPASSWORD='<PGPASSWORD>' pg_dump -h hopper.proxy.rlwy.net -p 10263 -U postgres -d railway -Fc -f /backup/filipinodama-presg-<date>.dump --verbose"
   # verify:
   docker run --rm -v "$SCRATCH/pgbackup:/backup" postgres:18 \
     pg_restore --list /backup/filipinodama-presg-<date>.dump | grep -c 'TABLE DATA'   # expect ~38
   ```
   Keep a copy off the scratchpad (scratchpad is session-temp).
3. **Capture baseline row counts** (psql via docker, same as above) to compare after.
4. **Confirm rollback target:** the current US-West is the fallback. If the SG move fails, revert each service's region back to `us-west` — Railway migrates the volume back. Backup is the last resort.

---

## Migration steps (order matters — DB and API move together)

> The API must end up in the SAME region as Postgres/Redis (private network + latency). Because a region-scoped private network means an API in SG can't cleanly use a DB still in US, minimize the in-between window: move data services first, then API immediately after.

### Step 1 — Redis → Singapore (near-zero downtime; cache only)
- Dashboard: **Redis → Settings → Regions** → set **Southeast Asia (Singapore)**. Confirm the volume-migration prompt (Redis data is disposable — a few in-flight matches may drop; players reconnect).
- Or MCP: `scale_service`/region change on the Redis service to `southeast-asia`.
- Verify Redis comes back healthy (Redis service SUCCESS).

### Step 2 — Postgres → Singapore (THE downtime window)
- Dashboard: **Postgres → Settings → Regions** → set **Southeast Asia** → confirm the **volume-migration** prompt.
- This is the downtime: the API will error while the volume migrates (minutes for ~1 MB). Expected.
- Wait for Postgres service to return **SUCCESS** in Singapore.
- **DATABASE_URL is unchanged** (same `postgres.railway.internal` hostname).

### Step 3 — API → Singapore, 2 replicas
- MCP: `scale_service` filipinodama `{ "southeast-asia": 2 }` (and zero any `us-west`/`sfo` entries: `{ "southeast-asia": 2, "us-west": 0, "sfo": 0 }`).
- Also set `update_service num_replicas: 2` so the legacy count agrees (they fight otherwise — this caused hours of "2 replicas" flapping on 2026-07-16).
- This triggers a redeploy of the API in Singapore. Watch build logs; it should build clean (no builder-loop — that was a transient platform issue).

### Step 4 — (web/admin optional) leave in US-West or move to SG
- `web` + `admin` are static file servers; region matters far less. Leaving them in US-West is fine (Cloudflare CDN fronts them). Optionally move to `southeast-asia` too for consistency — zero-downtime (no volumes).

---

## Verify (before declaring done)

1. `https://api.filipinodama.com/health` → 200 `{"ok":true}` (PowerShell).
2. `https://filipinodama.com` and `https://app.filipinodama.com` → 200.
3. Row counts match baseline (psql via docker over the proxy):
   `User=90, Match=75, LedgerEntry=113, Order=8, Payment=8, InventoryItem=1204, StoreItem=61, migrations=24`, `Block` table exists, 0 failed migrations.
4. Manual smoke: a login, open a match, read the store/wallet, check a leaderboard.
5. `environment_status` — all 5 services SUCCESS.
6. Confirm the API replicas are actually in `southeast-asia` (scale echo shows `Southeast Asia (2)` and nothing else).

---

## Rollback (if anything goes wrong)

- **API won't come up in SG:** revert `scale_service` to `{ "us-west": 2 }` — API returns to US-West.
- **Postgres volume migration fails / data looks wrong:** revert Postgres region to `us-west` (Railway migrates the volume back), OR provision a fresh Postgres and `pg_restore` the pre-flight backup into it, then repoint `DATABASE_URL`.
- **Total fallback:** the whole US-West stack config is the known-good state we ran on 2026-07-17; restoring the backup into a US-West Postgres reproduces it exactly.

---

## Gotchas (from the 2026-07-16/17 session)

- Railway's control plane was flaky that night: **builder-scheduler loops** (a deploy rescheduling on new Metal builders every ~2 min without building — cancel + redeploy the last-good to clear), **MCP auth dropping** intermittently (reconnect Railway), **stale UI** ("Scaling to X replicas" spinner that never stops though the backend already settled — refresh, or trust `environment_status`/`list_deployments` over the dashboard).
- **`num_replicas` (legacy) vs the region-replica map fight each other.** Set BOTH to the same value or the count flaps. Region map via `scale_service`, legacy count via `update_service num_replicas`.
- **Two US-West aliases exist** (`sfo` legacy + `us-west` new). Zero the one you're not using.
- The GitHub→Railway auto-deploy: to force a redeploy of `main` HEAD when there's no dashboard button handy, push an **empty commit** to `main` (`git commit-tree`), which triggers a clean pipeline build. Do NOT use `mcp__railway__deploy` (it deploys a LOCAL tarball, bypassing the GitHub pipeline).
