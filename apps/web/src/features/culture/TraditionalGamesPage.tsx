import { Link } from "react-router-dom";
import { SiteHead, faqJsonLd, canonical, SITE } from "../../lib/seo";

/**
 * TraditionalGamesPage (/traditional-filipino-games) — the cultural pillar page
 * for the "traditional filipino games" / "larong pinoy" keyword cluster. Fully
 * static and public (no auth, no API), prerendered at build time.
 *
 * EDITORIAL RULES: cultural claims are kept general and verifiable (no invented
 * statistics, dates, or rankings). Dama is the featured game (it's the one you
 * can play here); the other games are covered honestly as a genuine guide, not
 * filler. Damath appears as cultural history only — do NOT expand the Damath
 * feature itself (owner directive: web-only, leave as-is).
 */

export const CULTURE_FAQ: { q: string; a: string }[] = [
  {
    q: "What are traditional Filipino games?",
    a: "Traditional Filipino games — larong Pinoy — are the street, schoolyard, and household games passed down through generations in the Philippines: board games like dama and sungka, and physical games like patintero, tumbang preso, luksong tinik, and piko. Many need nothing more than chalk, a slipper, or a handful of shells.",
  },
  {
    q: "Is dama a Filipino game?",
    a: "Dama is the Filipino form of checkers (draughts). The game arrived with Spanish colonization — 'dama' is the Spanish name of the crowned piece — and Filipinos kept its strict Spanish rules, mandatory maximum captures and the long-range flying dama, while making the game their own as a plaza, sari-sari store, and barbershop fixture for generations.",
  },
  {
    q: "What is larong Pinoy?",
    a: "Larong Pinoy simply means 'Filipino games' — the umbrella term for the Philippines' traditional pastimes. Schools teach them in PE and MAPEH classes to keep the heritage alive, and communities still stage larong Pinoy events during fiestas.",
  },
  {
    q: "Are traditional Filipino games still played today?",
    a: "Yes — in schools (they are part of the PE/MAPEH curriculum), at fiestas and barangay events, and increasingly online. Dama in particular has moved to digital boards, where Filipinos play ranked matches against each other from anywhere in the world.",
  },
  {
    q: "Which traditional Filipino games can you play online?",
    a: "Dama is the most playable traditional Filipino game online today — you can play it free in a browser, against the computer or against real players. Sungka apps also exist, while physical games like patintero and tumbang preso live on in schoolyards rather than screens.",
  },
];

const H2: React.CSSProperties = { font: "800 22px Cinzel,serif", color: "var(--gold-lt)", margin: "34px 0 10px" };
const H3: React.CSSProperties = { font: "700 15px Inter", color: "var(--gold-lt)", margin: "18px 0 6px" };
const P: React.CSSProperties = { font: "400 14px/1.75 Inter", color: "var(--ink)", margin: "0 0 12px" };
const LI: React.CSSProperties = { font: "400 14px/1.75 Inter", color: "var(--ink)", marginBottom: 6 };

