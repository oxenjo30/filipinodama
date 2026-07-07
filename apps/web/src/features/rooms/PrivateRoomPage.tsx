import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RANK_TIERS, rankTierFor } from "@dama/shared";
import { Avatar } from "../../components";
import { api, ApiError } from "../../lib/api";
import { useAppStore } from "../../stores/appStore";
import { useAuthStore } from "../../stores/authStore";

/**
 * PrivateRoomPage — Private Match / Invite lobby, ported verbatim from the
 * approved prototype (lines 452-624).
 *
 * The realtime room SOCKET backend is not built yet, so this page does NOT
 * fabricate other players, spectators, or chat. What IS live:
 *   • Host card       → the logged-in user (authStore.me) — real name, avatar,
 *                       frame and rank tier. No placeholder identity.
 *   • Room code       → generated locally for a genuine "create a room code"
 *                       flow the host can copy/share right now.
 *   • Invite Friends  → GET /api/friends (the player's real accepted friends).
 *
 * Everything that needs the room server (a guest actually joining, spectators
 * tuning in, live chat, starting the match, sending an invite) surfaces an
 * HONEST toast: "Private rooms go live with the room server." The guest slot
 * stays in its true "Waiting…" empty state, spectators show the real empty
 * state, and room chat renders empty — nothing is faked. Logged out: no fetch
 * fires and we prompt sign-in instead of crashing.
 */

const ROOM_SERVER_MSG = "Private rooms go live with the room server.";

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

/** Generate a shareable 6-char room code (real, local to this create flow). */
function makeRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

/** Resolve a tier {label,color} for a friend from rankTier (fallback: trophies). */
function tierOf(u: FriendUser): { label: string; color: string } {
  const t = RANK_TIERS.find((x) => x.key === u.rankTier) ?? rankTierFor(u.trophies);
  return { label: t.label, color: t.accent };
}

/** Segmented control button style (selected vs idle) — matches prototype. */
function segStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: "9px 8px",
    borderRadius: 8,
    cursor: "pointer",
    font: "700 12px Inter",
    border: active ? "1px solid rgba(232,184,75,.6)" : "1px solid rgba(232,184,75,.2)",
    background: active ? "rgba(232,184,75,.14)" : "rgba(15,8,32,.5)",
    color: active ? "var(--gold-lt)" : "var(--ink)",
  };
}

