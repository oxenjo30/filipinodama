import { ASSETS } from '../assets/assetManifest'
import { Card } from '../components/Card'
import { PageShell } from '../components/PageShell'
import { useSettingsStore, type AvatarChoice } from '../store/settingsStore'
import type { Side } from '../game'

const AVATARS: Array<{ key: AvatarChoice; src: string; label: string }> = [
  { key: 'default', src: ASSETS.avatarDefault.src, label: 'Wanderer' },
  { key: 'male', src: ASSETS.avatarMale.src, label: 'Datu' },
  { key: 'female', src: ASSETS.avatarFemale.src, label: 'Lakambini' },
  { key: 'mandirigma', src: ASSETS.avatarMandirigma.src, label: 'Mandirigma' },
  { key: 'babaylan', src: ASSETS.avatarBabaylan.src, label: 'Babaylan' },
  { key: 'bagani', src: ASSETS.avatarBagani.src, label: 'Bagani' },
  { key: 'diwata', src: ASSETS.avatarDiwata.src, label: 'Diwata' },
  { key: 'sultan', src: ASSETS.avatarSultan.src, label: 'Sultan' },
  { key: 'ermitanyo', src: ASSETS.avatarErmitanyo.src, label: 'Ermitanyo' },
]

export function ProfilePage() {
  const playerName = useSettingsStore((s) => s.playerName)
  const avatar = useSettingsStore((s) => s.avatar)
  const favoriteFaction = useSettingsStore((s) => s.favoriteFaction)
  const stats = useSettingsStore((s) => s.stats)
  const update = useSettingsStore((s) => s.update)

  const statRows: Array<[string, number]> = [
    ['Matches played', stats.matchesPlayed],
    ['Wins vs bot', stats.wins],
    ['Losses vs bot', stats.losses],
    ['Draws', stats.draws],
  ]

  return (
    <PageShell title="Profile" backTo="/home">
      <Card className="p-5">
        <label className="block text-sm font-medium" htmlFor="player-name">
          Player name
        </label>
        <input
          id="player-name"
          value={playerName}
          onChange={(e) => update({ playerName: e.target.value })}
          maxLength={24}
          placeholder="What shall we call you?"
          className="mt-1.5 w-full rounded-xl border border-white/10 bg-night-800 px-4 py-3 text-parchment placeholder:text-mist/60 focus:border-gold-400/60"
        />
        <p className="mt-1.5 text-xs text-mist">Shown on your player panel and saved on this device.</p>

        <fieldset className="mt-6">
          <legend className="text-sm font-medium">Avatar</legend>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {AVATARS.map((a) => (
              <button
                key={a.key}
                type="button"
                aria-pressed={avatar === a.key}
                onClick={() => update({ avatar: a.key })}
                className={`group flex flex-col items-center gap-1.5 rounded-xl p-2 transition-colors ${
                  avatar === a.key ? 'bg-gold-500/12' : 'hover:bg-white/5'
                }`}
              >
                <span
                  className={`block size-16 overflow-hidden rounded-full ring-2 transition-all ${
                    avatar === a.key ? 'ring-gold-300 shadow-glow-gold' : 'ring-white/15'
                  }`}
                >
                  <img src={a.src} alt={a.label} className="size-full object-cover" />
                </span>
                <span
                  className={`text-xs font-medium ${
                    avatar === a.key ? 'text-gold-300' : 'text-mist'
                  }`}
                >
                  {a.label}
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-6">
          <legend className="text-sm font-medium">Favorite faction</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(
              [
                ['red', 'Ember Legion', ASSETS.redMan.src, 'border-ember-500/60 bg-ember-700/25 text-ember-300'],
                ['blue', 'Tidal Order', ASSETS.blueMan.src, 'border-tide-500/60 bg-tide-700/25 text-tide-300'],
              ] as Array<[Side, string, string, string]>
            ).map(([side, label, src, activeCls]) => (
              <button
                key={side}
                type="button"
                aria-pressed={favoriteFaction === side}
                onClick={() => update({ favoriteFaction: side })}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
                  favoriteFaction === side
                    ? activeCls
                    : 'border-white/10 bg-white/[0.03] text-mist hover:text-parchment'
                }`}
              >
                <span className="block size-9 overflow-hidden rounded-full bg-night-900">
                  <img src={src} alt="" className="size-full object-cover" style={{ objectPosition: '50% 12%' }} />
                </span>
                {label}
              </button>
            ))}
          </div>
        </fieldset>
      </Card>

      <Card className="mt-4 p-5">
        <h2 className="heading-caps text-base text-gold-300">Record</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3">
          {statRows.map(([label, value]) => (
            <div key={label} className="rounded-xl bg-white/[0.03] px-4 py-3">
              <dt className="text-xs text-mist">{label}</dt>
              <dd className="tabular mt-0.5 text-2xl font-semibold text-parchment">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-mist">
          Only finished matches are recorded — wins and losses count games against the bot.
        </p>
      </Card>
    </PageShell>
  )
}
