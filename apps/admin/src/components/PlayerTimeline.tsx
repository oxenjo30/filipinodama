import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

type TimelineItem = { id: string; kind: string; title: string; detail: string; actor: string | null; createdAt: string; href?: string };

export function PlayerTimeline({ playerId }: { playerId: string }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const requestSeq = useRef(0);
  useEffect(() => { requestSeq.current += 1; setExpanded(false); setItems([]); setError(false); }, [playerId]);
  const load = () => { const seq = ++requestSeq.current; setLoading(true); setError(false); api.get<{ items: TimelineItem[] }>(`/api/admin/users/${encodeURIComponent(playerId)}/timeline?limit=20`).then((d) => { if (seq === requestSeq.current) setItems(d.items); }).catch(() => { if (seq === requestSeq.current) setError(true); }).finally(() => { if (seq === requestSeq.current) setLoading(false); }); };
  const toggle = () => { setExpanded((v) => !v); if (!expanded && !items.length) load(); };
  return <section style={{ marginBottom: 18 }}>
    <button className="abtn" aria-expanded={expanded} onClick={toggle}>{expanded ? "Hide" : "Show"} activity timeline</button>
    {expanded && <div className="pd-matches" style={{ marginTop: 8, animation: "fd-page-enter 180ms ease-out" }}>
      {loading ? <div className="pd-empty">Loading activity…</div> : error ? <div className="pd-empty">Timeline could not be loaded. <button className="abtn" onClick={load}>Retry</button></div> : items.length === 0 ? <div className="pd-empty">No recorded activity.</div> : items.map((item) => <button key={item.id} className="pd-match" style={{ width: "100%", textAlign: "left", border: 0, cursor: item.href ? "pointer" : "default" }} disabled={!item.href} onClick={() => item.href && navigate(item.href)}>
        <span className="pd-res" style={{ width: 64 }}>{item.kind}</span><span className="pd-opp" style={{ flex: 1 }}><strong>{item.title}</strong><br /><span className="dim">{item.detail}{item.actor ? ` · ${item.actor}` : ""}</span></span><span className="pd-mode">{new Date(item.createdAt).toLocaleString()}</span>
      </button>)}
    </div>}
  </section>;
}
