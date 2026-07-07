import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "./features/layout/AppLayout";
import { HomePage } from "./features/home/HomePage";
import { PlayHubPage } from "./features/play/PlayHubPage";
import { AiSetupPage } from "./features/play/AiSetupPage";
import { GamePage } from "./features/play/GamePage";
import { ComingSoon } from "./features/shared/ComingSoon";
import { FriendsPage } from "./features/friends/FriendsPage";
import { ProfilePage } from "./features/profile/ProfilePage";
import { QuestsPage } from "./features/quests/QuestsPage";
import { GuildsPage } from "./features/guilds/GuildsPage";
import { StorePage } from "./features/store/StorePage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { LearnPage } from "./features/learn/LearnPage";
import { SeasonPage } from "./features/season/SeasonPage";
import { LeaderboardPage } from "./features/leaderboard/LeaderboardPage";
import { AuthPage } from "./features/auth/AuthPage";
import { OnlineMatchPage } from "./features/play/OnlineMatchPage";
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
      <Routes>
        {/* ── auth (no AppLayout chrome — full-screen) ── */}
        <Route path="/login" element={<AuthPage initialMode="signin" />} />
        <Route path="/register" element={<AuthPage initialMode="signup" />} />

        <Route element={<AppLayout />}>
          {/* ── fully built ── */}
          <Route path="/" element={<HomePage />} />
          <Route path="/play" element={<PlayHubPage />} />
          <Route path="/play/ai" element={<AiSetupPage />} />
          <Route path="/play/ai/game" element={<GamePage />} />
          <Route path="/play/online" element={<OnlineMatchPage />} />

          {/* ── styled placeholders (no dead links) ── */}
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/learn" element={<LearnPage />} />
          <Route path="/store" element={<StorePage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/friends" element={<FriendsPage />} />
          <Route path="/guilds" element={<GuildsPage />} />
          <Route path="/quests" element={<QuestsPage />} />
          <Route path="/season" element={<SeasonPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/matchmaking" element={<ComingSoon title="Matchmaking" />} />

          {/* ── catch-all ── */}
          <Route path="*" element={<ComingSoon title="Not Found" eyebrow="✦ Off the Map ✦" blurb="This page doesn't exist yet. Head back and pick a battle." />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
