# Footer Menu & Per-Document Legal Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the handoff prototype's site-wide footer to every in-app screen, and split the tabbed `/legal` page into four dedicated routes (`/privacy`, `/terms`, `/community`, `/data`) that share one layout.

**Architecture:** A new self-contained `Footer` component renders inside `AppLayout` after `<main>`. The existing single tabbed `LegalPage` is refactored into a reusable `LegalLayout` that takes an `active` document key; four routes render it pre-selected, its sidebar tabs become real router navigation, and `/legal` redirects to `/privacy` so existing inbound links keep working.

**Tech Stack:** React 18, TypeScript, react-router-dom ^6.26, Vite, pnpm workspace. Inline styles (no CSS-in-JS lib), CSS custom properties defined in `apps/web/src/index.css`.

## Global Constraints

- **No test harness exists in the web app.** There is no vitest/jest. The verification gate for every task is: `pnpm --filter web typecheck` (must pass), `pnpm --filter web lint` (must pass), plus the stated visual/manual check. "Write the failing test" steps are replaced by "make the change, then verify via typecheck/lint/visual" — do not invent a test runner.
- **react-router-dom is ^6.26** — use the v6 element API (`<Navigate to="..." replace />`), not v5 `<Redirect>`.
- **Verbatim fidelity to the prototype** `handoff/FilipinoDama Royal.dc.html` footer (lines 2219–2238) and social icons (lines 2749–2785). Copy exact style values.
- **CSS custom props already exist** in `apps/web/src/index.css`: `--gold` `#E8B84B`, `--gold-lt` `#F5D783`, `--ink2` `#9a86bd`. Use them; do not redefine.
- **Two files are named `LegalPage.tsx`.** The LIVE one is `apps/web/src/features/legal/LegalPage.tsx`. The DEAD one is `apps/web/src/features/settings/LegalPage.tsx` (imported nowhere). Never edit the settings file except to delete it (Task 4).
- **Commit after every task.** Branch is `chore/scaffold` (already a feature branch — commit directly).

---

## File Structure

- `apps/web/src/features/layout/Footer.tsx` — **create.** Self-contained footer (social icons + two rows). Owns the three social SVG icons and the legal/contact nav.
- `apps/web/src/features/layout/AppLayout.tsx` — **modify.** Render `<Footer />` after `</main>`.
- `apps/web/src/features/legal/LegalLayout.tsx` — **create.** Holds `LEGAL_DATA`, `TABS`, `LegalKey`, `LegalDoc`, and the sidebar+content shell. Takes `active: LegalKey`. Sidebar tabs navigate between routes.
- `apps/web/src/features/legal/LegalPages.tsx` — **create.** Four thin named-export page components (`PrivacyPage`, `TermsPage`, `CommunityPage`, `DataPage`), each rendering `<LegalLayout active="..." />`.
- `apps/web/src/features/legal/LegalPage.tsx` — **delete** (its content moves to `LegalLayout.tsx`).
- `apps/web/src/features/settings/LegalPage.tsx` — **delete** (dead code).
- `apps/web/src/App.tsx` — **modify.** Add `Navigate` import; swap the `LegalPage` import for the four page components; replace the `/legal` route with four routes + a `/legal`→`/privacy` redirect (inside the `AppLayout` route block).
- `apps/web/src/features/auth/AuthPage.tsx` — **modify.** Repoint two `<a href="/legal">` anchors to `/terms` and `/privacy`.

---

## Task 1: Create the Footer component

**Files:**
- Create: `apps/web/src/features/layout/Footer.tsx`

**Interfaces:**
- Consumes: `useNavigate` from `react-router-dom`. Valid because `AppLayout` (where `Footer` renders) is a routed element inside `<BrowserRouter>`.
- Produces: `export function Footer(): JSX.Element` (and `export default Footer`).

- [ ] **Step 1: Create `Footer.tsx` with the full component**

Create `apps/web/src/features/layout/Footer.tsx` with exactly this content:

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Footer — site-wide footer, reproduced from the handoff prototype
 * (handoff/FilipinoDama Royal.dc.html footer, lines 2219-2238).
 *
 * Two rows: social icons + tagline + copyright, a hairline divider, then the
 * legal/contact nav + "Rated E for Everyone". Rendered by AppLayout after
 * <main>. Legal links navigate to the four dedicated legal routes; the social
 * icons are inert placeholders (no real URLs yet) but carry aria-labels so an
 * SVG-only button still has an accessible name.
 *
 * The prototype's `style-hover` attribute has no React inline-style equivalent,
 * so the legal-link hover color is done with local hover state (no CSS class,
 * to keep the footer self-contained).
 */