export function TraditionalGamesPage() {
  return (
    <div className="fd-page-pad" style={{ maxWidth: 980, margin: "0 auto", padding: "26px 26px 60px" }}>
      <SiteHead
        title="Traditional Filipino Games — Larong Pinoy Guide (Dama, Sungka & More)"
        description="A guide to traditional Filipino games (larong Pinoy): dama, sungka, patintero, tumbang preso and more — their rules, history, and where to play them today."
        path="/traditional-filipino-games"
        jsonLd={[
          faqJsonLd(CULTURE_FAQ),
          {
            "@context": "https://schema.org",
            "@type": "Article",
            headline: "Traditional Filipino Games — A Guide to Larong Pinoy",
            description:
              "Dama, sungka, patintero, tumbang preso, luksong tinik, piko and more — the games Filipinos grew up on, and where they live today.",
            image: SITE.ogImage,
            datePublished: "2026-07-19T00:00:00Z",
            dateModified: "2026-07-19T00:00:00Z",
            author: { "@type": "Organization", name: SITE.brand },
            publisher: { "@type": "Organization", name: SITE.name, logo: { "@type": "ImageObject", url: SITE.logo } },
            mainEntityOfPage: canonical("/traditional-filipino-games"),
            url: canonical("/traditional-filipino-games"),
          },
        ]}
      />

      <article className="frame fd-card-m" style={{ padding: "34px 34px 40px" }}>
        <header>
          <div style={{ font: "700 11px Inter", letterSpacing: "3px", textTransform: "uppercase", color: "var(--gold)", marginBottom: 8 }}>
            Larong Pinoy
          </div>
          <h1 style={{ font: "800 28px Cinzel,serif", color: "var(--gold-lt)", margin: "0 0 12px" }}>
            Traditional Filipino Games — A Guide to Larong Pinoy
          </h1>
          <p style={{ ...P, font: "400 15px/1.8 Inter" }}>
            <strong>Traditional Filipino games</strong> — <em>larong Pinoy</em> — are the games
            generations of Filipinos grew up on: board battles like <strong>dama</strong> and{" "}
            <strong>sungka</strong> played on benches and doorsteps, and street games like{" "}
            <strong>patintero</strong> and <strong>tumbang preso</strong> that turned any barangay
            road into a playing field. This guide covers the classics — how each is played, where
            they came from, and which ones you can still play today (one of them, right here,
            online).
          </p>
        </header>

        <h2 style={H2}>Dama — the Board Game of the Plaza</h2>
        <p style={P}>
          Walk past a sari-sari store, a barbershop, or a town plaza and you may still find two
          players hunched over a checkered board — often a hand-drawn grid with bottle caps for
          pieces. <strong>Dama</strong> is the Filipino form of draughts, inherited from the
          Spanish game of <em>damas</em> during the colonial era. It keeps the demanding Spanish
          ruleset — captures are <strong>mandatory</strong>, you must take the line that captures
          the <em>most</em> pieces, and the crowned <em>dama</em> flies the whole diagonal — and
          became Filipino in every other way: the bottle-cap pieces, the hand-drawn boards, the
          plaza and barbershop as its arenas. It is equal parts memory of childhood and serious
          mind sport.
        </p>
        <p style={P}>
          Dama is also the traditional game that has made the leap online most completely — you
          can{" "}
          <Link to="/play" style={{ color: "var(--gold)" }}>
            play dama free in your browser
          </Link>
          , learn the{" "}
          <Link to="/learn" style={{ color: "var(--gold)" }}>
            complete rules
          </Link>
          , or study{" "}
          <Link to="/strategy" style={{ color: "var(--gold)" }}>
            winning strategy
          </Link>
          .
        </p>

        <h2 style={H2}>Sungka — Shells, Pits, and Counting</h2>
        <p style={P}>
          <strong>Sungka</strong> is the Philippine member of the worldwide mancala family: a
          carved wooden boat of fourteen pits and two heads, sown with shells or pebbles. Players
          scoop and drop shells around the board, capturing by landing in the right pits. It
          rewards counting several moves ahead — a math game disguised as a household heirloom,
          passed from grandmothers to apos on many a doorstep.
        </p>

        <h2 style={H2}>The Street Games</h2>
        <h3 style={H3}>Patintero</h3>
        <p style={P}>
          The classic team chase: a grid is drawn on the road (chalk or water), taggers guard its
          lines, and runners try to cross the whole court and back without being touched. Whole
          neighborhoods once played patintero late into fiesta nights — it remains the flagship
          larong Pinoy street game.
        </p>
        <h3 style={H3}>Tumbang Preso</h3>
        <p style={P}>
          An empty can, one guard (the <em>preso</em>'s jailer), and a fistful of slippers.
          Players hurl their tsinelas to knock the can down while the guard scrambles to restore
          it and tag someone. Loud, chaotic, beloved.
        </p>
        <h3 style={H3}>Luksong Tinik and Luksong Baka</h3>
        <p style={P}>
          Jumping games of escalating difficulty: in <em>luksong tinik</em>, seated players stack
          hands and feet into a growing "thorn" the jumpers must clear; in <em>luksong baka</em>,
          the crouching "cow" rises higher each round. No equipment, pure nerve.
        </p>
        <h3 style={H3}>Piko</h3>
        <p style={P}>
          The Filipino hopscotch — a chalk grid, a flat marker (the <em>pamato</em>), and one leg
          to hop through it. Every region draws the court a little differently.
        </p>
        <h3 style={H3}>Agawan Base, Langit-Lupa, and Sipa</h3>
        <p style={P}>
          <em>Agawan base</em> is capture-the-base team tag; <em>langit-lupa</em> is tag with a
          twist — anything elevated ("langit", heaven) is safe ground; and <em>sipa</em>, kicking
          a woven rattan ball or a washer shuttlecock trailing cloth or straw strips to keep it
          airborne, is among the oldest
          Filipino games of skill.
        </p>

        <h2 style={H2}>Damath — When Dama Went to School</h2>
        <p style={P}>
          The Philippines even gave dama an academic child: <strong>Damath</strong>, invented by a
          Sorsogon schoolteacher in the 1970s, plays dama on a board of math operations — every
          capture computes a score. It became a curriculum staple and interschool competition,
          and it is a uniquely Filipino contribution to educational gaming.
        </p>

        <h2 style={H2}>Traditional Games in Filipino Schools</h2>
        <p style={P}>
          Larong Pinoy survives partly because schools keep it alive: PE and MAPEH classes teach
          traditional games as cultural heritage and exercise, and students are often assigned to
          research their rules — dama and sungka for strategy, patintero and tumbang preso for
          teamwork. If that's what brought you here: the{" "}
          <Link to="/learn" style={{ color: "var(--gold)" }}>
            complete dama rules guide
          </Link>{" "}
          covers the board, the mandatory-capture rule, and the flying dama with examples you can
          cite.
        </p>

        <h2 style={H2}>Why These Games Matter</h2>
        <p style={P}>
          Traditional games carry things no imported pastime can: the Filipino talent for making
          joy out of almost nothing — a can, a slipper, a chalk line — and the social fabric of
          the street and plaza. Some of these games now live mostly in memory and school
          programs; others, like dama, found a second life online. Keeping them played, in any
          form, keeps them ours.
        </p>

        <h2 style={H2}>Frequently Asked Questions</h2>
        {CULTURE_FAQ.map((f) => (
          <div key={f.q}>
            <h3 style={H3}>{f.q}</h3>
            <p style={P}>{f.a}</p>
          </div>
        ))}

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 26, paddingTop: 20, borderTop: "1px solid rgba(232,184,75,.2)" }}>
          <Link to="/play" className="btn btn-gold" style={{ textDecoration: "none", padding: "12px 22px" }}>
            ♟ Play Dama Online — Free
          </Link>
          <Link to="/blog" className="btn btn-purple" style={{ textDecoration: "none", padding: "12px 22px" }}>
            More Dama Guides &amp; Culture
          </Link>
        </div>
      </article>
    </div>
  );
}

export default TraditionalGamesPage;
