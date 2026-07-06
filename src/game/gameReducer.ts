import { applyMoveSequence } from './applyMove'
import { createInitialGameState } from './initialState'
import { resignGame } from './rules'
import type { GameState, MoveSequence, Side } from './types'

/**
 * Pure match-level reducer wrapped by the UI store. Keeps an undo stack of
 * prior states; undo is only offered by the UI in local (offline) modes.
 */
export interface MatchState {
  current: GameState
  past: GameState[]
}

export type MatchAction =
  | { type: 'apply'; sequence: MoveSequence }
  | { type: 'restart' }
  | { type: 'surrender'; side: Side }
  | { type: 'undo'; steps?: number }

export function createMatchState(): MatchState {
  return { current: createInitialGameState(), past: [] }
}

export function matchReducer(state: MatchState, action: MatchAction): MatchState {
  switch (action.type) {
    case 'apply': {
      if (state.current.status === 'finished') return state
      return {
        current: applyMoveSequence(state.current, action.sequence),
        past: [...state.past, state.current],
      }
    }
    case 'restart':
      return createMatchState()
    case 'surrender': {
      if (state.current.status === 'finished') return state
      return { ...state, current: resignGame(state.current, action.side) }
    }
    case 'undo': {
      const steps = Math.min(action.steps ?? 1, state.past.length)
      if (steps === 0) return state
      return {
        current: state.past[state.past.length - steps],
        past: state.past.slice(0, state.past.length - steps),
      }
    }
  }
}
