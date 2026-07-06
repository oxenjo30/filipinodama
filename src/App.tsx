import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { CreateRoomPage } from './pages/CreateRoomPage'
import { GamePage } from './pages/GamePage'
import { HomePage } from './pages/HomePage'
import { JoinRoomPage } from './pages/JoinRoomPage'
import { LandingPage } from './pages/LandingPage'
import { LeaderboardPage } from './pages/LeaderboardPage'
import { ModeSelectPage } from './pages/ModeSelectPage'
import { ProfilePage } from './pages/ProfilePage'
import { RulesPage } from './pages/RulesPage'
import { SettingsPage } from './pages/SettingsPage'
import { SplashPage } from './pages/SplashPage'
import { VsAiPage } from './pages/VsAiPage'

export default function App() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <Routes>
      <Route path="/" element={<SplashPage />} />
      <Route path="/landing" element={<LandingPage />} />
      <Route path="/home" element={<HomePage />} />
      <Route path="/play" element={<ModeSelectPage />} />
      <Route path="/play/ai" element={<VsAiPage />} />
      <Route path="/game/:mode" element={<GamePage />} />
      <Route path="/room/create" element={<CreateRoomPage />} />
      <Route path="/room/join" element={<JoinRoomPage />} />
      <Route path="/rules" element={<RulesPage />} />
      <Route path="/leaderboard" element={<LeaderboardPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  )
}
