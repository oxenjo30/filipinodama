import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RANK_TIERS, rankTierFor } from "@dama/shared";
import { Avatar } from "../../components";
import { api, ApiError } from "../../lib/api";
import { useAppStore } from "../../stores/appStore";
import { useAuthStore } from "../../stores/authStore";

/**
 * FriendsPage — social hub ported from the approved prototype (lines 2026-2109).
 *
 * FULLY LIVE-WIRED — no mock data, no fabricated roster:
 *   GET  /api/friends            → accepted friends
 *   GET  /api/friends/requests   → { incoming, outgoing } pending requests
 *   GET  /api/friends/suggested  → discovery candidates (real users)
 *   POST /api/friends/request                 { toUserId }   (Add)
 *   POST /api/friends/request/:id/accept                     (Accept)
 *   POST /api/friends/request/:id/decline                    (Decline)
 *
 * Presence is NOT delivered over REST (the server reports presence:"unknown"),
 * so we do not invent an Online/Offline split — every accepted friend lives in
 * one honest "Friends" list, and the "Online Now" tile reads 0 until realtime
 * presence lands (owned by another task). Every section shows an honest EMPTY
 * state when there is nothing. Logged out: no fetch fires and we prompt sign-in.
 */

/** publicFriend() shape the server returns for friends / requests / suggestions. */
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
type FriendReq = { id: string; createdAt: string; user: FriendUser };

/** Resolve a tier {label,color} — ALWAYS derived from trophies (the authoritative
 *  source); the stored rankTier column is a cache that can be stale. */
function tierOf(u: FriendUser): { label: string; color: string } {
  const t = rankTierFor(u.trophies);
  return { label: t.label, color: t.accent };
}

function summaryFor(friends: number, online: number, requests: number): { k: string; v: string; c: string }[] {
  return [
    { k: "Friends", v: String(friends), c: "var(--gold-lt)" },
    { k: "Online Now", v: String(online), c: "#7ee6a4" },
    { k: "Requests", v: String(requests), c: "#ff9aa6" },
  ];
}

/** Honest empty-state panel shared by Requests / Friends / Suggested sections. */
function EmptyPanel({ title, message }: { title: string; message: string }) {
  return (
    <div className="frame" style={{ padding: 22 }}>
      <div className="ptitle" style={{ textAlign: "left", marginBottom: 14 }}>
        {title}
      </div>
      <div
        style={{
          padding: "26px 16px",
          textAlign: "center",
          borderRadius: 12,
          border: "1px dashed rgba(232,184,75,.2)",
          background: "rgba(0,0,0,.18)",
          color: "var(--ink2)",
          font: "500 14px Inter",
        }}
      >
        {message}
      </div>
    </div>
  );
}

/** Identity block (avatar + name + tag + tier pill) — clicking opens the profile. */
function UserIdentity({
  user,
  onOpen,
  nameColor = "#fff",
}: {
  user: FriendUser;
  onOpen: () => void;
  nameColor?: string;
}) {
  const tier = tierOf(user);
  return (
    <>
      <Avatar src={user.avatarUrl ?? "champion"} size={44} frame={user.frameId ?? undefined} />
      <div onClick={onOpen} style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ font: "700 15px Inter", color: nameColor }}>{user.displayName}</span>
          <span style={{ font: "700 11px 'JetBrains Mono',monospace", color: "var(--ink2)" }}>
            {user.tag}
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "2px 8px",
              borderRadius: 100,
              border: "1px solid rgba(232,184,75,.2)",
              background: "rgba(15,8,32,.5)",
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: tier.color }} />
            <span style={{ font: "600 10px Inter", color: tier.color }}>{tier.label}</span>
          </span>
        </div>
        <div style={{ font: "500 12px Inter", color: "var(--ink2)", marginTop: 3 }}>
          {user.trophies.toLocaleString()} 🏆
        </div>
      </div>
    </>
  );
}