// The three social icons transcribed from the prototype ICONS.fb/yt/discord
// (lines 2783-2785) via the RAW helper (line 2750): a 24x24 viewBox, no fill,
// currentColor stroke, width 2, round caps/joins.
function SocialIcon({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 24,
        height: 24,
        padding: 0,
        background: "none",
        border: "none",
        color: "var(--ink2)",
        cursor: "pointer",
      }}
    >
      <svg
        width={18}
        height={18}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    </button>
  );
}

const LEGAL_LINKS: { label: string; to: string }[] = [
  { label: "Privacy Policy", to: "/privacy" },
  { label: "Terms of Service", to: "/terms" },
  { label: "Community Guidelines", to: "/community" },
  { label: "Data & Account", to: "/data" },
  { label: "Contact", to: "/contact" },
];

export function Footer() {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <footer style={{ borderTop: "1px solid rgba(232,184,75,.2)", marginTop: 20 }}>
      <div
        style={{
          maxWidth: 1560,
          margin: "0 auto",
          padding: "22px 26px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* top row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: 16, color: "var(--ink2)" }}>
            <SocialIcon label="Facebook">
              <path d="M14 8h2V5h-2a3 3 0 0 0-3 3v2H9v3h2v6h3v-6h2l1-3h-3V8a1 1 0 0 1 1-1z" />
            </SocialIcon>
            <SocialIcon label="YouTube">
              <rect x={3} y={6} width={18} height={12} rx={3} />
              <path d="M11 9l4 3-4 3z" />
            </SocialIcon>
            <SocialIcon label="Discord">
              <path d="M7 8a12 12 0 0 1 10 0M6 16a15 15 0 0 0 12 0M8 17c-1 1-2 2-3 2M16 17c1 1 2 2 3 2M5 16l-1-8 3-2M19 16l1-8-3-2" />
              <circle cx={9} cy={13} r={1} fill="currentColor" />
              <circle cx={15} cy={13} r={1} fill="currentColor" />
            </SocialIcon>
          </div>
          <div style={{ font: "600 12px Cinzel,serif", letterSpacing: 3, color: "var(--gold)" }}>
            STRATEGY · HERITAGE · VICTORY
          </div>
          <div style={{ font: "500 12px Inter", color: "var(--ink2)" }}>© 2025 filipinodama.com</div>
        </div>

        <div style={{ height: 1, background: "rgba(232,184,75,.12)" }} />

        {/* bottom row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <nav style={{ display: "flex", flexWrap: "wrap", gap: "6px 4px", alignItems: "center" }}>
            {LEGAL_LINKS.map((l) => (
              <button
                key={l.to}
                type="button"
                onClick={() => navigate(l.to)}
                onMouseEnter={() => setHovered(l.to)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "4px 10px",
                  font: "600 12px Inter",
                  color: hovered === l.to ? "var(--gold-lt)" : "var(--ink2)",
                }}
              >
                {l.label}
              </button>
            ))}
          </nav>
          <div
            style={{
              font: "500 11px Inter",
              color: "rgba(200,190,220,.5)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span>Rated E for Everyone</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS (no errors). If `React.ReactNode` triggers a "React is not defined" error, add `import type { ReactNode } from "react";` and use `ReactNode` instead of `React.ReactNode` — but with the project's JSX config this usually resolves without a value import; fix only if the error appears.

- [ ] **Step 3: Lint**

Run: `pnpm --filter web lint`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/layout/Footer.tsx
git commit -m "feat(web): add site-wide Footer component from prototype"
```

---

## Task 2: Render the Footer in AppLayout

**Files:**
- Modify: `apps/web/src/features/layout/AppLayout.tsx`

**Interfaces:**
- Consumes: `Footer` from `./Footer` (Task 1).
- Produces: no new exports; `AppLayout` now renders the footer.

- [ ] **Step 1: Add the Footer import**

In `apps/web/src/features/layout/AppLayout.tsx`, add this import alongside the other feature imports (after the `NotificationsMenu` import on line 9):

```tsx
import { Footer } from "./Footer";
```

- [ ] **Step 2: Render `<Footer />` after `</main>`**

Find this block (around lines 204-207):

```tsx
        <main style={{ flex: 1 }}>
          <Outlet />
        </main>
      </div>
```

Replace it with (add `<Footer />` after `</main>`, still inside the relative flex-column wrapper `</div>`):

```tsx
        <main style={{ flex: 1 }}>
          <Outlet />
        </main>
        <Footer />
      </div>
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 4: Lint**

Run: `pnpm --filter web lint`
Expected: PASS.

- [ ] **Step 5: Visual check**

Run: `pnpm --filter web dev`, open the app (e.g. `http://localhost:5173/`), scroll to the bottom.
Expected: footer visible at the bottom of `/` with three social icons on the left, `STRATEGY · HERITAGE · VICTORY` centered, `© 2025 filipinodama.com` on the right, a hairline divider, then the legal nav + `Rated E for Everyone`. On a short page (e.g. `/store` if long, or resize the window tall), the footer sits at the very bottom (pinned by `<main>`'s `flex:1`). Confirm it does NOT appear on `/login`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/layout/AppLayout.tsx
git commit -m "feat(web): render Footer in AppLayout below main"
```

---

## Task 3: Create LegalLayout (shared shell) and the four page components

This task extracts the shared shell from the live `LegalPage.tsx` into `LegalLayout.tsx`, makes the sidebar tabs navigate between routes, and adds four thin page components. The old `LegalPage.tsx` is deleted here (its content has moved). Routing is wired in Task 4 — until then the four pages exist but aren't routed, which is fine (typecheck still passes).

**Files:**
- Create: `apps/web/src/features/legal/LegalLayout.tsx`
- Create: `apps/web/src/features/legal/LegalPages.tsx`
- Delete: `apps/web/src/features/legal/LegalPage.tsx`

**Interfaces:**
- Produces: `export type LegalKey = "privacy" | "terms" | "community" | "data"`; `export function LegalLayout({ active }: { active: LegalKey }): JSX.Element` (from `LegalLayout.tsx`); `export function PrivacyPage()`, `export function TermsPage()`, `export function CommunityPage()`, `export function DataPage()` (from `LegalPages.tsx`).
- Consumes (Task 4): the four page components are imported into `App.tsx`.

- [ ] **Step 1: Create `LegalLayout.tsx`**

Create `apps/web/src/features/legal/LegalLayout.tsx`. This is the current `LegalPage.tsx` body with two changes: (a) it takes an `active: LegalKey` prop instead of `useState`, and (b) the sidebar tabs call `navigate("/privacy" | "/terms" | ...)` instead of `setLegalTab`. The `LEGAL_DATA` copy is transcribed verbatim from the existing `apps/web/src/features/legal/LegalPage.tsx` — **copy the entire `LEGAL_DATA` object from that file unchanged**; it is reproduced in full here so this task is self-contained:

```tsx
import { useNavigate } from "react-router-dom";

/**
 * LegalLayout — shared shell for the four legal documents (Privacy, Terms,
 * Community, Data). Reproduces the handoff prototype (lines 1029-1076): a
 * sticky tab sidebar + a document column. The sidebar tabs are real router
 * navigation between the four /privacy, /terms, /community, /data routes; the
 * `active` prop (set by each route's page component) selects the document and
 * the highlighted tab.
 *
 * Policy copy is static legal text (not user data) — transcribed verbatim from
 * the prototype's _legalData().
 */

type LegalDoc = {
  kicker: string;
  title: string;
  updated: string;
  intro: string;
  sections: { no: string; heading: string; paras: string[] }[];
};

export type LegalKey = "privacy" | "terms" | "community" | "data";

const UPDATED = "July 6, 2025";

const LEGAL_DATA: Record<LegalKey, LegalDoc> = {
  privacy: {
    kicker: "Privacy",
    title: "Privacy Policy",
    updated: UPDATED,
    intro:
      'This Privacy Policy explains what information Filipino Dama Royal ("we", "the app") collects, why we collect it, and the choices you have. It is written to comply with the Apple App Store Review Guidelines, the Google Play Developer Program Policies and User Data policy, and applicable laws including the GDPR and the CCPA.',
    sections: [
      {
        no: "1",
        heading: "Information We Collect",
        paras: [
          "Account data you provide: display name, player tag, avatar selection, and (if you choose social sign-in) the email address associated with your Apple or Google account.",
          "Gameplay data: match results, ratings, trophies, lessons completed, guild membership, and in-app purchases. Chat messages sent to friends or guilds are processed to deliver them and to enforce our Community Guidelines.",
          "Device and diagnostic data: device model, operating system version, coarse region, crash logs, and performance metrics. This data is used to keep the app stable and secure.",
        ],
      },
      {
        no: "2",
        heading: "How We Use Information",
        paras: [
          "To operate core features — matchmaking, leaderboards, guilds, friends, chat, and lessons; to process purchases through the Apple App Store or Google Play; to prevent cheating, fraud, and abuse; and to improve the game. We do not sell your personal information.",
        ],
      },
      {
        no: "3",
        heading: "Advertising & Analytics",
        paras: [
          "We use privacy-focused analytics to understand feature usage in aggregate. On iOS we request permission through App Tracking Transparency before any tracking that would require it, and we honour your choice. Any advertising identifiers are used only with your consent where the law requires it.",
        ],
      },
      {
        no: "4",
        heading: "Children’s Privacy",
        paras: [
          "The app is rated for a general audience. We do not knowingly collect personal information from children under 13 (or the minimum age in your country) without verifiable parental consent, consistent with COPPA and Google Play’s Families policy. If you believe a child has provided us data, contact us and we will delete it.",
        ],
      },
      {
        no: "5",
        heading: "Data Sharing",
        paras: [
          "We share data only with service providers who help us run the game (cloud hosting, crash reporting, payment processing by Apple/Google) under contracts that protect your data, or when required by law. Your public profile (name, tag, avatar, rating) is visible to other players.",
        ],
      },
      {
        no: "6",
        heading: "Data Retention & Security",
        paras: [
          "We keep your data only as long as your account is active or as needed to provide the service and meet legal obligations. Data is encrypted in transit. No system is perfectly secure, but we work to protect your information.",
        ],
      },
      {
        no: "7",
        heading: "Your Rights & Choices",
        paras: [
          'Depending on where you live, you may access, correct, export, or delete your personal data, and object to or restrict certain processing. You can manage or delete your account in-app under Settings, or by contacting us. See the "Data & Account" tab for step-by-step instructions required by app-store policy.',
        ],
      },
      {
        no: "8",
        heading: "International Transfers & Changes",
        paras: [
          'Your data may be processed in countries other than your own under appropriate safeguards. We may update this policy; material changes will be announced in-app and the "Last updated" date will change. Continued use after an update means you accept the revised policy.',
        ],
      },
    ],
  },
  terms: {
    kicker: "Terms",
    title: "Terms of Service",
    updated: UPDATED,
    intro:
      'These Terms of Service ("Terms") govern your use of Filipino Dama Royal. By downloading, accessing, or playing the game you agree to these Terms, the Apple Media Services / Google Play Terms as applicable, and our Privacy Policy. If you do not agree, do not use the app.',
    sections: [
      {
        no: "1",
        heading: "Eligibility",
        paras: [
          "You must be old enough to form a binding contract in your country and meet the minimum age of the app store you downloaded from. If you are a minor, you may use the app only with the consent and supervision of a parent or legal guardian.",
        ],
      },
      {
        no: "2",
        heading: "Your Account",
        paras: [
          "You are responsible for activity under your account and for keeping your credentials secure. Provide accurate information and notify us of any unauthorized use. We may suspend or terminate accounts that violate these Terms or our Community Guidelines.",
        ],
      },
      {
        no: "3",
        heading: "License",
        paras: [
          "We grant you a personal, limited, non-exclusive, non-transferable, revocable license to use the app for your own non-commercial entertainment. You may not copy, modify, reverse-engineer, cheat, use bots, or exploit the game, except where such restriction is prohibited by law.",
        ],
      },
      {
        no: "4",
        heading: "Virtual Items & Purchases",
        paras: [
          "The app may offer virtual goods and currency (e.g. trophies, cosmetics). Virtual items have no real-world monetary value, are licensed not sold, and are non-transferable and non-refundable except as required by law or the store’s policies.",
          "All purchases are processed by the Apple App Store or Google Play and are subject to their payment terms. Refund requests are handled according to Apple’s and Google’s refund policies.",
        ],
      },
      {
        no: "5",
        heading: "User Content & Conduct",
        paras: [
          "You are responsible for the names, messages, and other content you submit. You must follow our Community Guidelines. We may remove content and take action against accounts that break the rules. You grant us a license to host and display your content solely to operate the game.",
        ],
      },
      {
        no: "6",
        heading: "Service Availability",
        paras: [
          "We may update, change, suspend, or discontinue features at any time. Online play depends on connectivity and our servers; we do not guarantee uninterrupted service.",
        ],
      },
      {
        no: "7",
        heading: "Disclaimers & Liability",
        paras: [
          'The app is provided "as is" without warranties of any kind to the extent permitted by law. To the maximum extent permitted by law, our liability for any claim relating to the app is limited, and we are not liable for indirect or incidental damages. Nothing limits rights that cannot be waived under your local law.',
        ],
      },
      {
        no: "8",
        heading: "Governing Law & Changes",
        paras: [
          "These Terms are governed by the laws of the Republic of the Philippines, without limiting mandatory consumer protections in your country. We may revise these Terms; we will post the new version with an updated date, and continued use constitutes acceptance.",
        ],
      },
      {
        no: "9",
        heading: "Apple & Google Notice",
        paras: [
          "If you downloaded from the Apple App Store, Apple is not a party to these Terms and is not responsible for the app; Apple and its subsidiaries are third-party beneficiaries entitled to enforce these Terms against you. Similar terms apply to Google for downloads from Google Play.",
        ],
      },
    ],
  },
  community: {
    kicker: "Conduct",
    title: "Community Guidelines",
    updated: UPDATED,
    intro:
      "Filipino Dama Royal is for everyone. These guidelines keep the community fair, safe, and welcoming, in line with app-store safety requirements. Breaking them may lead to warnings, mutes, or account termination.",
    sections: [
      {
        no: "1",
        heading: "Play Fair",
        paras: [
          "No cheating, bots, exploits, collusion, or manipulation of matches, ratings, or leaderboards. Win by skill, not shortcuts.",
        ],
      },
      {
        no: "2",
        heading: "Be Respectful",
        paras: [
          "No harassment, hate speech, threats, sexual content, or discrimination based on race, ethnicity, religion, gender, sexual orientation, disability, or nationality. Treat opponents and guildmates the way you’d want to be treated.",
        ],
      },
      {
        no: "3",
        heading: "Keep Chat Clean",
        paras: [
          "Friend and guild chat is for good sportsmanship and strategy. Do not spam, advertise, share personal information, or post harmful links. Do not impersonate staff or other players.",
        ],
      },
      {
        no: "4",
        heading: "Protect Privacy & Safety",
        paras: [
          "Never share your own or others’ personal information. Do not solicit contact from minors. Report anyone who makes you uncomfortable.",
        ],
      },
      {
        no: "5",
        heading: "Report & Enforcement",
        paras: [
          "Use in-app reporting to flag rule-breaking behaviour. We review reports and may mute, suspend, or ban accounts, remove content, or reset ill-gotten rewards. Serious violations may be reported to authorities.",
        ],
      },
    ],
  },
  data: {
    kicker: "Your Data",
    title: "Data & Account Controls",
    updated: UPDATED,
    intro:
      "This section summarizes what data the app handles and how to exercise your controls — including account and data deletion, which Apple and Google require us to make easy to find and use.",
    sections: [
      {
        no: "1",
        heading: "Data Safety Summary",
        paras: [
          "Collected and linked to you: display name, player tag, avatar, email (if you use social sign-in), gameplay stats, purchases, and friend/guild activity.",
          "Collected for functionality and security: device and diagnostic data, and chat messages needed to deliver them and enforce our rules. We do not sell your data, and we do not use your data for third-party advertising without your consent.",
        ],
      },
      {
        no: "2",
        heading: "Delete Your Account",
        paras: [
          "You can permanently delete your account and associated personal data in-app: open Settings → Account → Delete Account, and confirm. You can also request deletion by emailing support@filipinodama.com from your registered address. We complete verified deletion requests within 30 days, except data we must keep for legal or fraud-prevention reasons.",
        ],
      },
      {
        no: "3",
        heading: "Request or Export Your Data",
        paras: [
          "You may request a copy of the personal data associated with your account. Contact support@filipinodama.com and we will verify your identity and provide an export in a portable format within the time required by law.",
        ],
      },
      {
        no: "4",
        heading: "Manage Permissions",
        paras: [
          "You control device permissions (such as notifications) in your operating system settings. On iOS you can change tracking preferences under Settings → Privacy & Security → Tracking. Revoking a permission may limit related features.",
        ],
      },
      {
        no: "5",
        heading: "Regional Rights",
        paras: [
          "Residents of the EEA/UK (GDPR) and California (CCPA/CPRA), among others, have specific rights including access, correction, deletion, portability, and the right to lodge a complaint with a regulator. We honour these rights regardless of where you live.",
        ],
      },
    ],
  },
};

const TABS: { key: LegalKey; label: string; icon: string; to: string }[] = [
  { key: "privacy", label: "Privacy Policy", icon: "🔒", to: "/privacy" },
  { key: "terms", label: "Terms of Service", icon: "📜", to: "/terms" },
  { key: "community", label: "Community Guidelines", icon: "🤝", to: "/community" },
  { key: "data", label: "Data & Account", icon: "🗂️", to: "/data" },
];

export function LegalLayout({ active }: { active: LegalKey }) {
  const navigate = useNavigate();
  const legalDoc = LEGAL_DATA[active];

  return (
    <div
      data-screen-label="Legal"
      style={{
        maxWidth: 1180,
        margin: "0 auto",
        padding: 26,
        display: "grid",
        gridTemplateColumns: "250px minmax(0,1fr)",
        gap: 22,
        alignItems: "start",
      }}
    >
      {/* NAV */}
      <div className="frame" style={{ padding: 16, position: "sticky", top: 88 }}>
        <div className="ptitle" style={{ textAlign: "left" }}>
          Legal &amp; Policies
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {TABS.map((t) => {
            const on = active === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => navigate(t.to)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  padding: "11px 12px",
                  borderRadius: 9,
                  border: `1px solid ${on ? "rgba(232,184,75,.4)" : "transparent"}`,
                  background: on ? "rgba(232,184,75,.12)" : "transparent",
                  color: on ? "var(--gold-lt)" : "var(--ink)",
                  font: "700 13px Inter",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span style={{ fontSize: 15 }}>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 10,
            border: "1px solid rgba(63,191,111,.25)",
            background: "rgba(63,191,111,.08)",
          }}
        >
          <div
            style={{
              font: "700 10px Inter",
              letterSpacing: 1,
              textTransform: "uppercase",
              color: "#7ee6a4",
              marginBottom: 5,
            }}
          >
            Store Compliant
          </div>
          <div style={{ font: "500 11px/1.5 Inter", color: "var(--ink2)" }}>
            Meets Apple App Store Review Guidelines and Google Play Developer Program Policies.
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div className="frame" style={{ padding: "32px 36px" }}>
        <span
          style={{
            display: "inline-block",
            padding: "5px 12px",
            borderRadius: 100,
            border: "1px solid var(--gold)",
            color: "var(--gold-lt)",
            font: "700 10px Inter",
            letterSpacing: 1.5,
            textTransform: "uppercase",
          }}
        >
          {legalDoc.kicker}
        </span>
        <h1
          style={{
            margin: "14px 0 6px",
            font: "800 clamp(24px,2.6vw,34px) Cinzel,serif",
            color: "var(--gold-lt)",
          }}
        >
          {legalDoc.title}
        </h1>
        <div
          style={{
            font: "600 12px 'JetBrains Mono',monospace",
            color: "var(--ink2)",
            marginBottom: 20,
          }}
        >
          Last updated {legalDoc.updated}
        </div>
        <p
          style={{
            margin: "0 0 24px",
            font: "400 15px/1.7 Inter",
            color: "var(--ink)",
            textWrap: "pretty",
          }}
        >
          {legalDoc.intro}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {legalDoc.sections.map((sec) => (
            <section key={sec.no}>
              <h2
                style={{
                  margin: "0 0 10px",
                  font: "800 17px Inter",
                  color: "#fff",
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                }}
              >
                <span style={{ font: "800 13px 'JetBrains Mono',monospace", color: "var(--gold)" }}>
                  {sec.no}
                </span>
                {sec.heading}
              </h2>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  paddingLeft: 2,
                }}
              >
                {sec.paras.map((para, i) => (
                  <p
                    key={i}
                    style={{
                      margin: 0,
                      font: "400 14px/1.65 Inter",
                      color: "var(--ink)",
                      textWrap: "pretty",
                    }}
                  >
                    {para}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
        <div
          style={{
            marginTop: 28,
            padding: "18px 20px",
            borderRadius: 12,
            border: "1px solid rgba(232,184,75,.2)",
            background: "rgba(0,0,0,.22)",
            display: "flex",
            gap: 14,
            alignItems: "flex-start",
          }}
        >
          <span style={{ fontSize: 22, flex: "none" }}>📧</span>
          <div>
            <div style={{ font: "700 13px Inter", color: "var(--gold-lt)", marginBottom: 3 }}>
              Questions about this policy?
            </div>
            <div style={{ font: "400 13px/1.6 Inter", color: "var(--ink2)" }}>
              Contact our team at <span style={{ color: "var(--gold-lt)" }}>support@filipinodama.com</span> or write to
              Data Protection Officer, Dama Royal Games Inc., Manila, Philippines. We respond within 30 days.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LegalLayout;
```

> **Note:** If the real `apps/web/src/features/legal/LegalPage.tsx` `LEGAL_DATA` differs in any character from the copy above (it should not — it was transcribed from it), the source file is authoritative: copy `LEGAL_DATA`, `LegalDoc`, `UPDATED`, and the render JSX from it directly, then apply only the two behavioral changes (prop instead of state; `navigate(t.to)` instead of `setLegalTab`).

- [ ] **Step 2: Create `LegalPages.tsx` with the four page components**

Create `apps/web/src/features/legal/LegalPages.tsx`:

```tsx
import { LegalLayout } from "./LegalLayout";

/**
 * The four legal document routes. Each is a thin wrapper that renders the shared
 * LegalLayout pre-selected to its document. Routed at /privacy, /terms,
 * /community, /data in App.tsx.
 */

export function PrivacyPage() {
  return <LegalLayout active="privacy" />;
}

export function TermsPage() {
  return <LegalLayout active="terms" />;
}

export function CommunityPage() {
  return <LegalLayout active="community" />;
}

export function DataPage() {
  return <LegalLayout active="data" />;
}
```

- [ ] **Step 3: Delete the old live `LegalPage.tsx`**

```bash
git rm apps/web/src/features/legal/LegalPage.tsx
```

(This will make `App.tsx` fail typecheck until Task 4 rewires it — that is expected. Do NOT run typecheck between this step and Task 4; the two tasks together form the atomic route swap. If executing task-by-task with a gate, treat Task 3 + Task 4 as one gate.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/legal/LegalLayout.tsx apps/web/src/features/legal/LegalPages.tsx
git commit -m "feat(web): extract LegalLayout + four legal page components"
```

---

## Task 4: Wire the four legal routes + /legal redirect in App.tsx

**Files:**
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Consumes: `PrivacyPage`, `TermsPage`, `CommunityPage`, `DataPage` from `./features/legal/LegalPages` (Task 3); `Navigate` from `react-router-dom`.

- [ ] **Step 1: Update the react-router-dom import**

In `apps/web/src/App.tsx` line 2, change:

```tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
```

to:

```tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
```

- [ ] **Step 2: Swap the LegalPage import for the four page components**

In `apps/web/src/App.tsx` line 16, change:

```tsx
import { LegalPage } from "./features/legal/LegalPage";
```

to:

```tsx
import { PrivacyPage, TermsPage, CommunityPage, DataPage } from "./features/legal/LegalPages";
```

- [ ] **Step 3: Replace the `/legal` route with four routes + a redirect**

In `apps/web/src/App.tsx`, find (line 102, inside the `<Route element={<AppLayout />}>` block):

```tsx
          <Route path="/legal" element={<LegalPage />} />
```

Replace it with:

```tsx
          <Route path="/legal" element={<Navigate to="/privacy" replace />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/community" element={<CommunityPage />} />
          <Route path="/data" element={<DataPage />} />
```

(These stay INSIDE the `<Route element={<AppLayout />}>` block so they get the nav + footer.)

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS (the Task 3 breakage is now resolved).

- [ ] **Step 5: Lint**

Run: `pnpm --filter web lint`
Expected: PASS.

- [ ] **Step 6: Visual check**

Run `pnpm --filter web dev`. Verify:
- `/privacy`, `/terms`, `/community`, `/data` each load the correct document with the correct sidebar tab highlighted.
- Clicking a sidebar tab navigates to the matching route and updates the URL.
- `/legal` redirects to `/privacy` (URL changes to `/privacy`).
- Hard-refresh (or open in a new tab) `/terms` directly — it loads the Terms document (confirms SPA history fallback works in dev).
- The footer's legal links (from Task 1) navigate to each document.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "feat(web): route /privacy /terms /community /data + /legal redirect"
```

---

## Task 5: Delete the dead settings LegalPage and repoint AuthPage links

**Files:**
- Delete: `apps/web/src/features/settings/LegalPage.tsx`
- Modify: `apps/web/src/features/auth/AuthPage.tsx`

**Interfaces:**
- None produced. This task removes dead code and fixes two inbound links.

- [ ] **Step 1: Confirm the settings LegalPage is unimported, then delete it**

Verify no import references it:

Run: `git grep -n "settings/LegalPage" -- apps/web/src`
Expected: no output (zero references).

Then delete:

```bash
git rm apps/web/src/features/settings/LegalPage.tsx
```

- [ ] **Step 2: Repoint AuthPage's two `/legal` anchors**

In `apps/web/src/features/auth/AuthPage.tsx`, the consent line has two `<a href="/legal">` anchors (around lines 370–386). Change the FIRST one (the "Terms & Conditions" link, line 371) from:

```tsx
              href="/legal"
```

to:

```tsx
              href="/terms"
```

Change the SECOND one (the "Privacy Policy" link, line 380) from:

```tsx
              href="/legal"
```

to:

```tsx
              href="/privacy"
```

(Leave `target="_blank" rel="noopener noreferrer"` and the styles unchanged. After this, only the `Terms & Conditions` anchor points to `/terms` and only the `Privacy Policy` anchor points to `/privacy` — verify by reading the two anchor blocks.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 4: Lint**

Run: `pnpm --filter web lint`
Expected: PASS.

- [ ] **Step 5: Visual check**

Run `pnpm --filter web dev`, go to `/register`, and click each consent link:
- "Terms & Conditions" opens a new tab at `/terms` showing the Terms document (no `/legal` flip).
- "Privacy Policy" opens a new tab at `/privacy` showing the Privacy document.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/auth/AuthPage.tsx
git commit -m "chore(web): delete dead settings LegalPage; point AuthPage links to /terms /privacy"
```

---

## Task 6: Full-app verification pass

**Files:** none (verification only).

- [ ] **Step 1: Typecheck + lint the whole web app**

Run: `pnpm --filter web typecheck && pnpm --filter web lint`
Expected: both PASS.

- [ ] **Step 2: Confirm no orphaned references remain**

Run: `git grep -n "features/legal/LegalPage\b" -- apps/web/src`
Expected: no output (the old file is gone and nothing imports it).

Run: `git grep -n "LegalPage" -- apps/web/src`
Expected: no output (both `LegalPage.tsx` files are deleted and no code references the name).

- [ ] **Step 3: End-to-end visual sweep**

Run `pnpm --filter web dev` and confirm:
- Footer appears on `/`, `/store`, `/privacy`, `/contact`, etc., but NOT on `/login` or `/register`.
- Footer legal links → correct documents; Contact link → `/contact`.
- Legal sidebar tabs navigate between the four routes with correct highlight.
- `/legal` → `/privacy`.
- Existing inbound links still resolve: Contact page's "Privacy & Terms" (→ `/legal` → `/privacy`), Settings' "Privacy & Terms" (→ `/legal` → `/privacy`).
- Social icons render (Facebook/YouTube/Discord) and are focusable with an accessible name (inspect: each `<button>` has an `aria-label`).

- [ ] **Step 4: Final commit (if any uncommitted verification tweaks)**

If steps surfaced a fix, commit it. Otherwise nothing to do — the feature is complete across the previous task commits.

---

## Self-Review Notes

- **Spec coverage:** Footer component (Task 1) + render (Task 2); legal split into 4 routes + shared layout (Task 3) + routing/redirect (Task 4); dead settings file deleted + AuthPage repointed (Task 5); a11y aria-labels (Task 1); margin-top:20px + verbatim styles (Task 1); Navigate import + route placement (Task 4); full verification incl. deep-link and inbound links (Task 6). Contact page unchanged (no task, per spec).
- **No test harness:** intentionally no unit-test steps; the web app has none. Gates are typecheck + lint + visual, stated per task.
- **Type consistency:** `LegalKey` defined once in `LegalLayout.tsx`, consumed by `LegalPages.tsx` via the `active` prop literal types; `Footer`'s `LEGAL_LINKS.to` values match the route paths in `App.tsx` (`/privacy` `/terms` `/community` `/data` `/contact`).
