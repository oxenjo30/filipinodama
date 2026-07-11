import { useRef, useEffect, useState } from "react";
import { MATCH_PHRASES } from "@dama/shared";
import { useCosmeticsStore } from "../../stores/cosmeticsStore";

/** Normalized in-match message the shared display renders. Each caller maps its
 *  own store's message type to this before passing it in. */
export type MatchChatMsg = {
  id: string;
  mine: boolean;
  emote: string | null;
  body: string | null;
  at: number;
};

const FALLBACK_EMOTES = ["👋", "😄", "😮", "😢", "👍", "🔥"];

/**
 * MatchChat — the shared in-match emote + quick-chat surface, used by online
 * matches and private/Damath rooms. Two tap rows (all free emotes + phrases) and
 * an optional free-text input. Transport is injected via `send`; the caller owns
 * the socket and maps its message feed to MatchChatMsg[].
 */
export function MatchChat({
  send,
  messages,
  showTextInput = false,
  disabled = false,
}: {
  send: (p: { emote?: string; body?: string }) => void;
  messages: MatchChatMsg[];
  showTextInput?: boolean;
  disabled?: boolean;
}) {
  const freeEmoteGlyphs = useCosmeticsStore((s) => s.freeEmoteGlyphs);
  const emotes = (() => {
    const free = freeEmoteGlyphs();
    return free.length ? free : FALLBACK_EMOTES;
  })();

  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const tap: React.CSSProperties = {
    padding: "6px 9px",
    borderRadius: 8,
    border: "1px solid rgba(232,184,75,.25)",
    background: "rgba(15,8,32,.6)",
    cursor: disabled ? "default" : "pointer",
    fontSize: 18,
    lineHeight: 1,
    opacity: disabled ? 0.5 : 1,
  };
  const phraseTap: React.CSSProperties = { ...tap, fontSize: 12, font: "700 12px Inter", color: "var(--ink)" };

  function sendText() {
    const t = draft.trim();
    if (!t || disabled) return;
    send({ body: t });
    setDraft("");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* message feed */}
      <div ref={scrollRef} style={{ maxHeight: 160, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        {messages.map((m) => (
          <div key={m.id} style={{ alignSelf: m.mine ? "flex-end" : "flex-start", maxWidth: "80%", padding: "6px 10px", borderRadius: 10, background: m.mine ? "rgba(232,184,75,.16)" : "rgba(255,255,255,.06)" }}>
            {m.emote ? <span style={{ fontSize: 22 }}>{m.emote}</span> : <span style={{ font: "500 13px Inter", color: "#fff" }}>{m.body}</span>}
          </div>
        ))}
      </div>

      {/* reactions row — all free emotes */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {emotes.map((g) => (
          <button key={g} type="button" style={tap} disabled={disabled} onClick={() => !disabled && send({ emote: g })}>{g}</button>
        ))}
      </div>

      {/* phrases row */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {MATCH_PHRASES.map((p) => (
          <button key={p} type="button" style={phraseTap} disabled={disabled} onClick={() => !disabled && send({ body: p })}>{p}</button>
        ))}
      </div>

      {showTextInput && (
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") sendText(); }}
            maxLength={200}
            placeholder="Say something…"
            disabled={disabled}
            style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(232,184,75,.25)", background: "rgba(0,0,0,.3)", color: "#fff", font: "500 13px Inter" }}
          />
          <button type="button" className="btn btn-gold" style={{ padding: "8px 14px" }} disabled={disabled} onClick={sendText}>Send</button>
        </div>
      )}
    </div>
  );
}

export default MatchChat;
