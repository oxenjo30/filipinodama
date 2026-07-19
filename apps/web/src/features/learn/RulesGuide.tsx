import { Link } from "react-router-dom";

/**
 * RulesGuide — the public, crawlable "Dama Rules" long-form guide rendered at the
 * bottom of /learn (below the approved three-column Learn layout, which is left
 * untouched). This is the SEO pillar page for the "dama rules" keyword cluster:
 * logged-out visitors and crawlers get the complete rules in semantic HTML; the
 * interactive lessons above remain the logged-in experience.
 *
 * ACCURACY: every rule stated here was verified against the game engine
 * (packages/game-engine/src/engine.ts) and DEFAULT_SETTINGS — men move forward
 * only but capture forward AND backward; captures are mandatory; the
 * maximum-capture rule is on by default (forcedMaxCapture); kings are "flying"
 * but cannot pass over pieces; promotion mid-chain continues the capture as a
 * king; 40-move king-inactivity draw limit. Do not edit the rules text without
 * re-checking the engine.
 *
 * RULES_FAQ and HOWTO_STEPS are exported for the FAQPage / HowTo JSON-LD emitted
 * by LearnPage's <SiteHead>.
 */

export const RULES_FAQ: { q: string; a: string }[] = [
  {
    q: "Can you move backwards in dama?",
    a: "Ordinary pieces (men) can only MOVE diagonally forward, but they CAN capture backwards. Jumping an enemy piece is allowed both forward and backward for every piece from the very start of the game. Only the dama (king) can freely move backwards without capturing.",
  },
  {
    q: "Is capturing mandatory in Filipino Dama?",
    a: "Yes. If any of your pieces can capture, you must capture — skipping a capture to play a quiet move is not allowed. When more than one capture is available, the standard rule (used on FilipinoDama Royal) requires taking the line that captures the most pieces.",
  },
  {
    q: "How many pieces does each player have in dama?",
    a: "Each player starts with 12 pieces, placed on the dark squares of the three rows nearest them on an 8×8 board — the same setup as most checkers variants.",
  },
  {
    q: "How does a piece become a dama (king)?",
    a: "A piece is crowned the moment it lands on the far back rank — the row where the opponent's pieces started. If a piece reaches the back rank in the middle of a capture chain, it is crowned immediately and may continue capturing as a dama in the same turn.",
  },
  {
    q: "How does the dama (king) move?",
    a: "The dama is a 'flying king': it slides any number of empty squares along a diagonal, forwards or backwards. When capturing, it jumps an enemy piece from any distance along the diagonal and may land on any empty square beyond it — but it can never pass over two pieces in a row or over its own pieces.",
  },
  {
    q: "Can a regular piece capture a dama (king)?",
    a: "Yes. Any piece can capture any enemy piece — an ordinary man may jump and remove an enemy dama. There is no rank restriction on captures.",
  },
  {
    q: "How do you win a game of dama?",
    a: "You win by capturing all of your opponent's pieces, or by leaving your opponent with no legal move on their turn. Games can also end in a draw — for example, when neither side makes progress within the inactivity limit (40 moves without a capture or a man advancing).",
  },
  {
    q: "Is Filipino Dama the same as checkers?",
    a: "Filipino Dama is the Philippine variant of checkers (draughts). It is played on the same 8×8 board with 12 pieces, but differs from American checkers in three big ways: men can capture backwards, capturing the maximum number of pieces is required, and the crowned dama is a long-range 'flying' king.",
  },
];

export const HOWTO_STEPS: { name: string; text: string }[] = [
  { name: "Set up the board", text: "Use an 8×8 board. Each player places 12 pieces on the dark squares of the three rows closest to them. The two middle rows start empty." },
  { name: "Move diagonally forward", text: "Players alternate turns. On your turn, slide one of your men one square diagonally forward onto an empty dark square." },
  { name: "Capture by jumping", text: "If a diagonally adjacent square holds an enemy piece and the square directly beyond it is empty, you must jump over it and remove it. Men may capture forward and backward. Chains of jumps in one turn are allowed and required when available." },
  { name: "Take the maximum capture", text: "When several capture lines exist, you must play the one that removes the most enemy pieces — this is the maximum-capture rule." },
  { name: "Crown your dama", text: "A man that reaches the far back rank is crowned a dama (king). The dama slides any distance diagonally in both directions and captures from range." },
  { name: "Win the game", text: "Capture all enemy pieces, or leave your opponent with no legal move. If neither side makes progress for 40 moves, the game is drawn." },
];

