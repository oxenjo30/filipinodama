import { useMemo } from 'react'
import { SIZE, isPlayable, squareName, type Piece, type Square } from '../game'
import { candidateSequences, useMatchStore, BOT_SIDE } from '../store/matchStore'
import { animationMs, useSettingsStore } from '../store/settingsStore'
import { PieceToken } from './PieceToken'

const keyOf = (sq: Square) => `${sq.row},${sq.col}`

/**
 * The play surface. A CSS-grid of interactive squares (source of truth for
 * hit-testing and alignment) with an absolutely-positioned piece layer on top
 * that animates via transform only.
 */
export function Board() {
  const match = useMatchStore((s) => s.match)
  const legal = useMatchStore((s) => s.legal)
  const selectedPieceId = useMatchStore((s) => s.selectedPieceId)
  const path = useMatchStore((s) => s.path)
  const tapSquare = useMatchStore((s) => s.tapSquare)
  const mode = useMatchStore((s) => s.mode)
  const moveHints = useSettingsStore((s) => s.moveHints)
  const speed = useSettingsStore((s) => s.animationSpeed)
  const boardTheme = useSettingsStore((s) => s.boardTheme)

  const state = match.current
  const lastRecord = state.moveHistory[state.moveHistory.length - 1]

  const derived = useMemo(() => {
    const candidates = candidateSequences(legal, selectedPieceId, path)
    const nextTargets = new Set<string>()
    const threatenedIds = new Set<string>()
    for (const seq of candidates) {
      const step = seq.steps[path.length]
      if (step) {
        nextTargets.add(keyOf(step.to))
        if (step.capturedId) threatenedIds.add(step.capturedId)
      }
    }
    // pieces already jumped earlier in the in-progress chain (shared prefix)
    const ghostedIds = new Set<string>(
      candidates.length > 0
        ? candidates[0].steps.slice(0, path.length).flatMap((s) => (s.capturedId ? [s.capturedId] : []))
        : [],
    )
    const movableIds = new Set(legal.map((s) => s.pieceId))
    // route display position for the selected piece mid-chain
    const routePos = path.length > 0 ? path[path.length - 1] : null
    return { nextTargets, threatenedIds, ghostedIds, movableIds, routePos }
  }, [legal, selectedPieceId, path])

  // squares where enemy pieces vanished on the last applied move (ember flash)
  const captureFlashes = useMemo(() => {
    if (!lastRecord || lastRecord.capturedIds.length === 0) return []
    const prev = match.past[match.past.length - 1]
    if (!prev) return []
    return prev.pieces
      .filter((p) => lastRecord.capturedIds.includes(p.id))
      .map((p) => ({ row: p.row, col: p.col, key: `${state.moveHistory.length}-${p.id}` }))
  }, [lastRecord, match.past, state.moveHistory.length])

  const lastPathKeys = useMemo(
    () => new Set((lastRecord?.path ?? []).map(keyOf)),
    [lastRecord],
  )

  const pieceAt = useMemo(() => {
    const map = new Map<string, Piece>()
    for (const p of state.pieces) map.set(`${p.row},${p.col}`, p)
    return map
  }, [state.pieces])

  const ms = animationMs(speed)
  const humanCanAct = !(mode === 'bot' && state.turn === BOT_SIDE) && state.status === 'playing'

  const squares = []
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const playable = isPlayable(row, col)
      const k = `${row},${col}`
      const piece = pieceAt.get(k)
      const isTarget = derived.nextTargets.has(k)
      const isLastPath = lastPathKeys.has(k)
      const label = piece
        ? `${squareName({ row, col })}, ${piece.side} ${piece.kind === 'king' ? 'dama' : 'piece'}`
        : squareName({ row, col })

      const darkTone =
        boardTheme === 'classic'
          ? 'bg-[#4a2e1d]'
          : 'bg-square-dark'
      const lightTone =
        boardTheme === 'classic'
          ? 'bg-[#d9c193]'
          : 'bg-square-light'

      squares.push(
        <button
          key={k}
          type="button"
          aria-label={label}
          disabled={!playable || !humanCanAct}
          onClick={() => tapSquare(row, col)}
          className={`relative ${playable ? darkTone : lightTone} ${
            playable && humanCanAct ? '' : 'cursor-default'
          } focus-visible:z-10`}
          style={
            playable
              ? {
                  backgroundImage: isLastPath
                    ? 'radial-gradient(circle, rgba(212,169,78,0.16), rgba(212,169,78,0.05))'
                    : 'radial-gradient(circle at 50% 40%, rgba(255,255,255,0.03), transparent 70%)',
                }
              : undefined
          }
        >
          {isTarget && moveHints && (
            <span className="anim-hint absolute inset-[32%] rounded-full bg-gold-300/80 shadow-glow-gold" />
          )}
          {isTarget && !moveHints && (
            <span className="absolute inset-[42%] rounded-full bg-gold-300/50" />
          )}
        </button>,
      )
    }
  }

  return (
    <div className="relative w-full select-none">
      {/* carved gold frame */}
      <div className="rounded-xl border border-gold-500/40 bg-gradient-to-b from-night-700 to-night-900 p-1.5 shadow-[0_10px_40px_rgba(0,0,0,0.55)] sm:p-2">
        <div className="relative overflow-hidden rounded-lg border border-gold-600/30">
          <div className="grid aspect-square grid-cols-8 grid-rows-8" role="grid" aria-label="Dama board">
            {squares}
          </div>

          {/* piece layer — visual only; taps fall through to the grid */}
          <div className="pointer-events-none absolute inset-0">
            {state.pieces.map((p) => {
              const isSelected = p.id === selectedPieceId
              const pos =
                isSelected && derived.routePos ? derived.routePos : { row: p.row, col: p.col }
              return (
                <div
                  key={p.id}
                  className="absolute"
                  style={{
                    width: '12.5%',
                    height: '12.5%',
                    transform: `translate(${pos.col * 100}%, ${pos.row * 100}%)`,
                    transition: ms > 0 ? `transform ${ms}ms ease-out` : undefined,
                    zIndex: isSelected ? 5 : 1,
                  }}
                >
                  <div className="absolute inset-[9%]">
                    <PieceToken
                      side={p.side}
                      kind={p.kind}
                      selected={isSelected}
                      movable={moveHints && humanCanAct && derived.movableIds.has(p.id) && !selectedPieceId}
                      threatened={derived.threatenedIds.has(p.id)}
                      ghosted={derived.ghostedIds.has(p.id)}
                      justPromoted={lastRecord?.promoted && lastRecord.pieceId === p.id}
                    />
                  </div>
                </div>
              )
            })}

            {/* capture flashes */}
            {captureFlashes.map((f) => (
              <div
                key={f.key}
                className="absolute"
                style={{
                  width: '12.5%',
                  height: '12.5%',
                  transform: `translate(${f.col * 100}%, ${f.row * 100}%)`,
                }}
              >
                <div className="anim-capture absolute inset-[15%] rounded-full bg-ember-400/70 blur-[6px]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
