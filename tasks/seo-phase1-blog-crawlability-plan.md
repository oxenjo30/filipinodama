# SEO Phase 1 — Blog-First Crawlability (Plan v2, post multi-agent review)

**Goal:** Make filipinodama.com's content visible to Google + AI answer engines by
emitting real HTML for the content routes — starting with the 145-article blog,
which is 100% static and the highest-leverage, lowest-risk win in the codebase.

**Scope chosen:** Blog-first (approved 2026-07-18). Home + `/blog` + `/blog/:slug`
only. `/learn` (auth-gated) deferred to a later phase.

**v2 note:** This revision incorporates three independent code reviews. Five real
defects in v1 were corrected (auth-gate blocker, prerender tool choice, duplicate
canonical, build-time timezone bug, and the `serve -s` vs "real 404" contradiction).
Confirmed against code before rewriting — see each item's evidence.

**Boundaries:**
- Do NOT change the game SPA behavior, auth flows, sockets, payments, or `/api/*`.
- Do NOT alter Damath (owner directive: web-only, leave as-is).
- Do NOT touch `/learn`, `/play/*`, or any auth-gated route's behavior.
- Deploy stays `serve -s dist` **unless the owner approves the 404 change** (see item 7).

---

## Root-cause recap (verified against code)

1. **SPA renders nothing in HTML.** `BrowserRouter`, no SSR/prerender. Empty `#root`.
2. **The whole app is gated behind an async auth call.** `App.tsx:70-89` returns a
   `Loading…` spinner and does **not even mount `<BrowserRouter>`/`<Routes>`** until
   `ready` is true; `ready` only flips after `bootstrap()` awaits `GET /api/auth/me`
   (`authStore.ts:40-48`), which is unreachable at build time. **This is the true #1
   blocker — a naive snapshot captures only the spinner.** (All three reviewers caught
   this independently; confirmed at `App.tsx:70`.)
3. **Soft 404s.** PWA `navigateFallback:"/index.html"` + `*`→`NotFoundPage` returns 200.
4. **One `<head>` for all routes**; no per-page meta; no JSON-LD.

Positive assets (do not redo): strong static `<head>`, `robots.txt = Allow: /`
(AI bots already allowed), sitemap declared, GA4+Pixel, and **145 pre-authored
articles** in `articles.json` (35 live today, 110 future drip; Rules 48, Guides 62,
Strategy 24, Culture 11). Dataset is clean: 0 dup slugs, 0 null dates, 0 unsafe path
chars, 0 `<script>` in bodies, all `T12:00:00Z` timestamps.

---

## Approach: build-time prerender via `react-dom/server` (NOT react-snap)

**Tool decision (was left open in v1; reviewers flagged both alternatives):**
- ❌ **react-snap** — launches headless Chromium; Railway RAILPACK image lacks Chrome
  system libs (build-fail risk), package is unmaintained, and it crawls *all* SPA
  routes (violates Damath/scope boundaries).
- ❌ **vite-react-ssg** — wants to own routing; forces rewriting `main.tsx`'s
  `createRoot` mount + `App.tsx` `<Routes>` into its route config. Too large a blast
  radius for "near-zero risk."
- ✅ **Custom post-build Node script using `renderToString` + `StaticRouter`** — no
  browser, no extra system deps, renders ONLY the 3 target route shapes, fully
  additive (`build` gains `&& node prerender.mjs`), deploy unchanged. Blog components
  render safely static (body via `dangerouslySetInnerHTML`; all `me`/API bits are
  already null-guarded so they render empty in the static pass).

Because we chose `renderToString`, **Helmet does NOT serialize automatically** — we
MUST thread `HelmetProvider` `context` and inject `helmet.renderStatic()` output into
the template head (item 3). A body-only check would silently pass with zero head tags,
so acceptance explicitly asserts head tags too.

---

## Work items (ordered; item 1 is a prerequisite)

### 1. PREREQUISITE — decouple content render from the auth gate  ⬅ do first
- [ ] Move the `if (!ready)` spinner out of `App` so `<BrowserRouter>`/`<Routes>`
      mount immediately. Gate only the auth-dependent chrome (inside `AppLayout` or
      the specific `me`-dependent widgets). `AppLayout` already reads `me` with
      `null` guards (`AppLayout.tsx:64`, `me && …`), and Blog pages already tolerate
      `me == null`, so article bodies render with no session.
- [ ] Verify the running app is unchanged for real users (still bootstraps, still
      shows correct logged-in/out chrome) — this is a behavior-sensitive refactor of
      the app root; test the live app, not just the build.
- [ ] **Acceptance:** with the API stubbed/unreachable, `/blog/<slug>` still renders
      the article body (no spinner lock).