export function FriendsPage() {
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.me);
  const showToast = useAppStore((s) => s.showToast);

  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [incoming, setIncoming] = useState<FriendReq[]>([]);
  const [suggested, setSuggested] = useState<FriendUser[]>([]);
  const [query, setQuery] = useState("");
  /** ids currently mid-request so their button disables (add/accept/decline). */
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!me) {
      setFriends([]);
      setIncoming([]);
      setSuggested([]);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    void (async () => {
      try {
        const [f, r, s] = await Promise.all([
          api.get<{ friends: FriendUser[] }>("/api/friends"),
          api.get<{ incoming: FriendReq[]; outgoing: FriendReq[] }>("/api/friends/requests"),
          api.get<{ suggested: FriendUser[] }>("/api/friends/suggested"),
        ]);
        if (!alive) return;
        setFriends(f.friends);
        setIncoming(r.incoming);
        setSuggested(s.suggested);
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 401)) {
          showToast("Couldn't load friends. Try again in a moment.");
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [me, showToast]);

  const markBusy = (id: string, v: boolean) =>
    setBusy((b) => ({ ...b, [id]: v }));

  /** Add a suggested user → POST /api/friends/request; remove from suggestions. */
  async function addFriend(u: FriendUser) {
    if (busy[u.id]) return;
    markBusy(u.id, true);
    try {
      const res = await api.post<{ status: string }>("/api/friends/request", { toUserId: u.id });
      setSuggested((list) => list.filter((x) => x.id !== u.id));
      if (res.status === "accepted") {
        // reverse request existed → now friends
        setFriends((list) => [u, ...list]);
        showToast(`You are now friends with ${u.displayName}.`);
      } else {
        showToast(`Friend request sent to ${u.displayName}.`);
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Couldn't send request. Try again.";
      showToast(msg);
    } finally {
      markBusy(u.id, false);
    }
  }

  /** Accept an incoming request → move sender into the friends list. */
  async function acceptRequest(req: FriendReq) {
    if (busy[req.id]) return;
    markBusy(req.id, true);
    try {
      await api.post(`/api/friends/request/${req.id}/accept`);
      setIncoming((list) => list.filter((r) => r.id !== req.id));
      setFriends((list) => [req.user, ...list]);
      showToast(`You are now friends with ${req.user.displayName}.`);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Couldn't accept request. Try again.";
      showToast(msg);
    } finally {
      markBusy(req.id, false);
    }
  }

  /** Decline an incoming request → drop it from the list. */
  async function declineRequest(req: FriendReq) {
    if (busy[req.id]) return;
    markBusy(req.id, true);
    try {
      await api.post(`/api/friends/request/${req.id}/decline`);
      setIncoming((list) => list.filter((r) => r.id !== req.id));
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Couldn't decline request. Try again.";
      showToast(msg);
    } finally {
      markBusy(req.id, false);
    }
  }

  // There is no public profile-by-id route yet; the leaderboard is the real
  // place to view other players, so identity clicks route there (no dead 404).
  const openProfile = (_id: string) => navigate("/leaderboard");

  /** Client-side filter over the real friends list (name / tag / tier). */
  const filteredFriends = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter((f) => {
      const tier = tierOf(f).label.toLowerCase();
      return (
        f.displayName.toLowerCase().includes(q) ||
        f.tag.toLowerCase().includes(q) ||
        tier.includes(q)
      );
    });
  }, [friends, query]);

  const SUMMARY = summaryFor(friends.length, 0, incoming.length);

  // ---- Logged-out prompt (never crash) ----
  if (!me) {
    return (
      <div
        style={{
          maxWidth: 900,
          margin: "0 auto",
          padding: 26,
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <div>
          <div
            style={{
              font: "700 12px Inter",
              letterSpacing: 2,
              textTransform: "uppercase",
              color: "var(--gold)",
            }}
          >
            Your Circle
          </div>
          <h1 style={{ margin: "6px 0 0", font: "800 32px Cinzel,serif", color: "var(--gold-lt)" }}>
            Friends
          </h1>
        </div>
        <div
          className="frame"
          style={{ padding: 34, textAlign: "center", display: "flex", flexDirection: "column", gap: 16 }}
        >
          <div style={{ font: "600 15px Inter", color: "var(--ink)" }}>
            Sign in to build your circle and challenge your friends.
          </div>
          <div>
            <button className="btn btn-gold" onClick={() => navigate("/login")} style={{ padding: "12px 24px" }}>
              Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: 900,
        margin: "0 auto",
        padding: 26,
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              font: "700 12px Inter",
              letterSpacing: 2,
              textTransform: "uppercase",
              color: "var(--gold)",
            }}
          >
            Your Circle
          </div>
          <h1 style={{ margin: "6px 0 0", font: "800 32px Cinzel,serif", color: "var(--gold-lt)" }}>
            Friends
          </h1>
        </div>
        <button
          className="btn btn-gold"
          onClick={() => {
            const el = document.getElementById("fd-suggested");
            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
            else showToast("No players to add right now — check back soon.");
          }}
          style={{ padding: "12px 20px" }}
        >
          ＋ Add Friend
        </button>
      </div>

      {/* Summary tiles — real counts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        {SUMMARY.map((c) => (
          <div key={c.k} className="frame" style={{ padding: 18, textAlign: "center" }}>
            <div style={{ font: "800 26px 'JetBrains Mono',monospace", color: c.c }}>{c.v}</div>
            <div style={{ font: "500 12px Inter", color: "var(--ink2)", marginTop: 3 }}>{c.k}</div>
          </div>
        ))}
      </div>

      {/* Search — filters the real friends list */}
      <div
        className="frame"
        style={{ padding: "5px 10px", display: "flex", alignItems: "center", gap: 8 }}
      >
        <span style={{ paddingLeft: 8, fontSize: 15, color: "var(--ink2)" }}>🔍</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search friends by name or tier…"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "#efe7fb",
            font: "500 14px Inter",
            padding: "13px 6px",
          }}
        />
      </div>

      {loading ? (
        <div
          className="frame"
          style={{ padding: 34, textAlign: "center", color: "var(--ink2)", font: "500 14px Inter" }}
        >
          Loading your circle…
        </div>
      ) : (
        <>
          {/* Friend Requests — real incoming pending requests */}
          {incoming.length === 0 ? (
            <EmptyPanel title="Friend Requests · 0" message="No pending requests." />
          ) : (
            <div className="frame" style={{ padding: 22 }}>
              <div className="ptitle" style={{ textAlign: "left", marginBottom: 14 }}>
                Friend Requests · {incoming.length}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {incoming.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid rgba(232,184,75,.16)",
                      background: "rgba(0,0,0,.2)",
                    }}
                  >
                    <Avatar
                      src={r.user.avatarUrl ?? "champion"}
                      size={44}
                      frame={r.user.frameId ?? undefined}
                    />
                    <div
                      onClick={() => openProfile(r.user.id)}
                      style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                    >
                      <div style={{ font: "700 15px Inter", color: "#fff" }}>{r.user.displayName}</div>
                      <div style={{ font: "500 12px Inter", color: "var(--ink2)", marginTop: 2 }}>
                        {r.user.tag} · {tierOf(r.user).label}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flex: "none" }}>
                      <button
                        onClick={() => acceptRequest(r)}
                        disabled={busy[r.id]}
                        style={{
                          padding: "9px 16px",
                          borderRadius: 8,
                          border: "1px solid rgba(63,191,111,.55)",
                          background: "rgba(63,191,111,.16)",
                          color: "#7ee6a4",
                          font: "700 12px Inter",
                          cursor: busy[r.id] ? "default" : "pointer",
                          opacity: busy[r.id] ? 0.6 : 1,
                        }}
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => declineRequest(r)}
                        disabled={busy[r.id]}
                        style={{
                          padding: "9px 14px",
                          borderRadius: 8,
                          border: "1px solid rgba(232,184,75,.2)",
                          background: "transparent",
                          color: "var(--ink2)",
                          font: "700 12px Inter",
                          cursor: busy[r.id] ? "default" : "pointer",
                          opacity: busy[r.id] ? 0.6 : 1,
                        }}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Friends — real accepted friends (presence unknown over REST → one list) */}
          {friends.length === 0 ? (
            <EmptyPanel title="Friends · 0" message="No friends yet — add some to play together." />
          ) : (
            <div className="frame" style={{ padding: 22 }}>
              <div className="ptitle" style={{ textAlign: "left", marginBottom: 14 }}>
                Friends · {friends.length}
              </div>
              {filteredFriends.length === 0 ? (
                <div
                  style={{
                    padding: "22px 16px",
                    textAlign: "center",
                    color: "var(--ink2)",
                    font: "500 14px Inter",
                  }}
                >
                  No friends match “{query.trim()}”.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {filteredFriends.map((f) => (
                    <div
                      key={f.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        padding: 12,
                        borderRadius: 12,
                        border: "1px solid rgba(232,184,75,.16)",
                        background: "rgba(0,0,0,.2)",
                      }}
                    >
                      <UserIdentity user={f} onOpen={() => openProfile(f.id)} />
                      <div style={{ display: "flex", gap: 8, flex: "none", alignItems: "center" }}>
                        <button
                          onClick={() => navigate("/play")}
                          style={{
                            padding: "9px 16px",
                            borderRadius: 8,
                            border: "1px solid rgba(232,184,75,.4)",
                            background: "rgba(232,184,75,.1)",
                            color: "var(--gold-lt)",
                            font: "700 12px Inter",
                            cursor: "pointer",
                          }}
                        >
                          Invite
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Suggested Players — real discovery candidates from /friends/suggested */}
          {suggested.length > 0 && (
            <div id="fd-suggested" className="frame" style={{ padding: 22 }}>
              <div className="ptitle" style={{ textAlign: "left", marginBottom: 14 }}>
                Suggested Players
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {suggested.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid rgba(232,184,75,.16)",
                      background: "rgba(0,0,0,.2)",
                    }}
                  >
                    <UserIdentity user={s} onOpen={() => openProfile(s.id)} />
                    <div style={{ display: "flex", gap: 8, flex: "none", alignItems: "center" }}>
                      <button
                        onClick={() => addFriend(s)}
                        disabled={busy[s.id]}
                        style={{
                          padding: "9px 16px",
                          borderRadius: 8,
                          border: "1px solid rgba(63,191,111,.55)",
                          background: "rgba(63,191,111,.16)",
                          color: "#7ee6a4",
                          font: "700 12px Inter",
                          cursor: busy[s.id] ? "default" : "pointer",
                          opacity: busy[s.id] ? 0.6 : 1,
                        }}
                      >
                        ＋ Add
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default FriendsPage;
