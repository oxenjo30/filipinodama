import { applyMoveSequence } from './applyMove'
import { getLegalTurnSequences } from './moveGenerator'
import type { BotDifficulty, GameState, MoveSequence } from './types'

/**
 * Legal-move bot with three genuine skill tiers:
 * - easy: uniform random over legal moves.
 * - normal: winning move > max capture (enforced by the generator) >
 *   promotion > random.
 * - hard: one-ply lookahead — scores material swing (own captures minus the
 *   opponent's best forced reply), promotions, and wins, so it refuses to
 *   hang pieces the way normal happily does.
 * `rng` is injectable so tests stay deterministic.
 */
export function createBotMove(
  state: GameState,
  difficulty: BotDifficulty = 'normal',
  rng: () => number = Math.random,
): MoveSequence | null {
  const legal = getLegalTurnSequences(state)
  if (legal.length === 0) return null

  const pick = (list: MoveSequence[]) => list[Math.floor(rng() * list.length)]
  if (difficulty === 'easy') return pick(legal)

  if (difficulty === 'hard') {
    let best: MoveSequence[] = []
    let bestScore = -Infinity
    for (const seq of legal) {
      const score = scoreOnePly(state, seq)
      if (score > bestScore) {
        bestScore = score
        best = [seq]
      } else if (score === bestScore) {
        best.push(seq)
      }
    }
    return pick(best)
  }

  const winning = legal.filter((seq) => {
    const next = applyMoveSequence(state, seq)
    return next.status === 'finished' && next.winner === state.turn
  })
  if (winning.length > 0) return pick(winning)

  const promoting = legal.filter((seq) => seq.promotes)
  if (promoting.length > 0) return pick(promoting)

  return pick(legal)
}

function scoreOnePly(state: GameState, seq: MoveSequence): number {
  const next = applyMoveSequence(state, seq)
  if (next.status === 'finished') {
    return next.winner === state.turn ? 1000 : -1000
  }
  const replies = getLegalTurnSequences(next)
  const worstReply = replies.reduce((max, r) => Math.max(max, r.capturedIds.length), 0)
  return seq.capturedIds.length * 10 + (seq.promotes ? 6 : 0) - worstReply * 10
}
