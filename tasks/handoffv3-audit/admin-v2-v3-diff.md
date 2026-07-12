# Admin Console — handoffv2 vs handoffv3 Change Inventory

Source files:
- OLD: `D:\AI Projects\FilipinoDama\handoffv2\FilipinoDama Admin.dc.html` (223,902 bytes / 2,033 lines)
- NEW: `D:\AI Projects\FilipinoDama\handoffv3\FilipinoDama Admin.dc.html` (281,415 bytes / 2,339 lines)

## Method

Both files are a single `<x-dc>` "design comp" export: a static HTML/CSS shell (lines 1–1431 in v3 / 1–1219 in v2) containing the render template (`{{ binding }}`, `<sc-if>`, `<sc-for>` custom tags), followed by one `<script type="text/x-dc" data-dc-script>` block containing a `class Component extends DCLogic` with `state`, methods, and a `render()`-style prop builder. There is no separate JSX file — the template markup and the JS logic were extracted into `*_shell.html` and `*_script.js` for each version and diffed independently:
- Tag-boundary-folded diff of the render template (`old_shell_tagfold.html` vs `new_shell_tagfold.html`) → **11 hunks**, covers every new button/table column/modal/drawer.
- Statement-folded diff of the component logic (`old_script_folded.js` vs `new_script_folded.js`) → **19 hunks**, covers every new state field, method, permission check, and audit action.
- Cross-checked: sidebar `navDefs` array (labels/badges/order), `PERMS` role matrix, and the CSS `<style>` block (lines 1–35) are **byte-identical** between versions — confirmed via direct diff, zero hits.
- `fdr.*` localStorage key inventory extracted via regex over both files and diffed as sets.
- No hunk in this diff exceeded ~130 folded lines / was ambiguous enough to require `[NEEDS-MANUAL-REVIEW]`; full diff coverage was achieved (tail of both files, lines beyond the last hunk, verified byte-identical by direct sub-range diff).

**Correction to task brief:** no KYC/payout-review section and no A/B testing / feature-flag console exist in v3. Grepped `kyc`, `payout`, `a/b test`, `abtest`, `featureflag` across both files — zero matches in v2, zero in v3 (the only "feature flag" text is the pre-existing "Config & feature flags" settings tab label, unchanged). The +57KB delta is instead: (1) one new Settings sub-tab — **Payment Gateways** — and (2) a large set of feature-complete upgrades to seven *existing* sections (live top-up revenue analytics, guild roster/applications, daily-reward ladder editor, account menu + sign-out screen, global search, player live-avatar/purchase history, refund/receipt flow). Total top-level sidebar sections: still 16, unchanged.

---

## ENTIRELY NEW: Settings → Payment Gateways tab (`secPayments`)

New third Settings sub-tab, inserted between "Config & feature flags" and "API keys & integrations". Nav button copy: **"Payment gateways"**. State-gated: `s.section==='settings' && (s.settingsTab||'config')==='payments' && s.role==='SUPERADMIN'`.

**[ROW 1]** New tab button `setSettingsPay` → `settingsTab:'payments'`. Tab row order is now: Config & feature flags | **Payment gateways** | API keys & integrations.

**[ROW 2]** New state: `gateways:{ paypal:{name:'PayPal',on:true,fee:'3.9'}, stripe:{name:'Stripe',on:true,fee:'2.9'}, paymongo:{name:'PayMongo',on:true,fee:'2.5'}, xendit:{name:'Xendit',on:false,fee:'2.7'} }`, `gwTest:{}` (per-gateway `'testing'|'ok'` transient status).