export function PrivateRoomPage() {
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.me);
  const showToast = useAppStore((s) => s.showToast);

  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);

  // Local room state (real create-code flow; no faked join/socket).
  const [roomCode] = useState(makeRoomCode);
  const [copyLabel, setCopyLabel] = useState("Copy");
  const [roomLocked, setRoomLocked] = useState(false);
  const [allowSpec, setAllowSpec] = useState(true);
  const [mode, setMode] = useState<ModeKey>("classic");
  const [time, setTime] = useState<TimeKey>("10");
  const [moveTimer, setMoveTimer] = useState<MoveKey>("20");
  const [chatInput, setChatInput] = useState("");

  // Collapse the two-column layout to one column on narrow viewports (the
  // global stylesheet has no room-grid class, so we drive it responsively here).
  const [narrow, setNarrow] = useState(
    typeof window !== "undefined" ? window.innerWidth <= 860 : false,
  );
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth <= 860);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
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
    () => `${window.location.origin}/rooms?code=${roomCode}`,
    [roomCode],
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
    void copyText(roomCode, () => {
      setCopyLabel("Copied!");
      window.setTimeout(() => setCopyLabel("Copy"), 1600);
    });
  const roomCopyLink = () =>
    void copyText(roomLink, () => showToast("Room link copied to clipboard."));
  const specShare = () =>
    void copyText(`${roomLink}&spectate=1`, () => showToast("Spectate link copied to clipboard."));

  // ---- Logged-out prompt (never crash) ----
  if (!me) {
    return (
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "40px 26px 60px" }}>
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

  const tier = RANK_TIERS.find((x) => x.key === me.rankTier) ?? rankTierFor(me.trophies);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "40px 26px 60px" }}>
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
            Your Private Room
          </span>
        </h1>
        <p style={{ font: "400 14px Inter", color: "var(--ink)", margin: 0 }}>
          Share your code to invite a friend — the match goes live with the room server.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: narrow ? "minmax(0,1fr)" : "1fr 320px",
          gap: 20,
          alignItems: "start",
        }}
      >
        {/* LEFT: room code + players */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* room code */}
          <div className="frame" style={{ padding: 24, textAlign: "center" }}>
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
                  font: "800 34px 'JetBrains Mono',monospace",
                  letterSpacing: 6,
                  color: "#fff",
                  padding: "12px 24px",
                  borderRadius: 12,
                  border: "1px solid rgba(232,184,75,.4)",
                  background: "rgba(15,8,32,.6)",
                }}
              >
                {roomCode}
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
              <button onClick={() => showToast(ROOM_SERVER_MSG)} style={pillBtnStyle}>
                ✉ Send Invite
              </button>
              <button onClick={() => showToast(ROOM_SERVER_MSG)} style={pillBtnStyle}>
                💬 Message
              </button>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginTop: 18,
                paddingTop: 16,
                borderTop: "1px solid rgba(232,184,75,.16)",
                textAlign: "left",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <span style={{ fontSize: 18 }}>{roomLocked ? "🔒" : "🔓"}</span>
                <div>
                  <div style={{ font: "700 13px Inter", color: "#fff" }}>Lock the room</div>
                  <div style={{ font: "500 12px Inter", color: "var(--ink2)", marginTop: 2 }}>
                    {roomLocked
                      ? "Only friends you invite can join with the code."
                      : "Anyone with the code can join."}
                  </div>
                </div>
              </div>
              <Switch on={roomLocked} onToggle={() => setRoomLocked((v) => !v)} />
            </div>
          </div>

          {/* players */}
          <div className="frame" style={{ padding: 26 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto 1fr",
                alignItems: "center",
                gap: 18,
              }}
            >
              {/* host */}
              <div style={{ textAlign: "center" }}>
                <Avatar
                  src={me.avatarUrl ?? "champion"}
                  size={96}
                  frame={me.frameId ?? undefined}
                  style={{ margin: "0 auto 10px" }}
                />
                <div style={{ font: "800 16px Cinzel,serif", color: "var(--gold-lt)" }}>
                  {me.displayName}
                </div>
                <div
                  style={{
                    display: "inline-block",
                    marginTop: 5,
                    font: "700 10px Inter",
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    color: "var(--gold)",
                    padding: "3px 10px",
                    borderRadius: 100,
                    border: "1px solid rgba(232,184,75,.4)",
                  }}
                >
                  Host
                </div>
              </div>
              <div
                style={{
                  width: 56,
                  height: 56,
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
              {/* guest — genuinely waiting (no faked join without the room server) */}
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    width: 96,
                    height: 96,
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
            </div>

            {/* match settings */}
            <div
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
                <div style={{ display: "flex", gap: 8 }}>
                  {MODES.map((m) => (
                    <button key={m.key} onClick={() => setMode(m.key)} style={segStyle(mode === m.key)}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div style={settingLabelStyle}>Time Control</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {TIMES.map((t) => (
                    <button key={t.key} onClick={() => setTime(t.key)} style={segStyle(time === t.key)}>
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
              <div style={{ display: "flex", gap: 8 }}>
                {MOVE_TIMERS.map((mt) => (
                  <button key={mt.key} onClick={() => setMoveTimer(mt.key)} style={segStyle(moveTimer === mt.key)}>
                    {mt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* spectators — real empty state; no faked viewers */}
          <div className="frame" style={{ padding: 20 }}>
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
                  {allowSpec ? "Friends can watch this match live." : "Spectating is turned off."}
                </div>
              </div>
              <Switch on={allowSpec} onToggle={() => setAllowSpec((v) => !v)} />
            </div>
            {allowSpec ? (
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
                <button
                  onClick={specShare}
                  style={{ ...pillBtnStyle, marginTop: 14 }}
                >
                  👁 Copy Spectate Link
                </button>
              </div>
            ) : (
              <div style={{ marginTop: 14, font: "500 13px Inter", color: "var(--ink2)" }}>
                Spectators are turned off. Only you and your opponent can see this match.
              </div>
            )}
          </div>

          {/* actions */}
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button
              className="btn btn-red"
              onClick={() => showToast(ROOM_SERVER_MSG)}
              style={{ fontSize: 15, padding: "15px 34px" }}
            >
              ⚔ Start Match
            </button>
            <button
              className="btn btn-purple"
              onClick={() => navigate("/play")}
              style={{ fontSize: 14 }}
            >
              Leave Room
            </button>
          </div>
        </div>

        {/* RIGHT: invite friends + chat */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="frame" style={{ padding: 20 }}>
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
                        <Avatar src={fr.avatarUrl ?? "champion"} size={40} frame={fr.frameId ?? undefined} />
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
                        onClick={() => showToast(ROOM_SERVER_MSG)}
                        style={{
                          padding: "7px 14px",
                          borderRadius: 100,
                          border: "1px solid rgba(232,184,75,.3)",
                          background: "rgba(15,8,32,.5)",
                          color: "var(--gold-lt)",
                          font: "700 12px Inter",
                          cursor: "pointer",
                        }}
                      >
                        Invite
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* room chat — empty until the room server delivers messages */}
          <div className="frame" style={{ padding: 20, display: "flex", flexDirection: "column" }}>
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
              <span style={{ font: "600 11px Inter", color: "var(--ink2)" }}>● Offline</span>
            </div>
            <div
              style={{
                height: 230,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                paddingRight: 4,
                textAlign: "center",
              }}
            >
              <div style={{ font: "500 13px Inter", color: "var(--ink2)", padding: "0 12px" }}>
                Chat opens when the room server is live and a friend joins.
              </div>
            </div>
            {/* quick emotes */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "12px 0 10px" }}>
              {EMOTES.map((em) => (
                <button
                  key={em}
                  onClick={() => showToast(ROOM_SERVER_MSG)}
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
            <form
              onSubmit={(e) => {
                e.preventDefault();
                showToast(ROOM_SERVER_MSG);
                setChatInput("");
              }}
              style={{ display: "flex", gap: 8 }}
            >
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Message…"
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
        </div>
      </div>
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

export default PrivateRoomPage;
