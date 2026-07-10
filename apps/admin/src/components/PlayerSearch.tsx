import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

/**
 * PlayerSearch — a debounced type-ahead for picking a player by name.
 *
 * The admin backend already exposes GET /api/admin/users?q=<text>, which
 * searches username / displayName / tag / email / id (case-insensitive). This
 * component queries it as you type and shows a dropdown of matches; picking one
 * calls onSelect(id) and shows the chosen player as a removable chip. Keyboard:
 * ↑/↓ to move, Enter to pick, Esc to close. Clearing the chip re-enables typing.
 *
 * Controlled by `value` (the selected user id, or "") so parents keep owning the
 * id they submit; `onSelect` fires with the id (or "" when cleared).
 */

type PlayerHit = {
  id: string;
  username: string;
  displayName: string | null;
  tag: string | null;
};

export function PlayerSearch({
  value,
  onSelect,
  placeholder = "Search player by name, tag, or email…",
}: {
  value: string;
  onSelect: (id: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlayerHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  // The player currently chosen (shown as a chip). Resolved when a hit is picked
  // OR when the parent hands us a value we haven't got a label for yet.
  const [chosen, setChosen] = useState<PlayerHit | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // If the parent clears the value externally, drop the chip.
  useEffect(() => {
    if (!value) setChosen(null);
  }, [value]);

  // Debounced search: 250ms after the last keystroke, query the admin endpoint.
  useEffect(() => {
    const q = query.trim();
    if (chosen || q.length < 1) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = window.setTimeout(() => {
      let alive = true;
      api
        .get<{ items: PlayerHit[] }>(`/api/admin/users?q=${encodeURIComponent(q)}&limit=8`)
        .then((d) => {
          if (!alive) return;
          setHits(d.items);
          setActive(0);
          setOpen(true);
        })
        .catch(() => {
          if (alive) setHits([]);
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
      return () => {
        alive = false;
      };
    }, 250);
    return () => window.clearTimeout(t);
  }, [query, chosen]);

  // Close the dropdown on an outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (h: PlayerHit) => {
    setChosen(h);
    setQuery("");
    setHits([]);
    setOpen(false);
    onSelect(h.id);
  };

  const clear = () => {
    setChosen(null);
    setQuery("");
    onSelect("");
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open || hits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(hits.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const h = hits[active];
      if (h) pick(h);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  // A player is chosen → show a removable chip instead of the input.
  if (chosen) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 38, padding: "6px 8px 6px 12px", borderRadius: 8, border: "1px solid var(--gold)", background: "var(--bg-2)" }}>
        <span style={{ font: "700 12px var(--sans)", color: "var(--ink-2)" }}>{chosen.displayName || chosen.username}</span>
        {chosen.tag && <span className="mono dim" style={{ fontSize: 10 }}>{chosen.tag}</span>}
        <button
          type="button"
          onClick={clear}
          aria-label="Clear selected player"
          style={{ marginLeft: "auto", width: 22, height: 22, borderRadius: 6, border: "1px solid var(--line, rgba(232,184,75,.25))", background: "transparent", color: "var(--ink-3)", cursor: "pointer", lineHeight: 1, fontSize: 13 }}
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <input
        className="input"
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => hits.length > 0 && setOpen(true)}
        onKeyDown={onKey}
        autoComplete="off"
      />
      {open && (query.trim().length >= 1) && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 50,
            maxHeight: 280,
            overflowY: "auto",
            borderRadius: 10,
            border: "1px solid var(--gold)",
            background: "var(--bg)",
            boxShadow: "0 14px 34px rgba(0,0,0,.5)",
          }}
        >
          {loading ? (
            <div className="dim" style={{ padding: "12px 14px", fontSize: 12 }}>Searching…</div>
          ) : hits.length === 0 ? (
            <div className="dim" style={{ padding: "12px 14px", fontSize: 12 }}>No players match “{query.trim()}”.</div>
          ) : (
            hits.map((h, i) => (
              <button
                key={h.id}
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(h)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  textAlign: "left",
                  padding: "9px 12px",
                  border: "none",
                  cursor: "pointer",
                  background: i === active ? "var(--bg-2)" : "transparent",
                  color: "var(--ink-2)",
                }}
              >
                <span style={{ font: "700 12px var(--sans)", color: "var(--ink-2)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {h.displayName || h.username}
                </span>
                {h.tag && <span className="mono dim" style={{ fontSize: 10, flex: "none" }}>{h.tag}</span>}
                <span className="mono dim" style={{ fontSize: 9, marginLeft: "auto", flex: "none", opacity: 0.6 }}>{h.id.slice(0, 8)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default PlayerSearch;
