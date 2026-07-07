import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Avatar } from "../../components";
import { avatar } from "../../lib/assets";
import { useAuthStore } from "../../stores/authStore";
import { usePresenceStore } from "../../stores/presenceStore";
import { useDmStore } from "../../stores/dmStore";

/**
 * MessagesPage — a two-pane Direct Messages messenger (handoff chat styling).
 *
 * Left pane  = the conversation list (GET /api/dm): avatar, name, last-message
 *              preview, live online dot (usePresenceStore) and unread badge.
 * Right pane = the open thread (GET /api/dm/:userId): message bubbles with
 *              author + time and a composer, mirroring GuildChatPanel's look.
 *
 * The route param :userId opens that thread; picking a conversation navigates
 * to /messages/:userId. All chat is REAL and PERSISTED — the dmStore loads from
 * REST and appends live inbound DMs from the shared socket. Only friends can be
 * messaged (the server enforces it); a NOT_FRIENDS error surfaces inline.
 */

/** Format an ISO timestamp as a short local clock time (e.g. "2:05 PM"). */
function clock(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m < 10 ? "0" + m : m} ${ap}`;
}

/** Relative-ish label for the conversation list ("2:05 PM" today, else date). */
function listStamp(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return clock(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// send glyph — ICONS.send() from the prototype: M4 12l16-8-6 16-3-6z
function SendIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 12l16-8-6 16-3-6z" />
    </svg>
  );
}

function EmptyState({ title, sub }: { title: string; sub?: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: 28,
        textAlign: "center",
        color: "var(--ink2)",
      }}
    >
      <div style={{ font: "700 15px Inter", color: "#efe7fb" }}>{title}</div>
      {sub && <div style={{ font: "500 13px Inter", lineHeight: 1.5 }}>{sub}</div>}
    </div>
  );
}

export function MessagesPage() {
  const { userId } = useParams<{ userId?: string }>();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.me);

  const conversations = useDmStore((s) => s.conversations);
  const loadingList = useDmStore((s) => s.loadingList);
  const loadConversations = useDmStore((s) => s.loadConversations);

  const openThread = useDmStore((s) => s.openThread);
  const closeThread = useDmStore((s) => s.closeThread);
  const openUserId = useDmStore((s) => s.openUserId);
  const openUser = useDmStore((s) => s.openUser);
  const messages = useDmStore((s) => s.messages);
  const loadingThread = useDmStore((s) => s.loadingThread);
  const sending = useDmStore((s) => s.sending);
  const error = useDmStore((s) => s.error);
  const send = useDmStore((s) => s.send);
  const unreadTotal = useDmStore((s) => s.unreadTotal);

  const isOnline = usePresenceStore((s) => s.isOnline);

  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Load the conversation list once on mount + prime the unread total.
  useEffect(() => {
    if (!me) return;
    void loadConversations();
    void unreadTotal();
  }, [me, loadConversations, unreadTotal]);

  // Open (or close) the thread the route points at.
  useEffect(() => {
    if (!me) return;
    if (userId) void openThread(userId);
    else closeThread();
  }, [me, userId, openThread, closeThread]);

  // Auto-scroll the thread to the newest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, openUserId]);

  const doSend = async () => {
    const body = draft.trim();
    if (!body || !userId) return;
    setDraft("");
    await send(userId, body);
  };

  // ── logged-out gate ───────────────────────────────────────────────────────
  if (!me) {
    return (
      <div style={{ maxWidth: 1560, margin: "0 auto", padding: 26 }}>
        <div className="frame" style={{ padding: 40, textAlign: "center" }}>
          <div style={{ font: "800 20px Cinzel,serif", color: "var(--gold-lt)", marginBottom: 8 }}>
            Direct Messages
          </div>
          <div style={{ font: "500 14px Inter", color: "var(--ink2)", marginBottom: 20 }}>
            Sign in to message your friends.
          </div>
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

  const myId = me.id;
  const headerName = openUser?.displayName ?? "";
  const headerOnline = openUser ? isOnline(openUser.id) : false;

  return (
    <div style={{ maxWidth: 1560, margin: "0 auto", padding: 26 }}>
      <div
        className="frame fd-dm-shell"
        style={{
          padding: 0,
          overflow: "hidden",
          display: "grid",
          gridTemplateColumns: "320px minmax(0,1fr)",
          height: "min(74vh, 760px)",
        }}
      >
        {/* ── LEFT: conversation list ── */}
        <aside
          className="fd-dm-list"
          style={{
            display: "flex",
            flexDirection: "column",
            borderRight: "1px solid rgba(232,184,75,.18)",
            background: "rgba(0,0,0,.16)",
            minHeight: 0,
          }}
        >
          <div
            style={{
              padding: "18px 18px 14px",
              borderBottom: "1px solid rgba(232,184,75,.14)",
            }}
          >
            <div style={{ font: "800 18px Cinzel,serif", color: "var(--gold-lt)" }}>Messages</div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {loadingList && conversations.length === 0 && (
              <div
                style={{
                  textAlign: "center",
                  font: "500 12px Inter",
                  color: "var(--ink2)",
                  padding: "24px 0",
                }}
              >
                Loading conversations…
              </div>
            )}

            {!loadingList && conversations.length === 0 && (
              <div
                style={{
                  textAlign: "center",
                  font: "500 13px Inter",
                  color: "var(--ink2)",
                  padding: "28px 20px",
                  lineHeight: 1.5,
                }}
              >
                No conversations yet.
                <br />
                Message a friend from your Friends list to start.
              </div>
            )}

            {conversations.map((c) => {
              const active = c.user.id === userId;
              const online = isOnline(c.user.id);
              return (
                <button
                  key={c.channelId}
                  onClick={() => navigate(`/messages/${c.user.id}`)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    width: "100%",
                    padding: "12px 16px",
                    border: "none",
                    borderBottom: "1px solid rgba(232,184,75,.08)",
                    background: active ? "rgba(232,184,75,.1)" : "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div style={{ position: "relative", flex: "none" }}>
                    <Avatar src={c.user.avatarUrl ?? "champion"} size={42} />
                    <span
                      style={{
                        position: "absolute",
                        right: -1,
                        bottom: -1,
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        background: online ? "#3fbf6f" : "#6b6480",
                        border: "2px solid #150a24",
                      }}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: 8,
                        justifyContent: "space-between",
                      }}
                    >
                      <span
                        style={{
                          font: "700 14px Inter",
                          color: "#fff",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {c.user.displayName}
                      </span>
                      <span style={{ font: "500 10px Inter", color: "var(--ink2)", flex: "none" }}>
                        {listStamp(c.lastAt)}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginTop: 2,
                      }}
                    >
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          font: "500 12px Inter",
                          color: c.unread > 0 ? "#efe7fb" : "var(--ink2)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {c.lastMessage ?? "Say hello 👋"}
                      </span>
                      {c.unread > 0 && (
                        <span
                          style={{
                            flex: "none",
                            minWidth: 18,
                            height: 18,
                            padding: "0 5px",
                            borderRadius: 9,
                            background: "linear-gradient(180deg,#e0555f,#a8202f)",
                            color: "#fff",
                            font: "800 10px Inter",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {c.unread > 99 ? "99+" : c.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ── RIGHT: open thread ── */}
        <section style={{ display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0 }}>
          {!userId ? (
            <EmptyState
              title="Select a conversation"
              sub="Pick a friend on the left to start messaging."
            />
          ) : (
            <>
              {/* Thread header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: 16,
                  borderBottom: "1px solid rgba(232,184,75,.18)",
                  background: "rgba(0,0,0,.2)",
                }}
              >
                <button
                  onClick={() => navigate("/messages")}
                  className="fd-dm-back"
                  title="Back to conversations"
                  style={{
                    display: "none",
                    flex: "none",
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    border: "1px solid rgba(232,184,75,.3)",
                    background: "rgba(15,8,32,.6)",
                    color: "var(--ink)",
                    cursor: "pointer",
                    font: "700 15px Inter",
                  }}
                >
                  ‹
                </button>
                {openUser && (
                  <Avatar src={openUser.avatarUrl ?? "champion"} size={40} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      font: "800 16px Cinzel,serif",
                      color: "var(--gold-lt)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {headerName || (loadingThread ? "Loading…" : "Conversation")}
                  </div>
                  {openUser && (
                    <div
                      style={{
                        font: "600 11px Inter",
                        color: headerOnline ? "#6ee0a0" : "var(--ink2)",
                      }}
                    >
                      {headerOnline ? "● Online now" : "○ Offline"}
                    </div>
                  )}
                </div>
              </div>

              {/* Message list */}
              <div
                ref={scrollRef}
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: 18,
                  display: "flex",
                  flexDirection: "column",
                  minHeight: 0,
                }}
              >
                {loadingThread && messages.length === 0 && (
                  <div
                    style={{
                      textAlign: "center",
                      font: "500 12px Inter",
                      color: "var(--ink2)",
                      padding: "20px 0",
                    }}
                  >
                    Loading messages…
                  </div>
                )}

                {!loadingThread && !error && messages.length === 0 && (
                  <div
                    style={{
                      textAlign: "center",
                      font: "500 13px Inter",
                      color: "var(--ink2)",
                      padding: "28px 0",
                      lineHeight: 1.5,
                    }}
                  >
                    No messages yet.
                    <br />
                    Say hello 👋
                  </div>
                )}

                {messages.map((m) =>
                  m.author.id === myId ? (
                    <div
                      key={m.id}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-end",
                        maxWidth: "82%",
                        alignSelf: "flex-end",
                        marginTop: 8,
                      }}
                    >
                      <div
                        style={{
                          padding: "9px 13px",
                          borderRadius: "14px 14px 4px 14px",
                          background: "linear-gradient(180deg,#f0c24b,#c98b2e)",
                          color: "#2a1607",
                          font: "500 14px Inter",
                          lineHeight: 1.4,
                          wordBreak: "break-word",
                        }}
                      >
                        {m.body}
                      </div>
                      <div style={{ font: "500 10px Inter", color: "var(--ink2)", marginTop: 3 }}>
                        {clock(m.createdAt)}
                      </div>
                    </div>
                  ) : (
                    <div
                      key={m.id}
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-start",
                        maxWidth: "88%",
                        alignSelf: "flex-start",
                        marginTop: 8,
                      }}
                    >
                      <img
                        src={avatar(m.author.avatarUrl ?? "champion")}
                        alt=""
                        style={{
                          flex: "none",
                          width: 36,
                          height: 36,
                          marginTop: 16,
                          display: "block",
                          borderRadius: "50%",
                          border: "2px solid rgba(232,184,75,.35)",
                          objectFit: "cover",
                          filter: "brightness(1.25)",
                        }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ font: "700 12px Inter", marginBottom: 3, color: "#c9a6ff" }}>
                          {m.author.displayName}
                        </div>
                        <div
                          style={{
                            padding: "9px 13px",
                            borderRadius: "4px 14px 14px 14px",
                            background: "rgba(255,255,255,.06)",
                            border: "1px solid rgba(232,184,75,.14)",
                            color: "#efe7fb",
                            font: "500 14px Inter",
                            lineHeight: 1.4,
                            wordBreak: "break-word",
                          }}
                        >
                          {m.body}
                        </div>
                        <div style={{ font: "500 10px Inter", color: "var(--ink2)", marginTop: 3 }}>
                          {clock(m.createdAt)}
                        </div>
                      </div>
                    </div>
                  ),
                )}
              </div>

              {/* Composer */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: "14px 16px",
                  borderTop: "1px solid rgba(232,184,75,.18)",
                  background: "rgba(0,0,0,.25)",
                }}
              >
                {error && (
                  <div style={{ font: "500 11px Inter", color: "#ff8fae", textAlign: "center" }}>
                    {error}
                  </div>
                )}
                <div style={{ display: "flex", gap: 9 }}>
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void doSend();
                      }
                    }}
                    maxLength={1000}
                    placeholder={`Message ${headerName || "your friend"}…`}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      background: "rgba(15,8,32,.6)",
                      border: "1px solid rgba(232,184,75,.25)",
                      borderRadius: 10,
                      outline: "none",
                      color: "#efe7fb",
                      font: "500 14px Inter",
                      padding: "12px 14px",
                    }}
                  />
                  <button
                    onClick={() => void doSend()}
                    disabled={sending || !draft.trim()}
                    className="btn btn-gold"
                    style={{
                      padding: "12px 15px",
                      flex: "none",
                      display: "flex",
                      alignItems: "center",
                      opacity: sending || !draft.trim() ? 0.55 : 1,
                      cursor: sending || !draft.trim() ? "not-allowed" : "pointer",
                    }}
                  >
                    <SendIcon />
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Responsive: on narrow screens show one pane at a time. */}
      <style>{`
        @media (max-width: 720px) {
          .fd-dm-shell {
            grid-template-columns: 1fr !important;
          }
          .fd-dm-shell .fd-dm-list {
            display: ${userId ? "none" : "flex"} !important;
          }
          .fd-dm-shell .fd-dm-back {
            display: ${userId ? "flex" : "none"} !important;
          }
        }
      `}</style>
    </div>
  );
}

export default MessagesPage;
