import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { rankTierFor, type GameSettings } from "@dama/shared";
import { Avatar } from "../../components";
import { api, ApiError } from "../../lib/api";
import { useAppStore } from "../../stores/appStore";
import { useAuthStore } from "../../stores/authStore";
import { useRoomStore, type RoomMember } from "../../stores/roomStore";
import { useOnlineStore } from "../../stores/onlineStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useGameSounds } from "../../lib/useGameSounds";
import { Board } from "../../components";
import { ShareInviteModal } from "./ShareInviteModal";

/**
 * PrivateRoomPage — Private Match / Invite lobby, ported from the approved
 * prototype (lines 452-624) and wired LIVE to the room socket via roomStore.
 *
 * Everything here is REAL:
 *   • Room code       → the server-issued code from EV.roomState (create/join).
 *   • Host / Guest    → the actual members the server reports (no fabrication).
 *   • Spectators      → real spectator chips from roomState.spectators[].
 *   • Kick / Ban      → host-only emits (EV.roomKick / EV.roomBan).
 *   • Settings        → host-only Move Timer, written to settings.moveTimerSec and
 *                       echoed back by the server's authoritative roomState.
 *   • Start Match     → host-only; on EV.roomStart the server seeds a real match
 *                       and we navigate into /play/online (the online match view).
 *   • Room chat       → sendChat → "room:chat"; the live feed comes back the same
 *                       way and is rendered from roomStore.chat.
 *   • Invite Friends  → GET /api/friends (the player's real accepted friends);
 *                       "Invite" shares the room code/link (no fake in-app DM).
 *
 * Honest empty states are driven by REAL room state: "Waiting…" when there is no
 * guest, "No one is watching yet" when spectators is empty, an empty chat until a
 * message arrives. Errors (room not found / banned / kicked / host left) surface
 * as an honest banner. Logged out: no socket fires and we prompt sign-in.
 */

/** publicFriend() shape returned by /api/friends. */
type FriendUser = {
  id: string;
  username: string;
  displayName: string;
  tag: string;
  avatarUrl: string | null;
  frameId: string | null;
  trophies: number;
  rankTier: string;
  lastSeenAt: string;
  presence: "unknown";
};

type ModeKey = "classic" | "blitz";
type TimeKey = "5" | "10" | "unlimited";
type MoveKey = "10" | "20" | "30" | "off";

const MODES: { key: ModeKey; label: string }[] = [
  { key: "classic", label: "Classic" },
  { key: "blitz", label: "Blitz" },
];
const TIMES: { key: TimeKey; label: string }[] = [
  { key: "5", label: "5 min" },
  { key: "10", label: "10 min" },
  { key: "unlimited", label: "Unlimited" },
];
const MOVE_TIMERS: { key: MoveKey; label: string }[] = [
  { key: "10", label: "10s" },
  { key: "20", label: "20s" },
  { key: "30", label: "30s" },
  { key: "off", label: "Off" },
];
const EMOTES = ["👋 Hi!", "😄 GG", "🔥 Let's go", "🤝 Good luck"];

/** Map the room's authoritative moveTimerSec → the segmented Move Timer key. */
function moveKeyFromSettings(s: GameSettings): MoveKey {
  const v = s.moveTimerSec;
  if (v === 10 || v === 20 || v === 30) return String(v) as MoveKey;
  return "off";
}
/** Inverse: a Move Timer key → the settings patch to send the server. */
function settingsFromMoveKey(k: MoveKey): Partial<GameSettings> {
  return { moveTimerSec: k === "off" ? undefined : Number(k) };
}

/** Resolve a tier {label,color} — always derived from trophies (authoritative). */
function tierOf(u: FriendUser): { label: string; color: string } {
  const t = rankTierFor(u.trophies);
  return { label: t.label, color: t.accent };
}

/** Segmented control button style (selected vs idle) — matches prototype. */
function segStyle(active: boolean, disabled = false): React.CSSProperties {
  return {
    flex: 1,
    padding: "9px 8px",
    borderRadius: 8,
    cursor: disabled ? "not-allowed" : "pointer",
    font: "700 12px Inter",
    border: active ? "1px solid rgba(232,184,75,.6)" : "1px solid rgba(232,184,75,.2)",
    background: active ? "rgba(232,184,75,.14)" : "rgba(15,8,32,.5)",
    color: active ? "var(--gold-lt)" : "var(--ink)",
    opacity: disabled ? 0.55 : 1,
  };
}

