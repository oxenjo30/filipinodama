import { Link } from "react-router-dom";
import { SiteHead, faqJsonLd, howToJsonLd, canonical, SITE } from "../../lib/seo";

/**
 * LearnTlPage (/tl/learn) — the TAGALOG rules pillar page for the "paano maglaro
 * ng dama" / "mga patakaran ng dama" keyword cluster. Fully static and public
 * (no auth, no API, no hooks), prerendered at build time.
 *
 * This is a TRANSCREATION (not a sentence-by-sentence translation) of the
 * English rules guide at /learn (RulesGuide.tsx). Every rule stated here matches
 * the engine-verified English source: men move forward only but capture forward
 * AND backward; captures are mandatory; maximum-capture is required; the dama is
 * a flying king that cannot pass over its own pieces or two enemy pieces in a
 * row; mid-chain promotion continues the capture as a dama; 40-move inactivity
 * draw. Do NOT edit the rules facts here without re-checking RulesGuide.tsx /
 * the engine.
 *
 * I18N: self-canonical at /tl/learn with a full reciprocal hreflang set
 * (en-PH → /learn, tl-PH → /tl/learn, x-default → /learn) and og:locale
 * tl_PH. hreflang uses "tl" (Tagalog, ISO 639-1) NOT "fil" — Google's hreflang
 * spec only recognizes ISO 639-1 languages and Filipino has no 639-1 code, so
 * "fil-PH" would be silently ignored. The Article JSON-LD keeps inLanguage
 * "fil-PH" (BCP 47, where "fil" IS valid).
 *
 * Consistent Tagalog game terms used throughout: dama (the game AND the crowned
 * piece), pyesa (piece), sapilitang kain (mandatory capture), lumilipad na dama
 * (flying dama), tabla (draw).
 */

export const RULES_FAQ_TL: { q: string; a: string }[] = [
  {
    q: "Bawal ba umatras sa dama?",
    a: "Sa normal na galaw, oo — ang ordinaryong pyesa ay gumagalaw lang nang pahilis paabante. Pero pagdating sa pagkain, puwede itong lumundag paabante AT paatras mula sa simula pa lang ng laro. Ang dama (ang nakoronahang pyesa) lang ang malayang nakakaatras kahit walang kinakain.",
  },
  {
    q: "Ilan ang pyesa sa dama?",
    a: "Tig-12 pyesa ang bawat manlalaro, nakalagay sa maiitim na parisukat ng tatlong hanay na pinakamalapit sa kanya sa 8×8 na board — pareho ang setup sa karamihan ng mga bersyon ng checkers.",
  },
  {
    q: "Sapilitan ba ang pagkain sa dama?",
    a: "Oo. Kapag may pyesa kang puwedeng kumain, dapat kang kumain — bawal ang ordinaryong galaw habang may puwede kang kainin. At kapag higit sa isa ang puwedeng kainin, ang standard na patakaran (na siyang ginagamit sa FilipinoDama Royal) ay piliin ang linya kung saan pinakamarami kang makukuhang pyesa ng kalaban.",
  },
  {
    q: "Paano nagiging dama ang isang pyesa?",
    a: "Nagiging dama ang pyesa sa sandaling dumapo ito sa pinakadulong hanay — ang hanay kung saan nagsimula ang mga pyesa ng kalaban. Kapag naabot iyon sa gitna ng sunud-sunod na kain, agad itong nakokoronahan at maaaring magpatuloy sa pagkain bilang dama sa parehong turn.",
  },
  {
    q: "Paano gumagalaw ang dama?",
    a: "Ang dama ay tinatawag na 'lumilipad na dama' (flying king): dumadausdos ito nang kahit ilang bakanteng parisukat sa diagonal, paabante man o paatras. Sa pagkain, nilulundagan nito ang pyesa ng kalaban mula sa kahit anong layo sa diagonal at puwedeng dumapo sa alinmang bakanteng parisukat lampas dito — pero hindi nito kayang lundagan ang sarili niyang pyesa o ang dalawang magkasunod na pyesa ng kalaban.",
  },
  {
    q: "Kaya bang kainin ng ordinaryong pyesa ang dama?",
    a: "Oo. Kahit anong pyesa ay puwedeng kumain ng kahit anong pyesa ng kalaban — puwedeng lundagan at tanggalin ng ordinaryong pyesa ang dama ng kalaban. Walang ranggo-ranggo pagdating sa kain.",
  },
  {
    q: "Paano manalo sa dama?",
    a: "Panalo ka kapag naubos mo ang lahat ng pyesa ng kalaban, o kapag wala na siyang legal na galaw sa kanyang turn. Puwede ring magtapos ang laro sa tabla (draw) — halimbawa, kapag walang pag-usad ang magkabilang panig sa loob ng 40 sunud-sunod na galaw nang walang kain o pag-abante ng ordinaryong pyesa.",
  },
  {
    q: "Pareho ba ang dama at checkers?",
    a: "Ang Filipino Dama ay ang bersyong Pilipino ng checkers (draughts). Pareho silang nilalaro sa 8×8 na board na may tig-12 pyesa, pero tatlo ang malaking pinagkaiba nito sa American checkers: nakakakain paatras ang ordinaryong pyesa, sapilitan ang pagpili sa linyang may pinakamaraming makakain, at ang nakoronahang pyesa ay nagiging 'lumilipad na dama' na nakakakain mula sa malayo.",
  },
];

