import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { rankTierFor } from "@dama/shared";
import { Avatar } from "../../components";
import { api, ApiError } from "../../lib/api";
import { ReportPlayerModal } from "../moderation/ReportPlayerModal";
import { useAppStore } from "../../stores/appStore";
import { useAuthStore } from "../../stores/authStore";
import { usePresenceStore } from "../../stores/presenceStore";

/**
 * FriendsPage — social hub ported from the approved prototype (lines 2026-2109).
 *
 * FULLY LIVE-WIRED — no mock data, no fabricated roster:
 *   GET  /api/friends            → accepted friends
 *   GET  /api/friends/requests   → { incoming, outgoing } pending requests
 *   GET  /api/friends/suggested  → discovery candidates (real users)
 *   GET  /api/users/:id          → public profile for the profile modal
 *   POST /api/friends/request                 { toUserId }   (Add from list)
 *   POST /api/friends/request-by-tag          { tag }        (Add Friend modal)
 *   POST /api/friends/request/:id/accept                     (Accept)
 *   POST /api/friends/request/:id/decline                    (Decline)
 *
 * PRESENCE: LIVE. The online/offline split, the per-row presence dot, and the
 * "Online Now" tile are all driven by usePresenceStore().isOnline(friend.id) —
 * a friend is "online" only while the server reports an active socket for them.
 * The store is started app-wide in AppLayout and updates via presence:update
 * socket pushes, so this page re-renders as friends come and go. No fake states.
 * lastSeenAt survives only as a fallback for the "last seen" label.
 *
 * DIRECT MESSAGES: the 💬 button navigates to /messages/:friendId (owned by the
 * dm-ui agent). We deliberately render NO unread badge here — the DM view owns
 * unread state; inventing one would be fake data.
 */

const ONLINE_WINDOW_MS = 2 * 60 * 1000; // lastSeenAt within 2 min ⇒ recent "last seen" fallback

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

/** publicProfile() shape from GET /api/users/:id (subset the modal renders). */
type PublicProfile = {
  id: string;
  displayName: string;
  tag: string;
  bio: string | null;
  avatarUrl: string | null;
  frameId: string | null;
  countryCode: string | null;
  trophies: number;
  tier: { key: string; label: string; sub: string; accent: string; img: string };
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  createdAt: string;
  guild: { id: string; name: string; tag: string; role: string } | null;
};

/** Resolve a tier {label,color} — ALWAYS derived from trophies (the authoritative
 *  source); the stored rankTier column is a cache that can be stale. */
function tierOf(u: FriendUser): { label: string; color: string } {
  const t = rankTierFor(u.trophies);
  return { label: t.label, color: t.accent };
}

/** Fallback "last seen" label for offline friends, derived from lastSeenAt.
 *  Live presence (the store) is the source of truth for online/offline; this is
 *  only shown under the name when a friend is offline. Honest — returns null when
 *  lastSeenAt is missing/unparseable so we simply say "Offline". */
