import { Link } from "react-router-dom";
import { SiteHead, faqJsonLd, canonical, SITE } from "../../lib/seo";

/**
 * StrategyTlPage (/tl/strategy) — the Tagalog edition of the strategy pillar
 * page. Fully static and public (no auth, no API), prerendered at build time.
 *
 * This is a TRANSCREATION of /strategy, not a sentence-by-sentence translation:
 * same engine-verified facts (captures mandatory, maximum-capture forced, men
 * capture backward, flying dama), rewritten the way a Filipino coach would
 * actually explain them. Game terms are kept consistent: dama (the game AND the
 * crowned piece), pyesa, sapilitang kain, lumilipad na dama, tabla.
 *
 * i18n: self-canonical at /tl/strategy with a full reciprocal hreflang set
 * (en-PH ↔ tl-PH, x-default → the English page), ogLocale tl_PH, and
 * inLanguage "fil-PH" on the Article JSON-LD. hreflang uses "tl" (Tagalog,
 * ISO 639-1) NOT "fil" — Google ignores hreflang languages outside ISO 639-1;
 * BCP-47 "fil" stays only in JSON-LD inLanguage, where it is valid.
 */

export const STRATEGY_TL_FAQ: { q: string; a: string }[] = [
  {
    q: "Paano manalo sa dama?",
    a: "Kontrolin ang gitna ng board, panatilihing magkakadikit at magkakasuporta ang mga pyesa mo, at gamitin ang sapilitang kain para ikaw ang magdikta ng bawat palitan. Dahil obligadong kumain ang kalaban kapag may makakain, puwede kang mag-alay ng isang pyesa para hilahin ang mga pyesa niya sa mga parisukat kung saan dalawa o tatlo ang mababawi mo. Bilangin ang bawat palitan bago mo ito ialok.",
  },
  {
    q: "Ano ang pinakamagandang unang move sa dama?",
    a: "Walang iisang 'tamang' unang move, pero iisa ang prinsipyo sa likod ng magagandang opening: umabante patungo sa gitna at siguraduhing may kasuporta ang bawat pyesang iaabante mo. Ang mga pyesa sa gitna ang nakakasaklaw ng pinakamaraming diagonal, samantalang ang mga pyesa sa gilid ay iisang direksyon lang ang kain at pinakamadaling ma-trap.",
  },
  {
    q: "Bakit nagsasakripisyo ng pyesa ang magagaling na manlalaro?",
    a: "Dahil sapilitan ang kain, ang sakripisyo ang pinaka-forcing na move sa buong laro — walang choice ang kalaban kundi tanggapin ito. Nag-aalay ng isang pyesa ang malalakas na manlalaro para magbukas ng sunud-sunod na kain, makabawi ng mas maraming pyesa kaysa sa ibinigay nila, o maglinis ng daan para makakorona sila ng dama.",
  },
  {
    q: "Dapat bang galawin agad ang mga pyesa sa likod na hilera?",
    a: "Huwag muna. Habang nakapwesto ang mga pyesa mo sa likod na hilera, hindi makakakorona ng dama ang kalaban, at sila rin ang pundasyon ng depensa mo. Iabante sila sa bandang huli na lang, kapag ang unahan sa koronahan na ang nagpapasya sa laro.",
  },
  {
    q: "Paano manalo sa endgame kapag may dama na?",
    a: "Sa lumilipad na dama, ang lamang sa pyesa ay nagiging panalo kapag sinikipan mo ang mga diagonal na matatakbuhan ng dama ng kalaban. Panalo ang dalawang dama laban sa isa: angkinin ang mahabang diagonal, putulin ang mga takasan, at ipitin ang kalaban sa kanto o sa isang sapilitang kain. Kapag ordinaryong pyesa pa ang laban, bilangin ang tempo — kadalasan, ang unang nakakorona ang kumokontrol sa natitirang laro.",
  },
  {
    q: "Ano ang pinakamalaking pagkakamali ng baguhan sa dama?",
    a: "Dalawa: ang pag-abante ng mga pyesa nang isa-isa at walang suporta, at ang pagkain sa bawat inaalok na pyesa nang hindi tinatanong kung bakit ito inialok. Sa larong sapilitan ang pinakamaraming kain, ang 'libreng' pyesa ay kadalasang bayad sa pagpasok sa isang chain na ikakatalo mo — tingnan mo muna kung ano ang mabubuksan ng kain mo bago ka magdiwang.",
  },
];

