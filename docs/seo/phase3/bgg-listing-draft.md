# BoardGameGeek Listing — Filipino Dama (Phase 3)

**Prepared:** 2026-07-19
**Owner action required:** Yes — BGG submissions must come from a human account (John's). Everything below is paste-ready.
**Bottom line:** **Do NOT submit a new game.** A "Filipino Dama" entry **already exists** on BGG — [boardgame/430395](https://boardgamegeek.com/boardgame/430395/filipino-dama) — so a new submission would be rejected or merged as a duplicate. The plan below is an **improvement/completion plan for the existing entry** plus one Web Link submission that gets filipinodama.com onto the page.

---

## 1. Current-state findings (verified 2026-07-19)

### 1.1 The existing entry

Source of the data below: BGG's own item API, fetched directly on 2026-07-19 (`https://api.geekdo.com/api/geekitems?objectid=430395&objecttype=thing`, HTTP 200). The public page is [https://boardgamegeek.com/boardgame/430395/filipino-dama](https://boardgamegeek.com/boardgame/430395/filipino-dama).

| Field | Current value | Assessment |
|---|---|---|
| Primary name | Filipino Dama | Correct — keep |
| Alternate names | **None** (count 0) | Gap — "Dama", "Filipino Checkers", "Philippine Checkers" are all in real use (see §2.2) |
| Year published | **2023** | Reflects the NewVenture Games edition, not the traditional game. Sibling entries use approximate historic years (Checkers = 1150, Turkish Checkers = 1400). Owner decision — see §2.7 |
| Designer | **None listed** | Gap — sibling traditional entries (Checkers, Turkish Checkers) both credit designer **"(Uncredited)"** |
| Artist / Graphic designer | David McCord | Edition credit (NewVenture) — leave |
| Publisher | NewVenture Games (primary) | Leave; optionally also add "(Public Domain)" publisher later (see §2.8) |
| Categories | Abstract Strategy (only) | Matches siblings — leave |
| Mechanisms | **None** (count 0) | Gap — Checkers (2083) carries Grid Movement, Pattern Movement, Square Grid, Static Capture |
| Families | Category: Combinatorial; Players: Two-Player Only Games; Traditional Games: Checkers / Draughts | Good baseline. Gap: **Country: Philippines** family exists and is missing (see §2.5) |
| Players / time / age | 2–2 players, 15–30 min, age 6+ | Sensible, matches Checkers norms — leave |
| Short description (tagline) | "A traditional version of Checkers that is unique to the **Phillippines**." | **Typo** — "Phillippines" → "Philippines" (see §2.3) |
| Description | 3 sentences (quoted verbatim in §2.4) | Thin; no rules content; "the board appears quite different from the usual checkerboards" describes the NewVenture edition's art, not the traditional game |
| Website field | empty (`url: false`) | Leave empty — see §3 for why filipinodama.com belongs in Web Links instead |
| Versions | 1 — "English edition" ([version/730682](https://boardgamegeek.com/boardgameversion/730682/english-edition), the 2023 NewVenture edition) | Leave |
| Images | 1 cover image (pic8978912, NewVenture edition box) | Optional later: owner-taken photo of a traditional hand-drawn board with bottle caps |
| Ratings/rank | Not retrievable without login (stats API returned 401); the entry is clearly low-traffic | — |

**Not verifiable from outside a logged-in session** (stated per boundary rules, not guessed):
- Whether any Web Links already exist on the entry (the browse page and weblink API are bot-blocked; given the entry's overall thinness, likely none — unconfirmed).
- The exact list of category options in the Web Link submission dropdown (§3 handles this).
- BGG's `xmlapi2` returned HTTP 401 to automation on 2026-07-19; all data above came from the `api.geekdo.com/api/geekitems` endpoint instead, which returned the full record.

### 1.2 Sibling-entry precedent (what "complete" looks like for a traditional draughts variant)

Fetched the same way, same date, for the two closest reference entries:

| Field | [Checkers (2083)](https://boardgamegeek.com/boardgame/2083/checkers) | [Turkish Checkers (26920)](https://boardgamegeek.com/boardgame/26920/turkish-checkers) |
|---|---|---|
| Year | 1150 | 1400 |
| Designer | (Uncredited) | (Uncredited) |
| Categories | Abstract Strategy (+ Comic Book/Strip from licensed editions) | Abstract Strategy |
| Mechanisms | Grid Movement, Pattern Movement, Square Grid, Static Capture | none |
| Alternate names | 103 (edition + colloquial names) | **Dama**, Türk Damasi, Turkish Draughts |
| Families | Combinatorial, Traditional Games: Checkers/Draughts, Two-Player Only, Components: 8 x 8 Grids, many Digital Implementations: … | Combinatorial, Traditional Games: Checkers/Draughts, Two-Player Only, Digital Implementations: … |

Key precedents this plan relies on:
- Designer **"(Uncredited)"** ([boardgamedesigner/3](https://boardgamegeek.com/boardgamedesigner/3/uncredited)) is the placeholder BGG uses when credits don't exist / are unknown — both sibling traditional entries use it. There is also a **"(Public Domain)"** placeholder, but on BGG that is a **publisher**, not a designer ([boardgamepublisher/171](https://boardgamegeek.com/boardgamepublisher/171/public-domain): "a placeholder entry to be used as publisher for traditional games for which the rules are commonly known, and that cannot be attributed to a specific publisher or designer").
- Colloquial/traditional **alternate names can live on the game itself** without a matching version — Turkish Checkers carries "Dama" and "Turkish Draughts" that way.
- **Country families exist**: [Country: Philippines (family/11603)](https://boardgamegeek.com/boardgamefamily/11603/country-philippines) — "games that feature Philippines prominently in the theme or gameplay."
- The parent family for all of this is [Traditional Games: Checkers / Draughts (family/96)](https://boardgamegeek.com/boardgamefamily/96/traditional-games-checkers-draughts), which entry 430395 already has.

### 1.3 Other findings

- A short video titled "Filipino Dama is sort of a 'melting pot' game of Checkers…" is filed on BGG **under the generic Checkers entry**, not under 430395: [video/477627](https://boardgamegeek.com/video/477627/checkers/filipino-dama-is-sort-of-a-melting-pot-game-of-che) (same video on [YouTube](https://www.youtube.com/watch?v=Ch8ZHQcGm5o)). No action required; noted for completeness.
- The publisher's product page ([NewVenture Games](https://newventuregames.com/products/filipino-dama)) markets the game as "600 year-old". **Do not repeat this claim anywhere on BGG.** It is unsourced and implausible on its face (the Spanish colonial period, which brought "damas" to the archipelago, began in 1565 — less than 500 years ago). Every draft below avoids it.
- BGG's wiki pages governing this work are bot-blocked (HTTP 403 to automation), so their contents below are cited from search-index snippets plus BGG forum threads, with links, rather than full-page fetches: [Guide to Database Corrections](https://boardgamegeek.com/wiki/page/Guide_to_Database_Corrections), [How To Add Content](https://boardgamegeek.com/wiki/page/How_To_Add_Content), [Link Submissions](https://boardgamegeek.com/wiki/page/Link_Submissions), [BGG Pending Queues for Users](https://boardgamegeek.com/wiki/page/BGG_Pending_Queues_for_Users). The owner will see the authoritative, current instructions when logged in.

---

## 2. Field-by-field correction content (ready to paste)

BGG corrections are submitted per-field from the game page (pencil/edit icons — see §4). Each block below gives the exact value to enter and a **justification note** to paste into the correction's comment box (admins approve faster when the reason and precedent are stated).

### 2.1 Designer — ADD

**Value:** `(Uncredited)`

**Justification to paste:**
> Traditional public-domain game with no known designer. Adding the standard "(Uncredited)" placeholder for consistency with the other entries in the Traditional Games: Checkers / Draughts family — see Checkers (2083) and Turkish Checkers (26920), which both credit "(Uncredited)".

### 2.2 Alternate names — ADD (three)

**Values:**
1. `Dama`
2. `Filipino Checkers`
3. `Philippine Checkers`

**Justification to paste:**
> These are the names this traditional game is actually known by. "Dama" is the everyday Filipino name for the game (precedent: Turkish Checkers (26920) already lists "Dama" and "Turkish Draughts" as alternate names without matching versions). "Filipino Checkers" is in common use, e.g. the long-standing app "Filipino Checkers / Dama" (https://play.google.com/store/apps/details?id=mkisly.checkers.filipino). "Philippine Checkers" is used e.g. at https://playculturalgames.com/filipino-dama/. These are colloquial names of the traditional game, not edition titles, so no version entries exist for them.

**Caveat (be ready for pushback):** the [Guide to Database Corrections](https://boardgamegeek.com/wiki/page/Guide_to_Database_Corrections) says alternate titles tied to a *published edition* should be submitted as a **version**, not a game correction. That rule doesn't fit colloquial names of a traditional game (Turkish Checkers is the direct precedent), which is why the justification cites it. If an admin declines anyway, accept the ruling — don't resubmit.

### 2.3 Short description (tagline) — FIX TYPO

**Current:** `A traditional version of Checkers that is unique to the Phillippines.`
**Submit:** `A traditional version of Checkers that is unique to the Philippines.`

**Justification to paste:**
> Spelling correction only: "Phillippines" → "Philippines".

(Minimal-change corrections sail through. If you'd rather improve it while you're there, a safe alternative: `The traditional Filipino form of Checkers, with mandatory maximum captures and long-range "flying" kings.` — but the pure typo fix is the surest approval.)

### 2.4 Description — REPLACE

**Current description (verbatim, for the admin's before/after comparison):**
> This is a variation of Dama (a.k.a. Checkers or Draughts) that is unique to the Philippines. The board appears quite different from the usual checkerboards, but the arrangement of spaces is the same as the squares used in the more common game. Though most of the rules are familiar, there are some exceptional powers for the Kings - long moves and long jumps - that make the latter half of the game very exciting.

**Proposed replacement (neutral, encyclopedic — no links, no promotion; BGG rejects ad copy in descriptions):**

> Filipino Dama (also called dama or Filipino checkers) is the traditional Philippine variant of draughts. It is played on the dark squares of an 8x8 board; each player begins with 12 men placed on the three rows nearest them, leaving the two middle rows empty. The lighter side conventionally moves first.
>
> Men move one square diagonally forward only, but capture both forward and backward by jumping. Captures are mandatory and capturing chains must be completed; when more than one capturing line is available, the line that captures the most pieces must be taken, with a free choice only between lines of equal count.
>
> A man that reaches the far rank is crowned a "dama" — a flying king that slides any distance along open diagonals and captures from range. A dama cannot jump over its own pieces or over two adjacent enemy pieces, and a man promoted in the middle of a capturing chain continues capturing as a dama in the same turn.
>
> A player wins by capturing all enemy pieces or by leaving the opponent without a legal move; a game may also end in a draw (tabla), including under a 40-move no-progress rule.
>
> The game descends from the Spanish game of damas introduced during the colonial era. It is traditionally played outdoors — in plazas, outside sari-sari stores, and in barbershops — often on hand-drawn boards using bottle caps as pieces. It is also the ancestor of Damath, an educational classroom variant that combines dama with arithmetic, devised by a Philippine schoolteacher in the 1970s.

(Rules content above is engine-verified against the filipinodama.com rules implementation; cultural claims are kept general per editorial policy. Note the description deliberately does **not** contain the filipinodama.com URL — that goes in Web Links, §3.)

**Justification to paste:**
> Expanded the description to actually state the rules of this traditional variant (movement, mandatory maximum capture, the flying dama king, promotion mid-chain, win/draw conditions) and its cultural background, in the same neutral style as the descriptions on Checkers (2083) and Turkish Checkers (26920). The old text described the look of one published edition's board rather than the traditional game.

### 2.5 Families — ADD

**Value:** `Country: Philippines` ([family/11603](https://boardgamegeek.com/boardgamefamily/11603/country-philippines))

**Justification to paste:**
> This is the traditional Philippine form of draughts — the Philippines is central to the game's identity, matching the family's scope ("games that feature Philippines prominently in the theme or gameplay").

Optional second family, lower priority: `Components: 8 x 8 Grids` (Checkers 2083 carries it; the same board applies here). Submit it only if the first family correction goes smoothly.

### 2.6 Mechanisms — ADD (four)

**Values (mirror Checkers 2083 exactly):**
1. `Grid Movement`
2. `Pattern Movement`
3. `Square Grid`
4. `Static Capture`

**Justification to paste:**
> Adding the same four mechanisms carried by Checkers (2083), of which this is the traditional Philippine variant with identical board, piece-grid and jump-capture structure. The entry currently lists no mechanisms.

### 2.7 Year published — OWNER DECISION (do not submit without deciding)

Current value **2023** is the NewVenture edition year; BGG convention for traditional games is an approximate origin year on the game entry (Checkers = 1150, Turkish Checkers = 1400) with edition years on versions — and the 2023 edition already exists as version 730682.

The honest problem: **no verifiable origin year for Filipino Dama exists.** The only defensible anchor is "after the start of the Spanish colonial period (1565)", since the game descends from Spanish damas. Any specific number would be invented. Options:

- **Option A — leave 2023.** Zero effort, zero risk, mildly misleading (makes a centuries-old traditional game look like a 2023 release next to its 1150/1400 siblings).
- **Option B — submit a correction that states the problem and defers the year entirely to admins.** Suggested justification if chosen:
  > This entry is the traditional Philippine draughts variant (it sits in the Traditional Games: Checkers / Draughts family), not the 2023 NewVenture edition — that edition is already recorded as version 730682. Sibling traditional entries use approximate origin years (Checkers = 1150, Turkish Checkers = 1400). The game descends from Spanish damas introduced after 1565; no precise origin date is documented. Requesting that admins set an approximate origin year per BGG convention for undatable traditional games, or advise the preferred handling.

  Recommendation: Option B, because the current value actively misfiles a traditional game — but propose no specific year yourself; let the admins choose per their own convention. Never state a year as fact, and never invent one.

### 2.8 Publisher — OPTIONAL, LATER

BGG's own definition of the "(Public Domain)" publisher placeholder fits this game exactly ("traditional games for which the rules are commonly known, and that cannot be attributed to a specific publisher or designer" — [boardgamepublisher/171](https://boardgamegeek.com/boardgamepublisher/171/public-domain)). Adding it alongside NewVenture Games would signal the game itself is public-domain. Per the corrections guide, publishers are normally attached via **versions**, so this may require creating a generic/traditional version — more effort than value right now. Skip unless an admin suggests it.

### 2.9 Leave unchanged

Players (2), playing time (15–30 min), min age (6), categories (Abstract Strategy), artist/graphic-designer credits, the existing version and cover image.

---

## 3. Getting filipinodama.com onto the page — Web Link submission (NOT the description, NOT the website field)

Why not elsewhere:
- **Description:** BGG descriptions are encyclopedic; promotional links there get corrections rejected.
- **Game "website" field:** that field is for the game's official site. A traditional public-domain game has no official site, and claiming ours would likely be rejected and reads as squatting. Leave it empty.
- **Web Links section:** exactly the mechanism for this — "Web Links are a means to link to off-site information about a game," submitted from the Web Links module on the game page ([Link Submissions wiki](https://boardgamegeek.com/wiki/page/Link_Submissions), [One Thing Add Link wiki](https://boardgamegeek.com/wiki/page/One_Thing_Add_Link)).

**Link 1 (submit now):**
- URL: `https://filipinodama.com`
- Title: `Play Filipino Dama online free at FilipinoDama.com (browser, vs AI or ranked multiplayer)`
- Category: pick the closest to "Play Online" / online implementation in the dropdown (the exact option list is only visible when logged in and could not be verified from outside; if no online-play category exists, use the general/miscellaneous one)
- Language: English

**Link 2 (optional, only after Link 1 is approved):**
- URL: `https://filipinodama.com/learn`
- Title: `Illustrated Filipino Dama rules in English and Tagalog`
- Category: the rules/reference-type category if offered

**Etiquette (important):** two links maximum, ever. It's the owner's own site — that's fine on BGG when the link is genuinely relevant, but do not additionally promote it in the entry's forums, do not add it to other games' pages (adding it to Checkers 2083 would be borderline; skip), and accept removal without argument if a mod objects. The site is in beta — the link title above claims features, not popularity, and must stay that way.

**Optional future step (not now):** BGG has per-platform "Digital Implementations: …" families (Board Game Arena, PlayOK, etc. — visible on Checkers/Turkish Checkers). A "Digital Implementations: FilipinoDama.com" family submission would put the site on the entry's family line, but new-family submissions for one's own small site invite scrutiny. Revisit after the site is out of beta and has visible traction.

---

## 4. Step-by-step submission instructions for the owner

1. **Account.** Log in at boardgamegeek.com (create a free account if needed — use the real "John / FilipinoDama.com" identity; the profile can mention you run the site, which reads as disclosure, not spam). Note: brand-new accounts can submit corrections, but expect closer admin review.
2. **Open the entry:** https://boardgamegeek.com/boardgame/430395/filipino-dama
3. **Submit corrections** (§2.1–2.6, plus 2.7 if you chose Option B). On the game page, use the **pencil/edit icons** next to each data section (or the page's Edit function) to open the correction form for that field ([Guide to Database Corrections](https://boardgamegeek.com/wiki/page/Guide_to_Database_Corrections); confirmed mechanism in this forum thread: [How do I submit a game correction?](https://boardgamegeek.com/thread/1709784/how-do-i-submit-a-game-correction)). For each one: enter the value from §2, paste the matching justification into the notes/comment box, submit.
   - Suggested order (highest-value, least-contestable first): 2.3 typo → 2.1 designer → 2.6 mechanisms → 2.5 family → 2.4 description → 2.2 alternate names → 2.7 year (if chosen).
   - Submit them as separate corrections (they are separate fields anyway); if one is declined the others are unaffected.
4. **Add the Web Link** (§3): scroll to the **Web Links** module on the game page → **Add Link** → fill URL/title/category → submit.
5. **Track approval.** Corrections and links enter admin/GeekMod queues; you can watch your own pending submissions via the pending-queues pages ([BGG Pending Queues for Users](https://boardgamegeek.com/wiki/page/BGG_Pending_Queues_for_Users)). New content is often approved "within a few days" per the [How To Add Content wiki](https://boardgamegeek.com/wiki/page/How_To_Add_Content), but correction-queue timing varies — sometimes weeks (see e.g. this user thread: [Is the corrections queue moving?](https://boardgamegeek.com/thread/3455460/is-the-corrections-queue-moving)). Do not resubmit while pending.
6. **If something is declined:** admins sometimes decline with a note. Read it, adjust once if there's a clear fix, otherwise let it go. Never argue in corrections; the entry still ends up better than it started.
7. **Afterwards (optional, any time):** upload an owner-taken photo of a real hand-drawn dama board with bottle caps to the entry's gallery (traditional-play imagery the entry currently lacks — its only image is the 2023 edition's box), and rate the game from the account.

**Total owner time estimate:** 30–45 minutes for steps 1–4.

---

## 5. What this buys us (SEO context)

- A completed BGG entry is a high-authority, permanently-linkable reference for the exact entity "Filipino Dama" — useful for entity SEO ("Filipino Dama (Filipino checkers / dama)") even though BGG outbound web links are typically nofollow; the value is discovery, entity corroboration, and referral traffic from the most-trusted board-game database.
- The Web Link is the only place filipinodama.com appears; everything else in this plan is genuine encyclopedic contribution, which is both the ethical posture and the one BGG's mods reward.

---

## Sources

- Entry data (fetched 2026-07-19, HTTP 200): `https://api.geekdo.com/api/geekitems?objectid=430395&objecttype=thing` (and the same endpoint for objectids 2083, 26920) — public page: [Filipino Dama on BGG](https://boardgamegeek.com/boardgame/430395/filipino-dama)
- [Checkers (2083)](https://boardgamegeek.com/boardgame/2083/checkers) · [Turkish Checkers (26920)](https://boardgamegeek.com/boardgame/26920/turkish-checkers) · [Traditional Games: Checkers / Draughts family](https://boardgamegeek.com/boardgamefamily/96/traditional-games-checkers-draughts) · [Country: Philippines family](https://boardgamegeek.com/boardgamefamily/11603/country-philippines)
- [(Uncredited) designer placeholder](https://boardgamegeek.com/boardgamedesigner/3/uncredited) · [(Public Domain) publisher placeholder](https://boardgamegeek.com/boardgamepublisher/171/public-domain)
- Process wikis (bot-blocked; cited from indexed snippets + linked for the owner to read logged-in): [Guide to Database Corrections](https://boardgamegeek.com/wiki/page/Guide_to_Database_Corrections) · [How To Add Content](https://boardgamegeek.com/wiki/page/How_To_Add_Content) · [Link Submissions](https://boardgamegeek.com/wiki/page/Link_Submissions) · [One Thing Add Link](https://boardgamegeek.com/wiki/page/One_Thing_Add_Link) · [BGG Pending Queues for Users](https://boardgamegeek.com/wiki/page/BGG_Pending_Queues_for_Users) · [New Game Submission Guideline](https://boardgamegeek.com/wiki/page/New_Game_Submission_Guideline)
- Forum threads: [How do I submit a game correction?](https://boardgamegeek.com/thread/1709784/how-do-i-submit-a-game-correction) · [Is the corrections queue moving?](https://boardgamegeek.com/thread/3455460/is-the-corrections-queue-moving)
- Alternate-name usage evidence: [Filipino Checkers / Dama (Google Play)](https://play.google.com/store/apps/details?id=mkisly.checkers.filipino) · [Philippine Checkers (playculturalgames.com)](https://playculturalgames.com/filipino-dama/)
- Publisher edition page (for context; its "600-year-old" marketing claim is unverified — not used): [NewVenture Games — Filipino Dama](https://newventuregames.com/products/filipino-dama)
- Related media noted in §1.3: [BGG video 477627 (filed under Checkers)](https://boardgamegeek.com/video/477627/checkers/filipino-dama-is-sort-of-a-melting-pot-game-of-che) · [same video on YouTube](https://www.youtube.com/watch?v=Ch8ZHQcGm5o)
- Rules content in the §2.4 description: engine-verified rules from filipinodama.com (`apps/web/src/features/learn/RulesGuide.tsx` in this repo).
