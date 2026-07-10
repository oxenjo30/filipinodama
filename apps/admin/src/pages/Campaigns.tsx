import { useEffect, useState } from "react";
import { RANK_TIERS } from "@dama/shared";
import { api } from "../lib/api";
import { useAdminMutation } from "../lib/ui";

type Campaign = {
  id: string;
  title: string;
  body: string;
  segment: string;
  status: string;
  reach: number;
  sentByName: string;
  createdAt: string;
};

const SEGMENTS: { value: string; label: string }[] = [
  { value: "all", label: "All players" },
  { value: "active7d", label: "Active (7d)" },
  ...RANK_TIERS.map((t) => ({ value: `rank:${t.key}`, label: t.label })),
];
const SEGMENT_LABEL: Record<string, string> = Object.fromEntries(SEGMENTS.map((s) => [s.value, s.label]));

/** 2C. Campaigns — segmented broadcast announcements. ECONOMY-gated. Real reach; CTR not tracked. */
export function Campaigns() {
  const [rows, setRows] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api
      .get<{ items: Campaign[] }>("/api/admin/campaigns")
      .then((d) => setRows(d.items))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  return (
    <>
      <div className="crumb">Growth · Campaign composer</div>
      <h1 className="page">Campaign composer</h1>

      <ComposeCard onDone={load} />

      <div className="panel" style={{ marginTop: 22 }}>
        <table className="tbl">
          <thead>
            <tr><th>Title</th><th>Segment</th><th className="num">Reach</th><th className="num">CTR</th><th>Sent by</th><th>When</th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="dim" style={{ textAlign: "center", padding: 24 }}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="dim" style={{ textAlign: "center", padding: 24 }}>No campaigns sent yet.</td></tr>
            ) : (
              rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{c.title}</div>
                    <div className="dim" style={{ fontSize: 12 }}>{c.body}</div>
                  </td>
                  <td className="dim">{SEGMENT_LABEL[c.segment] ?? c.segment}</td>
                  <td className="num">{c.reach.toLocaleString()}</td>
                  <td className="num dim">—</td>
                  <td className="mono dim">{c.sentByName}</td>
                  <td className="mono dim" style={{ whiteSpace: "nowrap" }}>{new Date(c.createdAt).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ComposeCard({ onDone }: { onDone: () => void }) {
  const mutate = useAdminMutation();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [segment, setSegment] = useState(SEGMENTS[0]!.value);
  const [reach, setReach] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const preview = () => {
    setPreviewing(true);
    setReach(null);
    api
      .post<{ count: number }>("/api/admin/campaigns/preview", { segment })
      .then((d) => setReach(d.count))
      .catch(() => setReach(null))
      .finally(() => setPreviewing(false));
  };

  const send = () =>
    mutate({
      title: `Send "${title}" to ${SEGMENT_LABEL[segment] ?? segment}`,
      body: reach !== null ? `Reach: ${reach.toLocaleString()} player(s). This sends immediately.` : "Preview the reach before sending.",
      requireReason: true,
      confirmLabel: "Send now",
      method: "POST",
      path: "/api/admin/campaigns/send",
      payload: { title, body, segment },
      successMsg: "Campaign sent.",
      onDone: () => { setTitle(""); setBody(""); setReach(null); onDone(); },
    });

  const valid = title.trim().length > 0 && body.trim().length > 0;

  return (
    <div className="panel panel-pad">
      <div style={{ fontWeight: 700, marginBottom: 12 }}>Compose announcement</div>
      <div className="field">
        <label>Title</label>
        <input className="input" placeholder="e.g. Weekend double XP!" value={title} onChange={(e) => { setTitle(e.target.value); setReach(null); }} />
      </div>
      <div className="field">
        <label>Message</label>
        <textarea className="input" rows={3} placeholder="Announcement body" value={body} onChange={(e) => { setBody(e.target.value); setReach(null); }} />
      </div>
      <div className="row" style={{ alignItems: "flex-end" }}>
        <div className="field" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}>
          <label>Segment</label>
          <select className="select" value={segment} onChange={(e) => { setSegment(e.target.value); setReach(null); }}>
            {SEGMENTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <button className="btn" disabled={previewing} onClick={preview}>{previewing ? "Checking…" : "Preview reach"}</button>
        <button className="btn gold" disabled={!valid} onClick={send}>Send now</button>
      </div>
      {reach !== null && (
        <div className="dim" style={{ fontSize: 12, marginTop: 10 }}>
          Previewed reach: <span className="mono" style={{ color: "var(--gold-lt)" }}>{reach.toLocaleString()}</span> player(s) match this segment.
        </div>
      )}
      <div className="dim" style={{ fontSize: 12, marginTop: 8 }}>Sent as an in-app notification. CTR isn't tracked yet — shown as "—" in history.</div>
    </div>
  );
}