**[ROW 3]** New "Gateway status & fees" card (this is new UI, distinct from the pre-existing per-gateway credential cards below it, which were relocated here — see Row 6). Heading: "Gateway status & fees". Subtext: "Toggle providers, set the processing fee, and test connectivity." For each of the 4 gateways (`sc-for list="gatewayCtl"`), a row with:
  - Name (`g.name`) + status label `● Enabled` (green `#4bd6a0`) / `○ Disabled` (muted `#8b78ad`)
  - Fee % input (`g.fee`, numeric, `%` suffix) — `onInput` → `setGatewayFee(k, value)`
  - **"Test connection"** button → `testGateway(k)`; label cycles `Test connection` → `Testing…` → `✓ Connected`; disabled-gateway test shows toast "`<Name>` is disabled — enable it first." (err); on success shows toast "✓ `<Name>` connection OK (`<80-220>`ms)." (ok) after a simulated 900 ms delay and logs `finance.gateway.test`.
  - **Enable/Disable** toggle button → `toggleGateway(k)`; logs audit action `finance.gateway` with reason "Enabled gateway" / "Disabled gateway"; toast "`<Name>` enabled." / "`<Name>` disabled."
  - Row border turns green when enabled, amber-muted when disabled.

**[ROW 4]** Relocated (not new) "Payment environment" toggle card (Live/Sandbox badge + "Applies to every gateway. Switch to Live only after sandbox testing passes." + toggle button) — previously lived directly under the Financials section tabs in v2; now lives under Settings → Payment gateways.

**[ROW 5]** Relocated (not new) full PayPal credential card: Client ID, Secret, Webhook ID, Merchant/Payer ID, Brand name ("Filipino Dama Royal"), Settlement currency select (USD/PHP/EUR/SGD), Capture mode select, SDK intent select, webhook endpoint URL (`https://api.filipinodama.com/webhooks/paypal`) with Copy button, "Send test payment" / "Save PayPal settings" buttons. All fields carry the same placeholder/demo values as v2 — unchanged copy, only relocated.

**[ROW 6]** Relocated (not new) Stripe / PayMongo / Xendit compact credential cards (publishable/secret/webhook keys, callback URLs) — identical content to v2, moved from Financials tab into this new Settings tab.

**[ROW 7]** Relocated (not new) "Diamond packs — gateway product mapping" table (Product / Price / PayPal SKU / Apple-Google ID / Status columns, `finProducts` list unchanged, e.g. "Royal Hoard $39.99 DMND_6000 diamonds.6000") — moved here from Financials tab.

Evidence (shell diff, relocation + new controls):
```
+        <button class="abtn" onClick="{{ setSettingsPay }}" style="{{ settingsPayStyle }}">Payment gateways</button>
...
+      <!-- ===== PAYMENT GATEWAYS ===== -->
+        <sc-if value="{{ secPayments }}" ...>
+        <div style="...">Gateway status &amp; fees</div>
+        <div ...>Toggle providers, set the processing fee, and test connectivity.</div>
+            <sc-for list="{{ gatewayCtl }}" as="g" ...>
+              ... <input value="{{ g.fee }}" onInput="{{ g.onFee }}" ...> ...
+              <button onClick="{{ g.test }}">{{ g.testLabel }}</button>
+              <button onClick="{{ g.toggle }}">{{ g.toggleLabel }}</button>
```

---

## ENTIRELY NEW: Financials tab — Live top-up revenue dashboard

The old Financials tab (gateway config UI + static demo KPI tiles) was gutted and replaced with a real, computed analytics dashboard driven by `fdr.purchases`. The 4 static KPI tiles (Gross revenue/Refunds/Net revenue/Payouts pending — hardcoded `$48,210` etc.) are now pushed below the new live block instead of at the top, and are otherwise unchanged/still-static placeholders.

**[ROW 8]** New "Diamond top-ups" live card (gradient blue), header: "💳 Diamond top-ups" / subtext "Live in-app purchases from the mobile wallet" / badge "Real-time". Six computed stat tiles: **Total**, **Today**, **Orders**, **Avg order**, **💎 Sold**, and conditionally **Refunds** (only shown if `hasRefunds`). All computed from `s.purchases` filtered to `kind==='topup'`.

**[ROW 9]** New "Last 7 days" bar chart (per-day $ totals, `topupChart`, 7 bars labeled 6d…Today) — only rendered when `hasTopups`.

