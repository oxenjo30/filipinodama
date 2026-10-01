import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

type Notice = { id: string; kind: "ticket" | "report"; title: string; detail: string; createdAt: string; href: string };

export function NotificationCenter() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);
  const requestSeq = useRef(0);
  const meId = auth.status === "ok" ? auth.me.id : "anonymous";
  const storageKey = `fd-admin:${meId}:read-alerts:v1`;
  const [read, setRead] = useState<Record<string, string>>(() => {
    try { const parsed: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "{}"); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, string> : {}; } catch { return {}; }
  });
  const load = () => { const seq = ++requestSeq.current; setLoading(true); setError(false); api.get<{ items: Notice[] }>("/api/admin/notifications?limit=20").then((d) => { if (seq === requestSeq.current) setItems(d.items); }).catch(() => { if (seq === requestSeq.current) setError(true); }).finally(() => { if (seq === requestSeq.current) setLoading(false); }); };
  useEffect(() => { load(); const timer = window.setInterval(load, 60_000); return () => { window.clearInterval(timer); requestSeq.current += 1; }; }, [meId]);
  useEffect(() => { try { const parsed: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "{}"); setRead(parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, string> : {}); } catch { setRead({}); } }, [storageKey]);
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(read)); } catch { /* unavailable storage leaves alerts unread */ } }, [read, storageKey]);
  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;
    if (open) {
      requestAnimationFrame(() => {
        const first = dialogRef.current?.querySelector<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled])');
        (first ?? dialogRef.current)?.focus();
      });
    } else if (wasOpen) triggerRef.current?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const closeOnEscape = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); setOpen(false); } };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("mousedown", closeOutside); document.removeEventListener("keydown", closeOnEscape); };
  }, [open]);
  const unread = useMemo(() => items.filter((n) => read[n.id] !== n.createdAt), [items, read]);
  const visit = (n: Notice) => { setRead((v) => ({ ...v, [n.id]: n.createdAt })); setOpen(false); navigate(n.href); };
  return <div ref={wrap} style={{ position: "relative" }}>
    <button ref={triggerRef} className="abtn" aria-haspopup="dialog" aria-expanded={open} onClick={() => { setOpen((v) => !v); if (!open) load(); }}>Alerts · {unread.length}</button>
    {open && <div ref={dialogRef} role="dialog" aria-modal="false" aria-label="Notifications" tabIndex={-1} style={{ position: "absolute", right: 0, top: "calc(100% + 10px)", zIndex: 50, width: "min(400px,calc(100vw - 32px))", maxHeight: 520, overflow: "auto", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "0 18px 55px rgba(25,12,36,.22)", padding: 14 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}><strong>Notifications</strong><button className="abtn" disabled={!unread.length} onClick={() => setRead(Object.fromEntries(items.map((n) => [n.id, n.createdAt])))}>Mark all as read</button></div>
      {loading ? <div className="dim" style={{ padding: 12 }}>Loading alerts…</div> : error ? <div style={{ padding: 12, color: "var(--danger)" }}>Alerts could not be loaded. <button className="abtn" onClick={load}>Retry</button></div> : items.length === 0 ? <div className="dim" style={{ padding: 12 }}>No open reports or support tickets.</div> : items.map((n) => <button key={n.id} className="abtn" onClick={() => visit(n)} style={{ width: "100%", display: "block", textAlign: "left", marginBottom: 6, padding: 12, background: read[n.id] === n.createdAt ? "transparent" : "var(--purple-soft)" }}><strong style={{ display: "block" }}>{n.title}</strong><span className="dim">{n.detail} · {new Date(n.createdAt).toLocaleString()}</span></button>)}
      <p className="dim" style={{ fontSize: 11, margin: "10px 2px 0" }}>Read state is personal to this admin and this browser. Opening an alert does not resolve its underlying record.</p>
    </div>}
  </div>;
}
