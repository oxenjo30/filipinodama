import type { PieceKind, Side } from '../game'
import { PieceToken } from './PieceToken'

interface MiniPiece {
  row: number
  col: number
  side: Side
  kind?: PieceKind
}

interface MiniBoardProps {
  /** grid is size × size, same parity as the real board: (row+col) odd = playable */
  size?: number
  pieces: MiniPiece[]
  /** gold destination dots */
  dots?: Array<[number, number]>
  /** squares flagged as capture victims */
  marks?: Array<[number, number]>
  caption: string
}

/** Small static diagram board for the rules page. Non-interactive. */
export function MiniBoard({ size = 4, pieces, dots = [], marks = [], caption }: MiniBoardProps) {
  const cells = []
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const playable = (r + c) % 2 === 1
      const piece = pieces.find((p) => p.row === r && p.col === c)
      const dot = dots.some(([dr, dc]) => dr === r && dc === c)
      const mark = marks.some(([mr, mc]) => mr === r && mc === c)
      cells.push(
        <div
          key={`${r},${c}`}
          className={`relative ${playable ? 'bg-square-dark' : 'bg-square-light'}`}
        >
          {mark && <div className="absolute inset-0.5 rounded-sm ring-2 ring-ember-400/80" />}
          {dot && (
            <span className="absolute inset-[34%] rounded-full bg-gold-300/85 shadow-glow-gold" />
          )}
          {piece && (
            <div className="absolute inset-[10%]">
              <PieceToken side={piece.side} kind={piece.kind ?? 'man'} />
            </div>
          )}
        </div>,
      )
    }
  }

  return (
    <figure className="shrink-0">
      <div
        className="grid w-36 overflow-hidden rounded-lg border border-gold-600/40 sm:w-40"
        style={{
          gridTemplateColumns: `repeat(${size}, 1fr)`,
          aspectRatio: '1 / 1',
        }}
        aria-label={caption}
        role="img"
      >
        {cells}
      </div>
      <figcaption className="mt-2 w-36 text-center text-xs text-mist sm:w-40">{caption}</figcaption>
    </figure>
  )
}
