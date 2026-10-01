import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";

export type PlayerFilter = "all" | "active" | "muted" | "banned";
type SavedView = { id: string; name: string; query: string; filter: PlayerFilter };
const filters = new Set<PlayerFilter>(["all", "active", "muted", "banned"]);
function parseViews(value: unknown): SavedView[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const v = entry as Partial<SavedView>;
    if (typeof v.id !== "string" || typeof v.name !== "string" || typeof v.query !== "string" || !filters.has(v.filter as PlayerFilter)) return [];
    return [{ id: v.id.slice(0, 80), name: v.name.slice(0, 60), query: v.query.slice(0, 120), filter: v.filter as PlayerFilter }];
  }).slice(0, 20);
}

export function SavedViews({ query, filter, onApply }: { query: string; filter: PlayerFilter; onApply: (view: { query: string; filter: PlayerFilter }) => void }) {
  const auth = useAuth();
  const adminId = auth.status === "ok" ? auth.me.id : "anonymous";
  const key = `fd-admin:${adminId}:player-views:v1`;
  const [views, setViews] = useState<SavedView[]>([]);
  const [showSave, setShowSave] = useState(false);
  const [name, setName] = useState("");
  const [storageError, setStorageError] = useState(false);
  useEffect(() => { try { setViews(parseViews(JSON.parse(localStorage.getItem(key) ?? "[]"))); } catch { setViews([]); setStorageError(true); } }, [key]);
  const persist = (next: SavedView[]) => { try { localStorage.setItem(key, JSON.stringify(next)); setViews(next); setStorageError(false); return true; } catch { setStorageError(true); return false; } };
  const save = () => {
    const clean = name.trim(); if (!clean) return;
    const next = [{ id: crypto.randomUUID(), name: clean.slice(0, 60), query: query.trim().slice(0, 120), filter }, ...views].slice(0, 20);
    if (persist(next)) { setName(""); setShowSave(false); }
  };
  return <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
    <select className="select" aria-label="Saved player views" defaultValue="" onChange={(e) => { const v = views.find((x) => x.id === e.target.value); if (v) onApply(v); e.currentTarget.value = ""; }}>
      <option value="">Saved views{views.length ? ` (${views.length})` : ""}</option>
      {views.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
    </select>
    <button className="abtn" onClick={() => setShowSave((v) => !v)}>Save current filters</button>
    {(query || filter !== "all") && <button className="abtn" onClick={() => onApply({ query: "", filter: "all" })}>Clear view</button>}
    {showSave && <div className="row" style={{ gap: 8, flex: "1 1 320px" }}><input className="input" autoFocus maxLength={60} placeholder="View name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setShowSave(false); }} /><button className="abtn primary" disabled={!name.trim()} onClick={save}>Save</button><button className="abtn" onClick={() => setShowSave(false)}>Cancel</button></div>}
    {storageError && <span role="alert" style={{ color: "var(--danger)", fontSize: 12 }}>Saved views are unavailable in this browser.</span>}
  </div>;
}
