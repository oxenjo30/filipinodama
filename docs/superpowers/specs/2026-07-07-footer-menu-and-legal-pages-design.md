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
`handoff/FilipinoDama Royal.dc.html`, lines 2218–2238 (`<footer>` block). The
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
  - Left: three social icons — Facebook, YouTube, Discord — as inline SVGs
    transcribed from the prototype. Rendered as inert `<button>`s (no real URLs
    yet); non-functional placeholders per decision.
  - Center: `STRATEGY · HERITAGE · VICTORY` tagline — `font: 600 12px Cinzel,serif`,
    letter-spacing 3px, `color: var(--gold)`.
  - Right: `© 2025 filipinodama.com` — `font: 500 12px Inter`, `color: var(--ink2)`.
- Hairline divider (`height:1px;background:rgba(232,184,75,.12)`).
- **Bottom row** (flex, space-between, wraps):
  - Left: legal nav — Privacy Policy, Terms of Service, Community Guidelines,
    Data & Account, Contact — as `<button>`s that navigate via react-router
    `useNavigate`.
  - Right: `Rated E for Everyone`.

Wrapper: `border-top:1px solid rgba(232,184,75,.2)`, inner max-width 1560px,
padding `22px 26px`, matching the prototype.

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

### 3. Legal — split into four routes with a shared layout

- **`apps/web/src/features/legal/LegalLayout.tsx` (new)** — holds the shared shell
  (sidebar nav + content column), the `LEGAL_DATA` record, and the `TABS` list.
  Takes an `active: LegalKey` prop that selects which document to render and which
  sidebar tab is highlighted. The sidebar tabs become **real router navigation**
  (`navigate("/terms")` etc.) instead of local `useState`.
- **`apps/web/src/features/legal/LegalPage.tsx`** — replaced. Its `LEGAL_DATA`,
  `TABS`, `LegalKey`, `LegalDoc`, and the render shell move into `LegalLayout`.
  Four thin page components render `<LegalLayout active="..." />` — either as
  named exports in one file or as tiny per-route wrappers; implementation plan to
  pick the cleaner form.
- **Routes** in `apps/web/src/App.tsx`:
  - `/privacy` → `<LegalLayout active="privacy" />`
  - `/terms` → `<LegalLayout active="terms" />`
  - `/community` → `<LegalLayout active="community" />`
  - `/data` → `<LegalLayout active="data" />`
  - `/legal` → redirect to `/privacy` (keeps existing inbound links working:
    ContactPage's two `/legal` links, AuthPage's two `/legal` links, and
    SettingsPage's "Privacy & Terms" link).

### 4. Contact — unchanged

The existing `apps/web/src/features/contact/ContactPage.tsx` at `/contact` stays
as-is. The footer's Contact link points to it. (Its internal `/legal` links keep
working via the `/legal` → `/privacy` redirect; optionally they may be updated to
`/privacy` directly, but that is not required.)

## Data flow

- Footer link click → `useNavigate` → route change → the matching `LegalLayout`
  (or ContactPage) renders with the correct document pre-selected. No shared
  state; the active document is determined entirely by the route.
- Social icons: no navigation; inert until real URLs are provided.

## Styling

Verbatim inline styles from the prototype (gold hairline borders,
`var(--ink2)`/`var(--gold)`/`var(--gold-lt)` colors, Cinzel tagline). No new CSS
classes. The footer relies on the same CSS custom properties already used across
the app.

## Error handling / edge cases

- Unknown/removed legal route: not applicable — the four routes are explicit; any
  other path falls through to the app's existing `*` not-found route.
- `/legal` with no sub-path: redirects to `/privacy`.
- Short pages: `flex:1` on `<main>` keeps the footer pinned to the bottom.
- Narrow screens: rows use `flex-wrap: wrap` exactly as the prototype does; no
  separate mobile footer variant.

## Testing

- Manual/visual: footer appears on every in-app screen, matches the prototype
  layout in wide and narrow widths.
- Each footer legal link lands on its own route with the correct document shown
  and the correct sidebar tab highlighted.
- Sidebar tabs navigate between the four legal routes.
- `/legal` redirects to `/privacy`.
- Contact link opens the existing contact page.
- Existing inbound `/legal` links (ContactPage, Settings) still resolve.

## Out of scope

- Real Facebook / YouTube / Discord URLs (icons render but are inert).
- Editing any legal or contact copy.
- Reworking the existing contact page.
- Mobile-specific footer variants beyond the prototype's `flex-wrap` behavior.