**[ROW 10]** New "Recent top-ups" list (`topupRows`, up to 10 rows), each row clickable → opens new Receipt modal (Row 15). Shows player name+tag, order ID, amount; refunded rows show strikethrough amount + "Refunded" pill instead of amount+time+Refund button. Live (non-refunded) rows show a **"Refund"** button → `refundTopup(x)`.

**[ROW 11]** New empty state: "No wallet top-ups yet. Purchases from the mobile app appear here in real time." (shown when `noTopups`).

**[ROW 12]** New "REVENUE BREAKDOWNS" 2×2/4-panel grid (only when `hasTopups`), each a horizontal bar-list:
  - **"By pack size"** — buckets: Starter / Small / Medium / Large / Mega (thresholds: ≥3000=Mega, ≥1000=Large, ≥500=Medium, ≥200=Small, else Starter, based on diamond price).
  - **"By player tier"** — buckets: Gold / Star Guardian / Diamond / Master / Grandmaster (thresholds on trophies: ≥2600 Grandmaster, ≥2000 Master, ≥1700 Diamond, ≥1100 Star Guardian, else Gold).
  - **"By region"** — Luzon / Visayas / Mindanao / Metro Manila / Overseas — deterministic hash of player tag/name when no explicit region on the purchase record.
  - **"By day of week"** — Sun–Sat bar chart.
  - (5th bucket, same grid) **"New vs returning"** — "New buyer" vs "Returning", determined by first-seen purchase timestamp per player.

**[ROW 13]** New method `refundTopup(x)`: guarded by `x.status==='refunded'` (no-op, toast "Already refunded.") and by `!can('finance.refund') && !can('config.edit')` (toast "Your role can't issue refunds." err) — **note:** `finance.refund` is not present in the `PERMS` map, so `can('finance.refund')` always returns `true` per the `can()` fallback (`!a || ...`); the refund action is therefore effectively ungated by role today (only blocked if a future PERMS entry is added). Confirms via `openModal` (kind `refund`, title "Refund top-up", body "Refund `<money>` to `<player>`? This reverses `<item>` and removes the diamonds from their wallet.", confirm label "Refund `<money>`"). On apply: marks the purchase `status:'refunded'` in `fdr.purchases`, and if the refunded player is the live device's own profile, decrements `fdr.wallet.diamonds`. Logs audit `finance.refund`; toast "Refund issued to `<player>`." (ok).

**[ROW 14]** Financials tab no longer has the old "Gateways & config" / "Refunds & disputes" sub-tab toggle (`finTabGw`/`finTabRf`/`finTabGateways`/`finTabRefunds` all removed from Financials — the Refunds & disputes panel content is now always shown directly under `secFinancials`, i.e. it's no longer tabbed, it's the default/only view alongside the new top-up dashboard).

**[ROW 15]** New **Top-up Receipt modal** (`topupReceiptOpen`/`trcpt`), triggered by clicking a row in "Recent top-ups". Header: "PURCHASE RECEIPT" eyebrow, big total amount, date, "Refunded" pill if applicable. Body rows: Order ID, Player (name+tag), Diamonds (amount 💎), Bonus (+n 💎, only if `hasBonus`), Total credited, Method (static "App Store · Apple Pay"), "Receipt sent to" (email). Close via ✕ button, `closeTopupReceipt()`, or backdrop click.

Evidence (shell diff):
```
+        <!-- LIVE TOP-UP REVENUE (from fdr.purchases) -->
+        <div style="background:linear-gradient(135deg,rgba(90,150,255,.12),#1b1030);...">
+            <div>💳</div><div>Diamond top-ups</div>
+            <div>Live in-app purchases from the mobile wallet</div>
+            <span>Real-time</span>
...
+  <!-- TOP-UP RECEIPT MODAL -->
+  <sc-if value="{{ topupReceiptOpen }}" ...>
+     <div>PURCHASE RECEIPT</div> {{ trcpt.money }} ... {{ trcpt.orderId }} ... {{ trcpt.method }}
```

---

## ENTIRELY NEW: Header — Global Search + Account Menu + Sign-out screen

