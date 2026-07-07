# Footer Menu & Per-Document Legal Pages — Design

**Date:** 2026-07-07
**Status:** Approved (pending spec review)

## Summary

Add the site-wide footer from the handoff prototype to the main web app, rendered
at the bottom of every in-app screen via `AppLayout`. As part of this, split the
existing tabbed `/legal` page into four dedicated routes (`/privacy`, `/terms`,
`/community`, `/data`) so each legal document has its own page, and point the
footer's legal links at those routes. The existing `/contact` page is unchanged;
the footer links to it.

## Source of truth

The footer is reproduced verbatim from the handoff prototype
`handoff/FilipinoDama Royal.dc.html`, lines 2219–2238 (`<footer>` element; line
2218 is the preceding comment). The
social icons come from that file's `ICONS.fb`/`ICONS.yt`/`ICONS.discord`
definitions (lines 2783–2785), which use the `RAW` SVG helper (line 2750):
`viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, stroke-width 2,
round caps/joins.

The legal document copy is the existing `LEGAL_DATA` already transcribed in
`apps/web/src/features/legal/LegalPage.tsx` (unchanged text). This design only
changes how that data is routed and laid out, not the copy.

## Components & files

### 1. Footer — `apps/web/src/features/layout/Footer.tsx` (new)

A self-contained component. Kept as its own file so `AppLayout` stays focused.

Structure (two rows, matching the prototype exactly):

- **Top row** (flex, space-between, wraps):
  - Left: three social icons — Facebook, YouTube, Discord — as inline React SVGs
    transcribed from the prototype (the `RAW` helper unrolled into an `<svg
    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
    strokeLinecap="round" strokeLinejoin="round">` with the fb/yt/discord paths).
    Rendered as inert `<button type="button">`s (no real URLs yet;
    non-functional placeholders per decision). **Each button MUST have an
    `aria-label`** (`"Facebook"`, `"YouTube"`, `"Discord"`) — an SVG-only button
    has no accessible name otherwise. Note: the prototype renders the icons as
    bare SVGs inside a `<div>`; wrapping them in labelled buttons is a deliberate
    divergence for future clickability + a11y.
  - Center: `STRATEGY · HERITAGE · VICTORY` tagline — `font: 600 12px Cinzel,serif`,
    letter-spacing 3px, `color: var(--gold)`.
  - Right: `© 2025 filipinodama.com` — `font: 500 12px Inter`, `color: var(--ink2)`.
- Hairline divider (`height:1px;background:rgba(232,184,75,.12)`).
- **Bottom row** (flex, space-between, wraps):
  - Left: legal nav — Privacy Policy, Terms of Service, Community Guidelines,
    Data & Account, Contact — as `<button>`s that navigate via react-router
    `useNavigate`.
  - Right: `Rated E for Everyone`.

Wrapper: `border-top:1px solid rgba(232,184,75,.2)` **and `margin-top:20px`**
(both from the prototype `<footer>` element, line 2219), inner max-width 1560px
with `margin:0 auto`, padding `22px 26px`.

**Templating note:** the prototype footer uses `sc-for`/`{{ }}` bindings and a
`style-hover="color:var(--gold-lt)"` attribute that has no React inline-style
equivalent. In the port: the `sc-for` legal loop becomes a `.map`; the icon
bindings become the unrolled inline SVGs above; and the legal-link **hover color
change is implemented with `onMouseEnter`/`onMouseLeave` local state** (not a CSS
class, to keep the footer self-contained). The social buttons, being inert, need
no hover.

Link targets:
- Privacy Policy → `/privacy`
- Terms of Service → `/terms`
- Community Guidelines → `/community`
- Data & Account → `/data`
- Contact → `/contact`

### 2. AppLayout — `apps/web/src/features/layout/AppLayout.tsx` (edit)

Render `<Footer />` after `</main>`, still inside the relative `flex-column`
wrapper (the one with `minHeight:100vh`). Because `<main>` has `flex:1`, the
footer is pushed to the bottom on short pages and sits below content on long ones.
`<Footer/>` calls `useNavigate`, which is valid here because `AppLayout` is itself
a routed element rendered inside `<BrowserRouter>` — the footer is NOT reusable
outside a router context.

### 3. Legal — split into four routes with a shared layout

> **File-name warning:** there are TWO files named `LegalPage.tsx` in the tree —
> `apps/web/src/features/legal/LegalPage.tsx` (the LIVE one, wired to the `/legal`
> route) and `apps/web/src/features/settings/LegalPage.tsx` (DEAD code — exports
> `LegalPage` but is imported nowhere; its docstring's "Reached from Settings"
> claim is stale/false). Every reference below is fully path-qualified. Do not
> edit the settings file by mistake.

- **`apps/web/src/features/legal/LegalLayout.tsx` (new)** — holds the shared shell
  (sidebar nav + content column), the `LEGAL_DATA` record, and the `TABS` list.
  Takes an `active: LegalKey` prop that selects which document to render and which
  sidebar tab is highlighted. The sidebar tabs become **real router navigation**
  (`navigate("/terms")` etc.) instead of local `useState`.
- **`apps/web/src/features/legal/LegalPage.tsx` (the LIVE one)** — replaced. Its
  `LEGAL_DATA`, `TABS`, `LegalKey`, `LegalDoc`, and the render shell move into
  `LegalLayout`. Four thin page components render `<LegalLayout active="..." />` —
  either as named exports in one file or as tiny per-route wrappers (cosmetic
  coin-flip, plan picks one). Either way the old `LegalPage` default export goes
  away, so `App.tsx`'s `import { LegalPage }` (line 16) is removed/rewritten.
- **`apps/web/src/features/settings/LegalPage.tsx` (the DEAD one)** — **delete
  it.** It is already unreferenced dead code and having two `LegalPage.tsx` files
  is a wrong-file hazard; removing it also stops future greps returning two hits.
- **Routes** in `apps/web/src/App.tsx` — **all four legal routes and the redirect
  MUST be placed INSIDE the `<Route element={<AppLayout />}>` block** (App.tsx
  ~line 79), alongside the other in-app routes. If placed outside it (where
  `/login` and `/register` live), they render with no top nav, no background, and
  **no footer** — defeating the deliverable. Routes:
  - `/privacy` → `<LegalLayout active="privacy" />`
  - `/terms` → `<LegalLayout active="terms" />`
  - `/community` → `<LegalLayout active="community" />`
  - `/data` → `<LegalLayout active="data" />`
  - `/legal` → `<Navigate to="/privacy" replace />` — **`Navigate` must be added
    to the `react-router-dom` import in `App.tsx`** (currently only
    `{ BrowserRouter, Routes, Route }` is imported; the codebase has no existing
    redirect, so this import is net-new). This keeps inbound links working (see
    below).
  - **SPA history fallback:** deep-linking or hard-loading `/privacy`, `/terms`,
    etc. (and the `/legal` redirect on a fresh tab) only works if the dev server
    and production host rewrite unknown paths to `index.html`. This is already
    required for every existing route, so it is a precondition, not new work —
    noted here because the new routes are reached via full-page `<a>` loads
    (see AuthPage below), not just SPA nav.

**Inbound `/legal` links** (verified exhaustive — repoint or rely on redirect):
- `ContactPage.tsx` lines 214, 302 — `navigate("/legal")`. Redirect covers them;
  optionally repoint to `/privacy`. Not required.
- `SettingsPage.tsx` line 272 — `navigate("/legal")`. Redirect covers it.
- `AuthPage.tsx` lines 371, 380 — these are raw `<a href="/legal" target="_blank">`
  anchors (full-page load, new tab), NOT `navigate()` calls. The redirect still
  resolves client-side, but the URL visibly flips `/legal`→`/privacy` in the new
  tab. **Repoint these directly:** line 371 ("Terms & Conditions") → `/terms`,
  line 380 ("Privacy Policy") → `/privacy`.

### 4. Contact — unchanged

The existing `apps/web/src/features/contact/ContactPage.tsx` at `/contact` stays
as-is. The footer's Contact link points to it. Its two internal `navigate("/legal")`
links keep working via the redirect (see the Inbound links list above; repointing
them is optional and not required).

## Data flow

- Footer link click → `useNavigate` → route change → the matching `LegalLayout`
  (or ContactPage) renders with the correct document pre-selected. No shared
  state; the active document is determined entirely by the route.
- Social icons: no navigation; inert until real URLs are provided.

## Styling

Inline styles ported from the prototype (gold hairline borders,
`var(--ink2)`/`var(--gold)`/`var(--gold-lt)` colors, Cinzel tagline). No new CSS
classes — the one dynamic affordance, the legal-link hover color, is handled with
`onMouseEnter`/`onMouseLeave` local state rather than a class (see the templating
note under the Footer component). The CSS custom properties (`--gold` `#E8B84B`,
`--gold-lt` `#F5D783`, `--ink2` `#9a86bd`) already exist in `index.css`.

