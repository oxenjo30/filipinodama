# DESIGN_SYSTEM.md — Theme, Colors, Fonts, Components

Every token below is lifted from the approved prototype (`FilipinoDama Royal.dc.html`). Reproduce it exactly. Put these in `apps/web/src/theme/tokens.css` as CSS variables and expose them to Tailwind via a preset.

## Brand & mood
Regal Filipino-heritage. Deep royal purple field, gold ornamentation, crimson-vs-royal-blue as the two player colors, marble-and-gold board. Ornate bordered "frame" cards. No AI-slop gradients, no emoji-as-icons (except the intentional ✦ 🏆 🪙 💎 accents that already appear).

## Color tokens

```css
:root{
  /* gold family */
  --gold:      #E8B84B;
  --gold-lt:   #F5D783;
  --gold-dp:   #C99A2E;
  --gold-hi:   #F7E2A0;   /* headline gradient top */
  --gold-lo:   #D5A63A;   /* headline gradient bottom */
  /* players */
  --red:       #A0303A;   /* Red / crimson player */
  --blue:      #2E6BC6;   /* Blue / royal player */
  --green:     #2f8f5b;   /* success / online */
  --purple:    #4a2d7a;   /* accent */
  /* ink / text */
  --ink:       #c9b8e0;   /* body text on dark */
  --ink2:      #9a86bd;   /* muted / secondary */
  --text:      #efe7fb;   /* default foreground */
  /* surfaces */
  --bg:        #160b28;   /* app background base */
  --bg2:       #120922;   /* deepest */
  --frame-bg:  rgba(30,17,52,.9);
  --panel:     #1e1134;
  --panel2:    #231239;
}
```

### Background field (fixed, behind everything)
```css
background:
  radial-gradient(1200px 700px at 50% -5%, rgba(90,50,140,.5), transparent 60%),
  radial-gradient(900px 900px at 8% 100%, rgba(120,30,50,.22), transparent 60%),
  #160b28;
/* plus a faint gold dot grid overlay at 40% opacity: */
background-image: radial-gradient(rgba(232,184,75,.05) 1px, transparent 1px);
background-size: 30px 30px;
```

## Typography

Load from Google Fonts:
```
Cinzel: 500;600;700;800;900   → display / headings / logo / VS
Inter: 400;500;600;700;800    → UI, body, buttons, labels
JetBrains Mono: 500;600;700   → numbers, stats, counters, codes, timers
```

- **Headlines** use Cinzel with a gold gradient text fill:
  `background:linear-gradient(180deg,#f7e2a0,#d5a63a); -webkit-background-clip:text; color:transparent;`
- **Section eyebrows**: Inter 700, 12px, letter-spacing 3px, uppercase, `--gold`, often wrapped in `✦ … ✦`.
- **Buttons/labels**: Inter 700, ~13px, letter-spacing 1.2–1.5px, uppercase.
- **Stats/counters/timers/room codes**: JetBrains Mono.