/**
 * GameFigure — section illustration, same pattern as TraditionalGamesPage /
 * the /tl pages: AI-generated painterly golden-hour art served as 1200×670
 * WebP (~100KB) from /assets/culture/. Explicit width/height prevent layout
 * shift; lazy loading keeps it off the critical path.
 */
function GameFigure({ src, alt }: { src: string; alt: string }) {
  return (
    <img
      src={`/assets/culture/${src}`}
      alt={alt}
      width={1200}
      height={670}
      loading="lazy"
      decoding="async"
      style={{
        width: "100%",
        height: "auto",
        borderRadius: 10,
        margin: "4px 0 14px",
        border: "1px solid rgba(232,184,75,.22)",
        boxShadow: "0 10px 28px rgba(0,0,0,.35)",
      }}
    />
  );
}

const H2: React.CSSProperties = {
  font: "800 22px Cinzel,serif",
  color: "var(--gold-lt)",
  margin: "34px 0 10px",
};
const H3: React.CSSProperties = {
  font: "700 15px Inter",
  color: "var(--gold-lt)",
  margin: "18px 0 6px",
};
const P: React.CSSProperties = {
  font: "400 14px/1.75 Inter",
  color: "var(--ink)",
  margin: "0 0 12px",
};
const LI: React.CSSProperties = { font: "400 14px/1.75 Inter", color: "var(--ink)", marginBottom: 6 };
const TH: React.CSSProperties = {
  font: "700 12px Inter",
  color: "var(--gold-lt)",
  textAlign: "left",
  padding: "8px 12px",
  border: "1px solid rgba(232,184,75,.25)",
};
const TD: React.CSSProperties = {
  font: "400 13px/1.6 Inter",
  color: "var(--ink)",
  padding: "8px 12px",
  border: "1px solid rgba(232,184,75,.18)",
  verticalAlign: "top",
};

