# FilipinoDama Royal — v2 → v3 Change Inventory

Source files:
- OLD: `handoffv2/FilipinoDama Royal.dc.html` (555,399 bytes)
- NEW: `handoffv3/FilipinoDama Royal.dc.html` (575,374 bytes)

Method: split each file at the `<script type="text/x-dc">` boundary into a markup "shell" (HTML/CSS, ~3,300 lines) and a "script" (JS class body, ~2,000 lines, already pretty-printed with real newlines). Folded the shell on `><` tag boundaries and diffed both parts line-for-line. Cross-checked: `data-screen-label` set (identical, no screens added/removed), CSS `<style>` block (byte-identical, 6,551 chars in both), `<head>`/meta (identical), and full `fdr.*` localStorage key inventory and method-name inventory extracted independently from the diff hunks to confirm nothing was missed. No screens were added or removed; no CSS/visual-theme changes; all changes are additive features layered onto existing screens plus a handful of behavioral/persistence fixes.

---

## A. Global / Topbar

**[ROW 1]** | Topbar (all screens) | Added | New "Search players" icon button in the topbar, before the notification bell | `<button onClick="{{ openGlobalSearch }}" title="Search players" ...>🔍</button>` — 40×40px pill button, gold-lt icon color, opens the new Global Player Search modal | Shell diff line 126 (insert after main nav topbar actions, before notif bell)

**[ROW 2]** | Global Player Search (new modal) | Added | Brand-new full-screen-overlay modal: search players by name/tag, view results, click through to Friend Profile | Structure: header with 🔍 icon + input (`placeholder="Search players by name or tag…"`) + close (✕) button; results list (avatar, name, tag, tier, rating, "View ›"); empty state "No players found" / "Try a different name or tag." | Shell diff lines 3206–3239 (`<!-- Global player search -->` block, inserted after Add Friend modal, before Avatar Picker modal), z-index 94

**[ROW 3]** | Global Player Search (logic) | Added | New state/methods: `openGlobalSearch()`, `closeGlobalSearch()`, `_playerPool()` (22-player fake directory), live-filtered `gsResults`/`gsHasResults`/`gsNoResults` computed from `gsQuery` | Search matches on `name` or `tag` substring (case-insensitive), capped to 20 results; clicking a result closes the modal and opens that player's Friend Profile via `openFriendProfile()` | Script diff lines 101–103 (render-time render props), lines 468–493 (`openGlobalSearch`, `closeGlobalSearch`, `_playerPool` definitions)

---

## B. Matchmaking Screen

**[ROW 4]** | Matchmaking (opponent-found state) | Added | New "Playing on {device}" line under the opponent's badge, once a match is found | `<span>{{ mmOppDevice.icon }}</span><span>Playing on {{ mmOppDevice.label }}</span>` (e.g. "📱 Playing on Mobile", "💻 Playing on Web", "▤ Playing on Tablet") | Shell diff lines 558–561 (inserted after opponent badge block, `mmSearching` sibling)

**[ROW 5]** | Matchmaking pool data | Modified | Each seeded matchmaking opponent (`Bagani`, `Diwata`, `Sultan`, `Mandirigma`, `Babaylan`, `Ermitanyo`, etc.) now carries a `device` field (`mobile` / `web` / `tablet`) | Example: `{name:'Bagani',...,device:'mobile'}`, `{name:'Diwata',...,device:'web'}`, `{name:'Sultan',...,device:'tablet'}` | Script diff lines 21–34 (opponent pool literal)

**[ROW 6]** | Matchmaking device mapping/render | Added | New `_devMap` lookup and `mmOppDevice` computed value | `_devMap={mobile:['Mobile','📱'],web:['Web','💻'],tablet:['Tablet','▤']}`; `mmOppDevice` derived from `s.mmOpp.device` (defaults to `web`) | Script diff lines 202–203 (helper), line 207 (added to render props alongside `mmYouBadge, mmOppBadge`)

---

## C. Leaderboard

**[ROW 7]** | Leaderboard podium (top 3) | Modified | Podium tiles are now clickable — open the clicked player's Friend Profile | `<div class="frame" onClick="{{ p.open }}" ...;cursor:pointer">` (was static, no onClick/no cursor) | Shell diff lines 9–11 (`1117c1122`)

