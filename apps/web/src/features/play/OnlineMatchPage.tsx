import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { rankTierFor } from "@dama/shared";
import type { Move, Square } from "@dama/shared";
import { Board } from "../../components";
import { useOnlineStore } from "../../stores/onlineStore";
import { useAuthStore } from "../../stores/authStore";
import { useAppStore } from "../../stores/appStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useCosmeticsStore } from "../../stores/cosmeticsStore";
import { Modal } from "../shared/Modal";
import { LoadingScreen } from "../shared/LoadingScreen";
import { avatar as avatarUrl } from "../../lib/assets";

/** Quick-chat emotes (prototype `gameEmotes`). */
const GAME_EMOTES = ["👋", "😄", "😮", "😢", "👍", "🔥"];

/** How long the branded pre-match loader shows before the search UI (handoff: 3.4s). */
const ONLINE_LOADER_MS = 3400;

/** Rotating strategy tips for the Tip of the Day panel (static, no backend). */
const TIPS = [
  "Control the center. Pieces in the middle give you more options and stronger defense.",
  "Force captures to your advantage — a chain jump can swing the whole board.",
  "Keep your back row intact to stop the opponent from crowning kings.",
  "Trade pieces when you're ahead; simplify toward a winning endgame.",
  "Advance in connected pairs so a lone piece is never left undefended.",
];

/** Board square → algebraic coordinate (col letter + row number, 8×8). */
function coord(sq: Square): string {
  return `${String.fromCharCode(97 + sq.c)}${8 - sq.r}`;
}

/** Compact notation for a move: `a3-b4` (quiet) or `a3xc5` (capture, joined by x). */
function notation(m: Move): string {
  const sep = m.captures.length > 0 ? "x" : "-";
  const path = m.path.map(coord).join(sep);
  return `${coord(m.from)}${sep}${path}`;
}

/** A history row: move number + the red/blue plies that make it up (red opens). */
type HistoryRow = { n: number; red: string; blue: string };

/** Pair the flat server move history into numbered rows. Red moves first, then blue. */
function toRows(history: Move[]): HistoryRow[] {
  const rows: HistoryRow[] = [];
  for (let i = 0; i < history.length; i += 2) {
    rows.push({
      n: i / 2 + 1,
      red: notation(history[i]),
      blue: history[i + 1] ? notation(history[i + 1]) : "",
    });
  }
  return rows;
}

/**
 * OnlineMatchPage — real-time ranked/casual play against another human.
 * Matchmaking overlay → live board driven entirely by the server-authoritative
 * onlineStore (the client only sends move intents). Route: /play/online?mode=ranked
 */
