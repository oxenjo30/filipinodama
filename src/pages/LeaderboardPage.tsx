import { ASSETS } from '../assets/assetManifest'
import { Card } from '../components/Card'
import { PageShell } from '../components/PageShell'
import { IconTrophy } from '../components/icons'

const FUTURE_COLUMNS = ['Rank', 'Player', 'Wins', 'Losses', 'Rating', 'Streak']

export function LeaderboardPage() {
  return (
    <PageShell title="Leaderboard" backTo="/home">
      <Card className="overflow-hidden">
        {/* future table header, shown as a preview of what ranked play tracks */}
        <div className="grid grid-cols-6 gap-2 border-b border-white/5 bg-white/[0.03] px-4 py-3">
          {FUTURE_COLUMNS.map((c) => (
            <span key={c} className="text-xs font-semibold tracking-wide text-mist uppercase">
              {c}
            </span>
          ))}
        </div>

        <div className="flex flex-col items-center px-6 py-14 text-center">
          <div className="relative">
            <img src={ASSETS.podium1.src} alt="" className="w-28 opacity-60" />
            <IconTrophy
              size={28}
              className="absolute top-2 left-1/2 -translate-x-1/2 text-gold-400/80"
            />
          </div>
          <h2 className="heading-caps mt-6 text-lg text-parchment">No ranked matches yet</h2>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-mist">
            Ranked play and ratings launch together with online rooms. Your victories against the
            bot are already counted on your profile.
          </p>
        </div>
      </Card>
    </PageShell>
  )
}