**[ROW 8]** | Leaderboard ranks table (rows) | Modified | Each leaderboard row is now clickable — opens that player's Friend Profile | `<div onClick="{{ r.open }}" ...;cursor:pointer">` (was static) | Shell diff lines 13–15 (`1137c1142`)

**[ROW 9]** | Leaderboard data binding | Added | Podium entries (`lbPodium`) and rank rows (`lbRanks`) now each carry an `open` callback wired to `openFriendProfile({name, tier, rating, status:'online'})` | For podium: `open:()=>this.openFriendProfile({name:..., tier, rating, status:'online'})`. For table rows the "(You)" row also gets an `open`, using the un-suffixed name | Script diff lines 158–165 (`900`/`905` and `912` region — `lbPodium`/`lbRanks` mapping)

---

## D. Tournament Detail (Bracket)

**[ROW 10]** | Tournament bracket match cards | Modified | Completed/final bracket matches are now clickable to watch a simulated replay; in-progress matches remain non-interactive | `<div class="frame" onClick="{{ m.watch }}" ...;cursor:{{ m.cursor }}">` — cursor is `pointer` when `m.final` (done) else `default` | Shell diff lines 17–19 (`2154c2159`)

**[ROW 11]** | Tournament bracket match cards | Added | New "▶ WATCH REPLAY" footer strip shown only on completed (`m.final`) bracket matches | `<sc-if value="{{ m.final }}">...▶ WATCH REPLAY...</sc-if>` — gold-tinted footer band, centered, uppercase, 10px | Shell diff lines 20–23 (`2164a2170,2172`)

**[ROW 12]** | Tournament bracket data/logic | Added | `watchTourReplay(a, b, win)` — simulates a full game (up to 50 attempts to match the recorded winner) and opens it in the Replay viewer via `openReplay(rec)` with a synthetic record (`mode:'Tournament Final'`, `finalA`/`finalB` player names attached) | Bracket match mapping restructured from a plain arrow-fn map to a block returning `{..., final:watchable, cursor:watchable?'pointer':'default', watch:watchable?(()=>this.watchTourReplay(m.a,m.b,m.win)):null}` | Script diff lines 143–151 (`_tourRounds`-style mapper + new `watchTourReplay` method)

---

## E. Guild Screen

**[ROW 13]** | Guild roster row | Modified | Guild member rows are now clickable — opens that member's Friend Profile (except your own row) | `open:m.you?null:()=>this.openFriendProfile({name:m.name, status:m.status, src:m.src, tier:'Diamond'})` added to each roster entry | Script diff lines 184–186 (`guildRoster` mapping)

**[ROW 14]** | Guild roster row (markup) | Modified | Member row div gains `onClick="{{ m.open }}"` and `cursor:pointer` (was `<div style="flex:1;min-width:0">`, static) | Confirms wiring for Row 13 | Shell diff lines 25–27 (`2537c2545`)

**[ROW 15]** | Guild creation — emblem picker | Modified (breaking) | Guild emblem selection changed from a 4-color CSS-gradient tile system to real emblem image assets shared with the existing avatar-frame "Guild Emblem" picker (`_GEMBLEMS`) | Old: `gcGrads` (4 CSS radial-gradient strings) + `gcTile()` glyph-based div renderer + `gcEmblem:i` (index) state. New: reuses `_GEMBLEMS` array (same one used elsewhere for equip-emblem), renders real `<img>` thumbnails, stores `gcEmblemSrc` (image path) instead of a numeric index | Script diff lines 188–200 (`gcGrads`/`gcTile`/`gcEmblems` block fully replaced)

**[ROW 16]** | Guild creation — submit | Modified | `submitGuildCreate()` now actually persists the created guild's name/description/emblem into app state (`guildName`, `guildDesc`, `guildEmblem`) instead of discarding the form data on submit | Old only cleared form fields and showed a toast; new sets `guildName:nm, guildDesc:(gcDesc||'').trim(), guildEmblem:emb` (emb = `gcEmblemSrc` or fallback `'uploads/me-guild.png'`) before clearing the form | Script diff lines 129–131 (`submitGuildCreate`)

---

## F. Friends Screen

**[ROW 17]** | Friends — Online list | Modified | Friend avatar (not just the name/status block) is now also clickable to open the Friend Profile | `<div onClick="{{ f.openProfile }}" style="position:relative;flex:none;cursor:pointer">{{ f.avatarEl }}...` (avatar div previously had no onClick) | Shell diff lines 29–31 (`2877c2885`)

