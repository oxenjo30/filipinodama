import { Link } from "react-router-dom";
import { SiteHead, faqJsonLd, canonical, SITE } from "../../lib/seo";
import { publishedArticles } from "../blog/blog";

/**
 * StrategyPage (/strategy) — the public "Filipino Dama Strategy" pillar page,
 * Phase 2 of the SEO strategy. Fully static (no auth, no API): every visitor and
 * crawler sees the same complete guide, prerendered at build time.
 *
 * The advice is grounded in the rules THIS game enforces (engine-verified in the
 * /learn guide): captures are mandatory and maximum-capture is forced — which is
 * why forcing sacrifices are the core tactical theme — men capture backward, and
 * the crowned dama is a flying king. Keep any strategy claims consistent with
 * those rules.
 *
 * The "From the strategy shelf" strip lists LIVE Strategy-category blog articles
 * via publishedArticles() (drip-aware): the prerendered HTML carries the set live
 * at build time, and the client recomputes on render — same pattern as /blog.
 */

export const STRATEGY_FAQ: { q: string; a: string }[] = [
  {
    q: "What is the best strategy to win at dama?",
    a: "Control the center, keep your pieces connected in phalanx formations, and use the mandatory-capture rule to force trades on your terms. Because your opponent MUST capture when able, you can sacrifice one piece to pull their pieces onto squares where you capture two or three back. Count every exchange before you offer it.",
  },
  {
    q: "Why would you sacrifice a piece in dama?",
    a: "Because captures are forced, a sacrifice is the most forcing move in the game: your opponent has no choice but to take. Strong players give up one piece to open a multi-capture chain, win material back with interest, or clear a path to crown a dama.",
  },
  {
    q: "Is it better to attack or defend in dama?",
    a: "Balanced play wins. Early on, develop toward the center and avoid loose, unsupported pieces. But passive play loses too — if you only defend, your opponent dictates every exchange. The ideal is active safety: advance in supported pairs and threaten captures your opponent must respect.",
  },
  {
    q: "Should you keep pieces on the back row in dama?",
    a: "Keep your back rank intact early. Your opponent cannot crown a dama while your back-row squares are defended, and back-rank men anchor your defensive structure. Advance them late, once crowning races decide the endgame.",
  },
  {
    q: "How do you win a dama endgame with kings?",
    a: "With flying damas, material advantage converts by restricting the enemy king's diagonals. Two damas versus one win by taking the long diagonal, cutting escape squares, and forcing the defender into a capture or a corner. With men, count tempo: the player who crowns first usually controls the race.",
  },
  {
    q: "What is the biggest beginner mistake in dama?",
    a: "Moving pieces one at a time without support, and taking every offered capture without asking why it was offered. In a game with forced maximum capture, a 'free' piece is very often the entry fee to a losing chain — always look at what your capture exposes.",
  },
];

