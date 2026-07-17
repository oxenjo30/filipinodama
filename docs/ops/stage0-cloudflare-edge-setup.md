# Stage 0 — Cloudflare Edge Setup (owner task)

Part of the multi-region roadmap (docs/ops/multi-region-design.md, Stage 0). This is the **owner-driven** half of Stage 0 — done in the Cloudflare dashboard, not in code. It makes the app faster for globally-scattered testers *today* (edge TLS + static caching) and, crucially, turns on the **`cf-ipcountry` geo header** that the server's new `[conn]` telemetry uses to record where players connect from. That telemetry is the evidence that decides if/when a second region is worth it.

**Prerequisite:** the domains (`filipinodama.com`, `app.filipinodama.com`, `api.filipinodama.com`) are already on Cloudflare DNS (the domain-status check showed `CDN provider: CLOUDFLARE`). So most of this is toggling proxy + cache rules, not migrating DNS.

---

## 1. Proxy the API through Cloudflare (turns on geo headers)

Right now `api.filipinodama.com` resolves to Railway. Make sure its Cloudflare DNS record is **Proxied** (orange cloud), not DNS-only (grey cloud).

- Cloudflare → DNS → the `api` record → set to **Proxied**.
- Once proxied, Cloudflare injects `cf-ipcountry` (2-letter ISO country) on every request, including the WebSocket upgrade. The server's `clientRegionOf()` reads this → the `[conn] region=...` logs start showing real geography instead of `unknown`.
- **WebSocket support:** Cloudflare proxies WebSockets by default on all plans — no extra config. Verify under **Network → WebSockets = On**.

> Do the same for `filipinodama.com` (web) and `app.filipinodama.com` (admin) if not already proxied.

---

## 2. Cache static assets aggressively (the big latency win)

The web + admin bundles are hashed/cache-busted, so they can be cached at the edge forever.

- Cloudflare → **Caching → Cache Rules** → add a rule:
  - **When:** `URI Path` matches `*.js` OR `*.css` OR `*.woff2` OR `*.png` OR `*.svg` (or scope to `/assets/*` if the build emits there).
  - **Then:** Cache eligibility = **Eligible for cache**, Edge TTL = **1 month** (safe — filenames are content-hashed).
- Ensure the app serves `Cache-Control: public, max-age=31536000, immutable` on hashed assets (Vite does this by default; the `serve -s dist` start command respects it).

**Result:** a tester in the EU/US downloads your JS/CSS/fonts from a Cloudflare edge node near them, not from Singapore. This is ~80% of the *perceived* "app feels slow far away".

---

## 3. Cache the store catalog (careful — public fields only)

The store catalog (item list, prices, art) is the same for everyone and safe to cache briefly. **Per-user fields (balance, owned items) must NEVER be cached.**

- Confirm the catalog endpoint returns ONLY public data (no balance/owned flags baked in). If it mixes per-user data, DON'T cache it — leave this step out until the endpoint is split.
- If it's clean: Cache Rule → path = the catalog endpoint (e.g. `/api/store/catalog`) → Edge TTL **60–300s**, and purge the cache on an admin catalog edit (Cloudflare API purge, or just accept the short TTL).

---

## 4. NEVER cache these (safety)

Add an explicit **bypass-cache** rule for anything dynamic/per-user so a cache rule can't accidentally serve one player another's data:

- `/api/auth/*`, `/api/wallet*`, `/api/matches*`, the matchmaking/socket path `/rt*`, `/api/leaderboard*` (live), `/api/me*`, `/api/rewards/*`, checkout/payment endpoints.
- Rule: path matches any of the above → **Bypass cache**.

> The socket path `/rt` is a WebSocket — it's never cached anyway, but bypass it explicitly for clarity.

---

## 5. Verify it worked

- Hit `https://api.filipinodama.com/health` — still 200 (proxied).
- Check the server logs (Railway → filipinodama → Deploy logs): once real testers connect through the proxy, you'll see lines like:
  `[conn] region=amer serving=southeast-asia device=web rtt_ms=210`
  `[conn] region=apac serving=southeast-asia device=mobile rtt_ms=25`
  That's the evidence. `region=unknown` before the proxy is on; real buckets (`apac`/`amer`/`emea`) after.
- Static asset response headers should show `cf-cache-status: HIT` after the second load.

---

## What this Stage 0 gives you

- **Faster now:** edge TLS termination + cached static assets for far-away testers, zero backend change.
- **The evidence:** weeks of `[conn]` logs tagged by region + RTT. After 2–4 weeks, if a real cluster of testers (say ≥15–20%) sits in one region with consistently high RTT (>150–200ms) and complains, THAT is the trigger to do Stage 1 (a second API region) — a data-driven decision, not a guess.

**Cost:** $0 on Cloudflare Free (Pro ~$20/mo if you want image optimization / more rules). **Risk:** none to money/matchmaking/data — nothing stateful changes.
