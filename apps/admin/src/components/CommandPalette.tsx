import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth, type AdminRole } from "../lib/auth";

type Results = {
  players: { id: string; displayName: string; tag: string }[];
  guilds: { id: string; name: string; tag: string }[];
  cups: { id: string; name: string; status: string }[];
};
const roleRank: Record<AdminRole, number> = { SUPPORT: 1, MODERATOR: 2, ECONOMY: 3, SUPERADMIN: 4 };
const destinations: { label: string; path: string; role: AdminRole }[] = [
  { label: "Overview", path: "/overview", role: "SUPPORT" }, { label: "Players", path: "/players", role: "SUPPORT" },
  { label: "Support queue", path: "/support", role: "SUPPORT" }, { label: "Moderation reports", path: "/moderation", role: "MODERATOR" },
  { label: "Anti-cheat", path: "/matches", role: "MODERATOR" }, { label: "Guilds", path: "/guilds", role: "MODERATOR" },
  { label: "Analytics", path: "/analytics", role: "ECONOMY" }, { label: "Store & economy", path: "/economy", role: "ECONOMY" },
  { label: "Financials", path: "/financials", role: "ECONOMY" }, { label: "Live ops", path: "/liveops", role: "ECONOMY" },
  { label: "Tournaments", path: "/tournaments", role: "ECONOMY" }, { label: "Campaigns", path: "/campaigns", role: "ECONOMY" },
  { label: "Settings", path: "/settings", role: "SUPERADMIN" }, { label: "Admins", path: "/admins", role: "SUPERADMIN" },
  { label: "Audit log", path: "/audit", role: "SUPERADMIN" },
];

export function CommandPalette({ effectiveRole }: { effectiveRole?: AdminRole }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestSeq = useRef(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  const role = effectiveRole ?? (auth.status === "ok" ? auth.me.adminRole : "SUPPORT");
  const commands = useMemo(() => destinations.filter((d) => roleRank[role] >= roleRank[d.role] && d.label.toLowerCase().includes(query.trim().toLowerCase())), [query, role]);
  const hasAccessibleResults = !!results && (results.players.length > 0 || (roleRank[role] >= roleRank.MODERATOR && results.guilds.length > 0) || (roleRank[role] >= roleRank.ECONOMY && results.cups.length > 0));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((v) => !v); }
      else if (e.key === "Escape") setOpen(false);
      else if (e.key === "Tab" && open && dialogRef.current) {
        const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),a[href]')];
        if (!focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
    else if (wasOpen) triggerRef.current?.focus();
  }, [open]);
  useEffect(() => {
    const q = query.trim();
    const seq = ++requestSeq.current;
    setResults(null);
    if (q.length < 2) { setLoading(false); setError(false); return; }
    setLoading(true); setError(false);
    const timer = window.setTimeout(() => api.get<Results>(`/api/admin/search?q=${encodeURIComponent(q)}`)
      .then((data) => { if (seq === requestSeq.current) setResults(data); })
      .catch(() => { if (seq === requestSeq.current) { setResults(null); setError(true); } })
      .finally(() => { if (seq === requestSeq.current) setLoading(false); }), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const go = (path: string) => { setOpen(false); setQuery(""); setResults(null); navigate(path); };
  const buttonStyle = { width: "100%", textAlign: "left" as const, padding: "10px 12px", border: 0, borderRadius: 8, background: "transparent", color: "var(--ink-2)", cursor: "pointer" };
  return <>
    <button ref={triggerRef} className="command-trigger" aria-label="Search or commands" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      <span className="command-label-desktop command-label-wide" aria-hidden="true">Search or commands</span>
      <span className="command-label-mobile command-label-compact" aria-hidden="true">Search</span>
      <span className="command-shortcut" aria-hidden="true">· Ctrl+K</span>
    </button>
    {open && <div role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(22,12,32,.45)", display: "grid", placeItems: "start center", paddingTop: "12vh" }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Command palette" style={{ width: "min(680px,calc(100vw - 32px))", maxHeight: "72vh", overflow: "auto", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "0 24px 80px rgba(25,12,36,.28)", padding: 16, animation: "fd-page-enter 180ms ease-out" }}>
        <div className="row" style={{ gap: 8 }}><input ref={inputRef} className="input" style={{ flex: 1 }} placeholder="Search sections, players, guilds, or tournaments…" value={query} onChange={(e) => setQuery(e.target.value)} /><button className="abtn" onClick={() => setOpen(false)}>Esc</button></div>
        <div style={{ marginTop: 12 }}>
          {commands.map((c) => <button key={c.path} style={buttonStyle} onClick={() => go(c.path)}><strong>{c.label}</strong><span className="dim" style={{ float: "right" }}>Section</span></button>)}
          {loading && <div className="dim" style={{ padding: 12 }}>Searching…</div>}
          {error && <div style={{ padding: 12, color: "var(--danger)" }}>Search could not be loaded. Try again.</div>}
          {results?.players.map((p) => <button key={`p:${p.id}`} style={buttonStyle} onClick={() => go(`/players?open=${p.id}`)}><strong>{p.displayName}</strong> <span className="dim">{p.tag}</span><span className="dim" style={{ float: "right" }}>Player</span></button>)}
          {roleRank[role] >= roleRank.MODERATOR && results?.guilds.map((g) => <button key={`g:${g.id}`} style={buttonStyle} onClick={() => go(`/guilds?open=${g.id}`)}><strong>{g.name}</strong> <span className="dim">{g.tag}</span><span className="dim" style={{ float: "right" }}>Guild</span></button>)}
          {roleRank[role] >= roleRank.ECONOMY && results?.cups.map((t) => <button key={`t:${t.id}`} style={buttonStyle} onClick={() => go(`/tournaments?open=${t.id}`)}><strong>{t.name}</strong><span className="dim" style={{ float: "right" }}>Tournament</span></button>)}
          {!loading && query.trim().length >= 2 && results && !commands.length && !hasAccessibleResults && <div className="dim" style={{ padding: 12 }}>No matching commands or records available to this role.</div>}
        </div>
      </div>
    </div>}
  </>;
}
