# FilipinoDama Royal — Go-Live Deploy Checklist (Railway)

A step-by-step runbook to take the app live on Railway with the domain
`filipinodama.com` (DNS at Hostinger). Do the steps **in order**. Nothing here
touches production DNS until Step 6, so Firebase stays live until you deliberately
cut over.

Architecture recap: **web** (static SPA, served on `filipinodama.com`) + **server**
(Fastify API + Socket.IO on `api.filipinodama.com`) + managed **Postgres** +
managed **Redis**. Auth is cookie-based across the two subdomains, so cookie and
CORS settings below are not optional — get them wrong and login silently fails.

---

## 0. Pre-flight (already done ✅)
- [x] Full monorepo builds green (`pnpm build` → shared, game-engine, server, web).
- [x] Pre-launch security/API/links/assets/buttons audit complete; all critical/high/
      medium findings fixed.
- [x] Brand assets (favicon, PWA icons, OG image) generated into `public/assets/brand/`.
- [x] `.env` and `*.zip` gitignored; the 98 MB design zip will not be committed.
- [x] PayMongo keys obtained (per owner).

---

## 1. Railway services
In the Railway project (already connected to `github.com/oxenjo30/filipinodama`):
- [ ] **Postgres** plugin added → note its connection URL.
- [ ] **Redis** plugin added → note its connection URL.
- [ ] **server** service → root `apps/server`.
      - Build: `pnpm install && pnpm --filter @dama/shared build && pnpm --filter server build`
      - Start: `pnpm --filter server prisma migrate deploy && node apps/server/dist/index.js`
        (run migrations on boot; `prisma migrate deploy` is safe/idempotent).
- [ ] **web** service → root `apps/web`, served as a static site from `apps/web/dist`.
      - Build: `pnpm install && pnpm --filter @dama/shared build && pnpm --filter web build`
      - Publish directory: `apps/web/dist`
      - SPA fallback: rewrite all unknown paths to `/index.html` (client-side routing).

> The `VITE_*` vars are compiled into the web bundle at **build** time — they must be
> present as web-service variables **before/when it builds**, not just at runtime.

---

## 2. Server (API) environment variables
Set these on the **server** service. The server **refuses to boot** in production if
the JWT/CORS/WEB_ORIGIN values are missing, weak, or still the dev defaults — this is
an intentional safety gate.

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | (from the Railway Postgres plugin) |
| `REDIS_URL` | (from the Railway Redis plugin) |
| `JWT_ACCESS_SECRET` | a fresh `openssl rand -base64 48` — **≥32 chars** |
| `JWT_REFRESH_SECRET` | a **different** fresh `openssl rand -base64 48` |
| `CORS_ORIGIN` | `https://filipinodama.com` |
| `WEB_ORIGIN` | `https://filipinodama.com` |
| `COOKIE_DOMAIN` | `.filipinodama.com` (leading dot — shares the cookie across subdomains) |
| `OAUTH_CALLBACK_BASE` | `https://api.filipinodama.com` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | (from Google Cloud console, optional) |
| `RESEND_API_KEY` | (from Resend) |
| `EMAIL_FROM` | `FilipinoDama Royal <no-reply@filipinodama.gg>` (domain must be SPF+DKIM verified in Resend) |
| `PAYMONGO_SECRET_KEY` | ✅ already set (live secret key) |
| `PAYMONGO_WEBHOOK_SECRET` | ✅ already set (webhook signing secret) |
| `PAYMONGO_PUBLIC_KEY` | ✅ already set |

Generate the two JWT secrets:
```
openssl rand -base64 48   # → JWT_ACCESS_SECRET
openssl rand -base64 48   # → JWT_REFRESH_SECRET  (must differ from the first)
```

---

## 3. Web environment variables
Set these on the **web** service (needed at build time):

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://api.filipinodama.com` |
| `VITE_SOCKET_URL` | `https://api.filipinodama.com` |

---

## 4. First deploy on Railway's temp URLs (before touching DNS)
- [ ] Deploy both services. Confirm the server boots (no fatal config error in logs).
      If it logs `FATAL: insecure production configuration`, a JWT/CORS/WEB_ORIGIN
      var is missing or still a dev default — fix and redeploy.