**[ROW 18]** | Friends — Offline list | Modified | Same avatar-click wiring applied to the Offline friends list | `<div onClick="{{ f.openProfile }}" ...;cursor:pointer">{{ f.avatarEl }}...` | Shell diff lines 33–35 (`2911c2919`)

---

## G. Add Friend Modal

**[ROW 19]** | Add Friend — suggested players list | Modified | Suggested-player avatar and name/info block are now clickable, opening that suggested player's Friend Profile (previously the row had no click target at all besides the explicit Add button) | `<div onClick="{{ p.open }}" style="flex:none;cursor:pointer">{{ p.avatarEl }}</div>` and `<div onClick="{{ p.open }}" style="flex:1;min-width:0;cursor:pointer">` | Shell diff lines 72–76 (`3223,3224c3265,3266`)

**[ROW 20]** | Add Friend — suggested players data | Added | Each suggested-player entry now carries `open:()=>this.openFriendProfile({name:p.name, src:p.src, tier:p.tier, status:'online', note:p.mutual})` | Wires Row 19 | Script diff line 175 (`1053a1098`)

---

## H. Friend Profile Modal

**[ROW 21]** | Friend Profile modal | Added | Major new content block inserted between "Recent Form" and the "Friends since" footer: **Guild** + **Favorite Move** stat tiles (2-up row), **Match Replays** list (with per-match ▶ Replay button), **Badges & Achievements** (pill chips), **Favorite Openings** (progress-bar list) | Full markup block — 4 new labeled sections with their own `sc-for` loops (`friendProfile.recentMatches`, `friendProfile.badges`, `friendProfile.openings`) | Shell diff lines 78–125 (`3438a3481,3528`)

