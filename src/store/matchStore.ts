import { create } from 'zustand'
import { sfx } from '../audio/sfx'
import {
  createBotMove,
  createMatchState,
  getPieceAt,
  matchReducer,
  type BotDifficulty,
  type MatchState,
  type MoveSequence,
  type Side,
  type Square,
  getLegalTurnSequences,
} from '../game'
import { useSettingsStore } from './settingsStore'

export type MatchMode = 'local' | 'bot'

export const HUMAN_SIDE: Side = 'red'
export const BOT_SIDE: Side = 'blue'

const sameSquare = (a: Square, b: Square) => a.row === b.row && a.col === b.col

interface MatchStore {
  mode: MatchMode
  botDifficulty: BotDifficulty
  match: MatchState
  /** legal full-turn sequences for the side to move (max-capture applied) */
  legal: MoveSequence[]
  selectedPieceId: string | null
  /** landing squares chosen so far while walking a multi-jump */
  path: Square[]
  startedAt: number
  endedAt: number | null
  resultRecorded: boolean

  startMatch: (mode: MatchMode, difficulty?: BotDifficulty) => void
  tapSquare: (row: number, col: number) => void
  clearSelection: () => void
  applySequence: (seq: MoveSequence) => void
  playBotTurn: () => void
  restart: () => void
  surrender: (side: Side) => void
  undoPlayerMove: () => void
}

/** Sequences for the selected piece whose first `path.length` landings match `path`. */
export function candidateSequences(
  legal: MoveSequence[],
  selectedPieceId: string | null,
  path: Square[],
): MoveSequence[] {
  if (!selectedPieceId) return []
  return legal.filter(
    (seq) =>
      seq.pieceId === selectedPieceId &&
      path.every((sq, i) => seq.steps[i] && sameSquare(seq.steps[i].to, sq)),
  )
}

function finishBookkeeping(
  store: Pick<MatchStore, 'mode' | 'resultRecorded'>,
  match: MatchState,
): Partial<MatchStore> {
  if (match.current.status !== 'finished' || store.resultRecorded) return {}
  const { winner } = match.current
  const settings = useSettingsStore.getState()
  if (store.mode === 'bot') {
    settings.recordResult(winner === HUMAN_SIDE ? 'win' : winner ? 'loss' : 'draw')
    if (winner === HUMAN_SIDE) sfx.win()
    else sfx.lose()
  } else {
    settings.recordResult('played')
    sfx.win()
  }
  return { endedAt: Date.now(), resultRecorded: true }
}

export const useMatchStore = create<MatchStore>()((set, get) => ({
  mode: 'local',
  botDifficulty: 'normal',
  match: createMatchState(),
  legal: getLegalTurnSequences(createMatchState().current),
  selectedPieceId: null,
  path: [],
  startedAt: Date.now(),
  endedAt: null,
  resultRecorded: false,

  startMatch: (mode, difficulty = 'normal') => {
    const match = createMatchState()
    set({
      mode,
      botDifficulty: difficulty,
      match,
      legal: getLegalTurnSequences(match.current),
      selectedPieceId: null,
      path: [],
      startedAt: Date.now(),
      endedAt: null,
      resultRecorded: false,
    })
  },

  tapSquare: (row, col) => {
    const { match, legal, selectedPieceId, path, mode } = get()
    const state = match.current
    if (state.status === 'finished') return
    if (mode === 'bot' && state.turn === BOT_SIDE) return

    // Continue or commit a selected route when tapping a highlighted landing.
    if (selectedPieceId) {
      const candidates = candidateSequences(legal, selectedPieceId, path)
      const hit = candidates.filter(
        (seq) => seq.steps[path.length] && sameSquare(seq.steps[path.length].to, { row, col }),
      )
      if (hit.length > 0) {
        const nextPath = [...path, { row, col }]
        const complete = hit.find((seq) => seq.steps.length === nextPath.length)
        if (complete) {
          get().applySequence(complete)
        } else {
          set({ path: nextPath })
          sfx.select()
        }
        return
      }
    }

    // Otherwise (re)select one of the mover's pieces — only if it has legal moves.
    const piece = getPieceAt(state, row, col)
    if (piece && piece.side === state.turn) {
      if (get().path.length > 0) return // locked mid-route; finish the jump
      const hasMoves = legal.some((seq) => seq.pieceId === piece.id)
      if (hasMoves) {
        set({ selectedPieceId: piece.id, path: [] })
        sfx.select()
        return
      }
      // piece exists but is not allowed to move (e.g. must-capture elsewhere)
      return
    }

    if (path.length === 0) set({ selectedPieceId: null, path: [] })
  },

  clearSelection: () => set({ selectedPieceId: null, path: [] }),

  applySequence: (seq) => {
    const store = get()
    const match = matchReducer(store.match, { type: 'apply', sequence: seq })
    if (seq.capturedIds.length > 0) sfx.capture()
    else sfx.move()
    if (seq.promotes) sfx.promote()
    set({
      match,
      legal: getLegalTurnSequences(match.current),
      selectedPieceId: null,
      path: [],
      ...finishBookkeeping(store, match),
    })
  },

  playBotTurn: () => {
    const { match, mode, botDifficulty } = get()
    if (mode !== 'bot' || match.current.status === 'finished') return
    if (match.current.turn !== BOT_SIDE) return
    const move = createBotMove(match.current, botDifficulty)
    if (move) get().applySequence(move)
  },

  restart: () => {
    const match = createMatchState()
    set({
      match,
      legal: getLegalTurnSequences(match.current),
      selectedPieceId: null,
      path: [],
      startedAt: Date.now(),
      endedAt: null,
      resultRecorded: false,
    })
  },

  surrender: (side) => {
    const store = get()
    const match = matchReducer(store.match, { type: 'surrender', side })
    set({
      match,
      legal: [],
      selectedPieceId: null,
      path: [],
      ...finishBookkeeping(store, match),
    })
  },

  undoPlayerMove: () => {
    const { match, mode } = get()
    if (match.past.length === 0) return
    // In bot mode, undo back to the human's last decision point.
    const steps = mode === 'bot' && match.current.turn === HUMAN_SIDE ? 2 : 1
    const next = matchReducer(match, { type: 'undo', steps: Math.min(steps, match.past.length) })
    set({
      match: next,
      legal: getLegalTurnSequences(next.current),
      selectedPieceId: null,
      path: [],
      endedAt: null,
    })
  },
}))
