import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { rankTierFor } from "@dama/shared";
import { PlayerLink } from "../../components";
import { api } from "../../lib/api";

/**
 * GlobalPlayerSearchModal — the topbar 🔍 "Search players" modal (v3 delta,
 * cluster W2). Full-screen overlay, live-filters REAL users as you type
 * (debounced ~250ms) via GET /api/users/search?q=. Row click navigates to
 * that player's public profile and closes the modal. No fabricated data —
 * every result comes straight from the server.
 */

type SearchResult = {
  id: string;
  username: string;
  displayName: string;
  tag: string;
  avatarUrl: string | null;
  frameId: string | null;
  trophies: number;
  rankTier: string;
};

export type GlobalPlayerSearchModalProps = {
  open: boolean;
  onClose: () => void;
};

const DEBOUNCE_MS = 250;

export function GlobalPlayerSearchModal({ open, onClose }: GlobalPlayerSearchModalProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | null>(null);
  const requestSeq = useRef(0);

  // Reset on each open + focus the input.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setLoading(false);
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);

  // Close on Escape; lock body scroll while open (matches the mobile drawer pattern).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // Live-filtered results, debounced ~250ms, from the real /api/users/search endpoint.
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = window.setTimeout(async () => {
      const seq = ++requestSeq.current;
      try {
        const res = await api.get<{ items: SearchResult[] }>(`/api/users/search?q=${encodeURIComponent(q)}`);
        if (seq === requestSeq.current) setResults(res.items);
      } catch {
        if (seq === requestSeq.current) setResults([]);
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, open]);

  if (!open) return null;

  const trimmed = query.trim();
  const hasResults = results.length > 0;
  const noResults = trimmed.length >= 2 && !loading && !hasResults;

  function openProfile(id: string) {
    onClose();
    navigate(`/profile/${id}`);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search players"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 94,
        background: "rgba(8,4,18,.82)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "10vh 20px 20px",
        animation: "fdrise .2s ease both",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 560,
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: 18,
          border: "1px solid rgba(232,184,75,.35)",
          background: "linear-gradient(180deg,#1a0f30,#140a24)",
          boxShadow: "0 30px 80px rgba(0,0,0,.6)",
          overflow: "hidden",
        }}
      >
        {/* header: 🔍 icon + input + close */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "16px 18px",
            borderBottom: "1px solid rgba(232,184,75,.18)",
            flex: "none",
          }}
        >
          <span aria-hidden style={{ fontSize: 18, color: "var(--gold-lt)", flex: "none" }}>
            🔍
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search players by name or tag…"
            style={{
              flex: 1,
              minWidth: 0,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#fff",
              font: "600 15px Inter",
            }}
          />
          <button
            onClick={onClose}
            aria-label="Close"
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

        {/* results */}
        <div style={{ overflowY: "auto", padding: hasResults ? "8px 8px" : 0 }}>
          {noResults && (
            <div style={{ padding: "48px 20px", textAlign: "center" }}>
              <div style={{ font: "700 15px Inter", color: "#fff" }}>No players found</div>
              <div style={{ font: "500 12px Inter", color: "var(--ink2)", marginTop: 6 }}>
                Try a different name or tag.
              </div>
            </div>
          )}

          {hasResults &&
            results.map((r) => {
              const tier = rankTierFor(r.trophies);
              return (
                <div
                  key={r.id}
                  onClick={() => openProfile(r.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 10px",
                    borderRadius: 12,
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,.05)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <PlayerLink
                    id={r.id}
                    name={r.displayName}
                    avatar={r.avatarUrl ?? "champion"}
                    frame={r.frameId ?? undefined}
                    size={40}
                    disabled
                    subtitle={
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                        <span style={{ font: "700 11px 'JetBrains Mono',monospace", color: "var(--ink2)" }}>
                          {r.tag}
                        </span>
                        <span style={{ font: "600 11px Inter", color: tier.accent }}>{tier.label}</span>
                        <span style={{ font: "500 11px Inter", color: "var(--ink2)" }}>
                          🏆 {r.trophies.toLocaleString()}
                        </span>
                      </div>
                    }
                  />
                  <span
                    style={{
                      marginLeft: "auto",
                      flex: "none",
                      font: "700 12px Inter",
                      color: "var(--gold)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    View ›
                  </span>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

export default GlobalPlayerSearchModal;
