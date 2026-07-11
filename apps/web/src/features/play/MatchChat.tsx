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
 * matches and private/Damath rooms. Collapsed by default (feed + composer only);
 * a 😊 toggle opens a popover with the emoji grid + phrase chips. Picking an
 * emoji/phrase sends it and closes the popover. Transport is injected via `send`;
 * the caller owns the socket and maps its message feed to MatchChatMsg[].
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // Close the picker on any click/tap outside the composer (Discord-style).
  useEffect(() => {
    if (!pickerOpen) return;
    function onDown(e: MouseEvent) {
      if (composerRef.current && !composerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [pickerOpen]);

  function sendText() {
    const t = draft.trim();
    if (!t || disabled) return;
    send({ body: t });
    setDraft("");
  }

  function pick(payload: { emote?: string; body?: string }) {
    if (disabled) return;
    send(payload);
    setPickerOpen(false); // one-tap-and-done
  }

  const emoteTap: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 38,
    height: 38,
    borderRadius: 9,
    border: "1px solid rgba(232,184,75,.18)",
    background: "rgba(15,8,32,.55)",
    cursor: disabled ? "default" : "pointer",
    fontSize: 20,
    lineHeight: 1,
    padding: 0,
    transition: "background .12s ease, transform .12s ease",
  };
  const phraseChip: React.CSSProperties = {
    padding: "7px 12px",
    borderRadius: 999,
    border: "1px solid rgba(232,184,75,.2)",
    background: "rgba(15,8,32,.55)",
    color: "var(--ink)",
    font: "700 12px Inter",
    cursor: disabled ? "default" : "pointer",
    whiteSpace: "nowrap",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* message feed */}
      <div
        ref={scrollRef}
        style={{
          maxHeight: 180,
          minHeight: 56,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {messages.length === 0 ? (
          <div style={{ margin: "auto", font: "500 12px Inter", color: "var(--ink2)", textAlign: "center", opacity: 0.8 }}>
            Say hello or send an emote 👋
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              style={{
                alignSelf: m.mine ? "flex-end" : "flex-start",
                maxWidth: "80%",
                padding: m.emote ? "2px 6px" : "6px 10px",
                borderRadius: 10,
                background: m.emote ? "transparent" : m.mine ? "rgba(232,184,75,.16)" : "rgba(255,255,255,.06)",
              }}
            >
              {m.emote ? (
                <span style={{ fontSize: 24 }}>{m.emote}</span>
              ) : (
                <span style={{ font: "500 13px Inter", color: "#fff" }}>{m.body}</span>
              )}
            </div>
          ))
        )}
      </div>

      {/* composer — 😊 picker toggle + optional text input + send */}
      <div ref={composerRef} style={{ position: "relative" }}>
        {/* popover: emoji grid + phrase chips */}
        {pickerOpen && (
          <div
            style={{
              position: "absolute",
              bottom: "calc(100% + 8px)",
              left: 0,
              right: 0,
              zIndex: 20,
              padding: 12,
              borderRadius: 14,
              border: "1px solid rgba(232,184,75,.28)",
              background: "linear-gradient(180deg,#20132f,#170c26)",
              boxShadow: "0 16px 40px rgba(0,0,0,.55)",
              animation: "fdrise .16s ease both",
            }}
          >
            {/* emoji grid */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {emotes.map((g) => (
                <button
                  key={g}
                  type="button"
                  style={emoteTap}
                  disabled={disabled}
                  onClick={() => pick({ emote: g })}
                >
                  {g}
                </button>
              ))}
            </div>

            <div style={{ height: 1, background: "rgba(232,184,75,.14)", margin: "10px 0" }} />

            {/* phrase chips */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {MATCH_PHRASES.map((p) => (
                <button
                  key={p}
                  type="button"
                  style={phraseChip}
                  disabled={disabled}
                  onClick={() => pick({ body: p })}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            aria-label="Emotes & quick chat"
            aria-expanded={pickerOpen}
            disabled={disabled}
            onClick={() => !disabled && setPickerOpen((o) => !o)}
            style={{
              flex: "none",
              width: 40,
              height: 40,
              borderRadius: 10,
              border: `1px solid ${pickerOpen ? "var(--gold)" : "rgba(232,184,75,.28)"}`,
              background: pickerOpen ? "rgba(232,184,75,.16)" : "rgba(15,8,32,.6)",
              cursor: disabled ? "default" : "pointer",
              fontSize: 20,
              lineHeight: 1,
              opacity: disabled ? 0.5 : 1,
            }}
          >
            😊
          </button>

          {showTextInput && (
            <>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendText();
                  if (e.key === "Escape") setPickerOpen(false);
                }}
                onFocus={() => setPickerOpen(false)}
                maxLength={200}
                placeholder="Say something…"
                disabled={disabled}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(232,184,75,.25)",
                  background: "rgba(0,0,0,.3)",
                  color: "#fff",
                  font: "500 13px Inter",
                }}
              />
              <button
                type="button"
                className="btn btn-gold"
                style={{ flex: "none", padding: "10px 16px" }}
                disabled={disabled}
                onClick={sendText}
              >
                Send
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default MatchChat;
