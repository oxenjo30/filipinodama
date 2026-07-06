import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ASSETS } from '../assets/assetManifest'
import { GameButton } from '../components/GameButton'
import { PageShell } from '../components/PageShell'
import { IconSwords } from '../components/icons'
import type { BotDifficulty } from '../game'

const TIERS: Array<{
  key: BotDifficulty
  numeral: string
  label: string
  text: string
  art: string
  ring: string
  activeCard: string
}> = [
  {
    key: 'easy',
    numeral: 'I',
    label: 'Easy',
    text: 'A gentle opponent that plays random legal moves. Great for learning the ropes.',
    art: ASSETS.diffEasy.src,
    ring: 'ring-emerald-500/70',
    activeCard: 'border-emerald-400/60 bg-emerald-500/[0.07]',
  },
  {
    key: 'normal',
    numeral: 'II',
    label: 'Normal',
    text: 'A balanced fighter that presses wins, captures, and crownings. A fair, steady fight.',
    art: ASSETS.diffNormal.src,
    ring: 'ring-gold-400/70',
    activeCard: 'border-gold-400/60 bg-gold-500/[0.08]',
  },
  {
    key: 'hard',
    numeral: 'III',
    label: 'Hard',
    text: 'A ruthless tactician that reads your reply and refuses to hang pieces. Bring your best game.',
    art: ASSETS.diffHard.src,
    ring: 'ring-ember-500/80',
    activeCard: 'border-ember-500/60 bg-ember-700/[0.15]',
  },
]

export function VsAiPage() {
  const navigate = useNavigate()
  const [difficulty, setDifficulty] = useState<BotDifficulty>('normal')
  const active = TIERS.find((t) => t.key === difficulty)!

  return (
    <PageShell title="Play vs AI" backTo="/play">
      <p className="heading-caps text-center text-xs text-gold-400">Offline practice</p>
      <p className="mx-auto mt-2 max-w-sm text-center text-sm text-mist">
        Choose your opponent’s strength, then start the match.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Difficulty">
        {TIERS.map((t) => {
          const selected = difficulty === t.key
          return (
            <button
              key={t.key}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setDifficulty(t.key)}
              className={`glass flex flex-col items-center rounded-2xl border p-5 text-center transition-all duration-200 active:scale-[0.98] ${
                selected ? t.activeCard : 'border-transparent hover:bg-white/[0.06]'
              }`}
            >
              <span
                className={`relative flex size-24 items-center justify-center rounded-full ring-1 ${t.ring} ${
                  selected ? 'shadow-glow-gold' : ''
                }`}
                style={{
                  background:
                    'radial-gradient(circle at 50% 45%, rgba(255,255,255,0.06), transparent 68%)',
                }}
              >
                <img
                  src={t.art}
                  alt=""
                  className="size-[92%] object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.55)]"
                />
              </span>
              <span className="heading-caps mt-3 flex items-baseline gap-2 text-base">
                <span className="text-gold-400">{t.numeral}</span>
                {t.label}
              </span>
              <span className="mt-1.5 text-sm leading-relaxed text-mist">{t.text}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-8 flex justify-center">
        <GameButton
          variant="primary"
          size="lg"
          icon={<IconSwords size={18} />}
          onClick={() => navigate(`/game/bot?d=${difficulty}`)}
        >
          Start match — {active.label}
        </GameButton>
      </div>
    </PageShell>
  )
}
