import { ASSETS } from '../assets/assetManifest'
import type { GameState } from '../game'
import { GameButton } from './GameButton'
import { Modal } from './Modal'

interface ResultModalProps {
  state: GameState
  open: boolean
  durationMs: number
  playerNames: { red: string; blue: string }
  onRematch: () => void
  onHome: () => void
  onShowHistory: () => void
}

const REASONS: Record<string, string> = {
  'no-pieces': 'All enemy pieces were captured.',
  'no-moves': 'The opponent had no legal moves left.',
  surrender: 'The opponent surrendered.',
  draw: 'Both sides agreed to a draw.',
}

function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function ResultModal({
  state,
  open,
  durationMs,
  playerNames,
  onRematch,
  onHome,
  onShowHistory,
}: ResultModalProps) {
  const winner = state.winner
  const portrait = winner === 'red' ? ASSETS.redKing : ASSETS.blueKing
  const redCaptures = state.moveHistory.filter((m) => m.side === 'red').reduce((n, m) => n + m.capturedIds.length, 0)
  const blueCaptures = state.moveHistory.filter((m) => m.side === 'blue').reduce((n, m) => n + m.capturedIds.length, 0)
  const kings = state.moveHistory.filter((m) => m.promoted).length

  const stats: Array<[string, string]> = [
    ['Total moves', String(state.moveHistory.length)],
    ['Duration', fmtDuration(durationMs)],
    [`${playerNames.red} captures`, String(redCaptures)],
    [`${playerNames.blue} captures`, String(blueCaptures)],
    ['Kings crowned', String(kings)],
  ]

  return (
    <Modal open={open} dismissable={false} maxWidth="max-w-sm">
      <div className="flex flex-col items-center text-center">
        {winner ? (
          <>
            <div
              className={`relative size-24 overflow-hidden rounded-full ring-4 ${
                winner === 'red' ? 'ring-ember-500' : 'ring-tide-500'
              } shadow-glow-gold`}
            >
              <img
                src={portrait.src}
                alt=""
                className="size-full object-cover"
                style={{ objectPosition: '50% 8%', filter: 'brightness(1.25) saturate(1.05)' }}
              />
            </div>
            <h2 className="heading-caps mt-4 text-2xl text-gold-300">
              {playerNames[winner]} wins
            </h2>
          </>
        ) : (
          <h2 className="heading-caps mt-2 text-2xl text-gold-300">Draw</h2>
        )}
        <p className="mt-1 text-sm text-mist">
          {REASONS[state.resultReason ?? ''] ?? 'The match has ended.'}
        </p>

        <dl className="mt-5 w-full space-y-2 rounded-xl bg-white/[0.03] p-4 text-sm">
          {stats.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-4">
              <dt className="text-mist">{label}</dt>
              <dd className="tabular font-semibold">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 flex w-full flex-col gap-2.5">
          <GameButton variant="primary" size="lg" onClick={onRematch}>
            Rematch
          </GameButton>
          <div className="grid grid-cols-2 gap-2.5">
            <GameButton variant="ghost" onClick={onShowHistory}>
              Move history
            </GameButton>
            <GameButton variant="outline" onClick={onHome}>
              Back to home
            </GameButton>
          </div>
        </div>
      </div>
    </Modal>
  )
}