export const HOWTO_STEPS_TL: { name: string; text: string }[] = [
  {
    name: "Ihanda ang board",
    text: "Gumamit ng 8×8 na board. Tig-12 pyesa ang bawat manlalaro sa maiitim na parisukat ng tatlong hanay na pinakamalapit sa kanya. Blangko muna ang dalawang gitnang hanay.",
  },
  {
    name: "Gumalaw nang pahilis paabante",
    text: "Magsalitan ang dalawang manlalaro. Sa iyong turn, iusog ang isang pyesa nang isang parisukat, pahilis paabante, papunta sa bakanteng maitim na parisukat.",
  },
  {
    name: "Kumain sa pamamagitan ng paglundag",
    text: "Kapag may pyesa ng kalaban sa katabing diagonal at bakante ang parisukat sa likod nito, dapat mo itong lundagan at tanggalin. Nakakakain ang ordinaryong pyesa paabante at paatras. Ang sunud-sunod na lundag sa iisang turn ay pinapayagan — at sapilitan kapag available.",
  },
  {
    name: "Piliin ang pinakamaraming makakain",
    text: "Kapag may iba't ibang linya ng kain, dapat piliin ang linyang may pinakamaraming matatanggal na pyesa ng kalaban — ito ang maximum-capture rule.",
  },
  {
    name: "Gawing dama ang pyesa",
    text: "Ang pyesang nakaabot sa pinakadulong hanay ay kokoronahan bilang dama. Dumadausdos ang dama nang kahit gaano kalayo sa diagonal, sa dalawang direksyon, at nakakakain mula sa malayo.",
  },
  {
    name: "Ipanalo ang laro",
    text: "Ubusin ang mga pyesa ng kalaban, o iwanan siyang walang legal na galaw. Kapag walang pag-usad sa loob ng 40 galaw, tabla ang laro.",
  },
];