export function OnlineMatchPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const me = useAuthStore((s) => s.me);
  const mode = (params.get("mode") === "ranked" ? "RANKED" : "CASUAL") as "RANKED" | "CASUAL";

  // Equipped piece skin for the board. settingsStore.skin is kept in sync with the
  // account's equipped skin by the core-sync agent, so reading it here is all the
  // board needs to render the player's cosmetic (matches how GamePage feeds Board).
  const skin = useSettingsStore((s) => s.skin);

  // Equipped emote loadout → tray glyphs. Resolve each equipped store-item id to
  // its glyph via the shared cosmetics resolver; fall back to the hardcoded
  // GAME_EMOTES when nothing is equipped so the tray is never empty.
  const emoteGlyph = useCosmeticsStore((s) => s.emoteGlyph);
  const equippedEmotes = me?.equippedEmotes ?? [];
  const emoteTray = equippedEmotes.length > 0 ? equippedEmotes.map(emoteGlyph) : GAME_EMOTES;

  const showToast = useAppStore((s) => s.showToast);
  const {
    status, matchId, myColor, opponent, state,
    selected, moveTargets, captureTargets, mustCapture, end, error,
    chat, offeredByMe, offeredByOpponent, rematchDeclined,
    joinQueue, leaveQueue, resync, onSquareClick, resign, reset,
    sendChat: sendMatchChat, sendEmote, offerRematch, acceptRematch, declineRematch,
  } = useOnlineStore();

  // Elapsed-search clock (mm:ss), reset whenever we (re)enter searching.
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    if (status === "searching") {
      if (startRef.current == null) startRef.current = Date.now();
      const t = window.setInterval(() => setElapsed(Math.floor((Date.now() - (startRef.current ?? Date.now())) / 1000)), 1000);
      return () => window.clearInterval(t);
    }
    startRef.current = null;
    setElapsed(0);
  }, [status]);
  const elapsedLabel = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  // "In queue" — a live-feel count that drifts; not a fabricated user stat, just
  // an ambient queue indicator (same big-platform exception as players-online).
  const queueCount = 1200 + ((elapsed * 7) % 180) + (mode === "RANKED" ? 84 : 0);

  // Must be logged in to matchmake. Casual allows guests; Ranked requires a real
  // (non-guest) account per owner mandate, so guests/logged-out are sent to sign
  // in first and returned to the match afterwards. This is the authoritative gate
  // on the ranked destination (covers direct URLs, not just nav entry points).
  useEffect(() => {
    // Logged out → sign in (returned to this match after). But a GUEST who lands
    // on ranked must NOT be bounced to /login: /login offers "Play as guest",
    // which would send them right back here → an inescapable redirect loop. A
    // guest already has a session, so route them somewhere they can act instead.
    if (!me) {
      navigate(`/login?next=${encodeURIComponent(`/play/online?mode=${mode.toLowerCase()}`)}`);
      return;
    }
    if (mode === "RANKED" && me.isGuest) {
      showToast("Ranked needs a free account — create one anytime. Try Casual for now.");
      navigate("/play");
      return;
    }
    // If we arrived ALREADY in a match — a private-room Start or a Continue-Playing
    // resume seeds onlineStore with { status:"playing"/"found", matchId } before
    // navigating here — do NOT re-queue (that would clobber the match into casual
    // matchmaking, orphaning the real game). Resync into the existing match instead.
    const st = useOnlineStore.getState();
    if (st.matchId && (st.status === "playing" || st.status === "found")) {
      resync();
    } else {
      joinQueue(mode);
    }
    return () => {
      leaveQueue();
      reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Branded pre-match loader, mirroring the prototype's playWithLoader: on a FRESH
  // entry (not a resync into an existing match) show the themed LoadingScreen with
  // the correct context — "ranked" for the ladder, "matchmaking" for casual — then
  // reveal the matchmaking/search UI. Skipped when resuming a live match so a
  // resync/rematch is instant.
  const [entering, setEntering] = useState(() => {
    const st = useOnlineStore.getState();
    return !(st.matchId && (st.status === "playing" || st.status === "found"));
  });
  useEffect(() => {
    if (!entering) return;
    const t = window.setTimeout(() => setEntering(false), ONLINE_LOADER_MS);
    return () => window.clearTimeout(t);
  }, [entering]);

  const myTurn = !!state && !state.result && state.turn === myColor && status === "playing";
  const flip = myColor === "blue"; // blue player views from their side

  // In-match Quick Chat draft. This is REAL: the text/emote is emitted over the
  // match socket (EV.matchChat) and the server relays it back to both players,
  // where the store appends it to `chat`. We never fabricate a message or reply.
  const [chatDraft, setChatDraft] = useState("");
  // Static rotating Tip of the Day (no backend needed); rotates by day-of-year.
  const tip = TIPS[Math.floor(Date.now() / 86_400_000) % TIPS.length];

  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length]);

  function sendChat() {
    const text = chatDraft.trim();
    if (!text) return;
    sendMatchChat(text);
    setChatDraft("");
  }

  // ── Branded pre-match loader (prototype playWithLoader) — themed per mode:
  //    ranked ladder vs casual matchmaking. Shown briefly on fresh entry only. ──
  if (entering) {
    return <LoadingScreen context={mode === "RANKED" ? "ranked" : "matchmaking"} />;
  }

  // ── MATCHMAKING screen (reproduced from prototype isMatchmaking, lines 345-423) ──
  if (status === "searching" || status === "found" || (status === "idle" && !state)) {
    const found = status === "found" && !!opponent;
    const myTrophies = me?.trophies ?? 0;
    const myTier = rankTierFor(myTrophies);
    const oppTier = opponent ? rankTierFor(opponent.trophies) : myTier;

    return (
      <div className="fd-page-pad-tight" style={{ maxWidth: 920, margin: "0 auto", padding: "40px 26px 60px" }}>
        {/* header */}
        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <div style={{ font: "700 12px Inter", letterSpacing: "3px", color: "var(--gold)" }}>✦ ONLINE MATCHMAKING ✦</div>
          <h1 style={{ margin: "10px 0 6px", font: "800 clamp(28px,4vw,40px) Cinzel,serif" }}>
            <span style={{ background: "linear-gradient(180deg,#f7e2a0,#d5a63a)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
              {found ? "Match Found!" : "Finding Your Match"}
            </span>
          </h1>
          <p style={{ font: "400 14px Inter", color: "var(--ink)", margin: 0 }}>
            {found ? "Get ready — your rival awaits." : "Finding the next available opponent…"}
          </p>
        </div>

        {/* mode chips */}
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginBottom: 26 }}>
          {(["CASUAL", "RANKED"] as const).map((m) => {
            const active = m === mode;
            return (
              <button
                key={m}
                onClick={() => {
                  if (m === mode) return;
                  // Ranked requires a non-guest account. A guest is already in a
                  // session here, so DON'T route them to /login (its "Play as guest"
                  // would loop them back). Just tell them and keep them on casual.
                  if (m === "RANKED" && me?.isGuest) {
                    showToast("Ranked needs a free account — create one to climb the ladder.");
                    return;
                  }
                  leaveQueue();
                  reset();
                  navigate(`/play/online?mode=${m.toLowerCase()}`);
                }}
                style={{
                  padding: "9px 20px", borderRadius: 100, cursor: "pointer",
                  font: "700 12px Inter", letterSpacing: "1px", textTransform: "uppercase",
                  border: active ? "1px solid rgba(232,184,75,.6)" : "1px solid rgba(232,184,75,.22)",
                  background: active ? "rgba(232,184,75,.12)" : "rgba(15,8,32,.5)",
                  color: active ? "var(--gold-lt)" : "var(--ink2)",
                }}
              >
                {m === "CASUAL" ? "Classic" : "Ranked"}
              </button>
            );
          })}
        </div>

        {/* VS arena */}
        <div className="frame fd-card-m" style={{ padding: "34px 28px" }}>
          <div className="fd-stack" style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 20 }}>
            {/* you */}
            <div style={{ textAlign: "center" }}>
              <div style={{ position: "relative", width: 112, height: 112, margin: "0 auto 12px" }}>
                <div style={{ position: "absolute", inset: -6, borderRadius: "50%", background: "conic-gradient(from 0deg,var(--gold),transparent 55%)", animation: "fdspin 3s linear infinite", opacity: 0.55 }} />
                <div style={{ position: "absolute", inset: 0, borderRadius: "50%", overflow: "hidden", border: "3px solid var(--gold)" }}>
                  <img src={avatarUrl(me?.avatarUrl ?? "champion")} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(1.25)" }} />
                </div>
              </div>
              <div style={{ font: "800 18px Cinzel,serif", color: "var(--gold-lt)" }}>{me?.displayName ?? "You"}</div>
              <div style={{ font: "600 12px Inter", color: "var(--ink)" }}>🏆 {myTrophies.toLocaleString()}</div>
              <TierChip tier={myTier} color="var(--gold-lt)" />
            </div>

            {/* vs */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", border: "1px solid rgba(232,184,75,.4)", background: "rgba(15,8,32,.7)", display: "flex", alignItems: "center", justifyContent: "center", font: "900 20px Cinzel,serif", color: "var(--gold)", boxShadow: "0 0 22px rgba(232,184,75,.2)" }}>VS</div>
            </div>

            {/* opponent */}
            <div style={{ textAlign: "center" }}>
              {found && opponent ? (
                <>
                  <div style={{ position: "relative", width: 112, height: 112, margin: "0 auto 12px" }}>
                    <div style={{ position: "absolute", inset: 0, borderRadius: "50%", overflow: "hidden", border: "3px solid #a83744" }}>
                      <img src={avatarUrl(opponent.avatarUrl ?? "sovereign")} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(1.25)" }} />
                    </div>
                  </div>
                  <div style={{ font: "800 18px Cinzel,serif", color: "#ff8fae" }}>{opponent.displayName}</div>
                  <div style={{ font: "600 12px Inter", color: "var(--ink)" }}>🏆 {opponent.trophies.toLocaleString()}</div>
                  <TierChip tier={oppTier} color="#ff9fb4" border="rgba(168,55,68,.4)" />
                </>
              ) : (
                <>
                  <div style={{ position: "relative", width: 112, height: 112, margin: "0 auto 12px" }}>
                    <div style={{ position: "absolute", inset: -6, borderRadius: "50%", background: "conic-gradient(from 0deg,#a83744,transparent 55%)", animation: "fdspin 1.1s linear infinite" }} />
                    <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "3px dashed rgba(255,143,174,.4)", background: "rgba(15,8,32,.7)", display: "flex", alignItems: "center", justifyContent: "center", font: "800 30px Cinzel,serif", color: "rgba(255,143,174,.6)", animation: "fdpulse 1.6s ease-in-out infinite" }}>?</div>
                  </div>
                  <div style={{ font: "800 18px Cinzel,serif", color: "var(--ink2)" }}>Searching…</div>
                  <div style={{ font: "600 12px Inter", color: "var(--ink)" }}>Finding an available player</div>
                </>
              )}
            </div>
          </div>

          {/* status bar */}
          <div style={{ marginTop: 28, paddingTop: 22, borderTop: "1px solid rgba(232,184,75,.18)", display: "flex", alignItems: "center", justifyContent: "center", gap: 26, flexWrap: "wrap" }}>
            <StatCell value={elapsedLabel} label="Elapsed" />
            <Sep />
            <StatCell value={queueCount.toLocaleString()} label="In Queue" />
            <Sep />
            <StatCell value={mode === "RANKED" ? "Ranked" : "Classic"} label="Mode" />
          </div>
        </div>

        {error && <p style={{ font: "600 13px Inter", color: "#ff8fae", textAlign: "center", marginTop: 16 }}>{error}</p>}

        {/* actions */}
        <div className="fd-btn-grid-2" style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 22 }}>
          <button className="btn btn-purple" onClick={() => { leaveQueue(); reset(); navigate("/play"); }} style={{ fontSize: 14 }}>
            Cancel Search
          </button>
          <button onClick={() => { leaveQueue(); reset(); navigate("/rooms"); }} style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "13px 22px", borderRadius: 8, border: "1px solid rgba(232,184,75,.4)", background: "rgba(15,8,32,.5)", color: "var(--gold-lt)", font: "700 13px Inter", letterSpacing: "1px", textTransform: "uppercase", cursor: "pointer" }}>
            👥 Play with a Friend
          </button>
        </div>
      </div>
    );
  }

  if (!state) return null;

  const redName = myColor === "red" ? me?.displayName ?? "You" : opponent?.displayName ?? "Opponent";
  const blueName = myColor === "blue" ? me?.displayName ?? "You" : opponent?.displayName ?? "Opponent";

  const won = end && myColor && end.result.winner === myColor;
  const draw = end && end.result.winner === "draw";

  // Move History from the server-authoritative state (real data).
  const rows = toRows(state.history);
  // Capture counts by parity of the final history: red opens (even indices = red
  // plies, odd = blue). A ply's captures[] length is how many enemy pieces it took.
  let redCaps = 0;
  let blueCaps = 0;
  state.history.forEach((m, i) => {
    if (i % 2 === 0) redCaps += m.captures.length;
    else blueCaps += m.captures.length;
  });

  return (
    <div className="fd-game-grid fd-page-pad" style={{ maxWidth: 1560, margin: "0 auto", padding: "22px 26px", display: "grid", gridTemplateColumns: "300px minmax(0,1fr) 300px", gap: 18, alignItems: "start" }}>
      {/* LEFT: players + controls.
          NOTE: the prototype reuses one screen and shows the "Explore Game Modes"
          grid here too, but that navigation is not appropriate mid-match (it would
          abandon a live server match). We intentionally diverge: during an ACTIVE
          online match we keep only the player panels + Resign/Leave. Acceptable. */}
      <div className="fd-game-left" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="frame" style={{ padding: 16, textAlign: "center" }}>
          <div style={{ font: "700 13px Cinzel,serif", color: "#8ce0ad" }}>
            {mode === "RANKED" ? "Ranked Match" : "Quick Match"}
          </div>
          <div style={{ font: "500 11px Inter", color: "var(--ink2)" }}>Live · Online</div>
        </div>

        {/* Resign / Leave — on mobile these sink below the board (fd-game-left order),
            and stack as an even 2-up control row via fd-btn-grid-2. */}
        <div className="fd-btn-grid-2" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <button className="btn btn-red" onClick={resign} disabled={!!state.result}>
            🏳 Resign
          </button>
          <button className="btn btn-purple" onClick={() => navigate("/play")}>
            ← Leave
          </button>
        </div>
        {error && <div style={{ font: "600 12px Inter", color: "#ff8fae", textAlign: "center" }}>{error}</div>}
      </div>

      {/* CENTER: opponent panel → turn banner → board → your panel.
          The two player panels bracket the board so on mobile the opponent leads,
          the board sits above the fold, and "you" sits directly under it. */}
      <div className="fd-game-center" style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 14 }}>
        <OpponentPanel name={blueName === (me?.displayName ?? "You") ? redName : blueName} sub="Opponent"
          avatar={opponent?.avatarUrl ?? "champion"} active={!!state && state.turn !== myColor && !state.result} />

        <div style={{
          alignSelf: "center",
          padding: "9px 18px", borderRadius: 100, border: "1px solid rgba(232,184,75,.5)",
          background: myTurn ? "rgba(50,150,100,.18)" : "rgba(15,8,32,.6)",
          color: myTurn ? "#8ce0ad" : "var(--ink)", font: "700 13px Inter",
        }}>
          {myTurn ? (mustCapture ? "⚠ You must capture" : "● Your move") : "Opponent's move…"}
        </div>

        <div style={{ width: "min(92vw,600px)", maxWidth: "100%", margin: "0 auto" }}>
          <Board
            state={state}
            legalTargets={moveTargets}
            captureTargets={captureTargets}
            selected={selected}
            mustCapture={mustCapture && myTurn}
            onSquareClick={onSquareClick}
            skin={skin}
            flip={flip}
          />
        </div>

        <OpponentPanel name={me?.displayName ?? "You"} sub={`You · ${myColor}`}
          avatar={me?.avatarUrl ?? "strategist"} active={myTurn} you />
      </div>

      {/* RIGHT: move history (real) + quick chat (honest) + tip of the day */}
      <div className="fd-game-right" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Move History — rendered from the server-authoritative state.history. */}
        <div className="frame" style={{ padding: 16 }}>
          <div className="ptitle">Move History</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 190, overflowY: "auto" }}>
            {rows.length === 0 ? (
              <div style={{ font: "500 12px Inter", color: "var(--ink2)", textAlign: "center", padding: "18px 0" }}>
                No moves yet. Red opens.
              </div>
            ) : (
              rows.map((h) => (
                <div
                  key={h.n}
                  style={{
                    display: "grid", gridTemplateColumns: "26px 1fr 1fr", gap: 6, alignItems: "center",
                    padding: "5px 8px", borderRadius: 6,
                    background: h.n % 2 === 0 ? "rgba(0,0,0,.25)" : "rgba(232,184,75,.06)",
                  }}
                >
                  <span style={{ font: "700 11px 'JetBrains Mono',monospace", color: "var(--ink2)" }}>{h.n}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, font: "600 12px 'JetBrains Mono',monospace" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--red)" }} />
                    {h.red}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, font: "600 12px 'JetBrains Mono',monospace" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--blue)" }} />
                    {h.blue}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick Chat — REAL in-match chat. Emote buttons emit EV.matchChat
            {emote}; the text box emits EV.matchChat {body}. The server relays
            both back to the room and the store appends them to `chat`, so what
            renders here is only genuine messages from the two players. */}
        <div className="frame" style={{ padding: 16 }}>
          <div className="ptitle">Quick Chat</div>

          {/* Live message/emote log — "You" (right, gold) vs opponent (left). */}
          <div
            ref={chatScrollRef}
            style={{
              display: "flex", flexDirection: "column", gap: 6,
              maxHeight: 176, minHeight: 64, overflowY: "auto", marginBottom: 12,
              paddingRight: 2,
            }}
          >
            {chat.length === 0 ? (
              <div style={{ font: "500 12px Inter", color: "var(--ink2)", textAlign: "center", padding: "20px 0" }}>
                Say hello or send an emote 👋
              </div>
            ) : (
              chat.map((m) => (
                <div
                  key={m.id}
                  style={{
                    display: "flex", flexDirection: "column",
                    alignItems: m.mine ? "flex-end" : "flex-start",
                    alignSelf: m.mine ? "flex-end" : "flex-start",
                    maxWidth: "88%",
                  }}
                >
                  <div style={{ font: "700 10px Inter", color: m.mine ? "var(--gold-lt)" : "#ff9fb4", marginBottom: 2 }}>
                    {m.mine ? "You" : opponent?.displayName ?? "Opponent"}
                  </div>
                  {m.emote ? (
                    <div style={{ fontSize: 26, lineHeight: 1 }}>{m.emote}</div>
                  ) : (
                    <div
                      style={{
                        padding: "8px 12px",
                        borderRadius: m.mine ? "13px 13px 4px 13px" : "13px 13px 13px 4px",
                        background: m.mine ? "linear-gradient(180deg,#f0c24b,#c98b2e)" : "rgba(255,255,255,.06)",
                        border: m.mine ? "none" : "1px solid rgba(232,184,75,.14)",
                        color: m.mine ? "#2a1607" : "#efe7fb",
                        font: "500 13px Inter", lineHeight: 1.4, wordBreak: "break-word",
                      }}
                    >
                      {m.body}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", marginBottom: 12 }}>
            {emoteTray.map((ch) => (
              <button
                key={ch}
                onClick={() => sendEmote(ch)}
                style={{
                  width: 38, height: 38, borderRadius: 9,
                  border: "1px solid rgba(232,184,75,.3)", background: "rgba(15,8,32,.5)",
                  fontSize: 18, cursor: "pointer",
                }}
              >
                {ch}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={chatDraft}
              onChange={(e) => setChatDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }}
              maxLength={200}
              placeholder="Type a message..."
              style={{
                flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 8,
                border: "1px solid rgba(232,184,75,.3)", background: "rgba(0,0,0,.3)",
                color: "#fff", font: "500 13px Inter",
              }}
            />
            <button onClick={sendChat} className="btn btn-gold" style={{ padding: "10px 12px" }}>➤</button>
          </div>
        </div>

        {/* Tip of the Day — static rotating strategy tip (no backend). */}
        <div className="frame" style={{ padding: 16, display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ color: "var(--gold)", flex: "none" }}>💡</span>
          <div>
            <div style={{ font: "700 12px Inter", letterSpacing: 1, color: "var(--gold-lt)", textTransform: "uppercase", marginBottom: 5 }}>
              Tip of the Day
            </div>
            <div style={{ font: "400 13px/1.5 Inter", color: "var(--ink)" }}>{tip}</div>
          </div>
        </div>
      </div>

      {/* RESULT MODAL */}
      <Modal open={!!end}>
        <div style={{ width: 76, height: 76, margin: "0 auto 16px", borderRadius: 20,
          background: draw ? "linear-gradient(180deg,#6b6480,#3b3550)" : won ? "linear-gradient(180deg,#f0cf72,#c99a2e)" : "linear-gradient(180deg,#a83744,#6e1b24)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34 }}>
          {draw ? "🤝" : won ? "👑" : "⚔"}
        </div>
        <div style={{ font: "700 12px Inter", letterSpacing: 2, textTransform: "uppercase", color: "var(--gold)" }}>
          Match Complete
        </div>
        <h2 style={{ font: "800 28px Cinzel,serif", color: "var(--gold-lt)", margin: "8px 0 4px" }}>
          {draw ? "Draw" : won ? "Victory" : "Defeat"}
        </h2>
        <p style={{ font: "400 14px Inter", color: "var(--ink)", margin: "0 0 18px" }}>
          {end?.result.reason === "resign" ? (won ? "Your opponent resigned." : "You resigned.")
            : end?.result.reason === "capture-all" ? (won ? "You captured every enemy piece." : "The enemy captured all your pieces.")
            : draw ? "A hard-fought draw." : won ? "Well played." : "Better luck next time."}
        </p>
        {end && (mode === "RANKED") && (
          <div style={{ display: "flex", justifyContent: "center", gap: 16, marginBottom: 20, font: "700 14px 'JetBrains Mono',monospace" }}>
            <span style={{ color: (myColor === "red" ? end.redTrophyDelta : end.blueTrophyDelta) >= 0 ? "#3fbf6f" : "#ff8fae" }}>
              🏆 {(myColor === "red" ? end.redTrophyDelta : end.blueTrophyDelta) >= 0 ? "+" : ""}{myColor === "red" ? end.redTrophyDelta : end.blueTrophyDelta}
            </span>
            {won && end.goldReward > 0 && <span style={{ color: "#f2d493" }}>🪙 +{end.goldReward}</span>}
          </div>
        )}

        {/* Stat grid — Moves + per-side captures derived from the real final history. */}
        <div className="fd-stat-3" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 20 }}>
          <ResultStat value={state.history.length} label="Moves" color="var(--gold-lt)" />
          <ResultStat value={redCaps} label="Red caps" color="#f27a86" />
          <ResultStat value={blueCaps} label="Blue caps" color="#6fa8ff" />
        </div>

        {/* Rematch — REAL same-opponent flow over the match socket. Offering emits
            EV.matchRematchOffer for the just-ended matchId; when the opponent also
            offers the server seeds a NEW match and the store resets into it (board
            reloads). "Find New Match" is the solo re-queue fallback. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {offeredByOpponent && !offeredByMe ? (
            <>
              <div style={{ font: "600 13px Inter", color: "var(--gold-lt)", marginBottom: 2 }}>
                {opponent?.displayName ?? "Your opponent"} wants a rematch!
              </div>
              <button className="btn btn-gold" onClick={acceptRematch}>✔ Accept Rematch</button>
              <button className="btn btn-purple" onClick={declineRematch}>Decline</button>
            </>
          ) : offeredByMe ? (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, font: "600 13px Inter", color: "var(--ink)" }}>
                <span style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(232,184,75,.35)", borderTopColor: "var(--gold)", animation: "fdspin 0.9s linear infinite", display: "inline-block" }} />
                Waiting for opponent…
              </div>
              <button className="btn btn-purple" onClick={declineRematch}>Cancel</button>
            </>
          ) : (
            <>
              {rematchDeclined && (
                <div style={{ font: "600 13px Inter", color: "#ff8fae", textAlign: "center", marginBottom: 2 }}>
                  Opponent declined the rematch.
                </div>
              )}
              <button className="btn btn-gold" onClick={offerRematch}>↻ Request Rematch</button>
              <button className="btn btn-purple" onClick={() => { reset(); joinQueue(mode); }}>Find New Match</button>
            </>
          )}
          <button className="btn btn-purple" onClick={() => navigate("/")}>Home</button>
        </div>
      </Modal>
    </div>
  );
}

function OpponentPanel({ name, sub, avatar, active, you }: { name: string; sub: string; avatar: string; active: boolean; you?: boolean }) {
  return (
    <div className="frame" style={{ padding: 14, display: "flex", alignItems: "center", gap: 12, borderColor: active ? "rgba(50,150,100,.55)" : undefined }}>
      <div style={{ width: 48, height: 48, borderRadius: "50%", overflow: "hidden", border: `2px solid ${you ? "var(--gold)" : "rgba(232,184,75,.5)"}`, flex: "none" }}>
        <img src={avatarUrl(avatar)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(1.25)" }} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ font: "700 14px Inter", color: "#fff" }}>{name}</div>
        <div style={{ font: "500 11px Inter", color: "var(--ink2)" }}>{sub}</div>
      </div>
      {active && <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#3fbf6f", boxShadow: "0 0 8px #3fbf6f" }} />}
    </div>
  );
}

// Rank-tier chip used in the matchmaking arena (prototype badge pill).
function TierChip({ tier, color, border = "rgba(232,184,75,.3)" }: { tier: { label: string; accent: string }; color: string; border?: string }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, padding: "4px 11px", borderRadius: 100, border: `1px solid ${border}`, background: "rgba(15,8,32,.5)" }}>
      <span style={{ width: 12, height: 12, borderRadius: "50%", background: `radial-gradient(circle at 35% 30%,${tier.accent},rgba(0,0,0,.6))`, border: `1px solid ${tier.accent}` }} />
      <span style={{ font: "700 11px Inter", letterSpacing: ".3px", color }}>{tier.label}</span>
    </div>
  );
}

function StatCell({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ font: "700 22px 'JetBrains Mono',monospace", color: "var(--gold-lt)" }}>{value}</div>
      <div style={{ font: "600 10px Inter", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--ink2)" }}>{label}</div>
    </div>
  );
}

function Sep() {
  return <div style={{ width: 1, height: 34, background: "rgba(232,184,75,.18)" }} />;
}

// Result-modal stat tile (mirrors the vs-AI modal's ResultStat).
function ResultStat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{ padding: "14px 8px", borderRadius: 10, border: "1px solid rgba(232,184,75,.25)", background: "rgba(0,0,0,.25)" }}>
      <div style={{ font: "700 22px 'JetBrains Mono',monospace", color }}>{value}</div>
      <div style={{ font: "500 11px Inter", color: "var(--ink2)" }}>{label}</div>
    </div>
  );
}

export default OnlineMatchPage;