**[ROW 22]** | Friend Profile — data generation | Added | New deterministic-per-name (seeded by char-code sum of the friend's name) generated fields: `recentMatches` (4 fake matches w/ result, mode, delta, watch handler), `badges` (2–4 badge labels from a 6-item pool), `openings` (2 favorite openings w/ %), `guildName`/`guildTag` (from 5-item pools), `favoriteMove` (`_fp.fav` fallback `'Diagonal Advance'`) | e.g. `badges` pool: `['Season Veteran','Untouchable','Guild Champion','Rapid Ace','Comeback King','Capture Master']`; `openings` pool: `['Diagonal Advance','Central Wall','Edge Creep','Double Corner','Mill Trap']`; guild pool: `['Dama Kings','Pinoy Warriors','Luzon Elite','Visayas Vanguard','Mindanao Masters']` w/ tags `['#DK','#PW','#LE','#VV','#MM']` | Script diff lines 176–182 (`1081a1127,1132`)

**[ROW 23]** | Friend Profile — watch replay | Added | New `watchReplay(m)` method: simulates a full game (up to 40 attempts) matching the recorded result (`m.res==='W'`), builds a synthetic match record, closes the Friend Profile modal, and opens the Replay viewer | `watchReplay(m){ const want=(m&&m.res==='W'); ... this.setState({friendProfile:null}); this.openReplay(rec); }` | Script diff line 100 (`452a468,493` region)

**[ROW 24]** | Friend Profile — open logic | Modified | `openFriendProfile(f)` substantially rewritten: now generates full deterministic profile defaults (rating, tier, wins/losses, streak, favorite move, recent form, online status, avatar, "since" year) from just a name, guarding against missing/invalid input (`if(!f||!f.name) return`) | Old version simply did `this.setState({friendProfile:f})` with whatever was passed in (relied on callers to supply complete data). New version computes a `seed` from the name's char codes and fills in any missing fields via `Object.assign(defaults, f)` | Script diff line 99 (`451c465,466`)

---

## I. Live/Watch (Spectate)

**[ROW 25]** | Live matches list | Modified | Live match viewer counts now reflect real-time bumps from watching (persisted), not just the static seed count | `viewersLabel:(m.viewers+(this._readViewers()[m.id]||0)).toLocaleString()` (was `m.viewers.toLocaleString()` only) | Script diff lines 212–214 (`1883c1935`)

**[ROW 26]** | Spectate screen — viewer count | Modified | The "currently watching" viewer count on the Spectate screen is now derived from the actual live match's base viewers + locally-tracked bump, keyed by match id, instead of a fake formula based on ply count | Old: `spectViewers:'1,'+(200+(_sPly*7)%700)` (fake, ply-derived). New: looks up the real match via `_liveMatches()` by id, adds `_readViewers()[id]`, formats with `.toLocaleString()` | Script diff lines 216–218 (`1894c1946`)

**[ROW 27]** | Live matches — synced private room | Added | If the player has an active private room open (from the Room screen) that allows spectators and isn't locked, it now appears at the top of the "Live matches" watch list as a synthetic entry | `if(synced){ ...base.unshift({id:'room-'+code, red:host, redR:'1,340', blue:guest, blueR:'1,290', mode:(mode==='Ranked'?'Ranked':'Private'), moves:24, viewers:spectators.length||1, synced:true}); }` | Script diff lines 87–94 (`_liveMatches()` rewritten to build `base` array then conditionally unshift the synced room)

**[ROW 28]** | Live/watch — viewer persistence | Added | New `_readViewers()` / `_bumpViewer(id, delta)` helpers backed by new localStorage key `fdr.liveViewers` (a map of matchId → delta count) | Called on entering (`+1`) and leaving (`-1`) a spectated match | Script diff lines 76–77 (helper defs), 78–79 (`watchLiveMatch` bump-on-enter), 82–83 (`leaveSpectate` bump-on-leave)

**[ROW 29]** | Watch match — id tracking | Modified | `watchMatch(m)` now includes `id:m.id` in the `spectMeta` it sets, so the viewer-bump/lookup logic can key off it | `this.setState({spectMeta:{id:m.id,red:m.red,blue:m.blue,redR:m.redR,blueR:m.blueR}})` (id field is new) | Script diff line 95 (`399,400c411,414` region)

---

## J. Room / Private Match (Cross-Device Sync)

**[ROW 30]** | Private Room | Added | Rooms now persist to localStorage (`fdr.room`) and can be **rejoined across page reloads / devices** — if a synced room exists and is recent (<15 min old), entering the Room screen resumes it instead of creating a fresh one | New `_syncRoom()` (writes room state: code, mode, time, moveTimer, locked, allowSpec, host, guest, spectators, origin, timestamp) and `_clearRoom()` (removes the key on leave/start) | Script diff lines 36–37 (helper defs), 39–40 (rejoin-on-entry logic with system chat message "Rejoined your synced room…")

**[ROW 31]** | Private Room — settings sync | Modified | Every room mutation (create, mode toggle, time toggle, move-timer toggle, lock toggle, spectator toggle, guest join/leave/ban, spectator kick) now calls `_syncRoom()` in its `setState` callback so changes propagate to the persisted record | Applies to: `createRoom`, `toggleAllowSpec`(on/off), `toggleRoomLock`, `removeGuest`, `banGuest`(?), `kickSpectator`, `roomModes`/`roomTimes`/`roomMoveTimers` selectors, guest-join timeout | Script diff lines 42–70 and 132–141 and 171–173 (~10 call sites, each adding `,()=>this._syncRoom()` to an existing `setState` call)

**[ROW 32]** | Private Room — leaving/starting | Modified | `leaveRoom()` and `startRoomMatch()` now call `_clearRoom()` to remove the synced room record when the room is abandoned or the match actually starts | Was previously just local state reset with no localStorage cleanup | Script diff lines 137–141 (`499,500c540,541`)

---

## K. Profile — Frame Equip Persistence

**[ROW 33]** | Player Profile — equipped frame | Added (bug fix / persistence gap closed) | Equipped profile frame (`equipFrame`) is now loaded from and saved to `fdr.profile` (was previously session-only / lost on reload) | `_loadProfile()` now maps a stored `myFrame` path back to a display name via `F2N` lookup; `_saveProfile()` now maps the display name back to a path via `N2F` and writes `myFrame` into the saved profile object; initial `state.equipFrame` is computed from `this._prof.myFrame` on load | Script diff lines 4 (init), 16–20 (`_loadProfile`/`_saveProfile` rewrite), 156–157 (frame `equip` handler now also calls `this._saveProfile()`)

**[ROW 34]** | Frame name/path map | Added | New two-way lookup tables `F2N` (path→display name) and `N2F` (display name→path) covering: `''`→`'None'`, `uploads/laurel.png`→`'Golden Laurel Frame'`, `uploads/frames/silver.png`→`'Silver Knight Frame'`, `uploads/frames/obsidian.png`→`'Obsidian Sovereign Frame'` | Used bidirectionally so the frame persists correctly across reloads | Script diff lines 4, 19–20

---

## L. Wallet (Gold/Diamonds) Persistence

**[ROW 35]** | Player wallet — gold/diamonds/owned items | Added (persistence gap closed) | Gold, Diamonds, and owned-items list are now persisted to a new localStorage key `fdr.wallet` and restored on load, instead of always resetting to hardcoded seed values (`gold:12500, diamonds:1500, owned:['Imperial Dragon Pieces']`) every session | New `_wallet` loader (constructor-time), `_saveWallet()` writer, and `componentDidUpdate` hook that auto-saves whenever `gold`, `diamonds`, or `owned` change | Script diff lines 4–5 (`_wallet`/`_saveWallet` defs), 6 (state init now reads from `_wallet`), 12 (mount calls `_saveWallet()`), 14 (`componentDidUpdate` auto-save trigger)

**[ROW 36]** | Real-money top-up receipts → order history sync | Added | New `_syncTopupOrders()` reconciles any Apple-Pay/App-Store top-up receipts recorded in localStorage (`fdr.topupReceipts`, presumably written by a native/webview shell or the payment flow) into the player's visible Purchase History (`orders`), de-duplicated by `orderId`, capped to the 60 most recent, sorted newest-first | Synthesized order entries use label `"App Store · Apple Pay"`, item name `"{N} Diamonds"` with an optional `"(+{bonus} bonus)"` suffix | Script diff line 153 (`_syncTopupOrders` full definition); also called on mount (script diff line 12) and wired to the new `storage` event listener (script diff line 11) so it re-syncs live if another tab/webview writes a receipt

**[ROW 37]** | Cross-tab profile sync | Added | New `window.addEventListener('storage', ...)` handler: if `fdr.profile` changes in another tab/window, reloads the profile and force-updates; if `fdr.topupReceipts` changes, re-runs `_syncTopupOrders()` | Guarded to attach only once (`if(!this._onProfSync)`) | Script diff line 11

---

## Summary Table

| # | Area | Adds | Mods | Removals | Notes |
|---|------|------|------|----------|-------|
| 1 | Global Topbar / Search | 3 | 0 | 0 | New search icon + full modal + backing logic |
| 2 | Matchmaking | 2 | 1 | 0 | Opponent device indicator |
| 3 | Leaderboard | 1 | 2 | 0 | Podium + rows now clickable to profile |
| 4 | Tournament Bracket | 2 | 1 | 0 | Watch replay on completed matches |
| 5 | Guild | 1 | 3 | 0 | Roster click-through; emblem picker overhaul (breaking); create now persists |
| 6 | Friends list | 0 | 2 | 0 | Avatar now clickable (Online + Offline) |
| 7 | Add Friend modal | 1 | 1 | 0 | Suggested players clickable |
| 8 | Friend Profile modal | 2 | 1 | 0 | Guild/Move/Replays/Badges/Openings block added |
| 9 | Live / Spectate | 3 | 2 | 0 | Real viewer counts; synced private room surfaces in Live list |
| 10 | Private Room sync | 2 | 2 | 0 | Cross-device/reload room persistence (`fdr.room`) |
| 11 | Profile frame persistence | 2 | 0 | 0 | Equipped frame now survives reload |
| 12 | Wallet persistence | 3 | 0 | 0 | Gold/Diamonds/owned items now survive reload; top-up receipts sync into orders |
| **Total rows** | **37** | **22** | **15** | **0** | No removals detected; no screens added/removed; no CSS changes |

**New localStorage keys (4):** `fdr.wallet`, `fdr.room`, `fdr.liveViewers`, `fdr.topupReceipts`

**New methods (12):** `openGlobalSearch`, `closeGlobalSearch`, `_playerPool`, `_readViewers`, `_bumpViewer`, `_syncRoom`, `_clearRoom`, `_syncTopupOrders`, `_saveWallet`, `componentDidUpdate`, `watchReplay`, `watchTourReplay`

**Modified method signature:** `openReplay(id)` → `openReplay(idOrRec)` (now accepts either a match-history id or a full synthetic match record object, to support the two new replay-from-simulation flows)

**No changes:** `data-screen-label` set (identical between v2/v3 — no screens added or removed), `<style>` CSS block (byte-identical), `<head>`/meta block (identical).
