import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../components/Card'
import { GameButton } from '../components/GameButton'
import { MiniBoard } from '../components/MiniBoard'
import { PageShell } from '../components/PageShell'
import { IconPlay } from '../components/icons'

function Section({
  title,
  children,
  diagram,
}: {
  title: string
  children: ReactNode
  diagram?: ReactNode
}) {
  return (
    <Card className="p-5">
      <h2 className="heading-caps text-base text-gold-300">{title}</h2>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="max-w-[65ch] flex-1 space-y-3 text-[15px] leading-relaxed text-parchment/90">
          {children}
        </div>
        {diagram}
      </div>
    </Card>
  )
}

export function RulesPage() {
  return (
    <PageShell title="How to play" backTo="/home">
      <div className="space-y-4">
        <Section title="Objective">
          <p>
            Capture every enemy piece — or trap your opponent so they have no legal move. Either
            way, the board is yours.
          </p>
        </Section>

        <Section title="Board & setup">
          <p>
            Dama is played on the dark diagonal squares of an 8&nbsp;×&nbsp;8 board. Each side
            starts with 12 pieces on the three rows closest to them. Red moves first, and the two
            armies advance toward each other.
          </p>
        </Section>

        <Section
          title="Moving"
          diagram={
            <MiniBoard
              pieces={[{ row: 3, col: 2, side: 'red' }]}
              dots={[
                [2, 1],
                [2, 3],
              ]}
              caption="A man steps one square diagonally forward."
            />
          }
        >
          <p>
            A normal piece (a <em>man</em>) moves one square diagonally forward onto an empty
            square. Men never step backward — though they may <strong>capture</strong> backward.
          </p>
        </Section>

        <Section
          title="Capturing"
          diagram={
            <MiniBoard
              pieces={[
                { row: 3, col: 0, side: 'red' },
                { row: 2, col: 1, side: 'blue' },
              ]}
              dots={[[1, 2]]}
              marks={[[2, 1]]}
              caption="Jump the enemy; land on the empty square beyond."
            />
          }
        >
          <p>
            To capture, jump over an adjacent enemy piece onto the empty square directly beyond
            it — forward or backward. The jumped piece is removed when your turn ends.
          </p>
        </Section>

        <Section title="Capturing is mandatory">
          <p>
            If any capture is available anywhere on the board, you <strong>must</strong> capture.
            Quiet moves are illegal until no captures remain. The app enforces this for you and
            shows a <span className="font-semibold text-ember-300">Capture required</span> banner.
          </p>
        </Section>

        <Section title="Multiple captures">
          <p>
            If your piece lands where another jump is possible, the chain continues — you keep
            jumping with the same piece until no further capture exists. Pieces already jumped
            stay on the board until the chain ends and can never be jumped twice.
          </p>
        </Section>

        <Section title="The maximum-capture rule">
          <p>
            When several capture routes exist, only the routes that capture the{' '}
            <strong>most pieces</strong> are legal. A two-piece chain beats any single jump. If two
            routes tie for the maximum, you choose freely between them.
          </p>
        </Section>

        <Section title="Crowning a dama">
          <p>
            A man that <strong>ends its turn</strong> on the far row is crowned a{' '}
            <em>dama</em> (king). Merely passing through the far row mid-chain does not crown the
            piece — it must finish there.
          </p>
        </Section>

        <Section
          title="How a dama moves"
          diagram={
            <MiniBoard
              pieces={[{ row: 3, col: 0, side: 'red', kind: 'king' }]}
              dots={[
                [2, 1],
                [1, 2],
                [0, 3],
              ]}
              caption="A dama flies any distance along open diagonals."
            />
          }
        >
          <p>
            The dama flies: it slides any number of empty squares along a diagonal, forward or
            backward. It captures at range too — jumping a single enemy piece anywhere along the
            diagonal and landing on any empty square beyond it. Chains and the maximum-capture rule
            apply to damas as well.
          </p>
        </Section>

        <Section title="Winning">
          <p>You win when your opponent has no pieces left, or no legal move on their turn.</p>
          <p className="text-sm text-mist">
            Draws by agreement and repetition rules arrive together with online play.
          </p>
        </Section>

        <div className="flex justify-center pt-2">
          <Link to="/game/bot">
            <GameButton variant="primary" size="lg" icon={<IconPlay size={18} />}>
              Practice against the bot
            </GameButton>
          </Link>
        </div>
      </div>
    </PageShell>
  )
}
