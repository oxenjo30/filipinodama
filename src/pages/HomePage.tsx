import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ASSETS } from '../assets/assetManifest'
import { Card } from '../components/Card'
import {
  IconBook,
  IconBot,
  IconChevronRight,
  IconDoor,
  IconGear,
  IconKey,
  IconPlay,
  IconTrophy,
  IconUser,
  IconUsers,
} from '../components/icons'
import { useSettingsStore } from '../store/settingsStore'

interface Tile {
  to: string
  title: string
  text: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  emblem?: string
  hero?: boolean
  badge?: string
}

const TILES: Tile[] = [
  {
    to: '/play',
    title: 'Play Dama',
    text: 'Choose your battle — versus AI, with friends, or on one device.',
    icon: IconPlay,
    emblem: ASSETS.mcClassic.src,
    hero: true,
  },
  {
    to: '/game/local',
    title: 'Local 2 player',
    text: 'Pass-and-play on this device.',
    icon: IconUsers,
    emblem: ASSETS.mcTraining.src,
  },
  {
    to: '/play/ai',
    title: 'Play vs AI',
    text: 'Easy, Normal, or Hard.',
    icon: IconBot,
    emblem: ASSETS.mcRanked.src,
  },
  {
    to: '/room/create',
    title: 'Create room',
    text: 'Set up a private table.',
    icon: IconDoor,
    badge: 'Preview',
  },
  {
    to: '/room/join',
    title: 'Join room',
    text: 'Enter a room code.',
    icon: IconKey,
    badge: 'Preview',
  },
  {
    to: '/rules',
    title: 'Tutorial & rules',
    text: 'Master the maximum-capture rule.',
    icon: IconBook,
  },
  {
    to: '/leaderboard',
    title: 'Leaderboard',
    text: 'Ranked play is on the horizon.',
    icon: IconTrophy,
  },
  { to: '/profile', title: 'Profile', text: 'Your name and record.', icon: IconUser },
  { to: '/settings', title: 'Settings', text: 'Sound, board theme, hints.', icon: IconGear },
]

export function HomePage() {
  const playerName = useSettingsStore((s) => s.playerName)

  useEffect(() => {
    localStorage.setItem('filipinodama-visited', '1')
  }, [])

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4">
        <img src={ASSETS.logo.src} alt="" className="size-9" />
        <div>
          <p className="heading-caps text-base leading-tight">
            Filipino<span className="text-gold-300">Dama</span>
          </p>
          <p className="text-xs text-mist">
            {playerName ? `Welcome back, ${playerName}` : 'Welcome, challenger'}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-24 pt-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {TILES.map(({ to, title, text, icon: TileIcon, emblem, hero, badge }) => (
            <Link
              key={title}
              to={to}
              className={`group ${hero ? 'col-span-2 sm:col-span-3' : ''}`}
            >
              <Card
                className={`relative h-full overflow-hidden p-4 transition-all duration-200 group-hover:border-gold-400/40 group-hover:bg-white/[0.06] group-active:scale-[0.985] ${
                  hero ? 'flex items-center gap-4 p-5' : ''
                }`}
              >
                {emblem && (
                  <img
                    src={emblem}
                    alt=""
                    aria-hidden="true"
                    className={
                      hero
                        ? 'pointer-events-none absolute -right-6 -bottom-10 w-40 opacity-25 transition-opacity group-hover:opacity-40'
                        : 'pointer-events-none absolute -right-4 -bottom-6 w-24 opacity-15 transition-opacity group-hover:opacity-30'
                    }
                  />
                )}
                {badge && (
                  <span className="absolute top-3 right-3 rounded-full border border-tide-500/40 bg-tide-700/40 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-tide-300 uppercase">
                    {badge}
                  </span>
                )}
                <div
                  className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${
                    hero ? 'bg-gold-400/20 text-gold-200' : 'bg-gold-500/12 text-gold-300'
                  }`}
                >
                  <TileIcon size={22} />
                </div>
                <div className={hero ? '' : 'mt-3'}>
                  <h2 className="font-semibold">{title}</h2>
                  <p className="mt-0.5 text-sm text-mist">{text}</p>
                </div>
                {hero && (
                  <IconChevronRight className="ml-auto shrink-0 text-gold-300 transition-transform group-hover:translate-x-1" />
                )}
              </Card>
            </Link>
          ))}
        </div>
      </main>
    </div>
  )
}
