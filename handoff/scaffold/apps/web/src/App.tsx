import { BrowserRouter, Routes, Route } from "react-router-dom";

/**
 * Router skeleton. Each feature branch (ROADMAP.md) fills in a screen.
 * The <div class="fd-bg"> + dots reproduce the prototype's fixed field.
 * Recreate the top nav + mobile nav from FilipinoDama Royal.dc.html here.
 */
export function App() {
  return (
    <BrowserRouter>
      <div className="fd-bg" />
      <div className="fd-bg-dots" />
      {/* <TopNav /> */}
      <Routes>
        <Route path="/" element={<Placeholder name="Home" />} />
        <Route path="/play" element={<Placeholder name="Play Hub" />} />
        <Route path="/play/ai" element={<Placeholder name="AI Setup" />} />
        <Route path="/match/:id" element={<Placeholder name="Game" />} />
        <Route path="/matchmaking" element={<Placeholder name="Matchmaking" />} />
        <Route path="/rooms/:code" element={<Placeholder name="Room" />} />
        <Route path="/spectate/:id" element={<Placeholder name="Spectate" />} />
        <Route path="/leaderboard" element={<Placeholder name="Leaderboard" />} />
        <Route path="/learn" element={<Placeholder name="Learn" />} />
        <Route path="/store" element={<Placeholder name="Store" />} />
        <Route path="/profile" element={<Placeholder name="Profile" />} />
        <Route path="/friends" element={<Placeholder name="Friends" />} />
        <Route path="/guilds" element={<Placeholder name="Guilds" />} />
        <Route path="/quests" element={<Placeholder name="Quests" />} />
        <Route path="/season" element={<Placeholder name="Season" />} />
        <Route path="/settings" element={<Placeholder name="Settings" />} />
      </Routes>
    </BrowserRouter>
  );
}

function Placeholder({ name }: { name: string }) {
  return (
    <main style={{ position: "relative", zIndex: 1, padding: 40 }}>
      <h1 style={{ fontFamily: "Cinzel, serif", color: "var(--gold-lt)" }}>{name}</h1>
      <p style={{ color: "var(--ink)" }}>Build this screen from FilipinoDama Royal.dc.html — see ROADMAP.md.</p>
    </main>
  );
}
