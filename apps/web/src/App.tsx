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

/**
 * App — router + shared layout.
 *
 * Fully built: Home (/), Play hub (/play), AI setup (/play/ai) and the playable
 * VS-AI game (/play/ai/game). Every other nav destination renders a styled
 * "coming soon" placeholder so no link is ever dead. All screens share the
 * AppLayout chrome (background field + top/mobile nav + toasts).
 */
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          {/* ── fully built ── */}
          <Route path="/" element={<HomePage />} />
          <Route path="/play" element={<PlayHubPage />} />
          <Route path="/play/ai" element={<AiSetupPage />} />
          <Route path="/play/ai/game" element={<GamePage />} />

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
