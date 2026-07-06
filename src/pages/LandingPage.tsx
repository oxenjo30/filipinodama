import { Link } from 'react-router-dom'
import { ASSETS } from '../assets/assetManifest'
import { Card } from '../components/Card'
import { GameButton } from '../components/GameButton'
import {
  IconBook,
  IconBot,
  IconDoor,
  IconKey,
  IconPlay,
  IconTrophy,
  IconUsers,
} from '../components/icons'

const FEATURES = [
  { icon: IconUsers, title: 'Local 2-player', text: 'Pass-and-play on one screen — the classic plaza duel.' },
  { icon: IconBot, title: 'Play vs bot', text: 'A sparring partner that always respects the rules.' },
  { icon: IconDoor, title: 'Private rooms', text: 'Create a room and share the code. Online sync is coming soon.' },
  { icon: IconKey, title: 'Join with a code', text: 'Enter a friend’s room code to take your seat.' },
  { icon: IconBook, title: 'Learn Filipino Dama', text: 'Mandatory captures, flying damas, the maximum-capture rule.' },
  { icon: IconTrophy, title: 'Ranked play (soon)', text: 'Leaderboards and cosmetics arrive with online play.' },
]

export function LandingPage() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4">
        <img src={ASSETS.logo.src} alt="" className="size-9" />
        <span className="heading-caps text-lg">
          Filipino<span className="text-gold-300">Dama</span>
        </span>
        <Link
          to="/rules"
          className="ml-auto text-sm font-semibold text-mist transition-colors hover:text-parchment"
        >
          Rules
        </Link>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-20">
        {/* hero */}
        <section className="mt-6 grid items-center gap-8 lg:mt-14 lg:grid-cols-2">
          <div className="text-center lg:text-left">
            <h1 className="heading-caps text-4xl leading-tight text-parchment sm:text-5xl">
              Filipino Dama,
              <br />
              <span className="text-gold-300">Reimagined</span>
            </h1>
            <p className="mx-auto mt-4 max-w-md text-[17px] leading-relaxed text-mist lg:mx-0">
              A modern Filipino strategy board game built for quick matches, online rooms, and
              competitive play.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row lg:justify-start sm:justify-center">
              <Link to="/home" className="w-full sm:w-auto">
                <GameButton variant="primary" size="lg" icon={<IconPlay size={18} />} className="w-full sm:w-auto">
                  Play now
                </GameButton>
              </Link>
              <Link to="/rules" className="w-full sm:w-auto">
                <GameButton variant="outline" size="lg" className="w-full sm:w-auto">
                  Learn the rules
                </GameButton>
              </Link>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-md">
            <div className="absolute -inset-6 rounded-full bg-gold-500/10 blur-3xl" aria-hidden="true" />
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-gold-500/40 bg-night-900 shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
              {/* the render sits on a light studio backdrop — zoom in on the
                  board and let a night vignette swallow the bright edges */}
              <img
                src={ASSETS.boardHero.src}
                alt={ASSETS.boardHero.alt}
                className="absolute inset-0 size-full scale-[1.5] object-cover"
                style={{ filter: 'brightness(0.94) saturate(1.05)' }}
              />
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    'radial-gradient(ellipse 62% 58% at 50% 48%, transparent 42%, rgba(10,14,26,0.85) 82%, #0a0e1a 100%)',
                }}
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-night-950/55 via-transparent to-transparent" />
            </div>
          </div>
        </section>

        {/* features */}
        <section className="mt-20">
          <h2 className="heading-caps text-center text-xl text-gold-300">Built for the long game</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: FeatureIcon, title, text }) => (
              <Card key={title} className="p-5">
                <div className="flex size-11 items-center justify-center rounded-xl bg-gold-500/15 text-gold-300">
                  <FeatureIcon size={22} />
                </div>
                <h3 className="mt-3 font-semibold">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-mist">{text}</p>
              </Card>
            ))}
          </div>
        </section>

        <footer className="mt-20 border-t border-white/5 pt-6 text-center text-xs text-mist">
          © 2026 FilipinoDama. A love letter to the plaza game.
        </footer>
      </main>
    </div>
  )
}
