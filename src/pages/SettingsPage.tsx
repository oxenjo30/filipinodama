import type { ReactNode } from 'react'
import { syncMusic } from '../audio/music'
import { sfx } from '../audio/sfx'
import { Card } from '../components/Card'
import { PageShell } from '../components/PageShell'
import {
  useSettingsStore,
  type AnimationSpeed,
  type BoardTheme,
  type Language,
  type PieceStyle,
} from '../store/settingsStore'

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <div className="min-w-0">
        <p className="text-[15px] font-medium">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-mist">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ${
        checked ? 'bg-gold-400' : 'bg-white/12'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 size-6 rounded-full bg-parchment shadow transition-transform duration-200 ${
          checked ? 'translate-x-5' : ''
        }`}
      />
    </button>
  )
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex shrink-0 rounded-xl border border-white/10 bg-night-800 p-1"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-9 rounded-lg px-3 text-sm font-medium transition-colors ${
            value === o.value ? 'bg-gold-500/20 text-gold-200' : 'text-mist hover:text-parchment'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function SettingsPage() {
  const s = useSettingsStore()

  return (
    <PageShell title="Settings" backTo="/home">
      <Card className="divide-y divide-white/5 px-5">
        <Row label="Sound effects" hint="Moves, captures, and crowning chimes.">
          <Toggle
            label="Sound effects"
            checked={s.sound}
            onChange={(v) => {
              s.update({ sound: v })
              if (v) sfx.move()
            }}
          />
        </Row>
        <Row label="Music" hint="“Balangay of Iron” — the FilipinoDama theme.">
          <Toggle
            label="Music"
            checked={s.music}
            onChange={(v) => {
              s.update({ music: v })
              syncMusic()
            }}
          />
        </Row>
        <Row label="Board theme">
          <Segmented<BoardTheme>
            label="Board theme"
            value={s.boardTheme}
            onChange={(v) => s.update({ boardTheme: v })}
            options={[
              { value: 'obsidian', label: 'Obsidian' },
              { value: 'classic', label: 'Classic' },
            ]}
          />
        </Row>
        <Row label="Piece style" hint="Portraits show the faction art; discs are plain tokens.">
          <Segmented<PieceStyle>
            label="Piece style"
            value={s.pieceStyle}
            onChange={(v) => s.update({ pieceStyle: v })}
            options={[
              { value: 'portrait', label: 'Portraits' },
              { value: 'minimal', label: 'Discs' },
            ]}
          />
        </Row>
        <Row label="Move hints" hint="Highlight legal landings and movable pieces.">
          <Toggle
            label="Move hints"
            checked={s.moveHints}
            onChange={(v) => s.update({ moveHints: v })}
          />
        </Row>
        <Row label="Animation speed">
          <Segmented<AnimationSpeed>
            label="Animation speed"
            value={s.animationSpeed}
            onChange={(v) => s.update({ animationSpeed: v })}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'normal', label: 'Normal' },
              { value: 'fast', label: 'Fast' },
            ]}
          />
        </Row>
        <Row label="Language" hint="Filipino translation is in the works.">
          <Segmented<Language>
            label="Language"
            value={s.language}
            onChange={(v) => s.update({ language: v })}
            options={[
              { value: 'en', label: 'English' },
              { value: 'fil', label: 'Filipino' },
            ]}
          />
        </Row>
      </Card>

      {s.language === 'fil' && (
        <p className="mt-3 px-1 text-sm text-mist">
          Salamat! The Filipino translation isn’t finished yet — the app stays in English for now,
          and your choice is saved for when it ships.
        </p>
      )}
    </PageShell>
  )
}