function lastSeenLabel(u: FriendUser): string | null {
  if (!u.lastSeenAt) return null;
  const t = new Date(u.lastSeenAt).getTime();
  if (Number.isNaN(t)) return null;
  const diff = Date.now() - t;
  if (diff < ONLINE_WINDOW_MS) return "last seen just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `last seen ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `last seen ${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `last seen ${days}d ago`;
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

/** A single friend row (used in both Online and Offline sections). */
function FriendRow({
  friend,
  online,
  onOpen,
  onMessage,
  onInvite,
}: {
  friend: FriendUser;
  online: boolean;
  onOpen: () => void;
  onMessage: () => void;
  onInvite: () => void;
}) {
  const tier = tierOf(friend);
  const dot = online ? "#3fbf6f" : "#6b6480";
  return (
    <div
      className="fd-social-row"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: 12,
        borderRadius: 12,
        border: online ? "1px solid rgba(232,184,75,.16)" : "1px solid rgba(232,184,75,.1)",
        background: online ? "rgba(0,0,0,.2)" : "rgba(0,0,0,.14)",
        opacity: online ? 1 : 0.72,
      }}
    >
      <div style={{ position: "relative", flex: "none" }}>
        <Avatar src={friend.avatarUrl ?? "champion"} size={44} frame={friend.frameId ?? undefined} />
        <span
          style={{
            position: "absolute",
            right: -1,
            bottom: -1,
            width: 13,
            height: 13,
            borderRadius: "50%",
            background: dot,
            border: "2px solid #150a24",
          }}
        />
      </div>
      <div onClick={onOpen} style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ font: "700 15px Inter", color: online ? "#fff" : "#efe7fb" }}>
            {friend.displayName}
          </span>
          <span style={{ font: "700 11px 'JetBrains Mono',monospace", color: "var(--ink2)" }}>
            {friend.tag}
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "2px 8px",
              borderRadius: 100,
              border: `1px solid rgba(232,184,75,${online ? ".2" : ".15"})`,
              background: "rgba(15,8,32,.5)",
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: tier.color }} />
            <span style={{ font: "600 10px Inter", color: tier.color }}>{tier.label}</span>
          </span>
        </div>
        <div
          style={{
            font: "500 12px Inter",
            color: online ? "#7ee6a4" : "var(--ink2)",
            marginTop: 3,
          }}
        >
          {online ? "Online now" : lastSeenLabel(friend) ?? "Offline"} ·{" "}
          {friend.trophies.toLocaleString()} 🏆
        </div>
      </div>
      <div className="fd-row-actions" style={{ display: "flex", gap: 8, flex: "none", alignItems: "center" }}>
        <button
          onClick={onMessage}
          title="Message"
          style={{
            position: "relative",
            flex: "none",
            width: 38,
            height: 38,
            borderRadius: 8,
            border: `1px solid rgba(232,184,75,${online ? ".25" : ".15"})`,
            background: online ? "rgba(15,8,32,.5)" : "rgba(15,8,32,.4)",
            color: online ? "var(--gold-lt)" : "var(--ink2)",
            fontSize: 15,
            cursor: "pointer",
          }}
        >
          💬
        </button>
        <button
          onClick={onInvite}
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
  );
}

