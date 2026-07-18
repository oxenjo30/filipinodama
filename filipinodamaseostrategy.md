# FilipinoDama.com — SEO & AI Search Strategy

**Prepared:** July 18, 2026 · **Goal:** Rank #1 on Google (Philippines) and be the cited source in AI answers (ChatGPT, Gemini, Claude, Perplexity, Google AI Overviews) for the target keyword set.

**Target keywords:** checkers · checkers online / dama online · board games philippines · pinoy games · dama rules · traditional filipino games · dama strategy

---

## Part 1 — Current Site Evaluation

I audited the **current production codebase** — the `filipinodama-royal` monorepo, web app at `apps/web/` (Vite + React + `react-router`, deployed on Railway as a static `serve -s dist` bundle) — plus the live robots.txt and sitemap. (An earlier version of this doc audited the old `legacy/prototype` site; the findings below are re-verified against the code that is actually deployed today, and correct two stale claims from that earlier pass — see the callouts marked ✅/⚠️.)

### What's working

- **Domain is a perfect exact-match** for the core entity ("Filipino Dama") — a real asset for both Google and AI entity recognition.
- **Strong metadata on the shell ✅**: `apps/web/index.html` already has title ("FilipinoDama Royal — Play Filipino Dama Online"), meta description, canonical URL, full Open Graph + Twitter Card tags, theme color, PWA meta, plus GA4 and Meta Pixel. This is better than the earlier audit credited — the head is close to production-ready; the gap is that it's the **same head for every route** (see #3 below).
- **robots.txt already allows all crawlers ✅**: the live `apps/web/public/robots.txt` is `User-agent: * / Allow: /` and declares the sitemap. It does **not** block AI bots (correcting the earlier audit — see #2). AI answer engines are already permitted; the reason they can't cite the site is crawlability (#1), not robots.
- **The rules/lessons content is genuinely good** — the `LearnPage` / `LessonPage` React components cover objective, board setup, mandatory capture, flying dama, maximum-capture rule, with diagrams. This is exactly the content the keyword set demands. The problem is that no crawler can see it because it renders client-side only (next section).
- **A production rebuild (FilipinoDama Royal) is already planned** — React/Vite/Fastify monorepo. This is the ideal moment to bake SEO into the architecture instead of retrofitting it.

### Critical problems (ordered by severity)

**1. The entire site is invisible to search engines and AI. (Blocker)**
The web app is a 100% client-rendered SPA (`react-router` `BrowserRouter`, no SSR/prerender/SSG anywhere in `vite.config.ts` or the build). Every route — `/`, `/learn`, `/learn/:id`, `/blog`, `/blog/:slug` — is served from the same `index.html` and returns an empty `<div id="root"></div>` with **no body text**. All the rules/strategy content only exists after the JS bundle executes and React mounts. Googlebot can eventually render JS (slowly and unreliably), but AI crawlers and answer engines largely **do not execute JavaScript at all**. As far as ChatGPT, Perplexity, Claude, and most of Google's ranking signals are concerned, filipinodama.com is a blank page with a title tag. Nothing else in this strategy works until this is fixed.

Compounding it: `vite.config.ts` sets the PWA `navigateFallback: "/index.html"` and the router's catch-all `*` renders `NotFoundPage` with an HTTP **200**, so unknown/removed URLs are **soft 404s** — they burn crawl budget and can keep dead URLs indexed.

**2. ⚠️ CORRECTION — robots.txt does NOT block AI crawlers.**
The earlier audit claimed robots.txt disallowed ClaudeBot, GPTBot, CCBot, Amazonbot. That is **not** true of the deployed site: `apps/web/public/robots.txt` is `User-agent: * / Allow: /` with no `Disallow` and a declared sitemap. **AI answer/citation bots are already allowed** — this is a solved problem, not an open one. (If you later decide to *withhold training data* while keeping *search/citation* access, that becomes a deliberate opt-out choice — block `GPTBot`/`CCBot` while leaving `OAI-SearchBot`, `ChatGPT-User`, `PerplexityBot`, `Perplexity-User`, `Claude-SearchBot`, `Claude-User`, and `Google-Extended` allowed. Today nothing is blocked, so no action is required to be AI-crawlable.)

**3. One set of metadata for every page.**
Because it's an SPA with a single `index.html`, `/learn` has the same title, description, and canonical as the homepage. There is no per-route `<head>` (`react-helmet` is not installed). No page can rank for its own keyword ("dama rules" needs a page *titled* for it).

**4. Indexed 404s / lost blog content.**
Google has already indexed `filipinodama.com/blog/posts/2026-07-02-can-you-move-backwards-in-dama` — and it now shows "Page not found." A blog existed (or was prerendered) and its content is gone. `/blog` currently serves the app shell and unknown routes client-redirect to `/home` with a 200 status (soft 404s). This wastes crawl equity and burns whatever early rankings that post earned. Question-format posts like "can you move backwards in dama" are *exactly* the right AEO content — this needs to come back.

**5. No structured data.**
No JSON-LD anywhere: no `VideoGame`, `WebSite`, `Organization`, `FAQPage`, `HowTo`, `Article`, or `BreadcrumbList` schema. Structured data is a primary input for rich results and for how AI systems understand entities.

**6. Sitemap health unverified.**
`sitemap.xml` is referenced in robots.txt but served in a way my fetch couldn't parse (possibly wrong content-type or gzip served without headers). Verify it returns `application/xml`, lists real indexable URLs, and is submitted in Google Search Console.

**7. No indexable content depth.**
Beyond the (invisible) rules page, there are no content pages: no strategy guides, no cultural/history content, no FAQ, no Tagalog content. The keyword set spans informational intent ("dama rules," "traditional filipino games") that a game app alone can never capture.

---

## Part 2 — Keyword Landscape & Realistic Targets

Research on the current SERPs shows a very winnable market for the core dama terms and a harder fight for the generic ones.

| Keyword | Intent | Who ranks today | Difficulty | Realistic target |
|---|---|---|---|---|
| **dama rules** | Informational | 2014 Blogspot, Scribd PDFs, Studocu, WordPress blogs, Ludii | **Low** — weak, outdated SERP | **#1 in 3–6 months** |
| **dama strategy** | Informational | Blogspot, Facebook posts, YouTube, gamesguide.com.ph | **Low** — almost no dedicated pages | **#1 in 3–6 months** |
| **filipino dama** (brand/entity) | Mixed | BoardGameGeek, app stores, NewVenture Games | **Low–Med** | **#1 in 3–6 months** |
| **dama online / play dama online** | Transactional | App stores, PlayOK (Turkish/Italian dama), playculturalgames.com | **Medium** | **Top 3 in 6–9 months** |
| **traditional filipino games** | Informational | Wikipedia, Kiddle, FilipiKnow, Staycations.ph | **High** — authority sites | **Top 5 in 9–12 months** |
| **pinoy games** | Broad/ambiguous | Mixed (video games, larong pinoy lists) | **Medium–High** | Top 5 in 9–12 months |
| **board games philippines** | Commercial | Toy Kingdom, Gaming Library, retail | **High** — commerce SERP, mismatched intent | Top 5–10 in 12 months via listicle angle |
| **checkers / checkers online** | Global head term | 247checkers, chess.com-tier sites, app stores | **Very high** globally | Realistic: rank in **PH-localized SERPs** for "checkers online" over 12+ months; own "filipino checkers" much sooner |

Honest note on "Checkers": #1 globally for "checkers" is not achievable in a planning horizon — that SERP belongs to massive, decade-old sites. The winning play is to **own the entire "dama / Filipino checkers" cluster first** (where you can be the definitive world authority), then let that authority + PH geo-relevance pull you up the localized "checkers online" SERP. In AI answers, however, you *can* quickly become the canonical source for "Filipino dama/checkers" — models cite topical authorities, not domain-rating giants.

---

## Part 3 — The Plan

### Phase 1 · Technical foundation (Weeks 1–4) — makes everything else possible

1. **Make content server-rendered or prerendered.** Keep the game itself an SPA/PWA, but emit all *content* routes (`/`, `/learn`, `/learn/:id`, `/blog`, `/blog/:slug`, and a new `/play` landing + strategy pages) as static prerendered HTML at build time. Practical fit for the current stack (Vite static bundle on Railway): a prerender step — `vite-react-ssg` or a `react-snap` post-build pass — targeting only the content routes; the deploy command (`serve -s dist`) is unchanged, it just ships real HTML files. Full text in the HTML source is the acceptance test: `curl https://filipinodama.com/learn` must return readable rules.
2. **Per-page metadata**: unique title, meta description, canonical, and OG image per route. Title patterns: "Dama Rules — How to Play Filipino Checkers (Complete Guide)", "Filipino Dama Strategy: 12 Ways to Win", "Play Filipino Dama Online Free".
3. **robots.txt — no action needed for crawlability** (per Part 1 #2): it already allows all bots. *Optional later:* if you decide to withhold training data, block `GPTBot`/`CCBot` only while keeping the search/citation bots allowed. Do this only as a deliberate business choice, not as a fix.
4. **Real 404s + redirects**: unknown routes return HTTP 404; restore or 301 the indexed `/blog/posts/...` URLs. Re-publish the "Can you move backwards in dama?" post — it was already getting indexed.
5. **Sitemap**: correct content-type, only canonical indexable URLs, auto-updated on publish; submit in Google Search Console (set up GSC + GA4 now, PH geo data will guide everything).
6. **Structured data (JSON-LD)**: `WebSite` + `Organization` on the root; `VideoGame` (name: "Filipino Dama", alternateName: "Dama, Filipino Checkers", genre, gamePlatform: Web) on the play pages; `FAQPage` on rules/FAQ; `HowTo` on the rules guide; `Article` + `BreadcrumbList` on blog posts.
7. **Performance**: the PWA is already mobile-first; verify Core Web Vitals (LCP < 2.5s on 3G-class connections — most PH dama searches are mobile) and compress the hero art to webp/avif (already planned in the Royal spec).

### Phase 2 · Content engine (Months 1–3) — wins the winnable keywords

Build four pillar pages, each the single best resource on the internet for its query, each with a "Play now" path into the game (content ranks → game converts):

1. **/learn — "Dama Rules: How to Play Filipino Checkers"** (~2,500 words). Expand the existing `LearnPage` rules content: setup, movement, mandatory capture, maximum-capture rule, flying dama, notation, differences vs. American checkers and vs. Turkish/Italian dama, printable board, FAQ block ("Can you move backwards in dama?", "Is capturing mandatory?", "How many pieces in dama?"). This SERP is Blogspot-from-2014 weak — a definitive page with interactive diagrams wins it.
2. **/strategy — "Filipino Dama Strategy" hub** with supporting posts (opening principles, forcing sequences, endgame with flying damas, common traps, sample annotated games). Nobody has a real strategy site for dama; YouTube and Facebook posts rank today.
3. **/traditional-filipino-games — cultural hub**: dama's place in larong pinoy, history, plaza culture, dama in Philippine schools (MAPEH/PE — note that Studocu and Scribd rank for "dama rules" because *students* search this; a clean, citable, teacher-friendly page can capture the .edu ecosystem), plus an honest guide to other traditional games (sungka, luksong tinik, patintero…) that links back to dama as "the one you can play online right now." This is the long-game asset for "traditional filipino games" and "pinoy games."
4. **/play (landing) — "Play Filipino Dama Online Free"**: transactional page targeting "dama online," "play dama online," "filipino checkers online" — feature list, screenshots, vs-AI and multiplayer modes, no-download/PWA angle.

Ongoing cadence: 2–4 blog posts/month answering real question queries (People Also Ask mining): "dama vs checkers difference," "how to become dama in dama," "is dama a Filipino game?", "dama board how many squares." Add **Tagalog/Taglish versions** of the rules and strategy pages (`/tl/` with hreflang en-PH ↔ fil-PH) — competition in Tagalog is near zero and it strengthens PH geo-relevance.

### Phase 3 · Authority & links (Months 2–6)

- **Own your entity across the graph**: complete the BoardGameGeek "Filipino Dama" listing with a link; Wikidata entry for the game/site; contribute (neutrally, with citations) to the Wikipedia "Traditional games in the Philippines" article's dama coverage — Wikipedia/Wikidata are top AI-grounding sources.
- **PH link outreach**: FilipiKnow, gamesguide.com.ph, 8List, Scout/Inquirer lifestyle (they already write "Filipino board games" listicles — pitch the "classic games going digital" story), university PE departments and MAPEH teacher resources (offer a free classroom rules PDF), local esports/gaming communities.
- **Community presence**: r/Philippines and r/casualPH, Facebook dama groups (they're active — "Philippine damas strategies" groups rank in search!), a YouTube channel with short strategy clips (YouTube results currently rank for "dama strategy"; video → embeds → links).
- **Digital PR angle**: leaderboards/tournaments are on the roadmap — an online "National Dama Open" is an inherently newsworthy, linkable event in PH media.

### Phase 4 · AI answer optimization (continuous, starts Week 1)

Getting recommended by ChatGPT/Claude/Perplexity/AI Overviews:

- **Crawlability first** (Phase 1 items 1–3 — HTML-visible content + unblocked answer bots are 80% of AEO).
- **Quotable, extractable formatting**: every pillar page opens with a 2–3 sentence direct-answer definition ("Filipino Dama is the Philippine variant of checkers/draughts, played on an 8×8 board where captures are mandatory and the 'dama' (crowned piece) moves any distance diagonally…"). FAQ blocks with question-form H2/H3s mirror how people prompt AI.
- **Consistent entity naming** everywhere: "Filipino Dama (Filipino checkers / dama)" — same phrasing on-site, on BGG, Wikidata, and social profiles, so models converge on one entity with filipinodama.com as its home.
- **Add an `llms.txt`** at the root summarizing the site and pointing to the canonical rules/strategy pages (emerging convention; cheap to add).
- **Freshness signals**: dated updates on pillar pages; AI search engines strongly favor recently-updated sources.

### Measurement

Weekly: GSC impressions/positions for the 8 target keywords (PH geo), indexed-page count, Core Web Vitals. Monthly: organic sessions → game-start conversion, AI citation spot-checks (ask ChatGPT/Perplexity/Claude "how do you play Filipino dama?" / "where can I play dama online?" and log whether filipinodama.com is cited), backlink growth. Quarterly milestones: **Q1** — technical foundation live, 4 pillars published, rules/strategy pages indexed and moving; **Q2** — #1 on "dama rules"/"dama strategy," top 3 "filipino dama," first AI citations; **Q3–Q4** — top 3 "dama online," top 5 "traditional filipino games," PH-localized "checkers online" climbing.

---

## Priority summary — do these first

1. Prerender/SSR the content routes (nothing else matters until crawlers see text).
2. ~~Unblock AI answer-engine bots in robots.txt.~~ **Already done** — robots.txt is `Allow: /`. No action needed.
3. Restore the blog + fix 404 handling; set up GSC.
4. Per-page metadata + JSON-LD.
5. Publish the four pillar pages, starting with the expanded Rules guide.
