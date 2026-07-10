import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { DamathVariant } from "@dama/shared";
import { Avatar, Button } from "../../components";
import { useAppStore } from "../../stores/appStore";
import { useAuthStore } from "../../stores/authStore";
import { api, ApiError } from "../../lib/api";
import { useDamathRoomStore } from "../../stores/damathRoomStore";
import { useDamathOnlineStore } from "../../stores/damathOnlineStore";
import { variantInfo } from "./variants";

type FriendUser = {
  id: string;
  displayName: string;
  tag: string;
  avatarUrl: string | null;
  trophies: number;
};

const EMOTES = ["👋 Hi!", "😄 GG", "🔥 Let's go", "🤝 Good luck"];

const goldHeading: React.CSSProperties = {
  background: "linear-gradient(180deg,#f7e2a0,#d5a63a)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
};

/**
 * DamathRoomPage — Math Dama private room, matching Classic's private-room look
 * and features: VS card with avatars, Copy Code / Copy Link / Share, an Invite
 * Friends panel (real friends), live Room Chat, and auto-join from a shared
 * ?code= link. Built on the Damath room stack (damathRoomStore + damath-rooms.ts);
 * Classic's rooms are untouched.
 */
export function DamathRoomPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const me = useAuthStore((s) => s.me);
  const guestSignIn = useAuthStore((s) => s.guest);
  const showToast = useAppStore((s) => s.showToast);
  const attachMatch = useDamathOnlineStore((s) => s.attachMatch);

  const variant = (params.get("variant") as DamathVariant) || "whole";

  const {
    code,
    hostId,
    host,
    guest,
    spectators,
    variant: liveVariant,
    chat,
    error,
    startInfo,
    create,
    join,
    spectate,
    start,
    leave,
    sendChat,
    consumeStart,
    clearError,
    reset,
  } = useDamathRoomStore();

  const iAmHost = !!me && !!hostId && me.id === hostId;
  const inRoom = !!code;

  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [joinInput, setJoinInput] = useState("");
  const [copyLabel, setCopyLabel] = useState("Copy");
  const [chatInput, setChatInput] = useState("");
  const [narrow, setNarrow] = useState(typeof window !== "undefined" ? window.innerWidth <= 860 : false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth <= 860);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Auto-scroll chat to the newest line.
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.length]);

  // Auto-enter from a shared link: ?code=XXXXXX (&spectate=1 to watch). A
  // logged-out visitor is dropped in as a guest first.
  const queryCode = params.get("code");
  const querySpectate = params.get("spectate") === "1";
  const autoJoinedRef = useRef(false);
  useEffect(() => {
    if (autoJoinedRef.current || inRoom || !queryCode) return;
    autoJoinedRef.current = true;
    void (async () => {
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

  // Host started → adopt the seeded match + go to the board.
  useEffect(() => {
    if (startInfo) {
      const { matchId, yourColor, variant: v } = startInfo;
      consumeStart();
      void attachMatch(matchId, yourColor, v);
      navigate("/damath/online?from=room");
    }
  }, [startInfo, consumeStart, attachMatch, navigate]);

  // Surface room errors honestly.
  useEffect(() => {
    if (!error) return;
    if (error.kind === "not-found") showToast(`No room found for code ${error.code ?? ""}.`);
    else if (error.kind === "full") showToast("That room is already full.");
    else if (error.kind === "closed") showToast("The host closed the room.");
    else showToast("Couldn't reach the server.");
  }, [error, showToast]);

  // Leave on unmount (frees the seat).
  useEffect(() => {
    return () => {
      leave();
      reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load real friends for the invite list.
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
          showToast("Couldn't load friends.");
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
    () => (code ? `${window.location.origin}/damath/room?code=${code}` : ""),
    [code],
  );

  const copyText = async (text: string, done: () => void) => {
    try {
      await navigator.clipboard.writeText(text);
      done();
    } catch {
      showToast("Couldn't copy — copy it manually.");
    }
  };
  const copyCode = () =>
    void copyText(code ?? "", () => {
      setCopyLabel("Copied!");
      window.setTimeout(() => setCopyLabel("Copy"), 1600);
    });
  const copyLink = () => void copyText(roomLink, () => showToast("Room link copied."));
  const copySpectateLink = () => void copyText(`${roomLink}&spectate=1`, () => showToast("Spectate link copied — friends can watch."));
  const inviteFriend = () => void copyText(roomLink, () => showToast("Room link copied — send it to your friend."));

  const doCreate = () => {
    clearError();
    void create(variant);
  };
  const doJoin = (e?: React.FormEvent) => {
    e?.preventDefault();
    const c = joinInput.trim();
    if (!c) return;
    clearError();
    void join(c);
  };
  const doLeave = () => {
    leave();
    if (queryCode) setParams({}, { replace: true });
    autoJoinedRef.current = false;
    navigate("/damath");
  };
  const doStart = () => {
    if (!iAmHost) return;
    if (!guest) {
      showToast("Waiting for an opponent to join.");
      return;
    }
    start();
  };
  const submitChat = (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    sendChat(text);
    setChatInput("");
  };

  const info = variantInfo(inRoom ? liveVariant : variant);

  // ── Logged-out prompt ──
  if (!me) {
    return (
      <div className="fd-page-pad" style={{ maxWidth: 640, margin: "0 auto", padding: "48px 26px 60px", textAlign: "center" }}>
        <div style={{ font: "700 12px Inter", letterSpacing: 3, color: "var(--gold)" }}>✦ PRIVATE MATCH ✦</div>
        <h1 style={{ margin: "10px 0 10px", font: "800 clamp(26px,4vw,38px) Cinzel,serif" }}>
          <span style={goldHeading}>Math Dama · Private Room</span>
        </h1>
        <p style={{ font: "400 14px Inter", color: "var(--ink)", marginBottom: 22 }}>
          Sign in to host or join a private Math Dama room.
        </p>
        <Button variant="gold" onClick={() => navigate(`/login?next=${encodeURIComponent(`/damath/room?variant=${variant}`)}`)}>
          Sign In
        </Button>
      </div>
    );
  }

  return (
    <div className="fd-page-pad" style={{ maxWidth: 1180, margin: "0 auto", padding: "36px 26px 60px" }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ font: "700 12px Inter", letterSpacing: 3, color: "var(--gold)" }}>✦ PRIVATE MATCH ✦</div>
        <h1 style={{ margin: "10px 0 6px", font: "800 clamp(26px,4vw,40px) Cinzel,serif" }}>
          <span style={goldHeading}>{inRoom ? "Your Private Room" : "Math Dama · Private Room"}</span>
        </h1>
        <p style={{ font: "400 14px Inter", color: "var(--ink)", margin: 0 }}>
          {info?.label ?? "Whole"} ·{" "}
          {inRoom ? "Share your code to invite a friend — start the match when they arrive." : "Invite a friend with a code and play on two devices."}
        </p>
      </div>

      {!inRoom ? (
        <div style={{ display: "grid", gap: 16, maxWidth: 560, margin: "0 auto" }}>
          <div className="frame" style={{ padding: 24, textAlign: "center" }}>
            <div className="ptitle">Host a room</div>
            <p style={{ font: "400 13px Inter", color: "var(--ink)", margin: "6px 0 16px" }}>
              Create a room and share the code (or link) with your friend.
            </p>
            <Button variant="gold" onClick={doCreate}>Create Room</Button>
          </div>
          <div className="frame" style={{ padding: 24, textAlign: "center" }}>
            <div className="ptitle">Join a room</div>
            <form onSubmit={doJoin} style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12, flexWrap: "wrap" }}>
              <input
                value={joinInput}
                onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
                placeholder="ENTER CODE"
                maxLength={6}
                style={codeInput}
              />
              <Button variant="purple" type="submit">Join</Button>
            </form>
          </div>
          <div style={{ textAlign: "center" }}>
            <button onClick={() => navigate("/damath")} style={backBtn}>← Back</button>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "minmax(0,1fr) 340px", gap: 18, alignItems: "start" }}>
          {/* LEFT: code + VS card */}
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div className="frame" style={{ padding: 22, textAlign: "center" }}>
              <div className="ptitle">Room Code</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, margin: "10px 0 6px", flexWrap: "wrap" }}>
                <div style={{ font: "800 30px 'JetBrains Mono',monospace", letterSpacing: 6, color: "var(--gold-lt)", padding: "8px 18px", borderRadius: 10, border: "1px solid rgba(232,184,75,.3)", background: "rgba(0,0,0,.3)" }}>
                  {code}
                </div>
                <Button variant="purple" size="sm" onClick={copyCode}>{copyLabel}</Button>
              </div>
              <p style={{ font: "400 12px Inter", color: "var(--ink2)", margin: "4px 0 14px" }}>
                Share this code with a friend, or send them the link to join instantly.
              </p>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                <button onClick={copyLink} style={pillBtn}>🔗 Copy Link</button>
                <button onClick={inviteFriend} style={pillBtn}>✉ Share Invite</button>
                <button onClick={copySpectateLink} style={pillBtn}>👁 Spectate Link</button>
              </div>
            </div>

            <div className="frame" style={{ padding: 24 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 22 }}>
                <SeatCard label="Host (Red)" member={host} isYou={host?.userId === me.id} tag="HOST" />
                <div style={{ font: "800 20px Cinzel,serif", color: "var(--gold)" }}>VS</div>
                <SeatCard label="Guest (Blue)" member={guest} isYou={guest?.userId === me.id} waiting="Waiting…" />
              </div>

              <div style={{ marginTop: 20, borderTop: "1px solid rgba(232,184,75,.14)", paddingTop: 16 }}>
                {iAmHost ? (
                  <Button variant="gold" block disabled={!guest} onClick={doStart}>
                    {guest ? "Start Match" : "Waiting for a guest to join…"}
                  </Button>
                ) : (
                  <div style={{ textAlign: "center", font: "600 13px Inter", color: "var(--ink)" }}>
                    Waiting for the host to start the match…
                  </div>
                )}
              </div>
            </div>

            {/* Spectators — friends watching this room (read-only). */}
            <div className="frame" style={{ padding: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span className="ptitle" style={{ marginBottom: 0 }}>Spectators</span>
                <button onClick={copySpectateLink} style={{ ...pillBtn, padding: "6px 12px", fontSize: 11 }}>👁 Copy Spectate Link</button>
              </div>
              {spectators.length === 0 ? (
                <div style={{ font: "500 12px Inter", color: "var(--ink2)", padding: "12px 4px 2px" }}>
                  No one is watching yet — share the spectate link to let friends tune in.
                </div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                  {spectators.map((sp) => (
                    <div key={sp.userId} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 100, background: "rgba(0,0,0,.25)" }}>
                      <Avatar src={sp.avatarUrl ?? "champion"} size={22} ring={false} />
                      <span style={{ font: "600 12px Inter", color: "var(--ink)" }}>{sp.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ textAlign: "center" }}>
              <button onClick={doLeave} style={backBtn}>Leave room</button>
            </div>
          </div>

          {/* RIGHT: invite friends + chat */}
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div className="frame" style={{ padding: 18 }}>
              <div className="ptitle">Invite Friends</div>
              {friendsLoading ? (
                <div style={{ font: "500 12px Inter", color: "var(--ink2)", textAlign: "center", padding: "16px 0" }}>Loading…</div>
              ) : friends.length === 0 ? (
                <div style={{ font: "500 12px Inter", color: "var(--ink2)", textAlign: "center", padding: "14px 8px", lineHeight: 1.5 }}>
                  No friends yet.{" "}
                  <button onClick={() => navigate("/friends")} style={linkBtn}>Add some</button> to invite them here.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
                  {friends.map((f) => (
                    <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: 8, background: "rgba(0,0,0,.2)" }}>
                      <Avatar src={f.avatarUrl ?? "champion"} size={30} ring={false} />
                      <span style={{ font: "600 13px Inter", color: "var(--ink)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.displayName}</span>
                      <button onClick={inviteFriend} style={{ ...pillBtn, padding: "5px 12px", fontSize: 11 }}>Invite</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="frame" style={{ padding: 18, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className="ptitle" style={{ marginBottom: 0 }}>Room Chat</span>
                <span style={{ font: "700 10px Inter", color: "#8ce0ad" }}>● Live</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, minHeight: 120, maxHeight: 200, overflowY: "auto", margin: "12px 0" }}>
                {chat.length === 0 ? (
                  <div style={{ font: "500 12px Inter", color: "var(--ink2)", textAlign: "center", padding: "22px 8px" }}>
                    No messages yet — say hi to your opponent.
                  </div>
                ) : (
                  chat.map((m) => (
                    <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: m.from.userId === me.id ? "flex-end" : "flex-start" }}>
                      <span style={{ font: "700 10px Inter", color: "var(--ink2)", marginBottom: 2 }}>{m.from.userId === me.id ? "You" : m.from.name}</span>
                      <span style={{ font: "500 13px Inter", color: "#fff", background: m.from.userId === me.id ? "rgba(232,184,75,.16)" : "rgba(46,107,198,.2)", padding: "6px 10px", borderRadius: 10, maxWidth: "85%" }}>{m.body}</span>
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {EMOTES.map((e) => (
                  <button key={e} onClick={() => sendChat(e)} style={{ ...pillBtn, padding: "5px 10px", fontSize: 12 }}>{e}</button>
                ))}
              </div>
              <form onSubmit={submitChat} style={{ display: "flex", gap: 6 }}>
                <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Message…" style={{ ...codeInput, flex: 1, letterSpacing: 0, textAlign: "left", font: "500 13px Inter", width: "auto" }} />
                <Button variant="gold" size="sm" type="submit">Send</Button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SeatCard({ label, member, isYou, tag, waiting }: { label: string; member: { userId: string; name: string; avatarUrl: string | null } | null; isYou?: boolean; tag?: string; waiting?: string }) {
  return (
    <div style={{ textAlign: "center", minWidth: 120 }}>
      {member ? (
        <Avatar src={member.avatarUrl ?? "champion"} size={72} />
      ) : (
        <div style={{ width: 72, height: 72, margin: "0 auto", borderRadius: "50%", border: "2px dashed rgba(232,184,75,.3)", display: "grid", placeItems: "center", color: "var(--ink2)", fontSize: 26 }}>?</div>
      )}
      <div style={{ font: "700 15px Cinzel,serif", color: member ? "var(--gold-lt)" : "var(--ink2)", marginTop: 8 }}>
        {member ? member.name : (waiting ?? "—")}
        {isYou && <span style={{ font: "500 11px Inter", color: "var(--ink2)" }}> (You)</span>}
      </div>
      {member && tag && (
        <span style={{ display: "inline-block", marginTop: 4, font: "700 9px Inter", letterSpacing: 1, textTransform: "uppercase", color: "var(--gold-lt)", background: "rgba(232,184,75,.15)", padding: "2px 8px", borderRadius: 100 }}>{tag}</span>
      )}
      {!member && <div style={{ font: "500 11px Inter", color: "var(--ink2)", marginTop: 4 }}>{label}</div>}
    </div>
  );
}

const codeInput: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: 8,
  border: "1px solid rgba(232,184,75,.35)",
  background: "rgba(0,0,0,.3)",
  color: "#fff",
  font: "700 16px 'JetBrains Mono',monospace",
  letterSpacing: 3,
  textAlign: "center",
  width: 180,
};

const pillBtn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 100,
  border: "1px solid rgba(232,184,75,.3)",
  background: "rgba(15,8,32,.5)",
  color: "var(--gold-lt)",
  font: "600 12px Inter",
  cursor: "pointer",
};

const backBtn: React.CSSProperties = {
  padding: "12px 22px",
  borderRadius: 8,
  border: "1px solid rgba(232,184,75,.35)",
  background: "rgba(15,8,32,.5)",
  color: "var(--gold-lt)",
  font: "700 12px Inter",
  letterSpacing: 1,
  textTransform: "uppercase",
  cursor: "pointer",
};

const linkBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--gold-lt)",
  textDecoration: "underline",
  cursor: "pointer",
  font: "inherit",
  padding: 0,
};

export default DamathRoomPage;