export function FriendsPage() {
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.me);
  const showToast = useAppStore((s) => s.showToast);
  // LIVE presence: subscribe to the online set so this page re-renders whenever a
  // friend connects/disconnects. A friend is online only while the server reports
  // an active socket — presenceStore is started app-wide in AppLayout.
  const onlineSet = usePresenceStore((s) => s.online);

  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [incoming, setIncoming] = useState<FriendReq[]>([]);
  const [suggested, setSuggested] = useState<FriendUser[]>([]);
  const [query, setQuery] = useState("");
  /** ids currently mid-request so their button disables (add/accept/decline). */
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  // Add Friend modal
  const [addOpen, setAddOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [addBusy, setAddBusy] = useState(false);

  // Profile modal (loaded from GET /api/users/:id)
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

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

  // Load the public profile whenever the modal target changes.
  useEffect(() => {
    setReportOpen(false);
    if (!profileId) {
      setProfile(null);
      setProfileError(null);
      return;
    }
    let alive = true;
    setProfileLoading(true);
    setProfileError(null);
    setProfile(null);
    void (async () => {
      try {
        const { user } = await api.get<{ user: PublicProfile }>(`/api/users/${profileId}`);
        if (alive) setProfile(user);
      } catch (e) {
        if (alive) {
          const msg = e instanceof ApiError ? e.message : "Couldn't load this profile.";
          setProfileError(msg);
        }
      } finally {
        if (alive) setProfileLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [profileId]);

  const markBusy = (id: string, v: boolean) => setBusy((b) => ({ ...b, [id]: v }));

  /** Add a suggested user → POST /api/friends/request; remove from suggestions. */
  async function addFriend(u: FriendUser) {
    if (busy[u.id]) return;
    markBusy(u.id, true);
    try {
      const res = await api.post<{ status: string }>("/api/friends/request", { toUserId: u.id });
      setSuggested((list) => list.filter((x) => x.id !== u.id));
      if (res.status === "accepted") {
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

  /** Add Friend modal → POST /api/friends/request-by-tag { tag }. */
  async function sendByTag() {
    const raw = tagInput.trim();
    if (!raw || addBusy) return;
    setAddBusy(true);
    try {
      const res = await api.post<{ status: string }>("/api/friends/request-by-tag", { tag: raw });
      if (res.status === "accepted") {
        showToast("You are now friends! They had already requested you.");
      } else {
        showToast(`Friend request sent to ${raw.startsWith("#") ? raw : "#" + raw}.`);
      }
      setTagInput("");
      setAddOpen(false);
      // Refresh outgoing state indirectly: pull suggested again so an added user
      // drops out of the discovery list (kept honest — no local guessing).
      try {
        const s = await api.get<{ suggested: FriendUser[] }>("/api/friends/suggested");
        setSuggested(s.suggested);
        if (res.status === "accepted") {
          const f = await api.get<{ friends: FriendUser[] }>("/api/friends");
          setFriends(f.friends);
        }
      } catch {
        /* non-fatal refresh */
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Couldn't send request. Check the tag and try again.";
      showToast(msg);
    } finally {
      setAddBusy(false);
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

  // 💬 Message: open the DM view for this friend (route owned by the dm-ui agent).
  const messageFriend = (id: string) => navigate("/messages/" + id);

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

  // Split filtered friends into online / offline by LIVE presence (the store).
  const { onlineFriends, offlineFriends } = useMemo(() => {
    const on: FriendUser[] = [];
    const off: FriendUser[] = [];
    for (const f of filteredFriends) (onlineSet.has(f.id) ? on : off).push(f);
    return { onlineFriends: on, offlineFriends: off };
  }, [filteredFriends, onlineSet]);

  // "Online Now" tile — count of ALL friends the server currently reports online.
  const onlineCount = useMemo(
    () => friends.reduce((n, f) => (onlineSet.has(f.id) ? n + 1 : n), 0),
    [friends, onlineSet],
  );
  const SUMMARY = summaryFor(friends.length, onlineCount, incoming.length);

  // ---- Logged-out prompt (never crash) ----
  if (!me) {
    return (
      <div
        className="fd-page-pad"
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
      className="fd-page-pad"
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
        className="fd-page-head"
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
        <button className="btn btn-gold fd-head-cta" onClick={() => setAddOpen(true)} style={{ padding: "12px 20px" }}>
          ＋ Add Friend
        </button>
      </div>

      {/* Summary tiles — real counts */}
      <div className="fd-stat-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
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
                    className="fd-social-row"
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
                      onClick={() => setProfileId(r.user.id)}
                      style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                    >
                      <div style={{ font: "700 15px Inter", color: "#fff" }}>{r.user.displayName}</div>
                      {/* Prototype's "mutual friends" subtext isn't available from the
                          backend (no mutual-count endpoint), so we keep the honest
                          tag · tier subtext instead — an accepted divergence. */}
                      <div style={{ font: "500 12px Inter", color: "var(--ink2)", marginTop: 2 }}>
                        {r.user.tag} · {tierOf(r.user).label}
                      </div>
                    </div>
                    <div className="fd-row-actions" style={{ display: "flex", gap: 8, flex: "none" }}>
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

          {/* Friends — real accepted friends, split Online / Offline by lastSeenAt */}
          {friends.length === 0 ? (
            <EmptyPanel title="Friends · 0" message="No friends yet — add some to play together." />
          ) : filteredFriends.length === 0 ? (
            <div className="frame" style={{ padding: 22 }}>
              <div className="ptitle" style={{ textAlign: "left", marginBottom: 14 }}>
                Friends · {friends.length}
              </div>
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
            </div>
          ) : (
            <>
              {onlineFriends.length > 0 && (
                <div className="frame" style={{ padding: 22 }}>
                  <div className="ptitle" style={{ textAlign: "left", marginBottom: 14 }}>
                    Online · {onlineFriends.length}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {onlineFriends.map((f) => (
                      <FriendRow
                        key={f.id}
                        friend={f}
                        online
                        onOpen={() => setProfileId(f.id)}
                        onMessage={() => messageFriend(f.id)}
                        onInvite={() => navigate("/play")}
                      />
                    ))}
                  </div>
                </div>
              )}

              {offlineFriends.length > 0 && (
                <div className="frame" style={{ padding: 22 }}>
                  <div className="ptitle" style={{ textAlign: "left", marginBottom: 14 }}>
                    Offline · {offlineFriends.length}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {offlineFriends.map((f) => (
                      <FriendRow
                        key={f.id}
                        friend={f}
                        online={false}
                        onOpen={() => setProfileId(f.id)}
                        onMessage={() => messageFriend(f.id)}
                        onInvite={() => navigate("/play")}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Suggested Players — real discovery candidates from /friends/suggested */}
          {suggested.length > 0 && (
            <div id="fd-suggested" className="frame" style={{ padding: 22 }}>
              <div className="ptitle" style={{ textAlign: "left", marginBottom: 14 }}>
                Suggested Players
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {suggested.map((s) => {
                  const tier = tierOf(s);
                  return (
                    <div
                      key={s.id}
                      className="fd-social-row"
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
                      <Avatar src={s.avatarUrl ?? "champion"} size={44} frame={s.frameId ?? undefined} />
                      <div
                        onClick={() => setProfileId(s.id)}
                        style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ font: "700 15px Inter", color: "#fff" }}>{s.displayName}</span>
                          <span
                            style={{ font: "700 11px 'JetBrains Mono',monospace", color: "var(--ink2)" }}
                          >
                            {s.tag}
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
                            <span
                              style={{ width: 8, height: 8, borderRadius: "50%", background: tier.color }}
                            />
                            <span style={{ font: "600 10px Inter", color: tier.color }}>{tier.label}</span>
                          </span>
                        </div>
                        <div style={{ font: "500 12px Inter", color: "var(--ink2)", marginTop: 3 }}>
                          {s.trophies.toLocaleString()} 🏆
                        </div>
                      </div>
                      <div className="fd-row-actions" style={{ display: "flex", gap: 8, flex: "none", alignItems: "center" }}>
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
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ===== Add Friend modal (by #tag → /friends/request-by-tag) ===== */}
      {addOpen && (
        <div
          className="fd-dialog-top"
          onClick={() => !addBusy && setAddOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 82,
            background: "rgba(8,4,18,.74)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 420,
              borderRadius: 18,
              border: "1px solid rgba(232,184,75,.35)",
              background: "linear-gradient(180deg,#1a0f30,#140a24)",
              boxShadow: "0 30px 80px rgba(0,0,0,.6)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "22px 26px 18px",
                borderBottom: "1px solid rgba(232,184,75,.16)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ font: "800 19px Cinzel,serif", color: "var(--gold-lt)" }}>Add a Friend</div>
                <div style={{ font: "600 11px Inter", color: "var(--ink2)", marginTop: 3 }}>
                  Enter their player tag to send a request
                </div>
              </div>
              <button
                onClick={() => !addBusy && setAddOpen(false)}
                style={{
                  flex: "none",
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  border: "1px solid rgba(232,184,75,.2)",
                  background: "transparent",
                  color: "var(--ink2)",
                  font: "700 17px Inter",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: "22px 26px", display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label
                  style={{
                    display: "block",
                    font: "700 11px Inter",
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    color: "var(--ink2)",
                    marginBottom: 8,
                  }}
                >
                  Player Tag
                </label>
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void sendByTag();
                  }}
                  autoFocus
                  placeholder="#3947"
                  className="fd-nozoom"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "12px 14px",
                    borderRadius: 10,
                    border: "1px solid rgba(232,184,75,.3)",
                    background: "rgba(0,0,0,.3)",
                    color: "#fff",
                    font: "700 16px 'JetBrains Mono',monospace",
                    letterSpacing: 1,
                    outline: "none",
                  }}
                />
                <div style={{ font: "500 11px Inter", color: "var(--ink2)", marginTop: 8 }}>
                  A tag looks like <b style={{ color: "var(--gold-lt)" }}>#3947</b> — find it on a
                  player’s profile.
                </div>
              </div>
              <button
                className="btn btn-gold"
                onClick={() => void sendByTag()}
                disabled={addBusy || !tagInput.trim()}
                style={{
                  width: "100%",
                  padding: 14,
                  opacity: addBusy || !tagInput.trim() ? 0.6 : 1,
                  cursor: addBusy || !tagInput.trim() ? "default" : "pointer",
                }}
              >
                {addBusy ? "Sending…" : "Send Request"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Profile modal (GET /api/users/:id) ===== */}
      {profileId && (
        <div
          className="fd-sheet-overlay"
          onClick={() => setProfileId(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 84,
            background: "rgba(8,4,18,.74)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            className="fd-sheet"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 440,
              maxHeight: "88vh",
              overflow: "auto",
              borderRadius: 18,
              border: "1px solid rgba(232,184,75,.35)",
              background: "linear-gradient(180deg,#1a0f30,#140a24)",
              boxShadow: "0 30px 80px rgba(0,0,0,.6)",
            }}
          >
            <div
              style={{
                padding: "18px 22px",
                borderBottom: "1px solid rgba(232,184,75,.16)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ font: "800 16px Cinzel,serif", color: "var(--gold-lt)" }}>Player Profile</div>
              <button
                onClick={() => setProfileId(null)}
                style={{
                  flex: "none",
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  border: "1px solid rgba(232,184,75,.2)",
                  background: "transparent",
                  color: "var(--ink2)",
                  font: "700 17px Inter",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            {profileLoading ? (
              <div
                style={{
                  padding: 40,
                  textAlign: "center",
                  color: "var(--ink2)",
                  font: "500 14px Inter",
                }}
              >
                Loading profile…
              </div>
            ) : profileError ? (
              <div
                style={{
                  padding: 40,
                  textAlign: "center",
                  color: "var(--ink2)",
                  font: "500 14px Inter",
                }}
              >
                {profileError}
              </div>
            ) : profile ? (
              <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 18 }}>
                {/* Identity */}
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <Avatar
                    src={profile.avatarUrl ?? "champion"}
                    size={64}
                    frame={profile.frameId ?? undefined}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: "800 20px Cinzel,serif", color: "#fff" }}>
                      {profile.displayName}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                        marginTop: 5,
                      }}
                    >
                      <span
                        style={{ font: "700 11px 'JetBrains Mono',monospace", color: "var(--ink2)" }}
                      >
                        {profile.tag}
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
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: profile.tier.accent,
                          }}
                        />
                        <span style={{ font: "600 10px Inter", color: profile.tier.accent }}>
                          {profile.tier.label}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>

                {profile.bio && (
                  <div style={{ font: "500 13px/1.55 Inter", color: "var(--ink)" }}>{profile.bio}</div>
                )}

                {/* Stats grid — rank tier + record */}
                <div className="fd-stat-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  {[
                    { k: "Trophies", v: profile.trophies.toLocaleString(), c: "var(--gold-lt)" },
                    { k: "Wins", v: String(profile.wins), c: "#7ee6a4" },
                    { k: "Losses", v: String(profile.losses), c: "#ff9aa6" },
                  ].map((s) => (
                    <div
                      key={s.k}
                      className="frame"
                      style={{ padding: 14, textAlign: "center" }}
                    >
                      <div style={{ font: "800 20px 'JetBrains Mono',monospace", color: s.c }}>
                        {s.v}
                      </div>
                      <div style={{ font: "500 11px Inter", color: "var(--ink2)", marginTop: 2 }}>
                        {s.k}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="fd-stat-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {[
                    { k: "Draws", v: String(profile.draws), c: "var(--ink)" },
                    { k: "Streak", v: String(profile.streak), c: "var(--gold-lt)" },
                  ].map((s) => (
                    <div key={s.k} className="frame" style={{ padding: 14, textAlign: "center" }}>
                      <div style={{ font: "800 20px 'JetBrains Mono',monospace", color: s.c }}>
                        {s.v}
                      </div>
                      <div style={{ font: "500 11px Inter", color: "var(--ink2)", marginTop: 2 }}>
                        {s.k}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Rank tier row */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "1px solid rgba(232,184,75,.16)",
                    background: "rgba(0,0,0,.2)",
                  }}
                >
                  <span style={{ font: "600 12px Inter", color: "var(--ink2)" }}>Rank Tier</span>
                  <span style={{ font: "700 13px Inter", color: profile.tier.accent }}>
                    {profile.tier.label} · {profile.tier.sub}
                  </span>
                </div>

                {profile.guild && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 14px",
                      borderRadius: 12,
                      border: "1px solid rgba(232,184,75,.16)",
                      background: "rgba(0,0,0,.2)",
                    }}
                  >
                    <span style={{ font: "600 12px Inter", color: "var(--ink2)" }}>Guild</span>
                    <span style={{ font: "700 13px Inter", color: "var(--gold-lt)" }}>
                      {profile.guild.name} [{profile.guild.tag}]
                    </span>
                  </div>
                )}

                {/* NOTE: "recent form" is intentionally omitted — the public
                    profile endpoint does not return a match-history summary, so
                    showing one would be fabricated. */}

                {me && profile.id !== me.id && (
                  <button
                    onClick={() => setReportOpen(true)}
                    style={{
                      alignSelf: "flex-start",
                      padding: 0,
                      border: "none",
                      background: "transparent",
                      color: "var(--ink2)",
                      font: "600 11px Inter",
                      letterSpacing: ".3px",
                      cursor: "pointer",
                      opacity: 0.8,
                    }}
                  >
                    Report player
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {profile && (
        <ReportPlayerModal
          open={reportOpen}
          accusedId={profile.id}
          context="profile"
          onClose={() => setReportOpen(false)}
        />
      )}
    </div>
  );
}

export default FriendsPage;
