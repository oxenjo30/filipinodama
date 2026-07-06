import { Link } from 'react-router-dom'
import { ASSETS } from '../assets/assetManifest'
import { PageShell } from '../components/PageShell'
import { IconChevronRight } from '../components/icons'

interface Mode {
  title: string
  tag: string
  text: string
  art: string
  /** true when the emblem has an alpha background (render contained, not cropped) */
  transparent: boolean
  to?: string
  /** honest lock — online systems are not connected yet */
  comingSoon?: boolean
}

const MODES: Mode[] = [
  {
    title: 'Quick match',
    tag: 'Casual',
    text: 'Jump into an online game against a similar-skill player. Unrated.',
    art: ASSETS.modeQuick.src,
    transparent: ASSETS.modeQuick.transparent,
    comingSoon: true,
  },
  {
    title: 'Ranked match',
    tag: 'Rated',
    text: 'Compete on the ladder. Wins raise your rating.',
    art: ASSETS.modeRanked.src,
    transparent: ASSETS.modeRanked.transparent,
    comingSoon: true,
  },
  {
    title: 'Play vs AI',
    tag: 'Offline',
    text: 'Practice against the computer at Easy, Normal, or Hard difficulty.',
    art: ASSETS.modeVsAi.src,
    transparent: ASSETS.modeVsAi.transparent,
    to: '/play/ai',
  },
  {
    title: 'Play with a friend',
    tag: 'Private',
    text: 'Create a private room with a shareable code. Room preview for now.',
    art: ASSETS.modeFriend.src,
    transparent: ASSETS.modeFriend.transparent,
    to: '/room/create',
  },
  {
    title: 'Local 2 player',
    tag: 'Same device',
    text: 'Pass-and-play on this device. Red moves first.',
    art: ASSETS.mcClassic.src,
    transparent: ASSETS.mcClassic.transparent,
    to: '/game/local',
  },
]

function ModeCard({ mode }: { mode: Mode }) {
  const body = (
    <>
      <span
        className={`relative block size-16 shrink-0 overflow-hidden rounded-xl bg-night-900 ring-1 ring-gold-600/40 ${
          mode.comingSoon ? 'opacity-60 saturate-50' : ''
        }`}
      >
        <img
          src={mode.art}
          alt=""
          className="size-full object-cover"
          style={{ filter: 'brightness(1.12)' }}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="heading-caps text-base whitespace-nowrap text-parchment">
            {mode.title}
          </span>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${
              mode.comingSoon
                ? 'border-white/15 bg-white/5 text-mist'
                : 'border-gold-500/40 bg-gold-500/10 text-gold-300'
            }`}
          >
            {mode.tag}
          </span>
        </span>
        <span className="mt-1 block text-sm leading-relaxed text-mist">{mode.text}</span>
        {mode.comingSoon && (
          <span className="mt-1.5 block text-xs font-semibold text-tide-300">
            Coming soon — online play isn’t connected yet.
          </span>
        )}
      </span>
    </>
  )

  if (mode.comingSoon) {
    return (
      <div
        aria-disabled="true"
        className="glass flex items-center gap-4 rounded-2xl p-4 opacity-75"
      >
        {body}
      </div>
    )
  }

  return (
    <Link to={mode.to!} className="group block">
      <div className="glass flex items-center gap-4 rounded-2xl p-4 transition-all duration-200 group-hover:border-gold-400/40 group-hover:bg-white/[0.06] group-active:scale-[0.99]">
        {body}
        <IconChevronRight className="ml-auto shrink-0 text-mist transition-transform group-hover:translate-x-1 group-hover:text-gold-300" />
      </div>
    </Link>
  )
}

export function ModeSelectPage() {
  return (
    <PageShell title="Play Dama" backTo="/home" wide>
      <p className="heading-caps text-center text-xs text-gold-400">Choose your battle</p>
      <p className="mx-auto mt-2 max-w-sm text-center text-sm text-mist">
        Pick a game mode to begin.
      </p>
      <div className="mt-6 grid gap-3 lg:grid-cols-2">
        {MODES.map((m) => (
          <ModeCard key={m.title} mode={m} />
        ))}
      </div>
    </PageShell>
  )
}
