# SYSTEM_STATES.md — System, Auth & Edge States

Beyond the 22 content screens, FilipinoDama Royal has a set of **full-screen system states** and one banner. Each is a fixed overlay (`position:fixed;inset:0`, except the two banners) painted on the shared dark-purple radial field + gold dot grid, layered by `z-index` so the most critical always wins.

All of these are **built and verified in the prototype** (`FilipinoDama Royal.dc.html`). In production, reproduce each 1:1 visually, but drive them from **real signals** (auth state, router, network API, error boundary, server `/health`, stored consent) instead of the prototype's local state flags.

---

## The states

| State | Prototype flag | Production trigger | z-index | Behavior |
|-------|----------------|--------------------|---------|----------|
| **Landing** (marketing) | `showLanding` | Unauthenticated + not yet in auth flow | 355 | Public hero + 6 feature cards + how-to-play (3 steps) + CTA band + footer. `Play Now` / `Sign In` enter auth; "See How to Play" smooth-scrolls to steps. |
| **Login / Create account** | `showLogin` | Unauthenticated, auth flow started | 360 | Sign-in / create-account tabs, email+password, OAuth (Google/Apple/Facebook), Continue as Guest, Terms note. Back → landing. |
| **Forgot password** | `showForgot` | From login "Forgot?" | 360 | Email → send reset → "Check your email" confirmation (echoes the address) + Resend. Back → sign in. |
| **Onboarding** | `onboarding` | First login **after signup only** (persist per-user, e.g. `onboarded` column) | 358 | 4-slide carousel (welcome → how to play → currencies → modes), progress dots, Back/Next, Skip; ends "Enter the Arena". |
| **Cookie / consent banner** | `showConsent` | First visit — no stored consent | 365 (bottom bar) | "We value your privacy", Privacy Policy link, **Necessary only** / **Accept all**. Choice persists; never shown again once set. Gate non-essential cookies/analytics on `all`. |
| **Offline banner** | `isOffline` | `navigator.onLine === false` / socket drop | 400 (top strip) | Slim top banner: "You're offline — reconnecting…" with a pulsing dot. Auto-clears on reconnect. |
| **404 Not Found** | `is404` | Router hits an unknown route | in-flow (`<main>`) | Branded "Off the board / This page doesn't exist" + Back to Home + Go to Play. Defensive fallback for any unrecognized screen. |
| **Error boundary** | `errorState` | Uncaught render/runtime error (React error boundary, `componentDidCatch`) | 370 | "The board took a tumble" recovery screen; shows the error message; Reload + Back to Home. In prod, also report to Sentry. |
| **Maintenance mode** | `maintenance` | Server health flag / admin maintenance toggle (`ADMIN_DASHBOARD.md`) | 380 | Full takeover: "The kingdom is being fortified", estimated return time, **Check again** (re-checks status), status-follow line. |

---

## Layering rule

From highest to lowest, when multiple could be active:

```
offline banner (400, top strip — coexists above everything)
maintenance    (380)
error boundary (370)
consent banner (365, bottom bar)
login / forgot (360)
onboarding     (358)
landing        (355)
────────────────────
content screens → render in <main>, beneath all overlays
```

The **offline** strip and the **consent** bar are edge-anchored bars, so they can coexist visually with a centered overlay beneath them. The full-screen takeovers (maintenance > error > login/forgot > onboarding > landing) are mutually exclusive in practice; the z-order defines who wins if two conditions overlap.

---

## Prototype flag → production signal

In the prototype, `renderVals()` derives each boolean from `this.state`. In production, derive them from real sources:

| Flag | Derive from |
|------|-------------|
| `showLanding` / `showLogin` / `showForgot` | Auth store (`useAuth`): no session → landing; "get started"/"sign in" → login; "forgot" → forgot. |
| `onboarding` | `user.onboardedAt == null` immediately after a **signup** response; cleared by `POST /api/users/me/onboarded`. |
| `showConsent` | Absence of a stored consent record (localStorage `consent` + optionally a server-side record for logged-in users). |
| `isOffline` | `window` `online`/`offline` events **and** socket disconnect (show while the socket is reconnecting). |
| `is404` | React Router no-match route (`<Route path="*">`). |
| `errorState` | A top-level React **error boundary** wrapping the app shell; `componentDidCatch` sets it and reports to Sentry. |
| `maintenance` | A `GET /api/health` (or a config flag) returning maintenance = true; polled, and pushed via socket when the admin toggles it. |

---

## Acceptance criteria (feature branches)

These map to `feat/landing-onboarding` (M2) and `feat/system-states` (M7) in `ROADMAP.md`:

- **Landing** renders for logged-out visitors on desktop + mobile, matches the prototype, and both CTAs route into auth.
- **Login / Forgot / Onboarding** reproduce the prototype flows; onboarding shows exactly once per new account (server-persisted), never for returning sign-ins or guests.
- **Consent** persists the choice and never re-prompts; non-essential cookies/analytics are actually gated on `all`.
- **Offline** banner appears within ~1s of losing connectivity and clears on reconnect; in-match, it coexists with the reconnect/resync flow (see `API_SPEC.md` `match:resync`).
- **404** catches any unknown route; both buttons recover.
- **Error boundary** catches a thrown child error, shows the recovery screen, reports to Sentry, and Reload/Home both work.
- **Maintenance** takes over the whole app when the health flag/admin toggle is on, blocks gameplay, and "Check again" re-checks status.
- Correct **z-index layering** verified: maintenance over error over login over onboarding over landing; offline strip above all; consent bar above the centered overlays.

---

## Visual notes

- All overlays use the shared field: `radial-gradient(…purple…) , #0c0618` + the `radial-gradient(rgba(232,184,75,.06) 1px…)` 30px dot grid at 40% opacity.
- Cards use the `.frame` treatment (see `DESIGN_SYSTEM.md`); headings Cinzel gold-gradient, body Inter `--ink`, mono for codes/ETAs.
- Entrances use `fdfade` / `fdrise` / `fdslidein` (no bounce). The offline dot and maintenance dot pulse with `fdpulse`.
- Match copy verbatim from the prototype (e.g. "The kingdom is being fortified", "The board took a tumble", "Off the board") — the voice is intentional.
