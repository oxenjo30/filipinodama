import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";

/**
 * NotificationsMenu — the prototype's notifications dropdown, wired to the real
 * backend. On open it GETs /api/notifications (grouped today/yesterday/earlier),
 * lists rows (unread highlighted), supports "Mark all read"
 * (POST /api/notifications/read-all) and per-row read on click
 * (POST /api/notifications/:id/read). Honest empty state when there is nothing.
 *
 * Reusable: both TopNav and AppLayout render it as a floating panel anchored to
 * their bell. Rendered only when `open`; a fixed full-screen backdrop closes it.
 */

type NotifType = string;

/** Shape of notification.data we care about. All fields optional/defensive. */
type NotifData = {
  requestId?: string;
  fromUserId?: string;
  byUserId?: string;
  avatarUrl?: string | null;
  status?: "accepted" | "declined";
  ticketId?: string;
  tournamentId?: string;
};

/** A support ticket notification (staff reply or resolution) carries a ticketId to deep-link to. */
function isSupportTicketType(type: NotifType): boolean {
  return type === "support_reply" || type === "support_resolved";
}

type Notif = {
  id: string;
  type: NotifType;
  title: string;
  body: string | null;
  data: unknown;
  readAt: string | null;
  createdAt: string;
};

/** A friend-request notification carries a real friend-request id to act on. */
/**
 * Every tournament notification carries a tournamentId and deep-links to that
 * cup. Matched by PREFIX rather than a fixed list: the server adds tournament
 * types as the format grows (ready clock, match ready, forfeit, group cut,
 * result), and a list here would silently fall back to a generic bell with no
 * tap-through for each new one.
 */
function isTournamentType(type: NotifType): boolean {
  return type.startsWith("tournament_");
}

function isFriendType(type: NotifType): boolean {
  return type.includes("friend");
}

/** Read notification.data defensively (server stores it as arbitrary JSON). */
function notifData(n: Notif): NotifData {
  return n.data && typeof n.data === "object" && !Array.isArray(n.data)
    ? (n.data as NotifData)
    : {};
}

type NotifResponse = {
  notifications: Notif[];
  groups: { today: Notif[]; yesterday: Notif[]; earlier: Notif[] };
  unreadCount: number;
  nextCursor: string | null;
  hasMore: boolean;
};

export type NotificationsMenuProps = {
  open: boolean;
  onClose: () => void;
  /** Called whenever the unread count changes, so the anchor can show a badge. */
  onUnreadChange?: (count: number) => void;
};

const GROUP_LABELS: Array<{ key: "today" | "yesterday" | "earlier"; label: string }> = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "earlier", label: "Earlier" },
];

/** Icon + wrapper gradient per notification type, matching the prototype. */
function styleFor(type: NotifType): { icon: string; bg: string } {
  if (isFriendType(type)) return { icon: "👥", bg: "linear-gradient(160deg,#5a3a8c,#3a2568)" };
  // Gold, matching the tournament surfaces elsewhere in the app.
  if (isTournamentType(type)) return { icon: "🏅", bg: "linear-gradient(160deg,#c99a2e,#8a6410)" };
  switch (type) {
    case "achievement":
      return { icon: "🏆", bg: "linear-gradient(160deg,#c99a2e,#8a6410)" };
    case "event":
      return { icon: "📅", bg: "linear-gradient(160deg,#2E6BC6,#1a3f7a)" };
    case "system":
      return { icon: "⚙️", bg: "linear-gradient(160deg,#7a2b38,#4a1a22)" };
    default:
      return { icon: "🔔", bg: "rgba(120,90,180,.4)" };
  }
}

/** Compact relative time ("Just now", "5m ago", "3h ago", "2d ago"). */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 45) return "Just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(then).toLocaleDateString();
}