**[ROW 16]** New global search box in the top header bar (`fd-hide-sm`), placeholder **"Search players, guilds, cups…"**, bound to `gsQuery`/`onGsQuery`. Results dropdown (`gsShow`) lists up to 6 matching players, 4 matching guilds, 4 matching tournaments (`gsResults`), each row showing badge (colored initials/type letter), label, sub-label (rank+trophies / guild tag / tournament format), and a kind pill ("Player"/"Guild"/"Cup"). Clicking a result routes to that section and clears the query. Empty state: **"No matches"** (`gsNoResults`).

**[ROW 17]** Account chip in header converted from a static display into a **clickable dropdown menu** (`toggleAcctMenu`/`closeAcctMenu`, backdrop-dismiss). Menu header shows name "Gabriela A.", email "gabriela@filipinodama.gg", role pill. Menu items:
  - **"⚙ Manage account"** → `acctManage()`: SUPERADMIN routes to Admins section (`section:'admins'`) with toast "Opened admin & role management."; non-SUPERADMIN gets toast "Account settings are managed by your Superadmin." (warn), no navigation.
  - **"🕑 My activity log"** → `acctActivity()`: routes to Settings → Config tab, toast "Your actions appear in the audit log."
  - **"⎋ Sign out"** → `acctSignOut()`: logs audit `session.signout`, sets `signedOut:true` + captures `signOutTime` (HH:MM 24h), closes menu.

**[ROW 18]** New full-screen **Sign-out interstitial** (`signedOut` state, z-index 200, fixed overlay covering entire app). Content: FilipinoDama "D" mark, "FilipinoDama" / "ADMIN CONSOLE" wordmark, green check circle, heading **"You've been signed out"**, body **"Your session on this device has ended. Your work is saved and every action stays in the audit log."**, account pill (avatar "GA", "Gabriela A.", "gabriela@filipinodama.gg"), primary button **"Sign back in"** and secondary button **"Switch account"** (both call `signBackIn()` — no differentiated behavior yet), footer **"Session ended · `{{ signOutTime }}`"** (monospace).
  - `signBackIn()`: `signedOut:false`, `section:'overview'`, `selId:null`; toast "Welcome back, Gabriela." (ok, implied default).

Evidence (shell diff):
```
+  <!-- SIGN-OUT SCREEN -->
+  <sc-if value="{{ signedOut }}" ...>
+    <div>You've been signed out</div>
+    <div>Your session on this device has ended. Your work is saved and every action stays in the audit log.</div>
+    <button onClick="{{ signBackIn }}">Sign back in</button>
+    <button onClick="{{ signBackIn }}">Switch account</button>
+    <div>Session ended · {{ signOutTime }}</div>
...
+      <div class="fd-hide-sm" style="position:relative;margin-right:8px">
+        <input value="{{ gsQuery }}" onInput="{{ onGsQuery }}" placeholder="Search players, guilds, cups…" ...>
...
+        <button class="abtn" onClick="{{ toggleAcctMenu }}" ...>
+        <sc-if value="{{ acctMenuOpen }}" ...>
+            <button onClick="{{ acctManage }}">⚙ Manage account</button>
+            <button onClick="{{ acctActivity }}">🕑 My activity log</button>
+            <button onClick="{{ acctSignOut }}">⎋ Sign out</button>
```

---

## Players section

**[ROW 19]** New **"Live"** badge shown on the player row/drawer when `p.live` (a real device-synced player record, vs. seeded demo data). Small green pill next to the player name.

**[ROW 20]** New avatar rendering: player rows and the detail drawer now render an actual `<img>` from `p.avatar` (with an optional overlaid frame `<img>` from `p.frame`) when `hasAvatar` is true, falling back to the old colored-initials circle otherwise. Previously it was always initials-only.

**[ROW 21]** New **"RECENT PURCHASES"** block in the player detail drawer (`sel.hasPurchases`), listing up to 8 purchases for that player tag (`sel.purchases`): item name, currency icon (💳 top-up / 💎 gem / 🪙 gold) + price, relative time ("`Xm/h/d ago`" via new `_agoLabel`).

