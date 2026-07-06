import type { GameState } from '../game'
import { Modal } from './Modal'

interface MoveHistoryModalProps {
  state: GameState
  open: boolean
  onClose: () => void
}

export function MoveHistoryModal({ state, open, onClose }: MoveHistoryModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Move history">
      {state.moveHistory.length === 0 ? (
        <p className="py-6 text-center text-sm text-mist">No moves yet.</p>
      ) : (
        <ol className="max-h-80 space-y-1 overflow-y-auto pr-1 text-sm">
          {state.moveHistory.map((m, i) => (
            <li
              key={i}
              className="flex items-center gap-3 rounded-lg px-3 py-2 odd:bg-white/[0.03]"
            >
              <span className="tabular w-6 text-right text-mist">{i + 1}.</span>
              <span
                className={`size-2.5 shrink-0 rounded-full ${
                  m.side === 'red' ? 'bg-ember-500' : 'bg-tide-500'
                }`}
                aria-label={m.side}
              />
              <span className="tabular font-medium">{m.notation}</span>
              <span className="ml-auto text-xs text-mist">
                {m.capturedIds.length > 0 && `${m.capturedIds.length} captured`}
                {m.promoted && (m.capturedIds.length > 0 ? ' · crowned' : 'crowned')}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  )
}