export function NotificationsMenu({ open, onClose, onUnreadChange }: NotificationsMenuProps) {
  const navigate = useNavigate();
  const [data, setData] = useState<NotifResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get<NotifResponse>("/api/notifications");
      setData(res);
      onUnreadChange?.(res.unreadCount);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [onUnreadChange]);

  // (Re)load each time the panel opens so it reflects the latest server state.
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const markRead = useCallback(
    async (id: string) => {
      // Optimistic: flip locally, then persist. Recompute unread from state.
      setData((prev) => {
        if (!prev) return prev;
        const now = new Date().toISOString();
        const flip = (list: Notif[]) =>
          list.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: now } : n));
        const target = prev.notifications.find((n) => n.id === id);
        if (!target || target.readAt) return prev;
        const unreadCount = Math.max(0, prev.unreadCount - 1);
        onUnreadChange?.(unreadCount);
        return {
          ...prev,
          notifications: flip(prev.notifications),
          groups: {
            today: flip(prev.groups.today),
            yesterday: flip(prev.groups.yesterday),
            earlier: flip(prev.groups.earlier),
          },
          unreadCount,
        };
      });
      try {
        await api.post(`/api/notifications/${id}/read`);
      } catch {
        // Roll back to server truth on failure.
        load();
      }
    },
    [load, onUnreadChange],
  );

  const markAll = useCallback(async () => {
    setData((prev) => {
      if (!prev) return prev;
      const now = new Date().toISOString();
      const flip = (list: Notif[]) => list.map((n) => (n.readAt ? n : { ...n, readAt: now }));
      onUnreadChange?.(0);
      return {
        ...prev,
        notifications: flip(prev.notifications),
        groups: {
          today: flip(prev.groups.today),
          yesterday: flip(prev.groups.yesterday),
          earlier: flip(prev.groups.earlier),
        },
        unreadCount: 0,
      };
    });
    try {
      await api.post("/api/notifications/read-all");
    } catch {
      load();
    }
  }, [load, onUnreadChange]);

  const dismiss = useCallback(
    async (id: string) => {
      // Optimistic removal; if a dismissed row was unread, drop the unread count.
      setData((prev) => {
        if (!prev) return prev;
        const target = prev.notifications.find((n) => n.id === id);
        if (!target) return prev;
        const drop = (list: Notif[]) => list.filter((n) => n.id !== id);
        const unreadCount = target.readAt ? prev.unreadCount : Math.max(0, prev.unreadCount - 1);
        onUnreadChange?.(unreadCount);
        return {
          ...prev,
          notifications: drop(prev.notifications),
          groups: {
            today: drop(prev.groups.today),
            yesterday: drop(prev.groups.yesterday),
            earlier: drop(prev.groups.earlier),
          },
          unreadCount,
        };
      });
      try {
        await api.post(`/api/notifications/${id}/dismiss`);
      } catch {
        load();
      }
    },
    [load, onUnreadChange],
  );

  const resolveFriend = useCallback(
    async (notif: Notif, action: "accept" | "decline") => {
      const requestId = notifData(notif).requestId;
      if (!requestId) return;
      const status = action === "accept" ? "accepted" : "declined";
      try {
        // Act on the real friend request, then record the outcome on the notif.
        await api.post(`/api/friends/request/${requestId}/${action}`);
        await api.post(`/api/notifications/${notif.id}/resolve`, { status });
      } catch {
        // fall through to reload for server truth
      } finally {
        load();
      }
    },
    [load],
  );

  if (!open) return null;

  const unread = data?.unreadCount ?? 0;
  const isEmpty = !loading && !error && (data?.notifications.length ?? 0) === 0;

  return (
    <>
      {/* click-away backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 55 }}
        aria-hidden
      />
      <div
        role="dialog"
        aria-label="Notifications"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          top: 66,
          right: 18,
          width: 390,
          maxWidth: "92vw",
          maxHeight: "76vh",
          zIndex: 60,
          display: "flex",
          flexDirection: "column",
          borderRadius: 14,
          border: "1px solid rgba(232,184,75,.4)",
          background: "linear-gradient(180deg,#231239,#180c2a)",
          boxShadow: "0 24px 60px rgba(0,0,0,.6),0 0 0 1px rgba(0,0,0,.4)",
        }}
      >
        {/* caret */}
        <div
          style={{
            position: "absolute",
            top: -8,
            right: 20,
            width: 14,
            height: 14,
            transform: "rotate(45deg)",
            background: "#231239",
            borderLeft: "1px solid rgba(232,184,75,.4)",
            borderTop: "1px solid rgba(232,184,75,.4)",
          }}
        />
        {/* header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "15px 18px 13px",
            borderBottom: "1px solid rgba(232,184,75,.18)",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
            <span
              style={{
                font: "700 13px Inter",
                letterSpacing: 2,
                textTransform: "uppercase",
                color: "var(--gold-lt)",
              }}
            >
              Notifications
            </span>
            {unread > 0 && (
              <span style={{ font: "700 11px 'JetBrains Mono',monospace", color: "var(--ink2)" }}>
                {unread > 9 ? "9+" : unread} new
              </span>
            )}
          </div>
          <button
            onClick={markAll}
            disabled={unread === 0}
            style={{
              background: "none",
              border: "none",
              cursor: unread > 0 ? "pointer" : "default",
              font: "600 12px Inter",
              color: unread > 0 ? "var(--gold)" : "var(--ink2)",
              opacity: unread > 0 ? 1 : 0.55,
              padding: "2px 0",
            }}
          >
            Mark all read
          </button>
        </div>

        {/* body */}
        <div style={{ overflowY: "auto", padding: "6px 0 8px" }}>
          {loading && (
            <div style={{ padding: "44px 20px", textAlign: "center", color: "var(--ink2)" }}>
              <div style={{ font: "600 12px Inter" }}>Loading…</div>
            </div>
          )}

          {error && !loading && (
            <div style={{ padding: "44px 20px", textAlign: "center", color: "var(--ink2)" }}>
              <div style={{ font: "700 14px Inter", color: "var(--ink)" }}>
                Couldn't load notifications
              </div>
              <button
                onClick={load}
                style={{
                  marginTop: 10,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  font: "600 12px Inter",
                  color: "var(--gold)",
                }}
              >
                Try again
              </button>
            </div>
          )}

          {isEmpty && (
            <div style={{ padding: "44px 20px", textAlign: "center", color: "var(--ink2)" }}>
              <div style={{ font: "700 14px Inter", color: "var(--ink)" }}>You're all caught up</div>
              <div style={{ font: "400 12px Inter", marginTop: 5 }}>
                New activity will show up here.
              </div>
            </div>
          )}

          {!loading &&
            !error &&
            data &&
            GROUP_LABELS.map(({ key, label }) => {
              const items = data.groups[key];
              if (!items.length) return null;
              return (
                <div key={key}>
                  <div
                    style={{
                      font: "700 10px Inter",
                      letterSpacing: 1.5,
                      textTransform: "uppercase",
                      color: "var(--ink2)",
                      padding: "11px 18px 5px",
                    }}
                  >
                    {label}
                  </div>
                  {items.map((n) => {
                    const s = styleFor(n.type);
                    const unreadRow = !n.readAt;
                    const friend = isFriendType(n.type);
                    const d = notifData(n);
                    // A friend-request notif is actionable only while it still
                    // carries a requestId and has no recorded outcome. friend_accept
                    // notifs have no requestId, so they never show buttons.
                    const isPending = friend && !!d.requestId && !d.status;
                    const statusLabel =
                      d.status === "accepted"
                        ? "✓ Accepted"
                        : d.status === "declined"
                          ? "Declined"
                          : "";
                    // A support ticket reply/resolution deep-links to that
                    // ticket's thread in Contact > My Tickets.
                    const ticketId = isSupportTicketType(n.type) ? d.ticketId : undefined;
                    // A tournament notification is usually acted on — "ready up
                    // or forfeit" is useless if it doesn't take you there.
                    const tournamentId = isTournamentType(n.type) ? d.tournamentId : undefined;
                    const handleClick = () => {
                      markRead(n.id);
                      if (ticketId) {
                        onClose();
                        navigate(`/contact?tab=tickets&ticket=${ticketId}`);
                      } else if (tournamentId) {
                        onClose();
                        navigate(`/tournaments/${tournamentId}`);
                      }
                    };
                    return (
                      <div
                        key={n.id}
                        onClick={handleClick}
                        style={{
                          position: "relative",
                          display: "flex",
                          gap: 12,
                          padding: "12px 16px 12px 18px",
                          cursor: "pointer",
                          background: unreadRow ? "rgba(232,184,75,.06)" : "transparent",
                          borderTop: "1px solid rgba(232,184,75,.07)",
                        }}
                      >
                        {friend && d.avatarUrl ? (
                          <img
                            src={d.avatarUrl}
                            alt=""
                            style={{
                              width: 42,
                              height: 42,
                              flex: "none",
                              borderRadius: 11,
                              objectFit: "cover",
                              border: "1px solid rgba(232,184,75,.5)",
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: 42,
                              height: 42,
                              flex: "none",
                              borderRadius: 11,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 18,
                              background: s.bg,
                            }}
                          >
                            {s.icon}
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            {unreadRow && (
                              <span
                                style={{
                                  width: 7,
                                  height: 7,
                                  flex: "none",
                                  borderRadius: "50%",
                                  background: "var(--gold)",
                                  boxShadow: "0 0 6px var(--gold)",
                                }}
                              />
                            )}
                            <span
                              style={{
                                font: "700 13px Inter",
                                color: "#fff",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {n.title}
                            </span>
                          </div>
                          {n.body && (
                            <div
                              style={{
                                font: "400 12px/1.45 Inter",
                                color: "var(--ink)",
                                marginTop: 2,
                              }}
                            >
                              {n.body}
                            </div>
                          )}
                          <div
                            style={{
                              font: "600 10px Inter",
                              color: "var(--ink2)",
                              marginTop: 5,
                            }}
                          >
                            {relativeTime(n.createdAt)}
                          </div>

                          {isPending && (
                            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  resolveFriend(n, "accept");
                                }}
                                style={{
                                  flex: 1,
                                  padding: 8,
                                  borderRadius: 7,
                                  border: "1px solid rgba(255,240,200,.6)",
                                  background: "linear-gradient(180deg,#f0cf72,#c99a2e)",
                                  color: "#3a2405",
                                  font: "700 11px Inter",
                                  letterSpacing: ".5px",
                                  textTransform: "uppercase",
                                  cursor: "pointer",
                                }}
                              >
                                Accept
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  resolveFriend(n, "decline");
                                }}
                                style={{
                                  flex: 1,
                                  padding: 8,
                                  borderRadius: 7,
                                  border: "1px solid rgba(232,184,75,.3)",
                                  background: "rgba(15,8,32,.5)",
                                  color: "var(--ink)",
                                  font: "700 11px Inter",
                                  letterSpacing: ".5px",
                                  textTransform: "uppercase",
                                  cursor: "pointer",
                                }}
                              >
                                Decline
                              </button>
                            </div>
                          )}

                          {statusLabel && (
                            <div
                              style={{
                                marginTop: 8,
                                font: "700 11px Inter",
                                color: "var(--ink2)",
                              }}
                            >
                              {statusLabel}
                            </div>
                          )}
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            dismiss(n.id);
                          }}
                          title="Dismiss"
                          aria-label="Dismiss notification"
                          style={{
                            flex: "none",
                            width: 24,
                            height: 24,
                            borderRadius: 6,
                            border: "none",
                            background: "none",
                            color: "var(--ink2)",
                            font: "400 15px Inter",
                            lineHeight: 1,
                            cursor: "pointer",
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
        </div>
      </div>
    </>
  );
}

export default NotificationsMenu;
