import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "./features/layout/AppLayout";
import { HomePage } from "./features/home/HomePage";
import { PlayHubPage } from "./features/play/PlayHubPage";
import { AiSetupPage } from "./features/play/AiSetupPage";
import { GamePage } from "./features/play/GamePage";
import { NotFoundPage } from "./features/shared/NotFoundPage";
import { ErrorBoundary } from "./features/shared/ErrorBoundary";
import { FriendsPage } from "./features/friends/FriendsPage";
import { ProfilePage } from "./features/profile/ProfilePage";
import { QuestsPage } from "./features/quests/QuestsPage";
import { GuildsPage } from "./features/guilds/GuildsPage";
import { StorePage } from "./features/store/StorePage";
import { InventoryPage } from "./features/inventory/InventoryPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { PrivacyPage, TermsPage, CommunityPage, DataPage } from "./features/legal/LegalPages";
import { LearnPage } from "./features/learn/LearnPage";
import { LessonPage } from "./features/learn/LessonPage";
import { SeasonPage } from "./features/season/SeasonPage";
import { LeaderboardPage } from "./features/leaderboard/LeaderboardPage";
import { AuthPage } from "./features/auth/AuthPage";
import { ResetPasswordPage } from "./features/auth/ResetPasswordPage";
import { VerifyEmailPage } from "./features/auth/VerifyEmailPage";
import { OnlineMatchPage } from "./features/play/OnlineMatchPage";
import { MessagesPage } from "./features/messages/MessagesPage";
import { PrivateRoomPage } from "./features/rooms/PrivateRoomPage";
import { ContactPage } from "./features/contact/ContactPage";
import { OrdersPage } from "./features/orders/OrdersPage";
import { BlogPage } from "./features/blog/BlogPage";
import { ArticlePage } from "./features/blog/ArticlePage";
import { useAuthStore } from "./stores/authStore";

/**
 * App — router + shared layout.
 *
 * Fully built: Home (/), Play hub (/play), AI setup (/play/ai) and the playable
 * VS-AI game (/play/ai/game). Auth screens live at /login and /register. Every
 * other nav destination renders a styled "coming soon" placeholder so no link is
 * ever dead. All screens share the AppLayout chrome (background field + top/mobile
 * nav + toasts).
 *
 * On mount we bootstrap() the auth session once so `me` hydrates from the session
 * cookie; until it resolves (`ready`) we render a lightweight loading field so the
 * app never flashes a logged-out state over a valid session. The app still loads
 * fully for a logged-out visitor (me stays null).
 */
export function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const ready = useAuthStore((s) => s.ready);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  if (!ready) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(1200px 700px at 50% -8%,rgba(90,50,140,.6),#0c0618 60%),#0c0618",
          color: "var(--gold-lt)",
          font: "700 14px Inter",
          letterSpacing: "2px",
        }}
      >
        <span style={{ opacity: 0.7 }}>Loading…</span>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Routes>
        {/* ── auth (no AppLayout chrome — full-screen) ── */}
        <Route path="/login" element={<AuthPage initialMode="signin" />} />
        <Route path="/register" element={<AuthPage initialMode="signup" />} />
        {/* Targets of the reset-password / verify-email emails
            (${WEB_ORIGIN}/reset?token=… and /verify?token=…). Without these the
            links 404. */}
        <Route path="/reset" element={<ResetPasswordPage />} />
        <Route path="/verify" element={<VerifyEmailPage />} />

        <Route element={<AppLayout />}>
          {/* ── fully built ── */}
          <Route path="/" element={<HomePage />} />
          <Route path="/play" element={<PlayHubPage />} />
          <Route path="/play/ai" element={<AiSetupPage />} />
          <Route path="/play/ai/game" element={<GamePage />} />
          <Route path="/play/local" element={<GamePage mode="local" />} />
          <Route path="/play/online" element={<OnlineMatchPage />} />
          <Route path="/rooms" element={<PrivateRoomPage />} />

          {/* ── styled placeholders (no dead links) ── */}
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/learn" element={<LearnPage />} />
          <Route path="/learn/:id" element={<LessonPage />} />
          <Route path="/store" element={<StorePage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/friends" element={<FriendsPage />} />
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/messages/:userId" element={<MessagesPage />} />
          <Route path="/guilds" element={<GuildsPage />} />
          <Route path="/quests" element={<QuestsPage />} />
          <Route path="/season" element={<SeasonPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/legal" element={<Navigate to="/privacy" replace />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/community" element={<CommunityPage />} />
          <Route path="/data" element={<DataPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/blog" element={<BlogPage />} />
          <Route path="/blog/:slug" element={<ArticlePage />} />

          {/* ── catch-all ── */}
          <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