## Error handling / edge cases

- Unknown/removed legal route: not applicable — the four routes are explicit; any
  other path falls through to the app's existing `*` not-found route.
- `/legal` with no sub-path: redirects to `/privacy`.
- Short pages: `flex:1` on `<main>` keeps the footer pinned to the bottom.
- Narrow screens: rows use `flex-wrap: wrap` exactly as the prototype does; no
  separate mobile footer variant.

## Testing

- Manual/visual: footer appears on every in-app screen, matches the prototype
  layout (including `margin-top:20px` gap) in wide and narrow widths; NOT on
  `/login` or `/register` (outside the layout route).
- Each footer legal link lands on its own route with the correct document shown
  and the correct sidebar tab highlighted.
- Sidebar tabs navigate between the four legal routes.
- `/legal` redirects to `/privacy` (both via SPA nav and a hard/deep-load in a
  fresh tab — the AuthPage anchors exercise the hard-load path).
- Deep-linking / hard-refreshing `/privacy`, `/terms`, `/community`, `/data`
  directly loads the correct document (confirms SPA history fallback + route
  placement).
- Contact link opens the existing contact page; AuthPage links now open `/terms`
  and `/privacy` directly (no visible `/legal` redirect flip).
- Existing inbound `/legal` links (ContactPage, Settings) still resolve.
- Accessibility: each social button exposes an accessible name (`aria-label`);
  verify with the accessibility tree / a screen reader, not just visually.
- Focus/scroll: switching legal routes keeps the sticky sidebar usable; no scroll
  reset is required (same shared layout), and focus remains on the activated tab.

## Out of scope

- Real Facebook / YouTube / Discord URLs (icons render but are inert).
- Editing any legal or contact copy.
- Reworking the existing contact page.
- Mobile-specific footer variants beyond the prototype's `flex-wrap` behavior.
