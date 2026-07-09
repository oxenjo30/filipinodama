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

export function AntiCheatPage() {
  return <LegalLayout active="anticheat" />;
}

export function DataPage() {
  return <LegalLayout active="data" />;
}