**[ROW 22]** New backing logic: `_syncRealPlayers()` reads `fdr.profile`/`fdr.wallet`/`fdr.sanctions` from localStorage on mount and on `storage` events, and injects/updates a synthetic "live" player record (`id:'live-'+tag`) at the top of the players list, replacing any other record with the same tag. Rank computed via new `_rankForTrophies(t)` (Wood <300, Bronze <600, Silver <900, Gold <1200, Platinum <1800, else Diamond).

**[ROW 23]** New `_publishLeaderboard()`: writes `fdr.leaderboard` (name/tag/trophies, sorted desc) to localStorage on mount and whenever a live player syncs — new integration point for the public-facing leaderboard to read admin-visible player state.

Evidence (script diff):
```
+  _syncRealPlayers(){ ... const rec={ id:'live-'+..., name:..., tag:..., rank:this._rankForTrophies(tro), ... live:true, avatar:(prof.myAvatar||''), frame:(prof.myFrame||'') }; ...}
+  _rankForTrophies(t){ ... if(t>=1800)return 'Diamond'; ... }
+  _publishLeaderboard(){ ... localStorage.setItem('fdr.leaderboard', JSON.stringify(rows)); }
```
```
+<sc-if value="{{ p.live }}" ...><span ...>Live</span></sc-if>
+<sc-if value="{{ sel.hasPurchases }}" ...>RECENT PURCHASES ... {{ pu.name }} {{ pu.cur }} {{ pu.price }} {{ pu.when }}
```

---

## Guilds section