export function RulesGuide() {
  return (
    <section
      className="frame fd-card-m"
      style={{ gridColumn: "1 / -1", padding: "34px 34px 40px", marginTop: 4 }}
      aria-labelledby="dama-rules-guide"
    >
      <article>
        <header>
          <div style={{ font: "700 11px Inter", letterSpacing: "3px", textTransform: "uppercase", color: "var(--gold)", marginBottom: 8 }}>
            Complete Reference
          </div>
          <h2 id="dama-rules-guide" style={{ ...H2, margin: "0 0 10px", fontSize: 26 }}>
            Dama Rules — How to Play Filipino Checkers
          </h2>
          <p style={{ ...P, font: "400 15px/1.8 Inter" }}>
            <strong>Filipino Dama</strong> (also called <em>dama</em> or Filipino checkers) is the
            Philippine variant of draughts, played on an 8×8 board where each side starts with 12
            pieces. Three rules define it: capturing is <strong>mandatory</strong>, you must take
            the line that captures the <strong>most</strong> pieces, and a crowned piece — the{" "}
            <em>dama</em> — becomes a long-range “flying king” that slides any distance along a
            diagonal. This guide covers everything you need to play, exactly as the game is played
            on FilipinoDama Royal.
          </p>
          <p style={{ ...P, font: "600 13px Inter" }}>
            <Link to="/tl/learn" style={{ color: "var(--gold)" }} hrefLang="tl-PH">
              Basahin ang gabay na ito sa Tagalog →
            </Link>
          </p>
        </header>

        <h2 style={H2}>The Board and Starting Setup</h2>
        <GameFigure
          src="dama-plaza.webp"
          alt="Illustration of two Filipino players at a dama board with red and blue bottle-cap pieces on a hand-drawn grid, at a town plaza at sunset"
        />
        <p style={P}>
          Dama is played on the 32 dark squares of a standard 8×8 checkerboard. Each player begins
          with <strong>12 men</strong> arranged on the dark squares of the three rows nearest them;
          the two middle rows start empty. The player with the lighter pieces conventionally moves
          first, and turns alternate — one move per turn.
        </p>

        <h2 style={H2}>How Men Move</h2>
        <p style={P}>
          An ordinary piece (a <em>man</em>) moves <strong>one square diagonally forward</strong>{" "}
          onto an empty dark square. Men never move backwards — but, crucially, they{" "}
          <strong>can capture backwards</strong>. That backward-capture rule is one of the things
          that separates Filipino Dama from American checkers, and it matters from the very first
          exchanges: a piece that looks safe behind your line can still be taken.
        </p>

        <h2 style={H2}>Capturing — Mandatory, and Maximum</h2>
        <p style={P}>
          If one of your pieces can jump an adjacent enemy piece into an empty square directly
          beyond it, you <strong>must</strong> capture — quiet moves are illegal while a capture
          exists. Jumped pieces are removed from the board at the end of the capturing move.
        </p>
        <ul style={{ paddingLeft: 22, margin: "0 0 12px" }}>
          <li style={LI}>
            <strong>Chain captures:</strong> if the jumping piece lands where another capture is
            available, it must continue jumping in the same turn — a single piece can sweep several
            enemies in one move.
          </li>
          <li style={LI}>
            <strong>Maximum-capture rule:</strong> when different capture lines are available, you
            must choose one that removes the <strong>most</strong> enemy pieces. If two lines tie,
            you may pick either.
          </li>
          <li style={LI}>
            <strong>Men capture both ways:</strong> forward and backward jumps are both legal for
            men at all times.
          </li>
          <li style={LI}>
            <strong>No re-jumping:</strong> a piece already jumped in the chain cannot be jumped
            again, and pieces are not lifted until the chain finishes — so they still block squares
            mid-chain.
          </li>
        </ul>

        <h2 style={H2}>The Dama (King)</h2>
        <p style={P}>
          A man that reaches the opponent’s back rank is crowned a <strong>dama</strong> — the piece
          the game is named after. If the crowning square is reached in the middle of a capture
          chain, the piece is crowned <em>immediately</em> and continues capturing as a dama in the
          same turn.
        </p>
        <p style={P}>
          The dama is a <strong>flying king</strong>: it slides any number of empty squares
          diagonally, forwards or backwards. To capture, it jumps an enemy piece anywhere along its
          diagonal — from any distance — and may land on <em>any</em> empty square beyond the
          captured piece, choosing the landing square that sets up the next jump. It cannot leap
          over its own pieces or over two enemy pieces standing on the same diagonal.
        </p>

        <h2 style={H2}>Winning and Draws</h2>
        <p style={P}>
          You <strong>win</strong> by capturing every enemy piece, or by leaving your opponent with
          no legal move on their turn. A game is <strong>drawn</strong> when neither side can make
          progress — on FilipinoDama Royal, when 40 consecutive moves pass without a capture or a
          man advancing, the game ends in a draw.
        </p>

        <h2 style={H2}>Filipino Dama vs Other Checkers Variants</h2>
        <div style={{ overflowX: "auto", margin: "0 0 12px" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560 }}>
            <thead>
              <tr>
                <th style={TH}>Rule</th>
                <th style={TH}>Filipino Dama</th>
                <th style={TH}>American Checkers</th>
                <th style={TH}>International Draughts</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={TD}>Board / pieces</td>
                <td style={TD}>8×8, 12 each</td>
                <td style={TD}>8×8, 12 each</td>
                <td style={TD}>10×10, 20 each</td>
              </tr>
              <tr>
                <td style={TD}>Men capture backwards</td>
                <td style={TD}>Yes</td>
                <td style={TD}>No</td>
                <td style={TD}>Yes</td>
              </tr>
              <tr>
                <td style={TD}>Capture priority</td>
                <td style={TD}>Maximum pieces required</td>
                <td style={TD}>Any capture allowed</td>
                <td style={TD}>Maximum pieces required</td>
              </tr>
              <tr>
                <td style={TD}>King movement</td>
                <td style={TD}>Flying (any distance)</td>
                <td style={TD}>One square</td>
                <td style={TD}>Flying (any distance)</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p style={P}>
          In short: Filipino Dama plays like international draughts compressed onto the smaller 8×8
          board — faster games, denser tactics, and far more forced sequences than American
          checkers.
        </p>

        <h2 style={H2}>Frequently Asked Questions</h2>
        {RULES_FAQ.map((f) => (
          <div key={f.q}>
            <h3 style={H3}>{f.q}</h3>
            <p style={P}>{f.a}</p>
          </div>
        ))}

        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            marginTop: 26,
            paddingTop: 20,
            borderTop: "1px solid rgba(232,184,75,.2)",
          }}
        >
          <Link to="/play" className="btn btn-gold" style={{ textDecoration: "none", padding: "12px 22px" }}>
            ♟ Play Filipino Dama Online
          </Link>
          <Link to="/blog" className="btn btn-purple" style={{ textDecoration: "none", padding: "12px 22px" }}>
            More Rules &amp; Strategy Guides
          </Link>
        </div>
      </article>
    </section>
  );
}
