# Fable 5 Handoff — SEO Phase 1 (Blog Crawlability) COMPLETE, pending owner sign-off

## Goal
Make filipinodama.com's content visible to Google + AI answer engines. Phase 1
(blog-first) is BUILT and LOCALLY VERIFIED. Full strategy: `filipinodamaseostrategy.md`.

## Mode
Delegation (was). Next session: owner decisions below, then Phase 2 content work.

## Source of Truth
- Plan + evidence: `tasks/seo-phase1-blog-crawlability-plan.md` (all items checked, v2)
- Strategy (corrected against real codebase): `filipinodamaseostrategy.md`

## Non-Negotiable Rules
- Damath stays web-only, untouched. Do not alter auth/sockets/payments.
- Never prerender future-dated drip articles (content leak).
- prerender template must be read once-pristine; serve.json must NEVER get a `**`
  catch-all rewrite (poisons directory-index resolution — proven empirically).

## Completed (all locally verified over HTTP, none committed to git yet)
1. Prerender pipeline: `vite build` → `vite build --ssr src/entry-prerender.tsx
   --outDir dist-ssr` → `node scripts/prerender.mjs` = 37 static pages (/, /blog,
   35 live articles, Asia/Manila drip-anchored) + 404.html + serve.json + sitemap.
2. Per-route heads via react-helmet-async (`src/lib/seo.tsx` — SiteHead + JSON-LD
   builders); page-specific tags stripped from index.html shell (deindex hazard).
3. App root: `AppRoutes` extracted (BrowserRouter stays browser-only; StaticRouter
   for SSR); `__PRERENDER__` bypasses the auth-loading gate at build time only;
   client keeps `createRoot` (no hydration, zero mismatch risk).
4. noindex on NotFound/coming-soon/not-found states; workbox
   `navigateFallbackDenylist` for /, /blog/**; future-target links de-linked in
   prerendered output; sitemap regenerated (37 URLs, lastmod, no thin routes).
5. Files touched: apps/web/{index.html, vite.config.ts, package.json,
   src/App.tsx, src/main.tsx, src/lib/seo.tsx(new), src/entry-prerender.tsx(new),
   scripts/prerender.mjs(new), scripts/live-articles.mjs(new),
   src/features/{home/HomePage,blog/BlogPage,blog/ArticlePage,shared/NotFoundPage}.tsx},
   railway.web.json, .gitignore, .railwayignore. Dep added: react-helmet-async@3.

## OWNER DECISIONS PENDING (blocking deploy)
1. **`railway.web.json` startCommand changed `serve -s dist` → `serve dist`** (one
   word). REQUIRED: with `-s`, production serves the home shell for every route and
   the prerender is dead (verified). Bonus: unknown URLs now get real HTTP 404s.
2. **Enable a daily redeploy** of the web service (Railway cron or scheduled GH
   Action, ~00:30 Asia/Manila) so newly-due drip articles get static HTML daily.
3. Commit + PR: nothing is committed; working tree holds all changes.

## Remaining Work (Phase 1.5 / 2 — new chat each)
- Manual browser smoke test (login → play flow) before deploy — only curl-level
  user-flow verification was done this pass.
- After deploy: GSC submit sitemap, verify indexing; spot-check AI crawlers get HTML.
- Phase 1.5: public `/learn` rules content (auth-gated today — needs static section).
- Phase 2: pillar pages (/strategy, /play landing, traditional-games), Tagalog /tl/,
  llms.txt, entity work (BGG/Wikidata).

## Acceptance Criteria (met — evidence in plan §10)
`curl` of served article returns body text + its own single canonical + Article
JSON-LD; SPA routes 200; unknown/future URLs 404+noindex; build green (tsc clean).

## Evidence Rule
Only report work there is evidence for. The ONE unverified item: live-browser
visual smoke test of auth/game flows (curl-only this pass). Everything else has
command output in the session log + plan §10.