## Rank tiers (trophy-based)
Six ascending tiers; each drives a badge color + leaderboard/profile styling. (Names/colors from the prototype's tier ladder — verify against `RankBadge` component.)

| Tier | Key | Trophy range (approx) | Accent |
|------|-----|-----------------------|--------|
| Wood | `wood` | 0–999 | `#8a6a43` |
| Bronze | `bronze` | 1000–1399 | `#c67b3e` |
| Silver | `silver` | 1400–1799 | `#c9d2df` |
| Gold | `gold` | 1800–2199 | `#E8B84B` |
| Platinum | `platinum` | 2200–2599 | `#4fd0c0` |
| Diamond/Grandmaster | `grandmaster` | 2600+ | `#b98cff` |

> Confirm exact thresholds against the prototype's `rankTierFor(trophies)` logic and reuse them verbatim in `packages/shared`.

## Core components (recreate as React + Tailwind)

### `.frame` — the signature ornate card
```
background-color: rgba(30,17,52,.9);
border: 1px solid rgba(232,184,75,.4);
border-radius: 10px;
box-shadow: inset 0 0 0 4px rgba(15,8,32,.55),
            inset 0 0 0 5px rgba(232,184,75,.16),
            0 12px 30px rgba(0,0,0,.4);
/* + four gold star glyphs pinned in each corner (SVG data-uri, 11px) */
```

### Buttons
```
.btn        base: 13px/700 Inter, uppercase, ls 1.2px, radius 8px,
            border 1px rgba(232,184,75,.55),
            inset 0 1px 0 rgba(255,255,255,.14) + 0 4px 12px rgba(0,0,0,.4);
.btn-red    linear-gradient(180deg,#a83744,#6e1b24)
.btn-purple linear-gradient(180deg,#3d2a6b,#241640)
.btn-blue   linear-gradient(180deg,#2f5da8,#1a356b)
.btn-green  linear-gradient(180deg,#2f8f5b,#175236)
.btn-gold   linear-gradient(180deg,#f0cf72,#c99a2e); color:#3a2405
hover: brightness(1.1)   active: translateY(1px)
```

### Pills / chips (currency + stats)
```
.pill  radius 100px, border 1px rgba(232,184,75,.4), bg rgba(15,8,32,.6),
       font 700 14px JetBrains Mono.
Gold pill text #f2d493, Diamond pill text #ff9aa8.
```

### Dividers, section titles
```
.ptitle  700 13px Inter, ls 2px, uppercase, --gold-lt, bottom hairline rgba(232,184,75,.22)
.divider ✦ eyebrow with gradient rules left/right
```

### Nav
- **Desktop**: centered `.navlink` row; active link is `--gold-lt` with a radial gold underline.
- **Mobile (≤1100px)**: `.fd-mnav` horizontal-scroll sticky bar of the same navlinks; `.fd-hide-narrow` elements hide.

## Board & pieces (the marble + gold board)
- 8×8, only dark squares playable. Board frame uses a gold bevel:
  `linear-gradient(145deg,#f5d88a 0%,#d3a63c 45%,#8a5a1e 100%)` with heavy inset shadow.
- Default surface = **marble + gold**. Alternate purchasable board themes are full-image surfaces (see `ASSETS.md`: wood, ebony, obsidian, marble). Equipped board theme swaps the surface texture.
- **Pieces** render from PNG skin slots (see `ASSETS.md`): a `man` and `king` image per color per skin. Default = glossy disc; king carries a ♛ / crown. Selected piece = gold ring; legal-move squares = gold dot; capture target = red glow; must-capture = pulsing glow.
- Equipped skin changes both players' piece art.

## Animations (keyframes to port verbatim)
`fdrise` (card entrance), `fdpulse`, `fdglow`, `fdspin` (matchmaking ring), `fdslidein`, `fdfade`, `fdcoinflip` + `fdcoinbob` + `fdshadowpulse` (coin/reward), `fdsheen` (gold sheen sweep), `fdckring`/`fdckdraw`/`fdckpop`/`fdckwave` (checkmark/claim celebrations), `fdconf` (confetti on win/claim). Definitions are in the prototype `<style>` block — copy them into `index.css`.

## Responsive rules
- Breakpoints: **1100px** (nav collapses to mobile bar, side rails stack) and **1000px** (multi-column grids collapse to single column, board becomes horizontally scrollable if needed, headers un-stick, h1 shrinks) and **640px** (tighter header padding).
- Mobile-first; hit targets ≥ 44px. The whole app must be fully usable one-handed on a phone.

## Iconography & currency glyphs
- Currency: Gold 🪙 (`--gold` text), Diamonds 💎 (`#ff9aa8` text), Trophies 🏆.
- Icon PNGs exist for coin/gem/trophy/chest (`ic-coin.png`, `ic-gem.png`, `ic-trophy.png`, `ic-chest.png`) — prefer these over emoji in headings/cards; see `ASSETS.md`.
- Decorative sparkle is the four-point star ✦ used in eyebrows and frame corners.

## System & edge states (full-screen)

> Full detail — triggers, z-index layering, prototype-flag → production-signal mapping, and acceptance criteria — lives in **[SYSTEM_STATES.md](./SYSTEM_STATES.md)**. Summary below.

Beyond the 22 content screens, the app has a set of **full-screen system states**. Each is a fixed overlay (`position:fixed;inset:0`) with the shared dark-purple radial field + gold dot grid, layered by `z-index` so the most critical always wins. Reproduce each from the prototype; in production they're driven by real signals (auth, network, router, error boundary, server health), not local flags.

| State | Trigger (production) | z-index | Key behavior |
|-------|----------------------|---------|--------------|
| **Landing** (marketing) | Unauthenticated + not yet in auth flow | 355 | Public hero + feature cards + how-to-play + footer. `Play Now` / `Sign In` enter the auth screen; "See How to Play" scrolls to steps. |
| **Login / Create account** | Unauthenticated, auth flow started | 360 | Sign-in / create-account tabs, email+password, OAuth (Google/Apple/Facebook), guest, Terms note. Back → landing. |
| **Forgot password** | From login "Forgot?" | 360 | Email → send reset → "Check your email" confirmation (shows address) + resend. Back → sign in. |
| **Onboarding** | First login after **signup** only (persist `onboarded` server-side per user) | 358 | 4-slide carousel (welcome → how to play → currencies → modes) with progress dots, Back/Next, Skip; ends "Enter the Arena". |
| **Offline banner** | `navigator.onLine === false` / socket drop | 400 (top bar) | Slim top banner: "You're offline — reconnecting…" with a pulsing dot. Auto-clears on reconnect. |
| **404 Not Found** | Router hits an unknown route | in-flow (`<main>`) | Branded "Off the board / This page doesn't exist" with Back to Home + Go to Play. Defensive fallback for any unrecognized screen. |
| **Error boundary** | An uncaught render/runtime error (React error boundary) | 370 | "The board took a tumble" recovery screen; shows the error message; Reload + Back to Home. In prod, also report to Sentry. |
| **Maintenance mode** | Server health flag / admin maintenance toggle (see `ADMIN_DASHBOARD.md`) | 380 | Full takeover: "The kingdom is being fortified", estimated return time, **Check again** (re-checks status), status-follow line. Highest layer — supersedes everything except the offline banner's top strip. |
| **Cookie / consent banner** | First visit — no stored consent (`fdr.consent` unset) | 365 (bottom bar) | Bottom banner: "We value your privacy", Privacy Policy link, **Necessary only** / **Accept all**. Choice persists (`necessary`\|`all`); never shown again once set. Production: gate non-essential cookies/analytics on `all`. |

Layering rule: **maintenance (380) > error (370) > login/forgot (360) > onboarding (358) > landing (355)**, with the **offline banner (400)** as a thin top strip that can coexist above any of them. Ordinary content screens render in `<main>` beneath all overlays. In the prototype these are gated by state flags (`showLanding`, `showLogin`, `showForgot`, `onboarding`, `isOffline`, `is404`, `errorState`, `maintenance`, `showConsent`); the production build derives the same booleans from auth state, the router, the network API, the error boundary, a `/health` maintenance check, and stored cookie consent.