const H2: React.CSSProperties = { font: "800 22px Cinzel,serif", color: "var(--gold-lt)", margin: "34px 0 10px" };
const H3: React.CSSProperties = { font: "700 15px Inter", color: "var(--gold-lt)", margin: "18px 0 6px" };
const P: React.CSSProperties = { font: "400 14px/1.75 Inter", color: "var(--ink)", margin: "0 0 12px" };
const LI: React.CSSProperties = { font: "400 14px/1.75 Inter", color: "var(--ink)", marginBottom: 6 };

export function StrategyTlPage() {
  return (
    <div className="fd-page-pad" style={{ maxWidth: 980, margin: "0 auto", padding: "26px 26px 60px" }}>
      <SiteHead
        title="Diskarte sa Dama — Paano Manalo sa Dama (Kumpletong Gabay)"
        description="Diskarte sa dama: mga prinsipyo sa opening, sakripisyo gamit ang sapilitang kain, tempo, endgame ng lumilipad na dama, at mga trap na dapat iwasan ng baguhan."
        path="/tl/strategy"
        ogLocale="tl_PH"
        alternates={[
          { hrefLang: "en-PH", path: "/strategy" },
          { hrefLang: "tl-PH", path: "/tl/strategy" },
          { hrefLang: "x-default", path: "/strategy" },
        ]}
        jsonLd={[
          faqJsonLd(STRATEGY_TL_FAQ),
          {
            "@context": "https://schema.org",
            "@type": "Article",
            headline: "Diskarte sa Dama — Paano Manalo sa Dama",
            description:
              "Mga prinsipyo sa opening, sakripisyo sa ilalim ng sapilitang kain, tempo, at endgame ng lumilipad na dama para sa larong dama.",
            inLanguage: "fil-PH",
            image: SITE.ogImage,
            datePublished: "2026-07-19T00:00:00Z",
            dateModified: "2026-07-19T00:00:00Z",
            author: { "@type": "Organization", name: SITE.brand },
            publisher: {
              "@type": "Organization",
              name: SITE.name,
              logo: { "@type": "ImageObject", url: SITE.logo },
            },
            mainEntityOfPage: canonical("/tl/strategy"),
            url: canonical("/tl/strategy"),
          },
        ]}
      />

      <article className="frame fd-card-m" lang="fil" style={{ padding: "34px 34px 40px" }}>
        <header>
          <div style={{ font: "700 11px Inter", letterSpacing: "3px", textTransform: "uppercase", color: "var(--gold)", marginBottom: 8 }}>
            Gabay sa Diskarte
          </div>
          <h1 style={{ font: "800 28px Cinzel,serif", color: "var(--gold-lt)", margin: "0 0 12px" }}>
            Diskarte sa Dama — Paano Manalo sa Dama
          </h1>
          <p style={{ ...P, font: "400 15px/1.8 Inter" }}>
            Ang <strong>diskarte sa dama</strong> ay umiikot sa tatlong kasanayan: kontrolin ang
            gitna ng board gamit ang magkakadikit na pyesa,{" "}
            <strong>gawing sandata ang sapilitang kain</strong> (mandatory capture) — mag-alay ng
            isang pyesa para makabawi ng dalawa o tatlo — at tapusin ang laro gamit ang{" "}
            <em>lumilipad na dama</em>. Iyan din mismo ang pagkakasunod-sunod ng gabay na ito.
            Nakabatay ang bawat payo sa mga patakarang ipinatutupad dito sa FilipinoDama Royal:
            sapilitan ang pagkain, obligadong piliin ang linyang pinakamaraming makakain, at
            kumakain ang ordinaryong pyesa pasulong man o paatras.
          </p>
          <p style={{ font: "400 13px/1.7 Inter", color: "var(--ink)", opacity: 0.85, margin: "0 0 4px" }}>
            Ito ang Tagalog na bersyon ng gabay na ito —{" "}
            <Link to="/strategy" style={{ color: "var(--gold)" }}>
              Read this guide in English
            </Link>
            .
          </p>
        </header>

        <h2 style={H2}>Paano Magsimula nang Tama? Mga Prinsipyo sa Opening</h2>
        <ul style={{ paddingLeft: 22, margin: "0 0 12px" }}>
          <li style={LI}>
            <strong>Agawin ang gitna.</strong> Ang mga parisukat sa gitna ang tumatama sa
            pinakamaraming diagonal — mas marami ang naaatake at naipagtatanggol ng pyesang nasa
            gitna kaysa sa pyesang nasa gilid. Ang mga pyesa sa gilid ay iisang direksyon lang ang
            kain, kaya sila rin ang pinakamadaling ma-trap.
          </li>
          <li style={LI}>
            <strong>Umabante nang may kasama.</strong> Ang pyesang may tagasuporta sa likod ay
            hindi makakain nang libre. Ang klasikong <em>phalanx</em> — dalawa o tatlong pyesang
            magkakadugtong sa diagonal — ay umaabante na parang pader na hindi mabubuwag ng
            kalaban nang hindi siya nalulugi sa palitan.
          </li>
          <li style={LI}>
            <strong>Huwag muna galawin ang likod na hilera.</strong> Habang nasa pwesto ang mga
            pyesa mo sa likod, hindi makakakorona ng dama ang kalaban. Sila ang huling iaabante.
          </li>
          <li style={LI}>
            <strong>Isipin ang kain bago ang bawat hakbang.</strong> Binabago ng bawat abante mo
            kung aling mga kain ang magiging sapilitan. Bago ka gumalaw, itanong: anong kain
            ang bubuksan nito — para sa akin, at para sa kalaban?
          </li>
        </ul>

        <h2 style={H2}>Ang Sakripisyo: Gawing Sandata ang Sapilitang Kain</h2>
        <p style={P}>
          Ang sapilitang kain ang makina ng bawat kombinasyon sa dama. <em>Walang choice</em> ang
          kalaban mo kundi kainin ang inaalok mo — kaya ang tamang sakripisyo ay hindi sugal,
          kundi isang <strong>forcing sequence na kalkulado mo hanggang dulo</strong>.
        </p>
        <h3 style={H3}>Ang isa-palit-dalawa</h3>
        <p style={P}>
          Ito ang pinakakaraniwang panalong pattern: iabante ang isang pyesa sa pwestong kakainin
          ito, at ang sapilitang kain ng kalaban ang mismong maghahatid ng pyesa niya sa parisukat
          kung saan dalawa ang makakain ng nakaabang mong pyesa. Gumastos ka ng isa, kumain ka ng
          dalawa. Sa maraming laro, kung sino ang unang makakita ng ganitong tira ang siyang
          nananalo.
        </p>
        <h3 style={H3}>Pagbuo ng chain gamit ang maximum capture</h3>
        <p style={P}>
          Dahil obligado ang <em>pinakamahabang</em> linya ng kain, kaya mong idikta ang mismong
          dadaanan ng pyesa ng kalaban — ikaw ang pumipili ng bawat kain sa chain para sa kanya.
          Inaayos ng mga bihasang manlalaro ang posisyon para ang sapilitang maximum capture
          mismo ang kumaladkad sa pyesa ng kalaban papaloob sa patibong, saka nila ito babawiin
          nang may tubo — o makakakorona sila ng sarili nilang dama sa likuran nito.
        </p>
        <h3 style={H3}>Bakit niya binigay 'yan? Pagbasa sa mga "regalo"</h3>
        <p style={P}>
          Magkabilaan ang talim ng patakarang ito — tumataga ito sa magkabilang panig. Bawat pyesang
          inaalok sa iyo ay dapat suriin bilang posibleng lason. Bago ka matuwa sa libreng kain,
          tingnan ang parisukat na babagsakan ng pyesa mo at bilangin ang mga kain ng kalaban na
          bubuksan nito. Kapag hindi mo makita kung bakit libre ang pyesa, ipagpalagay mong hindi
          ito libre.
        </p>

        <h2 style={H2}>Kailan Dapat Makipagpalitan? Tempo at Exchange</h2>
        <ul style={{ paddingLeft: 22, margin: "0 0 12px" }}>
          <li style={LI}>
            <strong>Makipagpalitan kapag lamang ka; paguluhin ang laro kapag talo ka sa bilang.</strong>{" "}
            Pabor sa may mas maraming pyesa ang bawat patas na palitan — bawat exchange, lumalaki
            nang proporsyonal ang lamang niya.
          </li>
          <li style={LI}>
            <strong>Bilangin ang tempo sa karera ng koronahan.</strong> Ang bilang ng hakbang na
            kailangan ng bawat malayang pyesa para maabot ang dulong hilera ang nagpapasya sa
            karamihan ng gitnang bahagi ng laro. Walang saysay ang lamang na isang pyesa kung
            dalawang hakbang na mas maaga ang koronahan ng kalaban.
          </li>
          <li style={LI}>
            <strong>Ang paatras na kain ang parusa sa sobrang abante.</strong> Kumakain paatras
            ang mga pyesa sa dama, kaya ang pyesang akala mo'y "nakalusot" na sa linya mo ay
            puwede pa ring kainin. Gamitin ito para parusahan ang sobra-sobrang pag-abante ng
            kalaban — at para bantayan ang sarili mong mga abante.
          </li>
        </ul>

        <h2 style={H2}>Endgame: Paano Gamitin ang Lumilipad na Dama?</h2>
        <p style={P}>
          Ibang laro na kapag may korona na. Ang dama ay dumudulas nang kahit gaano kalayo sa mga
          bukas na diagonal at kumakain mula sa malayo, kaya kayang dominahin ng isang dama ang
          ilang ordinaryong pyesa. Tatlong tuntunin sa endgame:
        </p>
        <ul style={{ paddingLeft: 22, margin: "0 0 12px" }}>
          <li style={LI}>
            <strong>Unahan sa korona.</strong> Sa karamihan ng patas na endgame, panalo ang unang
            dama — mas mabilis nitong sinasalanta ang board kaysa sa kayang idepensa ng mga
            ordinaryong pyesa.
          </li>
          <li style={LI}>
            <strong>Angkinin ang mahabang diagonal.</strong> Nakikita ng dama sa pangunahing
            diagonal ang halos lahat. Laban sa nag-iisang dama ng kalaban, ang pagkontrol sa
            mahabang diagonal at sa magkabilang dobleng kanto ang pipiga sa kanya palabas ng mga
            ligtas na parisukat. Kapag pinabayaan mo siyang tumakas nang tumakas, tabla (draw) ang
            kadalasang kahihinatnan ng dapat sana'y panalo mo.
          </li>
          <li style={LI}>
            <strong>Harang kontra abot.</strong> Hindi kayang lundagin ng dama ang dalawang
            magkatabing pyesa, ni ang sarili niyang mga kasamahan. Ang magkapares na tagapagtanggol
            sa iisang diagonal ay pader laban sa nananalakay na dama — ipwesto sila bago pa
            dumating ang dama, hindi pagkatapos.
          </li>
        </ul>

        <h2 style={H2}>Limang Trap na Madalas Kabagsakan ng Baguhan</h2>
        <ol style={{ paddingLeft: 22, margin: "0 0 12px" }}>
          <li style={LI}>Pagkain sa bawat inaalok na pyesa nang hindi binibilang ang kasunod na chain.</li>
          <li style={LI}>Pag-abante ng nag-iisang pyesa na malayo sa suporta — kakainin ito ng paatras na kain.</li>
          <li style={LI}>Maagang pag-alis ng mga pyesa sa likod na hilera, kaya natatalo sa karera ng koronahan.</li>
          <li style={LI}>Pakikipagpalitan ng pyesa kahit talo na sa bilang.</li>
          <li style={LI}>Pagpapabaya sa isang dama ng kalaban na malayang gumagala habang watak-watak ang mga pyesa mo sa mga bukas na diagonal.</li>
        </ol>

        <h2 style={H2}>Paano Talaga Gumaling sa Dama?</h2>
        <p style={P}>
          Ang pagbabasa ng diskarte ay nagbibigay ng bokabularyo; ang paglalaro ang nagbibigay ng
          kasanayan. Ito ang pinakamabilis na loop: maglaro ng isang match, tapos balikan ang mga
          kain sa larong iyon at itanong kung alin ang ipinilit sa iyo at alin ang pinili mo —
          lalo na sa mga natalo mong laro, doon ang pinakamalaking aral. Magsimula sa{" "}
          <Link to="/play" style={{ color: "var(--gold)" }}>
            paglaban sa AI
          </Link>{" "}
          sa mas madaling level — libre ang dama online dito, at buhay na buhay pa rin ang larong
          Pinoy na ito sa digital na board. Isang pattern lang bawat session ang praktisin
          (unahin ang isa-palit-dalawa). At kung bago ka pa lang at gusto mo munang matutunan
          kung paano maglaro ng dama, dumaan muna sa{" "}
          <Link to="/tl/learn" style={{ color: "var(--gold)" }}>
            gabay sa mga patakaran ng dama
          </Link>{" "}
          — doon nakasandal ang lahat ng diskarteng nasa pahinang ito.
        </p>

        <h2 style={H2}>Mga Madalas Itanong Tungkol sa Diskarte sa Dama</h2>
        {STRATEGY_TL_FAQ.map((f) => (
          <div key={f.q}>
            <h3 style={H3}>{f.q}</h3>
            <p style={P}>{f.a}</p>
          </div>
        ))}

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 26, paddingTop: 20, borderTop: "1px solid rgba(232,184,75,.2)" }}>
          <Link to="/play" className="btn btn-gold" style={{ textDecoration: "none", padding: "12px 22px" }}>
            ♟ Isabuhay ang Diskarte — Maglaro Na
          </Link>
          <Link to="/tl/learn" className="btn btn-purple" style={{ textDecoration: "none", padding: "12px 22px" }}>
            Mga Patakaran ng Dama
          </Link>
        </div>
      </article>
    </div>
  );
}

export default StrategyTlPage;
