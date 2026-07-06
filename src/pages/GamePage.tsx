import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { BotDifficulty } from '../game'
import { ASSETS } from '../assets/assetManifest'
import { Board } from '../components/Board'
import { GameButton } from '../components/GameButton'
import { Modal } from '../components/Modal'
import { MoveHistoryModal } from '../components/MoveHistoryModal'
import { PlayerPanel } from '../components/PlayerPanel'
import { ResultModal } from '../components/ResultModal'
import {
  IconBack,
  IconBook,
  IconFlag,
  IconGear,
  IconHistory,
  IconRestart,
  IconSwords,
  IconUndo,
} from '../components/icons'
import { BOT_SIDE, HUMAN_SIDE, useMatchStore, type MatchMode } from '../store/matchStore'
import { useSettingsStore } from '../store/settingsStore'

const QUICK_RULES = [
  'Capturing is mandatory — if a capture exists, you must take it.',
  'When several capture routes exist, you must take one that captures the most pieces.',
  'Men move one square diagonally forward, but may capture forward or backward.',
  'A man crowned on the far row becomes a dama (king).',
  'A dama flies: it moves any distance diagonally and captures at range.',
  'You win when your opponent has no pieces or no legal moves.',
]

export function GamePage() {
  const { mode: modeParam } = useParams()
  const mode: MatchMode = modeParam === 'bot' ? 'bot' : 'local'
  const [searchParams] = useSearchParams()
  const dParam = searchParams.get('d')
  const difficulty: BotDifficulty =
    dParam === 'easy' || dParam === 'hard' ? dParam : 'normal'
  const navigate = useNavigate()

  const storeMode = useMatchStore((s) => s.mode)
  const storeDifficulty = useMatchStore((s) => s.botDifficulty)
  const match = useMatchStore((s) => s.match)
  const legal = useMatchStore((s) => s.legal)
  const startMatch = useMatchStore((s) => s.startMatch)
  const restart = useMatchStore((s) => s.restart)
  const surrender = useMatchStore((s) => s.surrender)
  const undoPlayerMove = useMatchStore((s) => s.undoPlayerMove)
  const playBotTurn = useMatchStore((s) => s.playBotTurn)
  const startedAt = useMatchStore((s) => s.startedAt)
  const endedAt = useMatchStore((s) => s.endedAt)
  const playerName = useSettingsStore((s) => s.playerName)

  const [showHistory, setShowHistory] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [confirmRestart, setConfirmRestart] = useState(false)
  const [confirmSurrender, setConfirmSurrender] = useState(false)
  const [resultReady, setResultReady] = useState(false)

  const state = match.current
  const finished = state.status === 'finished'
  const botTurn = mode === 'bot' && state.turn === BOT_SIDE && !finished

  // start a fresh match when arriving with a different mode or difficulty
  useEffect(() => {
    if (storeMode !== mode || (mode === 'bot' && storeDifficulty !== difficulty)) {
      startMatch(mode, difficulty)
    }
  }, [mode, storeMode, difficulty, storeDifficulty, startMatch])

  // bot plays after a short beat
  useEffect(() => {
    if (!botTurn) return
    const t = window.setTimeout(() => playBotTurn(), 750)
    return () => window.clearTimeout(t)
  }, [botTurn, state.moveHistory.length, playBotTurn])

  // let the last capture animation settle before revealing the result
  useEffect(() => {
    if (!finished) {
      setResultReady(false)
      return
    }
    const t = window.setTimeout(() => setResultReady(true), 450)
    return () => window.clearTimeout(t)
  }, [finished])

  const names = useMemo(
    () => ({
      red: playerName.trim() || 'Red',
      blue: mode === 'bot' ? 'Bot' : 'Blue',
    }),
    [playerName, mode],
  )

  const mustCapture = legal.length > 0 && legal[0].capturedIds.length > 0
  const redCaptured = 12 - state.pieces.filter((p) => p.side === 'blue').length
  const blueCaptured = 12 - state.pieces.filter((p) => p.side === 'red').length
  const canUndo = match.past.length > 0 && !botTurn && !finished

  const surrenderSide = mode === 'bot' ? HUMAN_SIDE : state.turn
  const surrenderLabel = mode === 'bot' ? 'Surrender' : `${names[surrenderSide]} surrenders`

  return (
    <div className="flex min-h-dvh flex-col">
      {/* compact chrome — the board is the star */}
      <header className="flex h-12 items-center gap-1 px-3">
        <Link
          to="/home"
          aria-label="Back to home"
          className="-ml-1 flex size-11 items-center justify-center rounded-xl text-mist hover:bg-white/5 hover:text-parchment"
        >
          <IconBack />
        </Link>
        <h1 className="heading-caps text-sm text-mist">
          {mode === 'bot'
            ? `Versus Bot · ${difficulty[0].toUpperCase()}${difficulty.slice(1)}`
            : 'Local Match'}
        </h1>
        <Link
          to="/settings"
          aria-label="Settings"
          className="ml-auto flex size-11 items-center justify-center rounded-xl text-mist hover:bg-white/5 hover:text-parchment"
        >
          <IconGear />
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-2.5 px-3 pb-4">
        <div className="w-[min(94vw,58dvh,640px)]">
          <PlayerPanel
            side="blue"
            name={names.blue}
            capturedCount={blueCaptured}
            active={state.turn === 'blue' && !finished}
            thinking={botTurn}
          />
        </div>

        {/* fixed-height slot so the banner never shifts the board */}
        <div className="flex h-8 items-center" aria-live="polite">
          {mustCapture && !finished && !botTurn && (
            <span className="anim-fade-in flex items-center gap-2 rounded-full border border-ember-500/50 bg-ember-700/40 px-4 py-1 text-sm font-semibold text-ember-300">
              <IconSwords size={15} />
              Capture required
            </span>
          )}
        </div>

        <div className="relative w-[min(94vw,58dvh,640px)]">
          {/* flanking castles — pure decoration on wide screens */}
          <img
            src={ASSETS.redCastle.src}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 -left-56 hidden w-44 -translate-y-1/2 rounded-2xl opacity-50 [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,black,transparent)] xl:block"
          />
          <img
            src={ASSETS.blueCastle.src}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 -right-56 hidden w-44 -translate-y-1/2 rounded-2xl opacity-50 [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,black,transparent)] xl:block"
          />
          <Board />
        </div>

        <div className="w-[min(94vw,58dvh,640px)]">
          <PlayerPanel
            side="red"
            name={names.red}
            capturedCount={redCaptured}
            active={state.turn === 'red' && !finished}
          />
        </div>

        {/* match actions */}
        <div className="mt-1 flex w-[min(94vw,58dvh,640px)] items-center justify-center gap-1.5">
          <GameButton
            size="sm"
            aria-label="Undo move"
            icon={<IconUndo size={16} />}
            disabled={!canUndo}
            onClick={undoPlayerMove}
          >
            <span className="hidden sm:inline">Undo</span>
          </GameButton>
          <GameButton
            size="sm"
            aria-label="Move history"
            icon={<IconHistory size={16} />}
            onClick={() => setShowHistory(true)}
          >
            <span className="hidden sm:inline">History</span>
          </GameButton>
          <GameButton
            size="sm"
            aria-label="Rules reference"
            icon={<IconBook size={16} />}
            onClick={() => setShowHelp(true)}
          >
            <span className="hidden sm:inline">Rules</span>
          </GameButton>
          <GameButton
            size="sm"
            aria-label="Restart match"
            icon={<IconRestart size={16} />}
            disabled={finished}
            onClick={() => setConfirmRestart(true)}
          >
            <span className="hidden sm:inline">Restart</span>
          </GameButton>
          <GameButton
            size="sm"
            aria-label="Surrender"
            icon={<IconFlag size={16} />}
            disabled={finished || botTurn}
            onClick={() => setConfirmSurrender(true)}
          >
            <span className="hidden sm:inline">Surrender</span>
          </GameButton>
        </div>
      </main>

      <MoveHistoryModal state={state} open={showHistory} onClose={() => setShowHistory(false)} />

      <Modal open={showHelp} onClose={() => setShowHelp(false)} title="Quick rules">
        <ul className="space-y-2.5 text-sm leading-relaxed text-parchment/90">
          {QUICK_RULES.map((r) => (
            <li key={r} className="flex gap-2.5">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-gold-400" />
              {r}
            </li>
          ))}
        </ul>
        <Link
          to="/rules"
          className="mt-4 inline-block text-sm font-semibold text-gold-300 hover:text-gold-200"
        >
          Read the full rules →
        </Link>
      </Modal>

      <Modal open={confirmRestart} onClose={() => setConfirmRestart(false)} title="Restart match?">
        <p className="text-sm text-mist">The current position will be lost.</p>
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <GameButton onClick={() => setConfirmRestart(false)}>Keep playing</GameButton>
          <GameButton
            variant="danger"
            onClick={() => {
              restart()
              setConfirmRestart(false)
            }}
          >
            Restart
          </GameButton>
        </div>
      </Modal>

      <Modal
        open={confirmSurrender}
        onClose={() => setConfirmSurrender(false)}
        title="Surrender?"
      >
        <p className="text-sm text-mist">
          {mode === 'bot'
            ? 'The bot will take the victory.'
            : `${names[surrenderSide]} concedes the match to ${
                names[surrenderSide === 'red' ? 'blue' : 'red']
              }.`}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <GameButton onClick={() => setConfirmSurrender(false)}>Keep playing</GameButton>
          <GameButton
            variant="danger"
            onClick={() => {
              surrender(surrenderSide)
              setConfirmSurrender(false)
            }}
          >
            {surrenderLabel}
          </GameButton>
        </div>
      </Modal>

      <ResultModal
        state={state}
        open={finished && resultReady}
        durationMs={(endedAt ?? Date.now()) - startedAt}
        playerNames={names}
        onRematch={restart}
        onHome={() => navigate('/home')}
        onShowHistory={() => {
          setResultReady(false)
          setShowHistory(true)
        }}
      />
    </div>
  )
}