export function PrivateRoomPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const me = useAuthStore((s) => s.me);
  const guestSignIn = useAuthStore((s) => s.guest);
  const showToast = useAppStore((s) => s.showToast);

  // ── Live room state (server-owned via roomStore) ──
  const {
    code,
    hostId,
    host,
    guest,
    spectators,
    settings,
    matchId,
    chat,
    connecting,
    error,
    startedMatchId,
    spectateMatchId,
    create,
    join,
    spectate,
    setSettings,
    kick,
    ban,
    start,
    leave,
    sendChat,
    consumeStart,
    clearError,
    reset,
  } = useRoomStore();

  const iAmHost = !!me && !!hostId && me.id === hostId;
  const inRoom = !!code;

  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);

  const [joinInput, setJoinInput] = useState("");
  const [copyLabel, setCopyLabel] = useState("Copy");
  // Local host preferences the server has no field for yet (kept honest: these
  // are NOT presented as live shared state — only the Move Timer writes to the
  // server). Mirrored back into the segmented controls for the host.
  const [mode, setMode] = useState<ModeKey>("classic");
  const [time, setTime] = useState<TimeKey>("10");
  const [allowSpec, setAllowSpec] = useState(true);
  const [chatInput, setChatInput] = useState("");
  const [shareOpen, setShareOpen] = useState(false);

  // The Move Timer reflects the AUTHORITATIVE room settings (server broadcast).
  const moveTimer = moveKeyFromSettings(settings);

  // Collapse the two-column layout on narrow viewports (no room-grid class in the
  // global stylesheet, so we drive it responsively here — prototype parity).
  const [narrow, setNarrow] = useState(
    typeof window !== "undefined" ? window.innerWidth <= 860 : false,
  );
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth <= 860);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ── Auto-enter from a shared link: ?code=XXXX (&spectate=1 to watch) ──
  const queryCode = params.get("code");
  const querySpectate = params.get("spectate") === "1";
  const autoJoinedRef = useRef(false);
  useEffect(() => {
    if (autoJoinedRef.current) return;
    if (inRoom) return;
    if (!queryCode) return;
    // Guard immediately so the async guest() below can't re-trigger this effect
    // (me flips from null → guest) into a double-join.
    autoJoinedRef.current = true;
    void (async () => {
      // Zero-friction invite: a logged-out friend who clicks the shared link is
      // dropped straight into the room as a guest (owner-approved). Create the
      // guest account first, THEN join/spectate by the invite code.
      if (!me) {
        try {
          await guestSignIn();
        } catch {
          autoJoinedRef.current = false;
          showToast("Couldn't join as guest. Try signing in.");
          return;
        }
      }
      await (querySpectate ? spectate(queryCode) : join(queryCode));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, queryCode, querySpectate]);

  // ── Navigate into the online match once the host starts (EV.roomStart) ──
  useEffect(() => {
    if (startedMatchId) {
      consumeStart();
      navigate("/play/online");
    }
  }, [startedMatchId, consumeStart, navigate]);

  // ── Surface room errors as an honest toast + reset the input on failure ──
  useEffect(() => {
    if (!error) return;
    if (error.kind === "not-found") showToast(`No room found for code ${error.code}.`);
    else if (error.kind === "banned" || error.kind === "you-banned")
      showToast("You're banned from that room.");
    else if (error.kind === "kicked") showToast("You were removed from the room.");
    else if (error.kind === "closed") showToast("The host closed the room.");
  }, [error, showToast]);

  // ── Leave the room when we unmount (frees the seat server-side) ──
  useEffect(() => {
    return () => {
      leave();
      reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the player's real friends for the invite list.
  useEffect(() => {
    if (!me) {
      setFriends([]);
      setFriendsLoading(false);
      return;
    }
    let alive = true;
    setFriendsLoading(true);
    void (async () => {
      try {
        const f = await api.get<{ friends: FriendUser[] }>("/api/friends");
        if (alive) setFriends(f.friends);
      } catch (e) {
        if (alive && !(e instanceof ApiError && e.status === 401)) {
          showToast("Couldn't load friends. Try again in a moment.");
        }
      } finally {
        if (alive) setFriendsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [me, showToast]);

  const roomLink = useMemo(
    () => (code ? `${window.location.origin}/rooms?code=${code}` : ""),
    [code],
  );

  async function copyText(text: string, done: () => void) {
    try {
      await navigator.clipboard.writeText(text);
      done();
    } catch {
      showToast("Couldn't copy — copy it manually.");
    }
  }

  const roomCopy = () =>
    void copyText(code ?? "", () => {
      setCopyLabel("Copied!");
      window.setTimeout(() => setCopyLabel("Copy"), 1600);
    });
  const roomCopyLink = () =>
    void copyText(roomLink, () => showToast("Room link copied to clipboard."));
  const specShare = () =>
    void copyText(`${roomLink}&spectate=1`, () => showToast("Spectate link copied to clipboard."));
  const inviteFriend = () =>
    void copyText(roomLink, () => showToast("Room link copied — send it to your friend."));

  function doCreate() {
    clearError();
    void create();
  }
  function doJoin(e?: React.FormEvent) {
    e?.preventDefault();
    const c = joinInput.trim();
    if (!c) return;
    clearError();
    void join(c);
  }
  function doLeave() {
    leave();
    // Drop any ?code= so a re-entry starts clean.
    if (queryCode) setParams({}, { replace: true });
    autoJoinedRef.current = false;
    navigate("/play");
  }
  function pickMoveTimer(k: MoveKey) {
    if (!iAmHost) return;
    setSettings(settingsFromMoveKey(k));
  }
  function doStart() {
    if (!iAmHost) return;
    if (!guest) {
      showToast("Waiting for an opponent to join.");
      return;
    }
    start();
  }
  function submitChat(e: React.FormEvent) {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    sendChat(text);
    setChatInput("");
  }

  // ---- Logged-out prompt (never crash) ----
  if (!me) {
    return (
      <div className="fd-page-pad" style={{ maxWidth: 960, margin: "0 auto", padding: "40px 26px 60px" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ font: "700 12px Inter", letterSpacing: 3, color: "var(--gold)" }}>
            ✦ PRIVATE MATCH ✦
          </div>
          <h1 style={{ margin: "10px 0 6px", font: "800 clamp(28px,4vw,40px) Cinzel,serif" }}>
            <span
              style={{
                background: "linear-gradient(180deg,#f7e2a0,#d5a63a)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Your Private Room
            </span>
          </h1>
          <p style={{ font: "400 14px Inter", color: "var(--ink)", margin: 0 }}>
            Sign in to create a private room and invite your friends.
          </p>
        </div>
        <div
          className="frame"
          style={{ padding: 34, textAlign: "center", maxWidth: 480, margin: "0 auto" }}
        >
          <button
            className="btn btn-gold"
            onClick={() => navigate("/login")}
            style={{ padding: "12px 24px" }}
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  // ---- No room yet: Create or Join by code (real server flow) ----
  if (!inRoom) {
    return (
      <div className="fd-page-pad" style={{ maxWidth: 720, margin: "0 auto", padding: "40px 26px 60px" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ font: "700 12px Inter", letterSpacing: 3, color: "var(--gold)" }}>
            ✦ PRIVATE MATCH ✦
          </div>
          <h1 style={{ margin: "10px 0 6px", font: "800 clamp(28px,4vw,40px) Cinzel,serif" }}>
            <span
              style={{
                background: "linear-gradient(180deg,#f7e2a0,#d5a63a)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Private Room
            </span>
          </h1>
          <p style={{ font: "400 14px Inter", color: "var(--ink)", margin: 0 }}>
            Create a room and share the code, or join a friend&rsquo;s room.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: narrow ? "minmax(0,1fr)" : "1fr 1fr",
            gap: 20,
            alignItems: "stretch",
          }}
        >
          {/* Create */}
          <div className="frame fd-card-m" style={{ padding: 26, textAlign: "center" }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>👑</div>
            <div className="ptitle" style={{ margin: "0 0 8px" }}>
              Host a Room
            </div>
            <div style={{ font: "500 13px Inter", color: "var(--ink2)", marginBottom: 18 }}>
              Create a private room, set the rules, and invite a friend to play.
            </div>
            <button
              className="btn btn-gold"
              onClick={doCreate}
              disabled={connecting}
              style={{ padding: "13px 26px", opacity: connecting ? 0.7 : 1 }}
            >
              {connecting ? "Creating…" : "Create Room"}
            </button>
          </div>

          {/* Join */}
          <div className="frame fd-card-m" style={{ padding: 26, textAlign: "center" }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>🎟</div>
            <div className="ptitle" style={{ margin: "0 0 8px" }}>
              Join by Code
            </div>
            <div style={{ font: "500 13px Inter", color: "var(--ink2)", marginBottom: 18 }}>
              Got a room code from a friend? Enter it to jump in.
            </div>
            <form
              onSubmit={doJoin}
              className="fd-btn-stack"
              style={{ display: "flex", gap: 8, justifyContent: "center" }}
            >
              <input
                value={joinInput}
                onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={6}
                className="fd-nozoom"
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "12px 14px",
                  borderRadius: 8,
                  border: "1px solid rgba(232,184,75,.3)",
                  background: "rgba(15,8,32,.6)",
                  color: "#fff",
                  font: "800 16px 'JetBrains Mono',monospace",
                  letterSpacing: 3,
                  textAlign: "center",
                  outline: "none",
                }}
              />
              <button
                type="submit"
                className="btn btn-purple"
                disabled={connecting || !joinInput.trim()}
                style={{ padding: "12px 18px", opacity: connecting || !joinInput.trim() ? 0.6 : 1 }}
              >
                Join
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const started = !!matchId;

  return (
    <div className="fd-page-pad" style={{ maxWidth: 960, margin: "0 auto", padding: "40px 26px 60px" }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ font: "700 12px Inter", letterSpacing: 3, color: "var(--gold)" }}>
          ✦ PRIVATE MATCH ✦
        </div>
        <h1 style={{ margin: "10px 0 6px", font: "800 clamp(28px,4vw,40px) Cinzel,serif" }}>
          <span
            style={{
              background: "linear-gradient(180deg,#f7e2a0,#d5a63a)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            {iAmHost ? "Your Private Room" : `${host?.name ?? "Host"}'s Room`}
          </span>
        </h1>
        <p style={{ font: "400 14px Inter", color: "var(--ink)", margin: 0 }}>
          {iAmHost
            ? "Share your code to invite a friend — start the match when they arrive."
            : "You're in the room. Waiting for the host to start the match."}
        </p>
      </div>

      {/* SPECTATOR: a live, read-only board when a match is running and we joined
          to watch (not play). Rendered from the same onlineStore feed the players
          use — spectators receive matchMoved but can never move (myColor is null). */}
      {spectateMatchId && (
        <div style={{ marginBottom: 24 }}>
          <SpectatorBoard hostName={host?.name ?? "Red"} guestName={guest?.name ?? "Blue"} />
        </div>
      )}

      <div
        className="fd-stack"
        style={{
          display: "grid",
          gridTemplateColumns: narrow ? "minmax(0,1fr)" : "1fr 320px",
          gap: 20,
          alignItems: "start",
        }}
      >
        {/* LEFT: room code + players */}
        <div className="fd-order-1" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* room code */}
          <div className="frame fd-card-m" style={{ padding: 24, textAlign: "center" }}>
            <div
              style={{
                font: "700 12px Inter",
                letterSpacing: 2,
                textTransform: "uppercase",
                color: "var(--gold-lt)",
                marginBottom: 12,
              }}
            >
              Room Code
            </div>
            <div
              className="fd-btn-stack"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  font: "800 clamp(26px,7vw,34px) 'JetBrains Mono',monospace",
                  letterSpacing: 4,
                  color: "#fff",
                  padding: "12px 24px",
                  borderRadius: 12,
                  border: "1px solid rgba(232,184,75,.4)",
                  background: "rgba(15,8,32,.6)",
                }}
              >
                {code}
              </div>
              <button className="btn btn-purple" onClick={roomCopy} style={{ padding: "13px 18px" }}>
                {copyLabel}
              </button>
            </div>
            <div style={{ font: "400 12px Inter", color: "var(--ink2)", marginTop: 12 }}>
              Share this code with a friend, or invite someone below to join instantly.
            </div>
            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "center",
                marginTop: 16,
                flexWrap: "wrap",
              }}
            >
              <button onClick={roomCopyLink} style={pillBtnStyle}>
                🔗 Copy Link
              </button>
              <button onClick={() => setShareOpen(true)} style={pillBtnStyle}>
                ✉ Share Invite
              </button>
            </div>
          </div>

          {/* players */}
          <div className="frame fd-card-m" style={{ padding: 26 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto 1fr",
                alignItems: "center",
                gap: "clamp(8px,3vw,18px)",
              }}
            >
              {/* host (real member) */}
              <PlayerCard
                member={host}
                badge="Host"
                badgeColor="var(--gold)"
                isMe={!!host && host.userId === me.id}
              />
              <div
                style={{
                  width: "clamp(44px,12vw,56px)",
                  height: "clamp(44px,12vw,56px)",
                  flex: "none",
                  borderRadius: "50%",
                  border: "1px solid rgba(232,184,75,.4)",
                  background: "rgba(15,8,32,.7)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  font: "900 17px Cinzel,serif",
                  color: "var(--gold)",
                }}
              >
                VS
              </div>
              {/* guest — real member, or an honest waiting state */}
              {guest ? (
                <div style={{ textAlign: "center", position: "relative" }}>
                  <PlayerCard
                    member={guest}
                    badge="Challenger"
                    badgeColor="var(--gold-lt)"
                    isMe={guest.userId === me.id}
                  />
                  {iAmHost && (
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        justifyContent: "center",
                        marginTop: 10,
                      }}
                    >
                      <button onClick={() => kick(guest.userId)} style={kickBtnStyle}>
                        Kick
                      </button>
                      <button onClick={() => ban(guest.userId)} style={banBtnStyle}>
                        Ban
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      width: "clamp(68px,20vw,96px)",
                      height: "clamp(68px,20vw,96px)",
                      margin: "0 auto 10px",
                      borderRadius: "50%",
                      border: "2px dashed rgba(232,184,75,.3)",
                      background: "rgba(15,8,32,.5)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      font: "800 28px Cinzel,serif",
                      color: "rgba(232,184,75,.4)",
                      animation: "fdpulse 1.8s ease-in-out infinite",
                    }}
                  >
                    ?
                  </div>
                  <div style={{ font: "800 16px Cinzel,serif", color: "var(--ink2)" }}>Waiting…</div>
                  <div style={{ font: "600 11px Inter", color: "var(--ink)", marginTop: 5 }}>
                    No one has joined yet
                  </div>
                </div>
              )}
            </div>

            {/* match settings */}
            <div
              className="fd-collapse-2"
              style={{
                marginTop: 22,
                paddingTop: 20,
                borderTop: "1px solid rgba(232,184,75,.18)",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <div>
                <div style={settingLabelStyle}>Game Mode</div>
                <div className="fd-seg" style={{ display: "flex", gap: 8 }}>
                  {MODES.map((m) => (
                    <button
                      key={m.key}
                      onClick={() => iAmHost && setMode(m.key)}
                      disabled={!iAmHost}
                      style={segStyle(mode === m.key, !iAmHost)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div style={settingLabelStyle}>Time Control</div>
                <div className="fd-seg" style={{ display: "flex", gap: 8 }}>
                  {TIMES.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => iAmHost && setTime(t.key)}
                      disabled={!iAmHost}
                      style={segStyle(time === t.key, !iAmHost)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <div style={{ ...settingLabelStyle, marginBottom: 0 }}>Move Timer</div>
                <div style={{ font: "500 12px Inter", color: "var(--ink2)" }}>
                  {moveTimer === "off" ? "No per-move limit" : `${moveTimer}s per move`}
                </div>
              </div>
              <div className="fd-seg" style={{ display: "flex", gap: 8 }}>
                {MOVE_TIMERS.map((mt) => (
                  <button
                    key={mt.key}
                    onClick={() => pickMoveTimer(mt.key)}
                    disabled={!iAmHost}
                    style={segStyle(moveTimer === mt.key, !iAmHost)}
                  >
                    {mt.label}
                  </button>
                ))}
              </div>
              {!iAmHost && (
                <div style={{ font: "500 11px Inter", color: "var(--ink2)", marginTop: 8 }}>
                  Only the host can change the match settings.
                </div>
              )}
            </div>
          </div>

          {/* spectators — real chips from roomState.spectators[] */}
          <div className="frame fd-card-m" style={{ padding: 20 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div>
                <div className="ptitle" style={{ textAlign: "left", margin: 0 }}>
                  Spectators
                </div>
                <div style={{ font: "600 12px Inter", color: "var(--ink2)", marginTop: 3 }}>
                  {spectators.length > 0
                    ? `${spectators.length} watching this room.`
                    : "Friends can watch this match live."}
                </div>
              </div>
              {iAmHost && <Switch on={allowSpec} onToggle={() => setAllowSpec((v) => !v)} />}
            </div>
            {spectators.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
                {spectators.map((s) => (
                  <div
                    key={s.userId}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 12px 6px 6px",
                      borderRadius: 100,
                      border: "1px solid rgba(232,184,75,.2)",
                      background: "rgba(15,8,32,.5)",
                    }}
                  >
                    <Avatar src={s.avatarUrl ?? "champion"} size={24} />
                    <span style={{ font: "700 12px Inter", color: "#fff" }}>{s.name}</span>
                    {iAmHost && (
                      <button
                        onClick={() => kick(s.userId)}
                        title="Remove spectator"
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "var(--ink2)",
                          cursor: "pointer",
                          font: "700 13px Inter",
                          lineHeight: 1,
                          padding: 0,
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ marginTop: 16 }}>
                <div
                  style={{
                    font: "500 13px Inter",
                    color: "var(--ink)",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span style={{ fontSize: 16 }}>👁</span> No one is watching yet — share the spectate
                  link to let friends tune in.
                </div>
                <button onClick={specShare} style={{ ...pillBtnStyle, marginTop: 14 }}>
                  👁 Copy Spectate Link
                </button>
              </div>
            )}
          </div>

          {/* actions */}
          <div
            className="fd-btn-stack"
            style={{ display: "flex", gap: 12, justifyContent: "center" }}
          >
            {iAmHost && (
              <button
                className="btn btn-red"
                onClick={doStart}
                disabled={!guest || started}
                style={{
                  fontSize: 15,
                  padding: "15px 34px",
                  opacity: !guest || started ? 0.55 : 1,
                  cursor: !guest || started ? "not-allowed" : "pointer",
                }}
              >
                {started ? "Match Started" : guest ? "⚔ Start Match" : "⚔ Waiting for Opponent"}
              </button>
            )}
            <button className="btn btn-purple" onClick={doLeave} style={{ fontSize: 14 }}>
              Leave Room
            </button>
          </div>
        </div>

        {/* RIGHT: invite friends + chat */}
        <div className="fd-order-2 fd-stack" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="frame fd-card-m fd-order-2" style={{ padding: 20 }}>
            <div className="ptitle" style={{ textAlign: "left", marginBottom: 14 }}>
              Invite Friends
            </div>
            {friendsLoading ? (
              <div style={{ font: "500 13px Inter", color: "var(--ink2)", padding: "8px 2px" }}>
                Loading friends…
              </div>
            ) : friends.length === 0 ? (
              <div
                style={{
                  padding: "20px 14px",
                  textAlign: "center",
                  borderRadius: 10,
                  border: "1px dashed rgba(232,184,75,.2)",
                  background: "rgba(0,0,0,.18)",
                  color: "var(--ink2)",
                  font: "500 13px Inter",
                }}
              >
                No friends yet.{" "}
                <span
                  onClick={() => navigate("/friends")}
                  style={{ color: "var(--gold-lt)", cursor: "pointer", textDecoration: "underline" }}
                >
                  Add some
                </span>{" "}
                to invite them here.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {friends.map((fr) => {
                  const t = tierOf(fr);
                  const alreadyIn =
                    guest?.userId === fr.id || spectators.some((s) => s.userId === fr.id);
                  return (
                    <div
                      key={fr.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 11,
                        padding: 9,
                        borderRadius: 10,
                        border: "1px solid rgba(232,184,75,.14)",
                        background: "rgba(15,8,32,.4)",
                      }}
                    >
                      <div style={{ position: "relative", flex: "none" }}>
                        <Avatar
                          src={fr.avatarUrl ?? "champion"}
                          size={40}
                          frame={fr.frameId ?? undefined}
                        />
                        <span
                          title="Presence goes live with online play"
                          style={{
                            position: "absolute",
                            right: -1,
                            bottom: -1,
                            width: 11,
                            height: 11,
                            borderRadius: "50%",
                            background: "var(--ink2)",
                            border: "2px solid #1a0f2e",
                          }}
                        />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            font: "700 13px Inter",
                            color: "#fff",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {fr.displayName}
                        </div>
                        <div style={{ font: "600 11px Inter", color: t.color }}>{t.label}</div>
                      </div>
                      <button
                        onClick={inviteFriend}
                        disabled={alreadyIn}
                        style={{
                          padding: "7px 14px",
                          borderRadius: 100,
                          border: "1px solid rgba(232,184,75,.3)",
                          background: "rgba(15,8,32,.5)",
                          color: "var(--gold-lt)",
                          font: "700 12px Inter",
                          cursor: alreadyIn ? "default" : "pointer",
                          opacity: alreadyIn ? 0.5 : 1,
                        }}
                      >
                        {alreadyIn ? "In room" : "Invite"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* room chat — live over "room:chat" */}
          <RoomChat
            className="fd-card-m fd-order-1"
            me={me.id}
            chat={chat}
            input={chatInput}
            onInput={setChatInput}
            onSubmit={submitChat}
            onEmote={(em) => sendChat(em)}
          />
        </div>
      </div>

      {/* Social-media invite sheet — opens from the "Share Invite" control. */}
      <ShareInviteModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        roomLink={roomLink}
        code={code ?? ""}
        hostName={host?.name ?? "A friend"}
      />
    </div>
  );
}

/** A real player card (host or guest) — driven entirely by the server member. */
function PlayerCard({
  member,
  badge,
  badgeColor,
  isMe,
}: {
  member: RoomMember | null;
  badge: string;
  badgeColor: string;
  isMe: boolean;
}) {
  if (!member) return null;
  return (
    <div style={{ textAlign: "center" }}>
      <Avatar
        src={member.avatarUrl ?? "champion"}
        size={96}
        style={{ margin: "0 auto 10px", width: "clamp(68px,20vw,96px)", height: "clamp(68px,20vw,96px)" }}
      />
      <div style={{ font: "800 16px Cinzel,serif", color: "var(--gold-lt)" }}>
        {member.name}
        {isMe && <span style={{ font: "600 11px Inter", color: "var(--ink2)" }}> (You)</span>}
      </div>
      <div
        style={{
          display: "inline-block",
          marginTop: 5,
          font: "700 10px Inter",
          letterSpacing: 1,
          textTransform: "uppercase",
          color: badgeColor,
          padding: "3px 10px",
          borderRadius: 100,
          border: "1px solid rgba(232,184,75,.4)",
        }}
      >
        {badge}
      </div>
    </div>
  );
}

/** Room chat panel — renders the live "room:chat" feed and sends new lines. */
function RoomChat({
  className,
  me,
  chat,
  input,
  onInput,
  onSubmit,
  onEmote,
}: {
  className?: string;
  me: string;
  chat: { id: string; from: RoomMember; body: string; at: number }[];
  input: string;
  onInput: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onEmote: (em: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length]);

  return (
    <div
      className={`frame${className ? ` ${className}` : ""}`}
      style={{ padding: 20, display: "flex", flexDirection: "column" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div className="ptitle" style={{ textAlign: "left", margin: 0 }}>
          Room Chat
        </div>
        <span style={{ font: "600 11px Inter", color: "#5fd39a" }}>● Live</span>
      </div>
      <div
        ref={scrollRef}
        style={{
          height: 230,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          paddingRight: 4,
          ...(chat.length === 0
            ? { alignItems: "center", justifyContent: "center", textAlign: "center" }
            : {}),
        }}
      >
        {chat.length === 0 ? (
          <div style={{ font: "500 13px Inter", color: "var(--ink2)", padding: "0 12px" }}>
            No messages yet — say hi to your opponent.
          </div>
        ) : (
          chat.map((m) => {
            const mine = m.from.userId === me;
            return (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: mine ? "flex-end" : "flex-start",
                }}
              >
                {!mine && (
                  <span style={{ font: "700 11px Inter", color: "var(--gold-lt)", marginBottom: 2 }}>
                    {m.from.name}
                  </span>
                )}
                <span
                  style={{
                    maxWidth: "85%",
                    padding: "8px 12px",
                    borderRadius: 12,
                    font: "500 13px Inter",
                    color: "#fff",
                    background: mine ? "rgba(232,184,75,.18)" : "rgba(15,8,32,.7)",
                    border: mine
                      ? "1px solid rgba(232,184,75,.35)"
                      : "1px solid rgba(232,184,75,.14)",
                  }}
                >
                  {m.body}
                </span>
              </div>
            );
          })
        )}
      </div>
      {/* quick emotes — real sends over room:chat */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "12px 0 10px" }}>
        {EMOTES.map((em) => (
          <button
            key={em}
            onClick={() => onEmote(em)}
            style={{
              padding: "6px 11px",
              borderRadius: 100,
              border: "1px solid rgba(232,184,75,.2)",
              background: "rgba(15,8,32,.5)",
              color: "var(--ink)",
              font: "600 11px Inter",
              cursor: "pointer",
            }}
          >
            {em}
          </button>
        ))}
      </div>
      <form onSubmit={onSubmit} style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => onInput(e.target.value)}
          placeholder="Message…"
          className="fd-nozoom"
          style={{
            flex: 1,
            minWidth: 0,
            padding: "11px 13px",
            borderRadius: 8,
            border: "1px solid rgba(232,184,75,.25)",
            background: "rgba(15,8,32,.6)",
            color: "#fff",
            font: "500 13px Inter",
            outline: "none",
          }}
        />
        <button type="submit" className="btn btn-purple" style={{ padding: "11px 16px", fontSize: 13 }}>
          Send
        </button>
      </form>
    </div>
  );
}

const pillBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "9px 16px",
  borderRadius: 100,
  border: "1px solid rgba(232,184,75,.3)",
  background: "rgba(15,8,32,.5)",
  color: "var(--gold-lt)",
  font: "700 12px Inter",
  cursor: "pointer",
};

const kickBtnStyle: React.CSSProperties = {
  padding: "5px 12px",
  borderRadius: 100,
  border: "1px solid rgba(232,184,75,.3)",
  background: "rgba(15,8,32,.5)",
  color: "var(--gold-lt)",
  font: "700 11px Inter",
  cursor: "pointer",
};

const banBtnStyle: React.CSSProperties = {
  padding: "5px 12px",
  borderRadius: 100,
  border: "1px solid rgba(220,80,80,.4)",
  background: "rgba(60,15,15,.4)",
  color: "#f0a0a0",
  font: "700 11px Inter",
  cursor: "pointer",
};

const settingLabelStyle: React.CSSProperties = {
  font: "700 11px Inter",
  letterSpacing: 1.5,
  textTransform: "uppercase",
  color: "var(--gold-lt)",
  marginBottom: 8,
};

/** Gold toggle switch matching the prototype's lock/spectator switches. */
function Switch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      role="switch"
      aria-checked={on}
      style={{
        position: "relative",
        width: 46,
        height: 26,
        flex: "none",
        borderRadius: 100,
        cursor: "pointer",
        border: "1px solid rgba(232,184,75,.4)",
        background: on ? "rgba(232,184,75,.35)" : "rgba(15,8,32,.7)",
        transition: "background .15s ease",
        padding: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 22 : 2,
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: on ? "var(--gold-lt)" : "var(--ink2)",
          transition: "left .15s ease, background .15s ease",
        }}
      />
    </button>
  );
}

/**
 * SpectatorBoard — a live, READ-ONLY view of the room's in-progress match for a
 * spectator. Reads the server-authoritative board from the onlineStore (the same
 * feed players use); a spectator has myColor=null so the board is non-interactive
 * and onSquareClick no-ops. Red = host, Blue = guest. Shows whose turn it is and
 * the result when the game ends.
 */
function SpectatorBoard({ hostName, guestName }: { hostName: string; guestName: string }) {
  const state = useOnlineStore((s) => s.state);
  const skin = useSettingsStore((s) => s.skin);
  // Spectators hear the game too (myColor null → neutral end flourish).
  useGameSounds(state, null);

  if (!state) {
    return (
      <div className="frame" style={{ padding: 28, textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, font: "600 13px Inter", color: "var(--ink)" }}>
          <span style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(232,184,75,.35)", borderTopColor: "var(--gold)", animation: "fdspin .9s linear infinite", display: "inline-block" }} />
          Loading the live board…
        </div>
      </div>
    );
  }

  const turnLabel = state.result
    ? state.result.winner === "draw"
      ? "Draw"
      : `${state.result.winner === "red" ? hostName : guestName} wins`
    : `${state.turn === "red" ? hostName : guestName}'s move`;

  return (
    <div className="frame" style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ font: "700 12px Inter", letterSpacing: 1, textTransform: "uppercase", color: "#8ce0ad" }}>👁 Spectating · Live</span>
        <span style={{ font: "700 13px Inter", color: "var(--gold-lt)" }}>{turnLabel}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, font: "700 13px Inter" }}>
        <span style={{ color: "#ff9aa8" }}>🔴 {hostName}</span>
        <span style={{ color: "var(--ink2)", font: "600 11px Inter" }}>VS</span>
        <span style={{ color: "#7fb2ff" }}>🔵 {guestName}</span>
      </div>
      <div style={{ width: "min(92vw,520px)", maxWidth: "100%", margin: "0 auto" }}>
        {/* No onSquareClick / legalTargets — a spectator only observes. */}
        <Board state={state} redSkin={skin} blueSkin="default" />
      </div>
    </div>
  );
}

export default PrivateRoomPage;
