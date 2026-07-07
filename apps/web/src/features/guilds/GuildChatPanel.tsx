import { useEffect, useRef, useState } from "react";
import { EV } from "@dama/shared";
import { useAuthStore } from "../../stores/authStore";
import { api } from "../../lib/api";
import { connectSocket, getSocket } from "../../lib/socket";
import { avatar, guildCrest } from "../../lib/assets";

/**
 * GuildChatPanel — the slide-in guild chat drawer (handoff lines 2439-2469).
 *
 * REAL, PERSISTED chat. On open it loads history from GET /api/guilds/:id/chat,
 * joins the guild's socket room (EV.guildChatJoin), and listens for live
 * EV.guildChatMessage broadcasts. Sending POSTs to /api/guilds/:id/chat, which
 * persists the message and fans it out to the room — so every online member sees
 * it live and it survives a refresh. Nothing shown is fabricated: every line is a
 * real stored message from a real guildmate.
 */

/** Wire shape from the server (modules/guild-chat-service.ts → ChatMessage). */
type ChatMessage = {
  id: string;
  guildId: string;
  body: string;
  createdAt: string;
  author: { id: string; displayName: string; avatarUrl: string | null };
  role: "LEADER" | "OFFICER" | "MEMBER" | null;
};

const roleColor = (r: ChatMessage["role"]): string =>
  r === "LEADER" ? "#f0c24b" : r === "OFFICER" ? "#c9a6ff" : "var(--ink2)";

/** Format an ISO timestamp as a short local clock time (e.g. "2:05 PM"). */
function clock(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m < 10 ? "0" + m : m} ${ap}`;
}

function AvatarImg({ src, ring }: { src: string; ring: string }) {
  return (
    <img
      src={src}
      alt=""
      style={{
        width: 40,
        height: 40,
        display: "block",
        borderRadius: "50%",
        border: `2px solid ${ring}`,
        objectFit: "cover",
        filter: "brightness(1.25)",
      }}
    />
  );
}

// send glyph — ICONS.send() from the prototype: M4 12l16-8-6 16-3-6z
function SendIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12l16-8-6 16-3-6z" />
    </svg>
  );
}

export function GuildChatPanel({
  open,
  onClose,
  guildId,
  guildName,
  crestKey,
}: {
  open: boolean;
  onClose: () => void;
  guildId: string;
  guildName: string;
  crestKey?: string | null;
}) {
  const me = useAuthStore((s) => s.me);
  const [log, setLog] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  // On open: load history, join the guild's socket room, and subscribe to live
  // messages. On close/unmount: leave the room and remove ONLY our listener (the
  // socket is shared with online play — never removeAllListeners here).
  useEffect(() => {
    if (!open || !guildId) return;
    let cancelled = false;

    setLoading(true);
    setError(null);
    api
      .get<{ messages: ChatMessage[] }>(`/api/guilds/${guildId}/chat`)
      .then((res) => {
        if (!cancelled) setLog(res.messages);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load chat.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const onMessage = (msg: ChatMessage) => {
      if (msg.guildId !== guildId) return;
      setLog((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    };

    let socket = getSocket();
    connectSocket()
      .then((s) => {
        if (cancelled) return;
        socket = s;
        s.emit(EV.guildChatJoin, { guildId });
        s.on(EV.guildChatMessage, onMessage);
      })
      .catch(() => {
        /* live updates unavailable; history + send-refresh still work */
      });

    return () => {
      cancelled = true;
      socket.off(EV.guildChatMessage, onMessage);
      socket.emit(EV.guildChatLeave, { guildId });
    };
  }, [open, guildId]);

  useEffect(() => {
    if (open) {
      const t = setTimeout(scrollToBottom, 70);
      return () => clearTimeout(t);
    }
  }, [open, log.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      // The server persists + broadcasts; the broadcast echoes back to us and is
      // de-duped by id in onMessage, so we don't append optimistically here.
      const { message } = await api.post<{ message: ChatMessage }>(`/api/guilds/${guildId}/chat`, { body });
      setDraft("");
      // Fallback in case our own socket isn't connected to receive the broadcast.
      setLog((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    } catch {
      setError("Message failed to send.");
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  const myId = me?.id ?? "";

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 85,
        background: "rgba(10,5,20,.6)",
        backdropFilter: "blur(4px)",
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(94vw,440px)",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(180deg,#1b1030,#140a26)",
          borderLeft: "1px solid rgba(232,184,75,.3)",
          boxShadow: "-16px 0 50px rgba(0,0,0,.55)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 13,
            padding: 18,
            borderBottom: "1px solid rgba(232,184,75,.18)",
            background: "rgba(0,0,0,.2)",
          }}
        >
          <img
            src={guildCrest(crestKey, guildId).src}
            alt=""
            width={44}
            height={44}
            style={{
              flex: "none",
              width: 44,
              height: 44,
              objectFit: "contain",
              filter: "drop-shadow(0 4px 10px rgba(0,0,0,.5))",
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "800 17px Cinzel,serif", color: "var(--gold-lt)" }}>{guildName}</div>
            <div style={{ font: "600 11px Inter", color: "#6ee0a0" }}>● Guild chat</div>
          </div>
          <button
            onClick={onClose}
            style={{
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
            ✕
          </button>
        </div>

        {/* Message list */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column" }}>
          {loading && (
            <div style={{ textAlign: "center", font: "500 12px Inter", color: "var(--ink2)", padding: "20px 0" }}>
              Loading messages…
            </div>
          )}
          {!loading && log.length === 0 && (
            <div style={{ textAlign: "center", font: "500 13px Inter", color: "var(--ink2)", padding: "28px 0", lineHeight: 1.5 }}>
              No messages yet.
              <br />
              Say hello to your guild 👋
            </div>
          )}

          {log.map((m) =>
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
                <div style={{ font: "500 10px Inter", color: "var(--ink2)", marginTop: 3 }}>{clock(m.createdAt)}</div>
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
                <div style={{ flex: "none", marginTop: 16 }}>
                  <AvatarImg src={avatar(m.author.avatarUrl ?? "champion")} ring="rgba(232,184,75,.35)" />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ font: "700 12px Inter", marginBottom: 3 }}>
                    <span style={{ color: roleColor(m.role) }}>{m.author.displayName}</span>
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
                  <div style={{ font: "500 10px Inter", color: "var(--ink2)", marginTop: 3 }}>{clock(m.createdAt)}</div>
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
          {error && <div style={{ font: "500 11px Inter", color: "#ff8fae", textAlign: "center" }}>{error}</div>}
          <div style={{ display: "flex", gap: 9 }}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void send();
                }
              }}
              maxLength={500}
              placeholder="Message your guild…"
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
              onClick={() => void send()}
              disabled={sending || !draft.trim()}
              className="btn btn-gold"
              style={{ padding: "12px 15px", flex: "none", display: "flex", alignItems: "center", opacity: sending || !draft.trim() ? 0.55 : 1, cursor: sending || !draft.trim() ? "not-allowed" : "pointer" }}
            >
              <SendIcon />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default GuildChatPanel;