- [ ] Migrations ran: the DB has tables. If the catalog/quests/season are empty, run
      the seed once: `pnpm --filter server exec prisma db seed` (via a one-off Railway
      command or locally against the prod `DATABASE_URL`).
- [ ] Hit `https://<server>.up.railway.app/health` → `{ ok: true }`.
- [ ] Open the web temp URL and smoke-test (see Step 7). Auth won't fully work until
      the real domains + cookie domain are in place, so do the full auth test after Step 6.

---

## 5. PayMongo webhook
- [ ] In the PayMongo dashboard, add/point a webhook to:
      `https://api.filipinodama.com/api/payments/webhook`
- [ ] Ensure `PAYMONGO_WEBHOOK_SECRET` matches that webhook's signing secret.
- [ ] Event to enable: `checkout_session.payment.paid` (the only crediting event;
      refunds via `payment.refunded` are also handled). Diamonds are credited **only**
      by this signature-verified webhook — never client-side.

## 5b. Google OAuth (only if using it)
- [ ] In Google Cloud console, add the Authorized redirect URI:
      `https://api.filipinodama.com/api/auth/oauth/google/callback`
- [ ] Authorized JavaScript origin: `https://filipinodama.com`

---

## 6. DNS cutover at Hostinger (the go-live moment)
Only after Steps 1–5 pass on the temp URLs. Firebase stays live until you change these.
- [ ] In Railway, add custom domains: `filipinodama.com` → **web** service,
      `api.filipinodama.com` → **server** service. Railway shows the exact CNAME/A targets.
- [ ] At Hostinger DNS, set the records Railway gives you:
      - `api` (subdomain) → CNAME → Railway server target.
      - Apex `filipinodama.com` → the web target. If Hostinger rejects a CNAME on the
        apex, use Railway's A record(s), or point `www` via CNAME and redirect apex→www.
- [ ] Remove the old Firebase records for these hosts once Railway's certs are issued.
- [ ] Wait for TLS certificates to provision on both domains (Railway auto-issues).

---

## 7. Post-cutover smoke test (on the real domain)
- [ ] `https://filipinodama.com` loads; favicon + tab title + PWA installability OK.
      Share a link → OG image preview shows.
- [ ] **Register** a new account → succeeds, session persists across refresh (this
      proves cross-subdomain cookies + CORS are correct — the #1 thing to verify).
- [ ] **Log out** → cookie cleared; **log back in**.
- [ ] Guest login works. Google sign-in works (if configured).
- [ ] Start an **online match** (two browsers) → matchmaking pairs, moves sync live,
      result + trophies apply. (Confirms Socket.IO `/rt` + CORS on the API host.)
- [ ] Store: buy a **gold** item (no real money) → balance + inventory update. Equip it.
- [ ] Diamond **top-up**: start checkout → PayMongo page opens. Complete a real test
      purchase → webhook credits diamonds (check the ledger / balance). Verify a
      **single** credit (no double-credit).
- [ ] Season page: unlock the pass (diamonds) → charged once, `hasPass` true. The
      season pass does **not** appear in the general Store grid.
- [ ] Profile: edit name/bio, change avatar → persists. Match replay opens & plays.
- [ ] Guild: create/join, open guild chat → messages send + persist + appear live.
- [ ] Spot-check rate limits: rapid repeated logins get throttled (429) after ~10.

---

## 8. Rollback
- [ ] If anything is wrong post-cutover, revert the Hostinger records to Firebase
      (keep the old values noted before Step 6). Railway keeps running on its temp URLs
      for further debugging.

---

### Notes / rationale
- **Why `SameSite=None` + `COOKIE_DOMAIN`**: the SPA and API are different subdomains,
  so auth cookies must be `SameSite=None; Secure` and scoped to `.filipinodama.com` to
  ride cross-site requests. This is enabled automatically when `NODE_ENV=production`;
  `COOKIE_DOMAIN` supplies the shared parent.  (Alternative: serve the API under a path
  of the same origin, e.g. `filipinodama.com/api`, which keeps cookies first-party — but
  the subdomain split above is the assumed topology.)
- **Why the boot gate**: prevents shipping with the repo's published dev JWT secrets
  (which would let anyone forge tokens) or localhost CORS.
- Docker Compose in this repo is **local dev only** (Postgres+Redis); production uses
  Railway's managed plugins, not Docker.