/**
 * GameFigure — section illustration, same pattern as TraditionalGamesPage /
 * the /tl pages: AI-generated painterly golden-hour art (this one: Meshy
 * nano-banana-2) served as 1200×670 WebP (~100KB) from /assets/culture/.
 * Explicit width/height prevent layout shift; lazy loading keeps it off the
 * critical path.
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

const H2: React.CSSProperties = { font: "800 22px Cinzel,serif", color: "var(--gold-lt)", margin: "34px 0 10px" };
const H3: React.CSSProperties = { font: "700 15px Inter", color: "var(--gold-lt)", margin: "18px 0 6px" };
const P: React.CSSProperties = { font: "400 14px/1.75 Inter", color: "var(--ink)", margin: "0 0 12px" };
const LI: React.CSSProperties = { font: "400 14px/1.75 Inter", color: "var(--ink)", marginBottom: 6 };

export function StrategyPage() {
  const strategyArticles = publishedArticles().filter((a) => a.category === "Strategy").slice(0, 6);

  return (
    <div className="fd-page-pad" style={{ maxWidth: 980, margin: "0 auto", padding: "26px 26px 60px" }}>
      <SiteHead
        title="Filipino Dama Strategy — How to Win at Dama (Complete Guide)"
        description="Winning Filipino Dama strategy: opening principles, forcing sacrifices under the mandatory-capture rule, tempo and exchanges, flying-dama endgames, and the traps every beginner falls for."
        path="/strategy"
        alternates={[
          { hrefLang: "en-PH", path: "/strategy" },
          { hrefLang: "tl-PH", path: "/tl/strategy" },
          { hrefLang: "x-default", path: "/strategy" },
        ]}
        jsonLd={[
          faqJsonLd(STRATEGY_FAQ),
          {
            "@context": "https://schema.org",
            "@type": "Article",
            headline: "Filipino Dama Strategy — How to Win at Dama",
            description:
              "Opening principles, forcing sacrifices, tempo, and flying-dama endgames for Filipino Dama (Filipino checkers).",
            image: SITE.ogImage,
            datePublished: "2026-07-19T00:00:00Z",
            dateModified: "2026-07-19T00:00:00Z",
            author: { "@type": "Organization", name: SITE.brand },
            publisher: {
              "@type": "Organization",
              name: SITE.name,
              logo: { "@type": "ImageObject", url: SITE.logo },
            },
            mainEntityOfPage: canonical("/strategy"),
            url: canonical("/strategy"),
          },
        ]}
      />

      <article className="frame fd-card-m" style={{ padding: "34px 34px 40px" }}>
        <header>
          <div style={{ font: "700 11px Inter", letterSpacing: "3px", textTransform: "uppercase", color: "var(--gold)", marginBottom: 8 }}>
            Strategy Guide
          </div>
          <h1 style={{ font: "800 28px Cinzel,serif", color: "var(--gold-lt)", margin: "0 0 12px" }}>
            Filipino Dama Strategy — How to Win at Dama
          </h1>
          <p style={{ ...P, font: "400 15px/1.8 Inter" }}>
            Winning at <strong>Filipino Dama</strong> comes down to three skills: controlling the
            center with connected pieces, <strong>using the forced-capture rule as a weapon</strong>{" "}
            — sacrificing one piece to win two or three back — and converting endgames with the
            flying dama. This guide covers each skill in the order you should learn them, and it
            assumes the standard rules used on FilipinoDama Royal: captures are mandatory, the
            maximum-capture line is required, and men capture both forward and backward.
          </p>
          <p style={{ ...P, font: "600 13px Inter" }}>
            <Link to="/tl/strategy" style={{ color: "var(--gold)" }} hrefLang="tl-PH">
              Basahin ang gabay na ito sa Tagalog →
            </Link>
          </p>
        </header>

        <GameFigure
          src="dama-strategy.webp"
          alt="Illustration of a young Filipino player deep in thought, lifting a red bottle-cap piece for a multi-capture on a dama board while an older onlooker watches at dusk"
        />

        <h2 style={H2}>Opening Principles</h2>
        <ul style={{ paddingLeft: 22, margin: "0 0 12px" }}>
          <li style={LI}>
            <strong>Fight for the center.</strong> Central squares touch the most diagonals — a
            centered piece attacks and defends more than an edge piece ever can. Edge pieces
            capture in only one direction and are the easiest to trap.
          </li>
          <li style={LI}>
            <strong>Advance in supported pairs.</strong> A piece with a defender behind it cannot
            be captured for free. The classic phalanx — two or three men diagonally connected —
            advances as a wall your opponent cannot break without losing the exchange.
          </li>
          <li style={LI}>
            <strong>Keep the back rank home early.</strong> While your back-row men sit on their
            starting squares, your opponent cannot crown. Move them last.
          </li>
          <li style={LI}>
            <strong>Don't rush captures you don't have to create.</strong> Every advance changes
            which captures are forced. Before each move ask: what capture does this enable — for
            both sides?
          </li>
        </ul>

        <h2 style={H2}>The Forcing Game: Sacrifices Under Mandatory Capture</h2>
        <p style={P}>
          The mandatory-capture rule is the engine of every dama combination. Your opponent{" "}
          <em>must</em> take what you offer — which means a well-placed sacrifice is not a gamble,
          it is a <strong>forcing sequence you calculate to the end</strong>.
        </p>
        <h3 style={H3}>The two-for-one shot</h3>
        <p style={P}>
          The most common winning pattern: push a man where it can be captured, and the forced
          recapture pulls the enemy piece onto a square where your waiting piece captures two in a
          chain. You spent one, you took two. Whole games are decided by nothing more than
          spotting these one move earlier than the opponent.
        </p>
        <h3 style={H3}>Chain-building with maximum capture</h3>
        <p style={P}>
          Because the <em>longest</em> capture line is compulsory, you can steer an enemy piece
          through a specific path — each capture in the chain is chosen for them. Advanced players
          set up positions where the forced maximum chain drags the capturer deep into a trap,
          then win it back with interest or crown behind it.
        </p>
        <h3 style={H3}>Reading your opponent's "gifts"</h3>
        <p style={P}>
          The rule cuts both ways: every piece offered to you must be examined as a potential
          poison. Before celebrating a free capture, look at the square your piece lands on and
          count the enemy captures that follow from it. If you cannot see why the piece was free,
          assume it was not.
        </p>

        <h2 style={H2}>Tempo and the Exchange</h2>
        <ul style={{ paddingLeft: 22, margin: "0 0 12px" }}>
          <li style={LI}>
            <strong>Trade when ahead, complicate when behind.</strong> Equal trades favor the side
            with more pieces — each exchange makes the material edge proportionally larger.
          </li>
          <li style={LI}>
            <strong>Count tempo in crowning races.</strong> The number of moves each unblocked man
            needs to reach the far rank decides most middlegames. A piece advantage means nothing
            if your opponent crowns two moves sooner.
          </li>
          <li style={LI}>
            <strong>Backward captures punish overextension.</strong> Men capture backward, so a
            piece that slips "safely" past your line can still be taken. Use this to bait
            overextended advances — and to keep your own advances honest.
          </li>
        </ul>

        <h2 style={H2}>Endgame: The Flying Dama</h2>
        <p style={P}>
          Crowning transforms the game. A dama slides any distance along open diagonals and
          captures from range, so one dama can dominate several men. Three endgame rules:
        </p>
        <ul style={{ paddingLeft: 22, margin: "0 0 12px" }}>
          <li style={LI}>
            <strong>Crown first, ask questions later.</strong> In most level endgames, the first
            dama wins — it raids the board faster than men can defend.
          </li>
          <li style={LI}>
            <strong>Own the long diagonal.</strong> A dama on the main diagonal sees everything.
            Against a lone enemy dama, controlling the long diagonal and both double corners
            squeezes it out of safe squares.
          </li>
          <li style={LI}>
            <strong>Blockers beat range.</strong> A dama cannot jump over two adjacent pieces or
            its own men. Paired defenders on one diagonal wall out a raiding dama — position them
            before the dama arrives, not after.
          </li>
        </ul>

        <h2 style={H2}>Five Traps Every Beginner Falls For</h2>
        <ol style={{ paddingLeft: 22, margin: "0 0 12px" }}>
          <li style={LI}>Taking every offered piece without counting the follow-up chain.</li>
          <li style={LI}>Advancing a lone man ahead of its support — backward captures eat it.</li>
          <li style={LI}>Emptying the back rank early and losing the crowning race.</li>
          <li style={LI}>Trading pieces while behind in material.</li>
          <li style={LI}>Letting one enemy dama roam while your men sit unpaired on open diagonals.</li>
        </ol>

        <h2 style={H2}>How to Actually Improve</h2>
        <p style={P}>
          Strategy reading builds vocabulary; games build skill. The fastest loop: play a match,
          then replay your captures and ask which were forced on you and which you chose. Start
          with the <Link to="/play" style={{ color: "var(--gold)" }}>AI opponent</Link> on an easier
          level, practice one pattern per session (two-for-one shots first), and work through the{" "}
          <Link to="/learn" style={{ color: "var(--gold)" }}>interactive lessons</Link> for the rules
          details that strategy depends on.
        </p>

        <h2 style={H2}>Strategy FAQ</h2>
        {STRATEGY_FAQ.map((f) => (
          <div key={f.q}>
            <h3 style={H3}>{f.q}</h3>
            <p style={P}>{f.a}</p>
          </div>
        ))}

        {strategyArticles.length > 0 && (
          <>
            <h2 style={H2}>From the Strategy Shelf</h2>
            <ul style={{ paddingLeft: 22, margin: "0 0 12px" }}>
              {strategyArticles.map((a) => (
                <li key={a.slug} style={LI}>
                  <Link to={`/blog/${a.slug}`} style={{ color: "var(--gold)" }}>
                    {a.title}
                  </Link>{" "}
                  — {a.description}
                </li>
              ))}
            </ul>
          </>
        )}

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 26, paddingTop: 20, borderTop: "1px solid rgba(232,184,75,.2)" }}>
          <Link to="/play" className="btn btn-gold" style={{ textDecoration: "none", padding: "12px 22px" }}>
            ♟ Put It Into Practice
          </Link>
          <Link to="/learn" className="btn btn-purple" style={{ textDecoration: "none", padding: "12px 22px" }}>
            Rules Reference
          </Link>
        </div>
      </article>
    </div>
  );
}

export default StrategyPage;
