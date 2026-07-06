import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../components/Card'
import { GameButton } from '../components/GameButton'
import { PageShell } from '../components/PageShell'
import { IconCopy, IconDoor, IconWarning } from '../components/icons'
import { roomService } from '../online/roomService'
import type { Room, TimerOption } from '../online/roomTypes'
import { useSettingsStore } from '../store/settingsStore'

const TIMERS: Array<{ value: TimerOption; label: string }> = [
  { value: 'none', label: 'No timer' },
  { value: '3min', label: '3 min' },
  { value: '5min', label: '5 min' },
  { value: '10min', label: '10 min' },
]

export function CreateRoomPage() {
  const savedName = useSettingsStore((s) => s.playerName)
  const [name, setName] = useState(savedName)
  const [timer, setTimer] = useState<TimerOption>('none')
  const [room, setRoom] = useState<Room | null>(null)
  const [copied, setCopied] = useState(false)
  const [nameError, setNameError] = useState('')

  const create = async () => {
    if (!name.trim()) {
      setNameError('Enter a player name first.')
      return
    }
    setNameError('')
    const created = await roomService.createRoom({
      hostName: name.trim(),
      matchType: 'casual',
      timer,
      visibility: 'private',
    })
    setRoom(created)
  }

  const copy = async () => {
    if (!room) return
    try {
      await navigator.clipboard.writeText(room.code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      // clipboard unavailable — code stays visible on screen
    }
  }

  return (
    <PageShell title="Create room" backTo="/home">
      {/* honest status — no fake multiplayer */}
      <Card className="mb-4 flex items-start gap-3 border-tide-500/30 bg-tide-700/20 p-4">
        <IconWarning className="mt-0.5 shrink-0 text-tide-300" />
        <div className="text-sm leading-relaxed">
          <p className="font-semibold text-tide-300">Online sync isn’t connected yet.</p>
          <p className="mt-0.5 text-mist">
            You can preview the room flow below — the code is generated locally and can’t be
            joined from another device yet.
          </p>
        </div>
      </Card>

      {!room ? (
        <Card className="p-5">
          <label className="block text-sm font-medium" htmlFor="host-name">
            Player name
          </label>
          <input
            id="host-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            placeholder="e.g. Lakan"
            className="mt-1.5 w-full rounded-xl border border-white/10 bg-night-800 px-4 py-3 text-parchment placeholder:text-mist/60 focus:border-gold-400/60"
          />
          {nameError && <p className="mt-1.5 text-sm text-ember-400">{nameError}</p>}

          <fieldset className="mt-5">
            <legend className="text-sm font-medium">Match type</legend>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <button
                type="button"
                aria-pressed="true"
                className="rounded-xl border border-gold-400/50 bg-gold-500/15 px-4 py-2.5 text-sm font-semibold text-gold-200"
              >
                Casual
              </button>
              <button
                type="button"
                disabled
                title="Ranked arrives with online play"
                className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-mist opacity-60"
              >
                Ranked — soon
              </button>
            </div>
          </fieldset>

          <fieldset className="mt-5">
            <legend className="text-sm font-medium">Timer</legend>
            <div className="mt-1.5 grid grid-cols-4 gap-2">
              {TIMERS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={timer === t.value}
                  onClick={() => setTimer(t.value)}
                  className={`rounded-xl border px-2 py-2.5 text-sm font-medium transition-colors ${
                    timer === t.value
                      ? 'border-gold-400/50 bg-gold-500/15 text-gold-200'
                      : 'border-white/10 bg-white/[0.03] text-mist hover:text-parchment'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-5">
            <legend className="text-sm font-medium">Visibility</legend>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <button
                type="button"
                aria-pressed="true"
                className="rounded-xl border border-gold-400/50 bg-gold-500/15 px-4 py-2.5 text-sm font-semibold text-gold-200"
              >
                Private
              </button>
              <button
                type="button"
                disabled
                title="Public lobbies arrive with online play"
                className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-mist opacity-60"
              >
                Public — soon
              </button>
            </div>
          </fieldset>

          <GameButton
            variant="primary"
            size="lg"
            className="mt-6 w-full"
            icon={<IconDoor size={18} />}
            onClick={create}
          >
            Create room preview
          </GameButton>
        </Card>
      ) : (
        <Card className="p-6 text-center">
          <p className="text-sm text-mist">Room code</p>
          <p className="heading-caps mt-2 text-4xl tracking-[0.3em] text-gold-300">{room.code}</p>
          <GameButton className="mt-4" icon={<IconCopy size={16} />} onClick={copy}>
            {copied ? 'Copied' : 'Copy code'}
          </GameButton>
          <p className="mx-auto mt-5 max-w-sm text-sm leading-relaxed text-mist">
            This is a local preview. When online rooms launch, sharing this code will let a friend
            take the blue seat. Until then, grab someone nearby:
          </p>
          <Link to="/game/local" className="mt-4 block">
            <GameButton variant="outline" className="w-full">
              Start a local 2-player match instead
            </GameButton>
          </Link>
        </Card>
      )}
    </PageShell>
  )
}
