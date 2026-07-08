import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "../../stores/authStore";
import { useCosmeticsStore } from "../../stores/cosmeticsStore";

/**
 * EmotePicker — a small 😊 button that opens the player's EQUIPPED emote loadout
 * and inserts the chosen glyph. Used by the chat composers (Friends DM + Guild
 * chat) so purchased emotes are usable everywhere you chat, not just in a match.
 *
 * The loadout is `me.equippedEmotes` (store-item ids), resolved to glyphs via the
 * shared cosmetics resolver. When the player has none equipped we fall back to a
 * default reaction set so the picker is never empty. Picking one calls `onPick`
 * with the glyph (the composer appends it to the draft).
 */

const DEFAULT_EMOTES = ["👋", "😄", "😮", "😢", "👍", "🔥", "🎉", "😅"];

export function EmotePicker({ onPick }: { onPick: (glyph: string) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const me = useAuthStore((s) => s.me);
  const emoteGlyph = useCosmeticsStore((s) => s.emoteGlyph);
  const loadCatalog = useCosmeticsStore((s) => s.load);

  // The catalog is needed to map equipped ids → glyphs; load it defensively.
  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const equipped = me?.equippedEmotes ?? [];
  const glyphs = equipped.length > 0 ? equipped.map(emoteGlyph) : DEFAULT_EMOTES;

  return (
    <div ref={wrapRef} style={{ position: "relative", flex: "none" }}>
      <button
        type="button"
        aria-label="Emotes"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: 42,
          height: 42,
          flex: "none",
          borderRadius: 11,
          border: "1px solid rgba(232,184,75,.3)",
          background: "rgba(15,8,32,.6)",
          color: "var(--gold-lt)",
          cursor: "pointer",
          fontSize: 18,
          lineHeight: 1,
        }}
      >
        😊
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            right: 0,
            zIndex: 30,
            width: 208,
            padding: 8,
            borderRadius: 12,
            border: "1px solid rgba(232,184,75,.28)",
            background: "linear-gradient(180deg,#20132f,#170c26)",
            boxShadow: "0 14px 34px rgba(0,0,0,.5)",
            display: "grid",
            gridTemplateColumns: "repeat(4,1fr)",
            gap: 4,
            animation: "fdrise .16s ease both",
          }}
        >
          {glyphs.map((g, i) => (
            <button
              key={`${g}-${i}`}
              type="button"
              onClick={() => {
                onPick(g);
                setOpen(false);
              }}
              style={{
                height: 40,
                borderRadius: 9,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontSize: 22,
                lineHeight: 1,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(232,184,75,.12)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {g}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default EmotePicker;
