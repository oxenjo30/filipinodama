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
