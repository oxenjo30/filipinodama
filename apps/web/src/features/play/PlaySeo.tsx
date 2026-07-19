import { Link } from "react-router-dom";
import { SiteHead, faqJsonLd, canonical, SITE } from "../../lib/seo";

/**
 * PlaySeo — the public, crawlable marketing block + <head> for /play, the
 * transactional SEO landing ("play dama online", "filipino checkers online",
 * "dama online free"). Rendered additively BELOW the approved Play hub layout
 * (which is untouched) and prerendered to static HTML.
 *
 * ACCURACY (verified against PlayHubPage's own gating logic): Play vs AI and
 * local play need no sign-in; Quick Match and private rooms need a session but
 * allow guest accounts; Ranked requires a free (non-guest) account. The game is
 * free to play. Keep every claim here consistent with that.
 */

export const PLAY_FAQ: { q: string; a: string }[] = [
  {
    q: "Can I play Filipino Dama online for free?",
    a: "Yes. FilipinoDama Royal is free to play in your browser — no download or installation. Practice against the AI without even signing in, or create a free account for online multiplayer and ranked play.",
  },
  {
    q: "Can I play dama against the computer?",
    a: "Yes. The Play vs AI mode has Easy, Normal, and Hard difficulties and works without an account — open the site and start playing immediately.",
  },
  {
    q: "Can I play dama online with friends?",
    a: "Yes. Create a private room and share its invite code — your friend joins from any device. Quick Match also pairs you with online players of similar skill for casual games.",
  },
  {
    q: "How does ranked dama work?",
    a: "Ranked matches are rated: winning earns trophies (+25 per win) that move you up the seasonal ladder and leaderboards. Ranked requires a free account so your rating and match history are saved.",
  },
  {
    q: "Can I play Filipino Dama on my phone?",
    a: "Yes. The site is mobile-first and installable as an app from the browser, and FilipinoDama Royal is also available for Android. Your account, rating, and cosmetics sync across web and mobile.",
  },
  {
    q: "Is this real Filipino Dama rules?",
    a: "Yes — mandatory captures, the maximum-capture rule, backward captures for men, and the flying dama (king), enforced by the game engine. See the full rules guide for details.",
  },
];

function videoGameJsonLd(): object {
  return {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: "Filipino Dama",
    alternateName: ["Dama", "Filipino Checkers", "FilipinoDama Royal"],
    description:
      "Free online Filipino Dama (Filipino checkers) — play vs AI or real players in ranked multiplayer, with authentic mandatory-capture rules and flying damas.",
    genre: "Board game",
    gamePlatform: ["Web browser", "Android"],
    playMode: ["SinglePlayer", "MultiPlayer"],
    applicationCategory: "GameApplication",
    operatingSystem: "Web, Android",
    offers: { "@type": "Offer", price: "0", priceCurrency: "PHP" },
    author: { "@type": "Organization", name: SITE.brand },
    publisher: { "@type": "Organization", name: SITE.name, logo: { "@type": "ImageObject", url: SITE.logo } },
    image: SITE.ogImage,
    url: canonical("/play"),
  };
}

const H2: React.CSSProperties = { font: "800 22px Cinzel,serif", color: "var(--gold-lt)", margin: "0 0 10px" };
const H3: React.CSSProperties = { font: "700 15px Inter", color: "var(--gold-lt)", margin: "18px 0 6px" };
const P: React.CSSProperties = { font: "400 14px/1.75 Inter", color: "var(--ink)", margin: "0 0 12px" };

export function PlaySeo() {
  return (
    <>
      <SiteHead
        title="Play Filipino Dama Online Free — vs AI or Real Players"
        description="Play Filipino Dama (Filipino checkers) free in your browser — no download. Practice vs AI, battle real players in ranked multiplayer, or play a friend."
        path="/play"
        jsonLd={[videoGameJsonLd(), faqJsonLd(PLAY_FAQ)]}
      />
      <section className="frame fd-card-m" style={{ maxWidth: 980, margin: "26px auto 0", padding: "34px 34px 40px" }} aria-labelledby="play-seo">
        <article>
          <h2 id="play-seo" style={H2}>
            Play Filipino Dama Online — Free, No Download
          </h2>
          <p style={P}>
            <strong>FilipinoDama Royal</strong> is the home of Filipino Dama online: the authentic
            Philippine checkers game — mandatory captures, maximum-capture rule, flying damas —
            playable free in any browser. Jump straight into a match against the AI without an
            account, or sign up free to face real players in casual and ranked multiplayer.
          </p>

          <h3 style={H3}>Four ways to play</h3>
          <p style={P}>
            <strong>Play vs AI</strong> — three difficulty levels, no sign-in needed, perfect for
            learning the forced-capture rhythm. <strong>Quick Match</strong> — casual online games
            against similar-skill players. <strong>Ranked</strong> — climb the seasonal ladder at
            +25 trophies per win, with leaderboards, seasons, and tournaments.{" "}
            <strong>Private rooms</strong> — create a room, share the code, and play a friend on
            any device.
          </p>

          <h3 style={H3}>Authentic rules, fair play</h3>
          <p style={P}>
            Every match runs on a server-checked engine enforcing the real{" "}
            <Link to="/learn" style={{ color: "var(--gold)" }}>Filipino Dama rules</Link>: captures
            are mandatory, the longest capture line is required, men capture forward and backward,
            and a crowned dama flies the full diagonal. Ready to win more?{" "}
            <Link to="/strategy" style={{ color: "var(--gold)" }}>Learn dama strategy</Link>.
          </p>

          <h2 style={{ ...H2, marginTop: 28 }}>Playing Online — FAQ</h2>
          {PLAY_FAQ.map((f) => (
            <div key={f.q}>
              <h3 style={H3}>{f.q}</h3>
              <p style={P}>{f.a}</p>
            </div>
          ))}
        </article>
      </section>
    </>
  );
}
