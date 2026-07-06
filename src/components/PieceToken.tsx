import { ASSETS } from '../assets/assetManifest'
import type { PieceKind, Side } from '../game'
import { useSettingsStore } from '../store/settingsStore'
import { IconCrown } from './icons'

interface PieceTokenProps {
  side: Side
  kind: PieceKind
  selected?: boolean
  /** subtle dot marking pieces that are allowed to move */
  movable?: boolean
  /** enemy piece that would be captured by the next tap */
  threatened?: boolean
  /** already jumped earlier in the in-progress chain */
  ghosted?: boolean
  justPromoted?: boolean
}

const portraitFor = (side: Side, kind: PieceKind) =>
  side === 'red'
    ? kind === 'king'
      ? ASSETS.redKing
      : ASSETS.redMan
    : kind === 'king'
      ? ASSETS.blueKing
      : ASSETS.blueMan

/**
 * A board token. The faction portraits are opaque full-body renders on a
 * near-black background, so they are always shown inside a circular mask
 * (cropped to the helmet/bust) over a matching dark radial base — never as
 * raw rectangles. `pieceStyle: 'minimal'` swaps to flat discs.
 */
export function PieceToken({
  side,
  kind,
  selected = false,
  movable = false,
  threatened = false,
  ghosted = false,
  justPromoted = false,
}: PieceTokenProps) {
  const pieceStyle = useSettingsStore((s) => s.pieceStyle)
  const portrait = portraitFor(side, kind)

  const ringColor = selected
    ? 'ring-gold-300'
    : threatened
      ? 'ring-ember-400'
      : side === 'red'
        ? 'ring-ember-500/90'
        : 'ring-tide-500/90'

  const glow = selected
    ? 'shadow-glow-gold'
    : threatened
      ? 'shadow-glow-ember'
      : ''

  return (
    <div
      className={`relative size-full rounded-full ring-2 ${ringColor} ${glow} ${
        ghosted ? 'opacity-30 saturate-0' : ''
      } ${justPromoted ? 'anim-promote' : ''} transition-shadow duration-200`}
      style={{
        background:
          side === 'red'
            ? 'radial-gradient(circle at 35% 30%, #3a1215, #14060a 70%)'
            : 'radial-gradient(circle at 35% 30%, #12203f, #060a16 70%)',
      }}
    >
      {pieceStyle === 'portrait' ? (
        <img
          src={portrait.src}
          alt=""
          draggable={false}
          className="absolute inset-0 size-full rounded-full object-cover"
          style={{
            objectPosition: kind === 'king' ? '50% 8%' : '50% 12%',
            // the portraits are dark armor on near-black — lift them so the
            // bust stays readable at token size
            filter: 'brightness(1.3) saturate(1.08)',
          }}
        />
      ) : (
        <div
          className="absolute inset-[14%] rounded-full"
          style={{
            background:
              side === 'red'
                ? 'radial-gradient(circle at 38% 32%, #e65a5f, #711b22 75%)'
                : 'radial-gradient(circle at 38% 32%, #5f92e6, #1f3a74 75%)',
            boxShadow: 'inset 0 -3px 6px rgba(0,0,0,.5), inset 0 2px 3px rgba(255,255,255,.25)',
          }}
        />
      )}

      {/* inner bevel to seat the portrait into the token */}
      <div
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{ boxShadow: 'inset 0 0 0 2px rgba(0,0,0,.55), inset 0 -4px 10px rgba(0,0,0,.45)' }}
      />

      {kind === 'king' && (
        <span
          className="absolute -top-[12%] left-1/2 z-10 flex size-[38%] -translate-x-1/2 items-center justify-center rounded-full border border-gold-500/60 bg-night-900 text-gold-300 shadow-md"
          aria-hidden="true"
        >
          <IconCrown size={12} className="size-[62%]" />
        </span>
      )}

      {movable && !selected && (
        <span
          className="absolute -bottom-[6%] left-1/2 size-[16%] -translate-x-1/2 rounded-full bg-gold-300/90 shadow-glow-gold"
          aria-hidden="true"
        />
      )}
    </div>
  )
}
