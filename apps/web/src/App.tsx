import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "./features/layout/AppLayout";
import { HomePage } from "./features/home/HomePage";
import { PlayHubPage } from "./features/play/PlayHubPage";
import { AiSetupPage } from "./features/play/AiSetupPage";
import { GamePage } from "./features/play/GamePage";
import { ComingSoon } from "./features/shared/ComingSoon";

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
          <Route path="/leaderboard" element={<ComingSoon title="Leaderboard" />} />
          <Route path="/learn" element={<ComingSoon title="Learn" blurb="Interactive lessons that teach every rule of Filipino Dama — from the first move to crowning a Dama — are on the way." />} />
          <Route path="/store" element={<ComingSoon title="Store" />} />
          <Route path="/profile" element={<ComingSoon title="Profile" />} />
          <Route path="/friends" element={<ComingSoon title="Friends" />} />
          <Route path="/guilds" element={<ComingSoon title="Guilds" />} />
          <Route path="/quests" element={<ComingSoon title="Quests" />} />
          <Route path="/season" element={<ComingSoon title="Season" />} />
          <Route path="/settings" element={<ComingSoon title="Settings" />} />
          <Route path="/matchmaking" element={<ComingSoon title="Matchmaking" />} />

          {/* ── catch-all ── */}
          <Route path="*" element={<ComingSoon title="Not Found" eyebrow="✦ Off the Map ✦" blurb="This page doesn't exist yet. Head back and pick a battle." />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