/**
 * GameFigure — section illustration, same pattern as TraditionalGamesPage:
 * AI-generated painterly golden-hour art served as 1200×670 WebP (~100KB) from
 * /assets/culture/. Explicit width/height prevent layout shift; lazy loading
 * keeps it off the critical path; Tagalog alt text feeds image search + a11y.
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

export function LearnTlPage() {
  return (
    <div className="fd-page-pad" style={{ maxWidth: 980, margin: "0 auto", padding: "26px 26px 60px" }}>
      <SiteHead
        title="Paano Maglaro ng Dama — Kumpletong Gabay sa Mga Patakaran"
        description="Mga patakaran ng dama sa Tagalog: board setup, sapilitang kain, maximum-capture rule, ang lumilipad na dama, at paano manalo — may FAQ. Maglaro ng dama online, libre."
        path="/tl/learn"
        ogLocale="tl_PH"
        alternates={[
          { hrefLang: "en-PH", path: "/learn" },
          { hrefLang: "tl-PH", path: "/tl/learn" },
          { hrefLang: "x-default", path: "/learn" },
        ]}
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "Article",
            headline: "Mga Patakaran ng Dama — Paano Maglaro ng Filipino Dama",
            description:
              "Kumpletong gabay sa Tagalog sa mga patakaran ng dama: ang 8×8 na board, sapilitang kain, ang maximum-capture rule, ang lumilipad na dama, at paano manalo o tabla.",
            inLanguage: "fil-PH",
            image: SITE.ogImage,
            datePublished: "2026-07-19T00:00:00Z",
            dateModified: "2026-07-19T00:00:00Z",
            author: { "@type": "Organization", name: SITE.brand },
            publisher: { "@type": "Organization", name: SITE.name, logo: { "@type": "ImageObject", url: SITE.logo } },
            mainEntityOfPage: canonical("/tl/learn"),
            url: canonical("/tl/learn"),
          },
          faqJsonLd(RULES_FAQ_TL),
          howToJsonLd(
            "Paano Maglaro ng Dama",
            "Ihanda ang board at matutunan ang galaw ng pyesa, ang sapilitang kain, ang koronasyon ng dama, at kung paano manalo sa Filipino Dama.",
            HOWTO_STEPS_TL,
          ),
        ]}
      />

      <article className="frame fd-card-m" lang="fil" style={{ padding: "34px 34px 40px" }}>
        <header>
          <div style={{ font: "700 11px Inter", letterSpacing: "3px", textTransform: "uppercase", color: "var(--gold)", marginBottom: 8 }}>
            Kumpletong Gabay sa Tagalog
          </div>
          <h1 style={{ font: "800 28px Cinzel,serif", color: "var(--gold-lt)", margin: "0 0 12px" }}>
            Mga Patakaran ng Dama — Paano Maglaro ng Filipino Dama
          </h1>
          <p style={{ ...P, font: "400 15px/1.8 Inter" }}>
            Ang <strong>dama</strong> ay ang bersyong Pinoy ng checkers (draughts): dalawang
            manlalaro, 8×8 na board, at tig-12 pyesa sa maiitim na parisukat. Tatlong patakaran ang
            nagbibigay dito ng sariling personalidad: <strong>sapilitan ang kain</strong> (mandatory
            capture), dapat piliin ang linyang may <strong>pinakamaraming</strong> makukuha, at ang
            nakoronahang pyesa — ang <em>dama</em> — ay nagiging <em>lumilipad na dama</em> na
            dumadausdos nang malayo sa diagonal. Basahin ang gabay na ito at matututunan mo kung{" "}
            <strong>paano maglaro ng dama</strong> mula setup hanggang panalo — eksakto kung paano
            ito nilalaro sa FilipinoDama Royal.
          </p>
          <p lang="en" style={{ font: "600 12px Inter", margin: "0 0 4px" }}>
            <Link to="/learn" style={{ color: "var(--gold)" }}>
              Read this guide in English →
            </Link>
          </p>
        </header>

        <h2 style={H2}>Ang Board at Pagsisimula ng Laro</h2>
        <GameFigure
          src="dama-plaza.webp"
          alt="Ilustrasyon ng dalawang Pilipinong naglalaro ng dama gamit ang pula at asul na tansan sa ginuhit-kamay na board, sa plaza ng bayan tuwing dapithapon"
        />
        <p style={P}>
          Nilalaro ang dama sa 32 maiitim na parisukat ng standard na 8×8 checkerboard. Nagsisimula
          ang bawat manlalaro na may <strong>tig-12 pyesa</strong>, nakahanay sa maiitim na
          parisukat ng tatlong hanay na pinakamalapit sa kanya; blangko muna ang dalawang gitnang
          hanay. Ayon sa kaugalian, ang may puting pyesa ang unang gagalaw, at magsasalitan
          ang dalawa — isang galaw bawat turn. Isa itong klasikong <strong>larong Pinoy</strong> na
          kayang laruin sa mesa, sa papel na ginuhitan, o{" "}
          <Link to="/play" style={{ color: "var(--gold)" }}>
            online
          </Link>
          .
        </p>

        <h2 style={H2}>Paano Gumagalaw ang mga Pyesa?</h2>
        <p style={P}>
          Ang ordinaryong pyesa ay gumagalaw nang <strong>isang parisukat, pahilis paabante</strong>
          , papunta sa bakanteng maitim na parisukat. Hindi ito umaatras sa normal na galaw — pero
          heto ang mahalagang twist: <strong>nakakakain ito paatras</strong>. Ang pagkain paatras
          ang isa sa mga malinaw na pinagkaiba ng Filipino Dama sa American checkers, at
          ramdam mo ito mula pa sa unang mga palitan: ang pyesang mukhang ligtas sa likod ng linya
          mo ay puwede pa ring makain.
        </p>

        <h2 style={H2}>Sapilitang Kain — at ang Maximum-Capture Rule</h2>
        <p style={P}>
          Kapag may pyesa kang puwedeng lumundag sa katabing pyesa ng kalaban papunta sa bakanteng
          parisukat sa likod nito, <strong>dapat</strong> kang kumain — ilegal ang ordinaryong
          galaw habang may puwede kang kainin. Ito ang <em>sapilitang kain</em> (mandatory capture)
          — ang puso ng mga patakaran ng dama. Tinatanggal sa board ang mga nakain sa pagtatapos ng
          galaw.
        </p>
        <ul style={{ paddingLeft: 22, margin: "0 0 12px" }}>
          <li style={LI}>
            <strong>Sunud-sunod na kain:</strong> kapag ang lumundag na pyesa ay dumapo sa
            puwestong may panibagong makakain, dapat itong magpatuloy sa paglundag sa parehong turn
            — kaya kayang &ldquo;walisin&rdquo; ng iisang pyesa ang ilang pyesa ng kalaban sa
            iisang galaw.
          </li>
          <li style={LI}>
            <strong>Maximum-capture rule:</strong> kapag may iba&rsquo;t ibang linya ng kain, dapat
            piliin ang linyang may <strong>pinakamaraming</strong> matatanggal na pyesa ng kalaban. Kung
            magkapareho ang bilang, malaya kang pumili sa mga iyon.
          </li>
          <li style={LI}>
            <strong>Kain sa dalawang direksyon:</strong> legal sa ordinaryong pyesa ang lundag
            paabante at paatras, sa lahat ng oras.
          </li>
          <li style={LI}>
            <strong>Bawal ang ulit-lundag:</strong> ang pyesang nalundagan na sa chain ay hindi na
            puwedeng lundagan ulit, at hindi inaalis sa board ang mga nakain hangga&rsquo;t hindi
            tapos ang buong chain — kaya nakahaharang pa rin sila sa mga parisukat habang tumatakbo
            ang kain.
          </li>
        </ul>

        <h2 style={H2}>Ano ang Lumilipad na Dama?</h2>
        <p style={P}>
          Ang ordinaryong pyesang nakaabot sa pinakadulong hanay ng kalaban ay kokoronahan bilang{" "}
          <strong>dama</strong> — ang pyesang pinagmulan ng pangalan ng laro. Kapag naabot ang
          koronasyon sa gitna ng sunud-sunod na kain, <em>agad</em> na nakokoronahan ang pyesa at
          nagpapatuloy ito sa pagkain bilang dama sa parehong turn.
        </p>
        <p style={P}>
          Ang dama ay tinatawag na <strong>lumilipad na dama</strong> (flying dama): dumadausdos ito nang
          kahit ilang bakanteng parisukat sa diagonal, paabante man o paatras. Sa pagkain,
          nilulundagan nito ang pyesa ng kalaban saanman sa diagonal — mula sa kahit anong layo —
          at puwede itong dumapo sa <em>alinmang</em> bakanteng parisukat lampas sa nakain, para
          maipuwesto ang susunod na lundag. Pero may hangganan din ito: hindi nito kayang lundagan
          ang sarili niyang pyesa, o ang dalawang magkasunod na pyesa ng kalaban sa iisang
          diagonal.
        </p>

        <h2 style={H2}>Paano Manalo — at Kailan Tabla?</h2>
        <p style={P}>
          <strong>Panalo</strong> ka kapag naubos mo ang lahat ng pyesa ng kalaban, o kapag wala na
          siyang legal na galaw sa kanyang turn. <strong>Tabla</strong> (draw) naman ang laro kapag
          wala nang pag-usad ang magkabilang panig — sa FilipinoDama Royal, kapag lumipas ang 40
          sunud-sunod na galaw nang walang kain at walang ordinaryong pyesang umabante, tabla na
          ang laro.
        </p>

        <h2 style={H2}>Ano ang Pagkakaiba ng Dama sa Ibang Checkers?</h2>
        <div style={{ overflowX: "auto", margin: "0 0 12px" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560 }}>
            <thead>
              <tr>
                <th style={TH}>Patakaran</th>
                <th style={TH}>Filipino Dama</th>
                <th style={TH}>American Checkers</th>
                <th style={TH}>International Draughts</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={TD}>Board / pyesa</td>
                <td style={TD}>8×8, tig-12</td>
                <td style={TD}>8×8, tig-12</td>
                <td style={TD}>10×10, tig-20</td>
              </tr>
              <tr>
                <td style={TD}>Kain paatras ng ordinaryong pyesa</td>
                <td style={TD}>Oo</td>
                <td style={TD}>Hindi</td>
                <td style={TD}>Oo</td>
              </tr>
              <tr>
                <td style={TD}>Priyoridad sa kain</td>
                <td style={TD}>Sapilitan ang pinakamarami</td>
                <td style={TD}>Kahit aling kain</td>
                <td style={TD}>Sapilitan ang pinakamarami</td>
              </tr>
              <tr>
                <td style={TD}>Galaw ng dama (hari)</td>
                <td style={TD}>Lumilipad (kahit gaano kalayo)</td>
                <td style={TD}>Isang parisukat lang</td>
                <td style={TD}>Lumilipad (kahit gaano kalayo)</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p style={P}>
          Sa madaling salita: ang Filipino Dama ay parang international draughts na siniksik sa mas
          maliit na 8×8 na board — mas mabilis ang laro, mas siksik ang taktika, at mas maraming
          sapilitang sagupaan kaysa sa American checkers. Kapag kabisado mo na ang mga patakaran,
          ang susunod na hakbang ay ang{" "}
          <Link to="/tl/strategy" style={{ color: "var(--gold)" }}>
            diskarte sa dama
          </Link>{" "}
          — mga opening, pormasyon, at taktika para manalo nang mas madalas. O kung gusto mong
          subukan agad,{" "}
          <Link to="/play" style={{ color: "var(--gold)" }}>
            maglaro na
          </Link>{" "}
          — libre ang dama online dito, laban sa computer o sa totoong kalaro.
        </p>
        <p style={P}>
          Para sa mga estudyante: kung ipinasasaliksik sa inyo ang mga patakaran ng dama (dama
          rules) para sa MAPEH o PE, puwede mong i-cite ang gabay na ito — kumpleto ito mula sa
          setup ng board hanggang sa mga espesyal na patakaran tulad ng sapilitang kain at
          lumilipad na dama. May gabay din kami tungkol sa dama at iba pang{" "}
          <Link to="/traditional-filipino-games" style={{ color: "var(--gold)" }}>
            larong Pinoy
          </Link>
          , at puwede mo ring i-download ang{" "}
          <a href="/downloads/dama-rules-classroom-guide.pdf" style={{ color: "var(--gold)" }}>
            libreng printable na classroom rules guide (PDF)
          </a>
          .
        </p>

        <h2 style={H2}>Mga Madalas Itanong Tungkol sa Dama</h2>
        {RULES_FAQ_TL.map((f) => (
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
            ♟ Maglaro ng Dama Online — Libre
          </Link>
          <Link to="/tl/strategy" className="btn btn-purple" style={{ textDecoration: "none", padding: "12px 22px" }}>
            Mga Diskarte sa Dama
          </Link>
        </div>
      </article>
    </div>
  );
}

export default LearnTlPage;
