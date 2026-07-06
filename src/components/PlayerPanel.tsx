import { ASSETS } from '../assets/assetManifest'
import type { Side } from '../game'

interface PlayerPanelProps {
  side: Side
  name: string
  capturedCount: number
  active: boolean
  thinking?: boolean
}

/**
 * Glass strip above/below the board. The faction portrait is opaque art, so
 * it sits inside a circular masked avatar with a faction ring.
 */
export function PlayerPanel({ side, name, capturedCount, active, thinking = false }: PlayerPanelProps) {
  const portrait = side === 'red' ? ASSETS.redMan : ASSETS.blueMan
  const ring = side === 'red' ? 'ring-ember-500' : 'ring-tide-500'
  const tone = side === 'red' ? 'text-ember-300' : 'text-tide-300'

  return (
    <div
      className={`glass flex items-center gap-3 rounded-2xl px-3 py-2 sm:px-4 ${
        active ? 'anim-turn-pulse' : 'opacity-85'
      }`}
    >
      <div className={`relative size-11 shrink-0 overflow-hidden rounded-full ring-2 ${ring} bg-night-900`}>
        <img
          src={portrait.src}
          alt=""
          className="size-full object-cover"
          style={{ objectPosition: '50% 12%', filter: 'brightness(1.25) saturate(1.05)' }}
          draggable={false}
        />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold leading-tight">{name}</p>
        <p className={`text-xs ${tone}`}>
          {thinking ? 'Thinking…' : active ? 'Your move' : 'Waiting'}
        </p>
      </div>

      <div className="flex items-center gap-1.5" aria-label={`${capturedCount} pieces captured`}>
        {Array.from({ length: Math.min(capturedCount, 6) }, (_, i) => (
          <span
            key={i}
            className={`size-2.5 rounded-full ${
              side === 'red' ? 'bg-tide-500/80' : 'bg-ember-500/80'
            }`}
          />
        ))}
        <span className="tabular ml-1 text-sm font-semibold text-gold-300">{capturedCount}</span>
      </div>
    </div>
  )
}