**[ROW 24]** New **"Join requests"** panel (only shown when `hasGuildApps`), heading "Join requests", subtext "Players applying to join a guild from the app." Each pending application row shows initials avatar, player name+tag, "wants to join **`<guild name>`**", and **Approve**/**Reject** buttons.
  - `approveGuildApp(a)`: gated by `can('guild.moderate')` (toast "Your role can't moderate guilds." err if not); increments the guild's member count, persists `fdr.guilds`, marks the application `approved` in `fdr.guildApplications`, logs audit `guild.join.approve`, toast "`<player>` added to `<guild>`." (ok).
  - `rejectGuildApp(a)`: same permission gate; marks application `rejected`, logs `guild.join.reject`, toast "Request from `<player>` rejected."

**[ROW 25]** New **"View"** button on each guild table row (`g.open`, before the existing Rename/Disband buttons) → opens a new Guild Detail drawer.

**[ROW 26]** New **Guild Detail drawer** (`guildOpen`/`guildDetail`), right-side slide-in panel: crest, guild name, tag, member count, two stat tiles (WEEKLY PTS, MIN TROPHIES), and a **MEMBERS** roster list (`_guildMembers`, seeded pool of 12 named members plus any approved live join-applicants tagged "New", minus any kicked members). Each roster row: avatar initials, name (+ "New" pill if recently joined), tag, role (color-coded: Leader gold / Officer purple / Member muted), trophies, and a **✕ kick** button for non-Leader members (`canKick`).
  - `kickGuildMember(gtag, m)`: gated by `can('guild.moderate')`; adds member tag to a per-guild `guildKicked` exclusion list, decrements guild member count, persists `fdr.guilds`; if the kicked member had joined via application, marks that application `removed` in `fdr.guildApplications`; logs audit `guild.member.kick`, toast "`<name>` removed from the guild."
  - `openGuild(g)` / `closeGuild()`: sets/clears `selGuildTag`.

Evidence (shell + script diff):
```
+        <sc-if value="{{ hasGuildApps }}" ...>Join requests ... wants to join <b>{{ a.guildName }}</b>
+<button onClick="{{ a.approve }}">Approve</button><button onClick="{{ a.reject }}">Reject</button>
...
+<button class="abtn" onClick="{{ g.open }}" style="{{ btnGhostSm }}">View</button>
...
+  <!-- GUILD DETAIL DRAWER -->
+  <sc-if value="{{ guildOpen }}" ...> ... MEMBERS ... <button onClick="{{ m.kick }}">✕</button>
```
```
+  approveGuildApp(a){ if(!this.can('guild.moderate')){...} ... this.logAudit('guild.join.approve', ...) }
+  kickGuildMember(gtag, m){ ... this.logAudit('guild.member.kick', ...) }
```

---

## Live Ops / Seasons section

**[ROW 27]** New **"Daily login rewards"** editor card, inserted above the existing "Scheduled events" card. Heading "Daily login rewards" + **"Save ladder"** button (`saveDailyRewards`, SUPERADMIN-gated via `can('config.edit')`; non-privileged shows toast "Only SUPERADMIN can edit rewards." err). Subtext: "7-day claim ladder · pushed live to all clients on save."

**[ROW 28]** 7-row editable ladder (`dailyRewardRows`), Day 1–7, Day 7 forced to "Grand chest" styling:
  - Days 1–6 (`notChest`): a type `<select>` (Gold 🪙 / Diamonds 💎) + numeric amount input.
  - Day 7 (`isChest`): two numeric inputs — 🪙 gold amount and 💎 gem amount — with a "Grand chest" pill.
  - Default seed values (persisted to `fdr.dailyRewards` on first load if absent): Day1 200 gold, Day2 400 gold, Day3 10 gems, Day4 700 gold, Day5 20 gems, Day6 1200 gold, Day7 chest (2000 gold + 50 gems).
  - `onDailyReward(idx, field, value)` updates state per-row; `saveDailyRewards()` persists the whole array to `fdr.dailyRewards` and logs audit `economy.dailyRewards` ("7-day ladder" / "Updated daily login rewards"), toast "Daily reward ladder published." (ok).

Evidence:
```
+          <div>Daily login rewards</div><button onClick="{{ saveDailyRewards }}">Save ladder</button>
+          <div>7-day claim ladder · pushed live to all clients on save.</div>
+            <sc-for list="{{ dailyRewardRows }}" as="d" ...>
+              <sc-if value="{{ d.isChest }}">...Grand chest...</sc-if>
+              <sc-if value="{{ d.notChest }}">...<select>Gold 🪙/Diamonds 💎</select>...</sc-if>
```
```
+    dailyRewards:[{type:'gold',amt:200},{type:'gold',amt:400},{type:'gem',amt:10},{type:'gold',amt:700},{type:'gem',amt:20},{type:'gold',amt:1200},{type:'chest',gold:2000,gem:50}],
+  saveDailyRewards(){ if(!this.can('config.edit')){...} localStorage.setItem('fdr.dailyRewards', ...); this.logAudit('economy.dailyRewards', ...); }
```

---

## Moderation / Reports section

**[ROW 29]** Report resolution now persists to localStorage. New `_resolveReportStore(id, resolution)` writes `status:'resolved'`, `resolution` ('dismissed'/'banned'/'muted'), and `resolvedAt` timestamp into `fdr.reports` — previously `resolveReport` only mutated in-memory React state with no persistence. Called from both the "Dismiss" path and the ban/mute confirm-and-resolve path.

Evidence:
```
+  _resolveReportStore(id, resolution){ ... localStorage.setItem('fdr.reports', JSON.stringify(out)); }
   resolveReport(r,action){
     if(action==='dismiss'){
+      this._resolveReportStore(r.id,'dismissed');
...
       apply:function(){
+        this._resolveReportStore(r.id, type==='ban'?'banned':'muted');
```

---

## Economy / Mass Grant section

**[ROW 30]** Mass currency grants (`runMassGrant`) now also apply in real-time to the live synced player: if the granted segment includes the live player (`p.live`), the grant amount is added directly to `fdr.wallet` (gold/diamonds) in localStorage, and the grant ID is recorded in a new `fdr.grantsApplied` list (idempotency guard against double-application). Previously grants only updated the in-memory demo player list and `fdr.grants` history — no live-wallet effect.

Evidence:
```
+ if(p.live){
+ const w=JSON.parse(localStorage.getItem('fdr.wallet')||'{}')||{};
+ w[cur]=(typeof w[cur]==='number'?w[cur]:0)+amt;
+ localStorage.setItem('fdr.wallet', JSON.stringify(w));
+ const ap=JSON.parse(localStorage.getItem('fdr.grantsApplied')||'[]');
+ if(ap.indexOf(gid)<0) ap.push(gid);
+ localStorage.setItem('fdr.grantsApplied', JSON.stringify(ap));
+ }
```

---

## System / Settings — Maintenance mode

**[ROW 31]** Maintenance-mode toggle now persists to localStorage (`fdr.maintenance`, '1'/'0') in addition to updating in-memory state and audit log. Initial state is now read from `localStorage.getItem('fdr.maintenance')` on component init instead of always defaulting to `false`.

Evidence:
```
-    bcAudience:'all', bcTitle:'', bcBody:'', maint:false,
+    bcAudience:'all', bcTitle:'', bcBody:'', maint:(()=>{try{return localStorage.getItem('fdr.maintenance')==='1';}catch(e){return false;}})(),
...
   toggleMaint(){ ... this.setState({maint:nv});
+    try{ localStorage.setItem('fdr.maintenance', nv?'1':'0'); }catch(e){}
```

---

## Lifecycle / integration wiring (component mount)

**[ROW 32]** New `componentDidMount` (or equivalent lifecycle) wiring, all new:
  - Exposes `window.FDA = this` for external/console access (debug hook).
  - Calls `_syncRealPlayers()` on mount.
  - Seeds `fdr.dailyRewards` on first run if absent; loads it into state if present and valid (≥7 entries).
  - Seeds `fdr.guilds` from initial `this.state.guilds`.
  - Loads pending `fdr.guildApplications` into `guildApps` state.
  - Calls `_publishLeaderboard()`.
  - Seeds `fdr.purchases` via new `_seedTopups()` (10 synthetic top-up records across 10 fake players, `$0.99`–`$29.99` spanning 0–6 days ago) if `fdr.purchases` is empty/missing; otherwise loads existing purchases into `purchases` state.
  - Registers a new cross-tab `window.addEventListener('storage', ...)` handler that re-syncs on changes to `fdr.profile`/`fdr.wallet`/`fdr.sanctions` (→ `_syncRealPlayers()`), `fdr.purchases` (→ reload `purchases` state), and `fdr.guildApplications` (→ reload `guildApps` state) — makes the admin console live-reactive to the player-facing app's localStorage writes in the same browser.

Evidence: see script diff hunk at old line 879 / new line 970 (largest single hunk, ~400 lines).

---

## New/changed function inventory (Component methods)

New methods added in v3 (28 total): `_agoLabel`, `_guildMembers`, `_publishLeaderboard`, `_rankForTrophies`, `_resolveReportStore`, `_seedTopups`, `_setGuildAppStatus`, `_syncRealPlayers`, `acctActivity`, `acctManage`, `acctSignOut`, `approveGuildApp`, `closeAcctMenu`, `closeGuild`, `closeTopupReceipt`, `kickGuildMember`, `onDailyReward`, `onGsQuery`, `openGuild`, `openTopupReceipt`, `refundTopup`, `rejectGuildApp`, `saveDailyRewards`, `setGatewayFee`, `signBackIn`, `testGateway`, `toggleAcctMenu`, `toggleGateway`.

No methods were removed. `resolveReport` and `runMassGrant` and `toggleMaint` were modified in place (see rows 29/30/31).

## New localStorage keys (`fdr.*`)

`fdr.dailyRewards`, `fdr.grantsApplied`, `fdr.guildApplications`, `fdr.guilds`, `fdr.leaderboard`, `fdr.maintenance`, `fdr.profile` (read-only, written by the player app), `fdr.purchases`, `fdr.topupReceipts` (read-only, written by the player app), `fdr.wallet` (read-only, written by the player app).

Unchanged keys still in use: `fdr.diamondPacks`, `fdr.econ`, `fdr.events`, `fdr.flags`, `fdr.grants`, `fdr.guildOverride`, `fdr.pushNotifs`, `fdr.questDefs`, `fdr.reports`, `fdr.sanctions`, `fdr.season`, `fdr.storeItems`, `fdr.tickets`, `fdr.tournaments`.

## New permission checks

`can('finance.refund')` and `can('guild.moderate')` (the latter already existed in `PERMS`, just newly consumed for guild-app approve/reject/kick). **`finance.refund` is not defined in the `PERMS` map** — the `can()` fallback (`!a || ...`) means this check always passes, so refunds are gated only by the secondary `!can('config.edit')` OR-clause, which is also always true for the same reason. Net effect: `refundTopup` is currently ungated by role in the prototype logic as written — flag for backend enforcement (real API must not trust this client check).

## New audit-log action types

`economy.dailyRewards`, `finance.gateway`, `finance.gateway.test`, `finance.refund`, `guild.join.approve`, `guild.join.reject`, `guild.member.kick`, `session.signout`.

## Sidebar nav / role matrix / CSS — confirmed unchanged

`navDefs` (16 sections, labels, colors, groups), `PERMS` role matrix, and the entire `<style>` block are byte-identical between v2 and v3.

---

## Summary Table

| # | Area | Adds | Mods | Removals | Notes |
|---|------|------|------|----------|-------|
| 1 | Settings → Payment Gateways (new tab) | 1 new tab + 1 new "gateway status & fees" control card (enable/disable, fee edit, test connection) | — | — | Relocated (not counted as add/remove) the pre-existing PayPal/Stripe/PayMongo/Xendit credential cards + env toggle + product-mapping table here from Financials |
| 2 | Financials — live top-up dashboard | 1 live revenue card, 7-day chart, recent top-ups list, empty state, 5-panel revenue-breakdown grid, receipt modal | Refund flow now real (`refundTopup`) | Old "Gateways & config" / "Refunds & disputes" sub-tab toggle removed (content merged/always-on) | Also relocated old gateway UI out to new Settings tab (see row 1) |
| 3 | Header — search + account | Global search box + results dropdown; account dropdown menu (3 items); full-screen sign-out interstitial | Account chip converted from static to clickable | — | |
| 4 | Players | "Live" badge, avatar/frame image rendering, "Recent purchases" panel in drawer | — | — | Backed by `_syncRealPlayers`, `_rankForTrophies`, `_publishLeaderboard` |
| 5 | Guilds | "Join requests" panel (approve/reject), "View" button, Guild Detail drawer w/ member roster + kick | — | — | `approveGuildApp`, `rejectGuildApp`, `kickGuildMember`, `_guildMembers`, `_setGuildAppStatus` |
| 6 | Live Ops / Seasons | Daily login rewards 7-day editable ladder card + Save ladder button | — | — | `onDailyReward`, `saveDailyRewards` |
| 7 | Moderation | — | Report resolution now persists to `fdr.reports` | — | `_resolveReportStore` |
| 8 | Economy (mass grant) | — | Grants now apply live to `fdr.wallet` when target is the live player | — | idempotency via `fdr.grantsApplied` |
| 9 | System (maintenance) | — | Maintenance toggle persists to `fdr.maintenance`, initial state reads from it | — | |
| 10 | Lifecycle/mount | Cross-tab `storage` event sync, purchase/guild-app seeding, `window.FDA` debug hook | — | — | |

**Row count:** 32 numbered rows above (10 are section-level rollups covering 28 new methods, 10 new localStorage keys, 2 new permission checks, 8 new audit action types, and dozens of individual UI elements enumerated within each row's detail).

**Files consulted / evidence artifacts (scratch, not part of deliverable):**
`C:\Users\johnr\AppData\Local\Temp\claude\D--AI-Projects-FilipinoDama\4d46f08b-9bed-4d5e-8cae-4e16f39bda4b\scratchpad\admin-diff\` — `old_script.js`, `new_script.js`, `old_shell.html`, `new_shell.html`, `script_folded_diff.txt` (19 hunks), `shell_tagfold_diff.txt` (11 hunks).
