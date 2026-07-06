import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../components/Card'
import { GameButton } from '../components/GameButton'
import { PageShell } from '../components/PageShell'
import { IconKey, IconWarning } from '../components/icons'
import { roomService } from '../online/roomService'
import { useSettingsStore } from '../store/settingsStore'

export function JoinRoomPage() {
  const savedName = useSettingsStore((s) => s.playerName)
  const [code, setCode] = useState('')
  const [name, setName] = useState(savedName)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const join = async () => {
    const trimmed = code.trim().toUpperCase()
    if (trimmed.length < 6) {
      setError('Enter the 6-character room code.')
      return
    }
    if (!name.trim()) {
      setError('Enter a player name.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await roomService.joinRoom(trimmed, name.trim())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join the room.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageShell title="Join room" backTo="/home">
      <Card className="mb-4 flex items-start gap-3 border-tide-500/30 bg-tide-700/20 p-4">
        <IconWarning className="mt-0.5 shrink-0 text-tide-300" />
        <div className="text-sm leading-relaxed">
          <p className="font-semibold text-tide-300">Online rooms are not connected yet.</p>
          <p className="mt-0.5 text-mist">Codes can’t be joined until the backend goes live.</p>
        </div>
      </Card>

      <Card className="p-5">
        <label className="block text-sm font-medium" htmlFor="room-code">
          Room code
        </label>
        <input
          id="room-code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase())
            setError('')
          }}
          maxLength={6}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="ABC123"
          className="heading-caps mt-1.5 w-full rounded-xl border border-white/10 bg-night-800 px-4 py-3 text-center text-2xl tracking-[0.35em] text-gold-200 placeholder:text-mist/40 focus:border-gold-400/60"
        />

        <label className="mt-5 block text-sm font-medium" htmlFor="join-name">
          Player name
        </label>
        <input
          id="join-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={24}
          placeholder="e.g. Bayani"
          className="mt-1.5 w-full rounded-xl border border-white/10 bg-night-800 px-4 py-3 text-parchment placeholder:text-mist/60 focus:border-gold-400/60"
        />

        {error && (
          <p className="mt-3 rounded-lg border border-ember-500/40 bg-ember-700/25 px-3 py-2 text-sm text-ember-300">
            {error}
          </p>
        )}

        <GameButton
          variant="primary"
          size="lg"
          className="mt-6 w-full"
          icon={<IconKey size={18} />}
          onClick={join}
          disabled={busy}
        >
          Join room
        </GameButton>

        <p className="mt-4 text-center text-sm text-mist">
          Want to play right now?{' '}
          <Link to="/game/local" className="font-semibold text-gold-300 hover:text-gold-200">
            Local 2-player
          </Link>{' '}
          works offline.
        </p>
      </Card>
    </PageShell>
  )
}