### Hydration strategy (decided during item 1)
- [x] Keep `main.tsx` on `createRoot` (NOT `hydrateRoot`). The client re-renders the
      SPA from scratch over the prerendered DOM instead of hydrating it. This makes a
      spinner-vs-content **hydration mismatch impossible** (nothing is hydrated), keeps
      real-user behavior byte-identical to today (spinner → app), and needs zero
      hydration wiring. The prerendered HTML exists purely for crawlers + first paint.
      Trade-off accepted: one imperceptible client re-render over already-painted HTML.

### 2. Prerender script
- [ ] `apps/web/prerender.mjs` (plain ESM, runs AFTER `pnpm --filter web build` as the
      last step of web's `build`; keep it out of `tsc -b`). Sets
      `globalThis.__PRERENDER__ = true` before `renderToString` (unblocks item 1's gate).
- [ ] Build the live-slug list with a **build-time, `Asia/Manila`-anchored** "today"
      (item 6) — do NOT reuse ambient-TZ `isPublished()`.
- [ ] For `/`, `/blog`, and each live `/blog/<slug>`: `renderToString(<StaticRouter
      location=…><App/></StaticRouter>)` with a `HelmetProvider` context, inject body
      + head into the built `index.html` template, write `dist/blog/<slug>/index.html`.
- [ ] **De-link future-target internal links** (item 5).
- [ ] **Acceptance:** built article file's raw HTML contains BOTH the article body
      text AND `<title>`/canonical/`application/ld+json` (not just body).

### 3. Per-route `<head>` (react-helmet-async) + strip shell tags  ⬅ prevents deindex
- [ ] **Remove page-specific tags from `apps/web/index.html`**: `<title>`,
      `description`, `canonical`, all `og:*`, all `twitter:*`. Keep only global tags
      (charset, viewport, theme-color, icons, apple-*, manifest, GA4, Pixel).
      *Why:* otherwise every prerendered article ships the shell's homepage
      `canonical=…/` alongside Helmet's — duplicate/conflicting canonicals can
      **deindex all 35 articles** (confirmed `index.html:19,22-33`).
- [ ] Install `react-helmet-async`, wrap app in `HelmetProvider`.
- [ ] Add a root/home default `<Helmet>` re-emitting the homepage title/desc/canonical/
      OG so `/` is unchanged after the strip.
- [ ] `/blog` list head; `/blog/:slug` per-article `<title>`, meta description (from
      `description`), canonical `https://filipinodama.com/blog/<slug>`, OG/Twitter.
      Migrate ArticlePage's imperative `document.title` (`ArticlePage.tsx:145`) to Helmet.
- [ ] Wire `helmet.renderStatic()` in `prerender.mjs` and inject into the head.
- [ ] **Acceptance:** `grep -c 'rel="canonical"'` on a built article == 1, and it's
      the article URL, not `/`.

### 4. JSON-LD structured data (with site-level defaults)
- [ ] `/` (home, prerendered): `WebSite` + `Organization`.
- [ ] `/blog/:slug`: `Article` + `BreadcrumbList` (Home › Blog › title). Fill the
      fields `articles.json` lacks from **site-level constants** (no data migration):
      - `author` = `{ "@type":"Organization","name":"FilipinoDama" }`
      - `publisher` = Organization + `logo` ImageObject (existing brand asset)
      - `image` = fallback to site OG image (`/assets/brand/og-image.png`)
      - `dateModified` = `datePublished` when absent
      - `mainEntityOfPage` = canonical article URL; `headline` = title
- [ ] Emit via Helmet `<script type="application/ld+json">` so it lands in the HTML.

### 5. De-link future-target internal body links
- [ ] `ArticlePage.rewriteBodyLinks` (`ArticlePage.tsx:110`) rewrites bare `*.html`→
      `/blog/<slug>`. All 493 links resolve to real slugs (0 garbage), BUT **11 links
      on live pages point to future-dated (not-yet-live) articles** — crawlable
      dead-ends / thin "not published yet" pages.
- [ ] In the prerender pass ONLY, rewrite links whose target isn't in the live set to
      point to `/blog` (or strip the `<a>`). Leave client behavior unchanged for users.

### 6. Build-time "live" definition (timezone-correct)
- [ ] Compute "today" as the `Asia/Manila` calendar day
      (`Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila'})`), so the prerendered
      set is a **superset** of what any PH viewer sees. *Why:* Railway builds in UTC;
      the ambient `isPublished()` (`blog.ts:40`) would, for up to 8h/day, treat a
      same-day article as visible-to-PH-but-not-prerendered → a live SPA page with no
      static HTML. Article timestamps are all `T12:00Z`, so pub-day itself is
      TZ-invariant; only the "today" comparison is the hazard.
- [ ] Optionally also set `TZ=Asia/Manila` for the build to avoid hydration flicker.
- [ ] Key off `datePublished` only — never parse the date out of the slug prefix
      (the slug's date prefix differs from `datePublished`).

### 7. 404 handling — OUTCOME REVISED BY LIVE VERIFICATION (2026-07-19)
- [x] `noindex` via Helmet on `NotFoundPage`, "not published yet", and "not found"
      article states — done.
- [x] **Path A's premise was disproven by serving the built dist:** with `serve -s`,
      EVERY route (including `/blog` and every article) returned the home
      `index.html` — serve-handler's single-page rewrite suppresses directory-index
      resolution, so the prerendered files were never served at all. Controlled
      3-config experiment confirmed: a bare `**` catch-all rewrite poisons all other
      rules (not first-match-wins); with no catch-all, content routes resolve
      natively and unknown paths 404.
- [x] **Fix shipped:** `prerender.mjs` now generates `dist/serve.json` (enumerated
      SPA-route rewrites, NO catch-all) + a branded prerendered `dist/404.html`
      (with noindex). Result: prerendered routes serve their own files; SPA app
      routes serve the shell (HTTP 200); unknown URLs (incl. future-dated drip
      slugs) return **real HTTP 404** — better than Path A hoped for.
- [ ] ⚠ **OWNER SIGN-OFF NEEDED BEFORE DEPLOY:** `railway.web.json` startCommand
      changed `serve -s dist` → `serve dist` (one word). Without this, production
      never serves the prerendered HTML. Locally verified end-to-end; not committed.
- [ ] Regardless of the above: add workbox `navigateFallbackDenylist` for `/`,
      `/blog`, `/blog/*` so the service worker stops masking those with the cached
      `index.html` (fixes SW-side shadowing of the prerendered per-route HTML).

### 8. Sitemap — regenerate as a REPLACEMENT
- [ ] Build-time regen listing ONLY prerendered content URLs: `/`, `/blog`, and each
      live `/blog/<slug>` — from the same `Asia/Manila` live-slug list (never drifts).
- [ ] **Drop** `/store`, `/leaderboard` (thin/auth, not prerendered) and — for this
      phase — `/play`, `/learn` (not yet prerendered); re-add when their phase lands.
- [ ] Add honest `<lastmod>` per URL (`datePublished`/`dateModified`; `/` and `/blog`
      = latest published date). Verify `application/xml`.

### 9. Staleness — daily scheduled rebuild (NOT prerender-all-145)
- [ ] **OWNER ACTION:** schedule a daily redeploy of the `web` service so newly-due
      drip articles get static HTML within ≤24h without a code push. Options:
      (a) Railway cron redeploy of the web service (simplest — redeploy re-runs the
      build, and the build re-runs the Asia/Manila drip filter); (b) a scheduled
      GitHub Action that hits Railway's redeploy API/CLI daily (e.g. 00:30
      Asia/Manila, right after the drip day rolls over). Until enabled, a new
      article's static HTML appears at the next normal deploy; the SPA still shows
      it to users immediately (client-side drip check), so this is a crawl-freshness
      gap only.
- [x] Do **NOT** prerender all 145: emitting future-dated article HTML makes their
      bodies publicly crawlable/indexable **before** their publish date — a content
      leak that defeats the editorial drip. (Enforced: prerender emits live-only;
      unknown/future slugs now return HTTP 404.)

### 10. Verification — DONE 2026-07-19 (evidence in session log)
- [x] Clean `pnpm build` passes (tsc + client + SSR + prerender + PWA); 37 pages.
- [x] Raw built files: article body + one `<title>` + ONE canonical (the article's
      own URL) + Article/BreadcrumbList JSON-LD; home has WebSite/Organization.
- [x] **Served over HTTP** (`npx serve dist`, production-equivalent): `/`=66591B,
      `/blog`=32697B, article=25807B — each its own file; `/play`/`/profile`/etc =
      200 + shell; unknown + future slugs = HTTP 404 branded page w/ noindex; JS
      bundle 200; sitemap `application/xml`, 37 URLs, lastmod, no thin routes.
- [x] De-linking: 0 `<a>` to future slugs in prerendered pages (spans instead).
- [x] Auth/game behavior: `createRoot` (no hydration path) keeps real-user flow
      byte-identical; `__PRERENDER__` is never set in browsers. NOT verified in a
      live browser session this pass: visual login/play flows (no browser used;
      curl-level only). Recommend one manual smoke test before deploy.

---

## Risks & mitigations
- **App-root refactor (item 1)** is the one behavior-sensitive change — verify the
  live app's auth chrome before/after.
- **Hydration mismatch:** blog is static; low risk; TZ-anchored build removes the
  midnight-boundary flicker.
- **PWA/prerender interaction:** `navigateFallbackDenylist` (item 7) required.
- **Helmet-not-serialized:** guaranteed unless `renderStatic()` is wired (item 3) —
  acceptance asserts head tags to catch it.

## Out of scope (later phases)
- `/learn` public rules content (Phase 1.5).
- Strategy/culture pillar pages, `/play` landing, Tagalog `/tl/`.
- Off-site authority (BGG, Wikidata), `llms.txt`.
- Hard-404 host change (item 7) unless owner approves.
