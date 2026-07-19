# Wikidata Item Plan: "Filipino dama" (Filipino checkers / dama)

Research date: 2026-07-19. All Q-numbers and P-numbers below were verified live against the
Wikidata API (`wbsearchentities` / `wbgetentities`) on that date. Anything NOT verified is
flagged explicitly.

---

## 1. Existing-item findings

### 1.1 No item exists for Filipino dama

Searched `wbsearchentities` (English) for "Filipino dama", "dama checkers", "Filipino
checkers" — **zero results** for each. Searched in Tagalog (`language=tl`) for "dama" — the
only board-game hit is Q1293 (checkers itself, which carries "Dama" as its Tagalog
label/alias). The Tagalog Wikipedia article [tl:Dama](https://tl.wikipedia.org/wiki/Dama)
("Ang dama ay pangalan ng ilang mga iba't ibang larong tabla") is sitelinked to **Q1293**,
not to a Philippine-variant item (verified via `prop=pageprops` → `wikibase_item: Q1293`).

**Conclusion: a new item must be created.**

### 1.2 Related items (verified IDs and current state)

| Item | ID | URL | Notes |
|---|---|---|---|
| checkers / draughts (the game) | **Q1293** | https://www.wikidata.org/wiki/Q1293 | Label "checkers", description "board game". "Draughts" and Tagalog "Dama" resolve here. **The task's candidate Q188572 is WRONG** — Q188572 is "fact" (epistemology), not draughts. |
| Variants of draughts (class) | **Q2796140** | https://www.wikidata.org/wiki/Q2796140 | Subclass of game variant + board game; facet of (P1269) checkers; sport (P641) checkers. This is the class Wikidata uses as the P31 value for national variants. |
| board game | **Q131436** | https://www.wikidata.org/wiki/Q131436 | Used as a second P31 on some variant items (e.g. Spanish Checkers). |
| Damath | **Q25339298** | https://www.wikidata.org/wiki/Q25339298 | **Exists but is nearly empty**: description "two-player educational board game", one enwiki sitelink, a Freebase ID, and **no P31 at all**. See §5 for suggested improvements. |
| traditional games in the Philippines | **Q7832341** | https://www.wikidata.org/wiki/Q7832341 | Item for the enwiki article "Traditional games in the Philippines"; that article has a Board games section that covers dama. |
| Philippines | **Q928** | https://www.wikidata.org/wiki/Q928 | Target for country of origin (P495). |
| Turkish draughts (model item) | **Q1117085** | https://www.wikidata.org/wiki/Q1117085 | The best modeling template: P31 = Q2796140, P279 = Q1293, P1872/P1873 = 2 players, P18 image, P373/P910 categories, BGG ID (P2339). |
| Spanish Checkers (model item) | **Q84342700** | https://www.wikidata.org/wiki/Q84342700 | Closest relative (Filipino dama descends from Spanish damas). Notably it survives on Wikidata with **only a German Wikipedia sitelink** and just a BGG ID + Google KG ID — precedent that a draughts variant without an enwiki article is acceptable. |

### 1.3 External identifier found

- **BoardGameGeek has a dedicated "Filipino Dama" board game page, ID 430395**:
  https://boardgamegeek.com/boardgame/430395/filipino-dama — surfaced by web search with the
  literal title "Filipino Dama | Board Game | BoardGameGeek". Direct page fetch is blocked to
  bots (HTTP 403; the XML API also returned 401), so **open this URL in a browser and confirm
  the ID before entering it**. If confirmed, it becomes both an identifier (P2339) and the
  strongest third-party reference for the item.

### 1.4 Usable published sources (verified to say what is claimed)

1. English Wikipedia, [Damath](https://en.wikipedia.org/wiki/Damath): "Damath is a two-player
   educational board game combining the board game 'Dama' (Filipino checkers) and math."
   Confirms dama = Filipino checkers as an established referent, and the Damath→dama
   derivation.
2. English Wikipedia, [Traditional games in the Philippines](https://en.wikipedia.org/wiki/Traditional_games_in_the_Philippines):
   "Dama is a game with leaping captures played in the Philippines. It is similar to draughts
   or checkers." **Caution:** this article's dama section describes play on a small grid
   (fetched summary mentioned a 5x5 board) that does not match the standard 8x8 Filipino dama
   our site documents. Cite it only for "dama is a traditional Philippine game similar to
   checkers", not for board-format claims.
3. BoardGameGeek page above (pending on-page confirmation).

Wikipedia is citable as a Wikidata reference in practice (via "reference URL"), but it does
not itself count as a "serious reference" for notability; the BGG entry (once confirmed on the
live page, §1.3) is the stronger leg. Published Damath literature may also describe dama as a
Filipino checkers game, but **no specific publication was located or verified in this
session** (see §6) — do not cite "Damath literature" anywhere until a concrete source with a
URL is in hand.

---

## 2. Notability assessment (honest)

Wikidata's bar ([WD:N](https://www.wikidata.org/wiki/Wikidata:Notability)) is met if ANY of:
(1) a sitelink, (2) "a clearly identifiable conceptual or material entity, described by
serious and publicly available references", (3) structural need.

- Criterion 1: not available today — no Wikipedia article in any language is dedicated to
  Filipino dama specifically (the tl article covers dama generically and points at Q1293).
- Criterion 2: **arguable pass.** BGG dedicated entry (once confirmed, §1.3) + mentions in
  two enwiki articles. This is at least as much as Spanish Checkers (Q84342700) has. Damath
  educational literature could add a further leg, but no specific publication was verified in
  this session (see §6) — do not lean on it until one is cited.
- Criterion 3: **genuine structural need.** Damath (Q25339298) is an existing item whose
  defining property "based on (P144) → dama (Filipino checkers)" currently has no possible
  target. Creating this item fixes a real gap in the graph.

Risk: low-to-moderate. A patroller could still nominate it for deletion as "variant already
covered by Q1293". The counter is the Turkish/Spanish precedent + the Damath structural link.
Add the references at creation time, not later.

---

## 3. Ready-to-enter item draft

### 3.1 Terms (labels / descriptions / aliases)

**Language-code reality check:** `fil` is NOT a valid Wikidata term language — the API
rejects it ("Unrecognized value for parameter language: fil", verified 2026-07-19). Wikidata
uses **`tl` (Tagalog)** for Filipino-language terms. The "fil" terms requested by the task
are therefore entered under `tl` below.

| Field | en | tl (Tagalog) |
|---|---|---|
| Label | Filipino dama | dama |
| Description | variant of draughts played in the Philippines | larong tabla na bersiyon ng dama (checkers) na nilalaro sa Pilipinas |
| Aliases | Filipino checkers; Philippine draughts; Philippine checkers; dama | damang Pilipino |

Notes:
- The en description deliberately mirrors Turkish draughts' "variant of draughts played in
  the Mediterranean and Middle East" house style.
- The tl label "dama" does not collide with Q1293: Wikidata only forbids identical
  label+description pairs, and the descriptions differ. (Q1293's tl label is also "Dama".)
- The Tagalog description/alias strings are my drafting, not copied from a source — **have a
  Filipino speaker (the owner) sanity-check the tl wording before entry.**

### 3.2 Statements (all P/Q IDs verified)

| # | Property | Value | Reference | Notes |
|---|---|---|---|---|
| 1 | instance of (P31) | Variants of draughts (Q2796140) | reference URL (P854) = https://en.wikipedia.org/wiki/Damath ; retrieved (P813) = entry date | Same modeling as Turkish draughts Q1117085. |
| 2 | instance of (P31) | board game (Q131436) | same as #1 | Second P31, matching Spanish Checkers Q84342700. |
| 3 | subclass of (P279) | checkers (Q1293) | P854 = https://en.wikipedia.org/wiki/Traditional_games_in_the_Philippines ; P813 = entry date | Same as Turkish draughts. |
| 4 | country of origin (P495) | Philippines (Q928) | P854 = https://en.wikipedia.org/wiki/Traditional_games_in_the_Philippines ; P813 = entry date | Colonial-era Spanish descent is real but "origin = Philippines" is the correct claim for THIS variant. |
| 5 | minimum number of players (P1872) | 2 | none needed (Turkish draughts carries these unreferenced) | |
| 6 | maximum number of players (P1873) | 2 | none needed | |
| 7 | BoardGameGeek ID (P2339) | 430395 | identifiers need no reference | **Confirm the ID on the live BGG page first (see §1.3).** |
| 8 | based on (P144) | Spanish Checkers (Q84342700) | **only if a citable source states the descent** | OPTIONAL. Our site says dama descends from Spanish damas; I did not verify an independent published source making this exact claim. Skip unless you can cite one (e.g. a draughts-history reference). Do not source it to filipinodama.com alone. |
| 9 | different from (P1889) | Damath (Q25339298) | none needed | OPTIONAL but cheap conflation-guard. |
| 10 | image (P18) | — | — | OPTIONAL. Only if a freely-licensed photo of a dama board/bottle-cap set exists on Wikimedia Commons or the owner is willing to upload one under CC-BY-SA. None verified to exist today. |

Reference recipe per statement: click "add reference" → reference URL (P854) = source URL,
retrieved (P813) = the date you enter it; optionally title (P1476) and language of work or
name (P407) = English (Q1860 — **Q1860 not re-verified in this session; check before use**).
Once the BGG ID is confirmed, prefer adding the BGG URL as an additional P854 reference on
statements 1–4.

### 3.3 Official website (P856) — the honest answer

**Do NOT add P856 = https://filipinodama.com to this item.**

- P856 means "URL of the official homepage of the item's subject". A traditional public-domain
  game has no owner and therefore no official website. On a traditional-game item the claim
  would be factually wrong, and coming from the site operator it reads as linkspam — the
  likely outcome is a revert plus heightened scrutiny of the whole item, the opposite of the
  goal.
- Semi-legitimate alternative: **described at URL (P973) = https://filipinodama.com/learn**
  (the rules guide genuinely describes the subject). This is defensible but still
  self-interested; if used, keep it to the /learn page (informational, not the marketing
  homepage), and only after the item is established with neutral references. Moderate revert
  risk. Owner's call — flagged in Notes below.
- The fully legitimate home for P856 = filipinodama.com is a **separate item for the web
  game/software** ("Filipino Dama (video game)", P31 = video game/web application, developer,
  etc.). That item must independently meet WD:N criterion 2 — serious, publicly available,
  independent references about the product. As a beta with testers and no independent press
  coverage, **it does not clear that bar today**. Recommendation: defer until there is real
  third-party coverage, then create it and link the two items.

---

## 4. Step-by-step creation instructions

1. **Account.** Log in to Wikidata (any registered account can create items; anonymous IPs
   cannot). Use a personal account, not a brand account named after the site.
2. **Duplicate check (do this the same day).** Re-run the searches: en "Filipino dama",
   "Filipino checkers", "Philippine draughts"; tl "dama". Confirm still no dedicated item.
3. **Confirm the BGG ID.** Open https://boardgamegeek.com/boardgame/430395/filipino-dama in a
   browser; confirm the title and numeric ID.
4. **Create.** Go to https://www.wikidata.org/wiki/Special:NewItem. Enter the English label,
   description, and aliases from §3.1.
5. **Add Tagalog terms.** On the new item, expand "All entered languages" (or use
   Special:SetLabelDescriptionAliases with language `tl`) and enter the tl label,
   description, and alias.
6. **Add statements 1–7** from §3.2, in order, attaching the references as described in the
   reference recipe. Add 8–10 only per their conditions.
7. **Add the structural link from Damath.** On Q25339298 add based on (P144) → the new item,
   referenced with P854 = https://en.wikipedia.org/wiki/Damath (the article's first sentence
   states the derivation). This is the structural-need anchor — do it immediately, it is the
   item's best defense.
8. **Watchlist the item** for ~4 weeks. If anyone opens a deletion discussion, respond with:
   the BGG entry, the two enwiki mentions, the Damath structural need (Q25339298 needs this
   item as its P144 target), and the Q84342700/Q1117085 precedent. Cite Damath educational
   literature only if you have a specific publication URL in hand — none was verified in this
   session (see §6), and an uncitable claim will sink the defense.
9. **Do not** mass-add filipinodama.com links anywhere else on Wikidata, and do not edit the
   enwiki articles to insert the site. One clean, well-referenced item is the whole play.

### Suggested edit summary for creation

`Creating item for Filipino dama (Philippine draughts variant); modeled on Q1117085/Q84342700; structural target for Q25339298 (Damath) P144`

---

## 5. Bonus (optional, high-goodwill): repair the Damath item

Q25339298 currently has **no P31 and no country**. Uncontroversial, well-sourced additions
(all citable to https://en.wikipedia.org/wiki/Damath):

- instance of (P31) → board game (Q131436)
- country of origin (P495) → Philippines (Q928)
- based on (P144) → the new Filipino dama item (step 7 above)
- discoverer or inventor (P61) → Jesus Huenda — **only if** a Q-item for Huenda exists or is
  independently notable; do NOT create a person-item just for this. (P61 verified as the
  correct property; the person-item was not searched for in this session.)

Making a neutral, sourced improvement to an existing Philippine-games item before/alongside
creating ours is both genuinely useful and establishes the account as a good-faith editor.

---

## 6. Verification log

| Claim | How verified |
|---|---|
| No Filipino-dama item exists | `wbsearchentities` en: "Filipino dama", "dama checkers", "Filipino checkers" → all `search: []`; tl "dama" → only Q1293 game hit |
| Q188572 is NOT draughts | Fetched https://www.wikidata.org/wiki/Q188572 → label "fact" |
| Q1293 = checkers; Q928 = Philippines; Q131436 = board game; Q2796140 = Variants of draughts | `wbgetentities` labels/descriptions |
| Q25339298 = Damath, near-empty | Fetched item page: Freebase ID only, 1 enwiki sitelink, no P31 |
| Q7832341 = traditional games in the Philippines | `wbsearchentities` |
| Q1117085 / Q84342700 modeling patterns | Fetched both item pages |
| All P-numbers in §3 (P31, P279, P495, P856, P18, P373, P910, P1872, P1873, P2339, P641, P1269, P143, P248, P854, P813, P1476, P407, P973, P1889, P144, P61) | `wbgetentities` props=labels |
| `fil` invalid / `tl` valid term language | API error `badvalue` for fil; tl searches succeeded |
| tl:Dama sitelinks to Q1293 | tl.wikipedia API `prop=pageprops` |
| BGG Filipino Dama ID 430395 | Web-search result title + URL only; **page fetch blocked (403) — confirm in browser before entering** |
| enwiki quotes in §1.4 | Fetched both articles; sentences quoted as returned |

Not verified (flagged inline): Q1860 = English (for P407 in references); existence of a
Jesus-Huenda person item; any published source for the Spanish-damas descent claim (P144 on
our item); the BGG page contents; Commons imagery; any specific published Damath-literature
source describing dama as a Filipino checkers game (no publication was located or checked in
this session — the notability case in §2 and the deletion-defense script in §4 step 8
deliberately do not rely on it).
