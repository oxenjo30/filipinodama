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
  channel: string;
  scheduledFor: string | null;
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

const CHANNELS: { value: "push" | "email" | "in-app"; label: string }[] = [
  { value: "push", label: "Push" },
  { value: "email", label: "Email" },
  { value: "in-app", label: "In-app" },
];
const CHANNEL_LABEL: Record<string, string> = Object.fromEntries(CHANNELS.map((c) => [c.value, c.label]));

const STATUS_STYLE: Record<string, { color: string; background: string; borderColor: string }> = {
  sent: { color: "var(--green-lt)", background: "rgba(75,214,160,.12)", borderColor: "rgba(75,214,160,.35)" },
  scheduled: { color: "var(--amber)", background: "rgba(240,207,114,.12)", borderColor: "rgba(240,207,114,.35)" },
  draft: { color: "var(--dim)", background: "rgba(139,120,173,.12)", borderColor: "rgba(139,120,173,.3)" },
};

/**
 * 2C. Campaigns — segmented broadcast announcements. ECONOMY-gated. Real reach; CTR not tracked.
 * Composer state is owned here (not inside a child) so the right-rail reach/preview cards can
 * mirror it live, matching the approved secCampaigns two-column layout.
 */
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

  const mutate = useAdminMutation();
  const [channel, setChannel] = useState<"push" | "email" | "in-app">("push");
  const [segment, setSegment] = useState(SEGMENTS[0]!.value);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [reach, setReach] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // Auto-compute reach whenever the segment changes.
  useEffect(() => {
    let cancelled = false;
    setPreviewing(true);
    api
      .post<{ count: number }>("/api/admin/campaigns/preview", { segment })
      .then((d) => { if (!cancelled) setReach(d.count); })
      .catch(() => { if (!cancelled) setReach(null); })
      .finally(() => { if (!cancelled) setPreviewing(false); });
    return () => { cancelled = true; };
  }, [segment]);

  const valid = title.trim().length > 0 && body.trim().length > 0;

  const run = (action: "draft" | "schedule" | "send") => {
    const actionLabel = action === "draft" ? "Save draft" : action === "schedule" ? "Schedule" : "Send now";
    mutate({
      title: `${actionLabel}: "${title}" to ${SEGMENT_LABEL[segment] ?? segment}`,
      body:
        action === "send"
          ? reach !== null
            ? `Reach: ${reach.toLocaleString()} player(s) via ${CHANNEL_LABEL[channel]}. This sends immediately.`
            : "Preview the reach before sending."
          : `Via ${CHANNEL_LABEL[channel]}${action === "schedule" && scheduledFor ? ` · scheduled for ${scheduledFor}` : ""}.`,
      requireReason: true,
      confirmLabel: actionLabel,
      method: "POST",
      path: "/api/admin/campaigns",
      payload: {
        action,
        channel,
        segment,
        title,
        body,
        ...(action === "schedule" && scheduledFor ? { scheduledFor: new Date(scheduledFor).toISOString() } : {}),
      },
      successMsg: action === "draft" ? "Draft saved." : action === "schedule" ? "Campaign scheduled." : "Campaign sent.",
      onDone: () => { setTitle(""); setBody(""); setScheduledFor(""); load(); },
    });
  };

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="fd-2col" style={{ gridTemplateColumns: "1.5fr 1fr", alignItems: "start", gap: 16 }}>
          {/* composer */}
          <div className="acard" style={{ display: "flex", flexDirection: "column", gap: 16, padding: 22 }}>
            <div>
              <div style={{ font: "700 15px var(--sans)", color: "var(--ink-2)" }}>Compose campaign</div>
              <div style={{ marginTop: 5, font: "500 12px var(--sans)", color: "var(--dim)" }}>
                Reach players through push, email or in-app messages. Sends land in their Notifications center.
              </div>
            </div>

            <div>
              <div className="field" style={{ marginBottom: 5 }}><label>Channel</label></div>
              <div className="row">
                {CHANNELS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    className={`chip${channel === c.value ? " on" : ""}`}
                    onClick={() => setChannel(c.value)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>Audience segment</label>
              <select className="select" value={segment} onChange={(e) => { setSegment(e.target.value); setReach(null); }}>
                {SEGMENTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>

            <div className="field">
              <label>Title</label>
              <input className="input" placeholder="e.g. Weekend 2× Gold is live!" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="field">
              <label>Message</label>
              <textarea className="input" placeholder="Write your message…" style={{ minHeight: 100, resize: "vertical" }} value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
            <div className="field">
              <label>Schedule (leave for immediate send)</label>
              <input className="input" type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
            </div>

            <div className="row" style={{ justifyContent: "flex-end", marginTop: 2 }}>
              <button
                className="abtn"
                style={{
                  font: "700 12px var(--sans)", borderRadius: 9, padding: "10px 16px",
                  border: "1px solid rgba(232, 184, 75, .24)", color: "#d9ccf0", background: "transparent",
                }}
                disabled={!valid}
                onClick={() => run("draft")}
              >
                Save draft
              </button>
              <button
                className="abtn"
                style={{
                  font: "700 12px var(--sans)", borderRadius: 9, padding: "10px 16px",
                  border: "1px solid rgba(240, 207, 114, .4)", color: "#f0cf72", background: "rgba(15, 8, 32, .5)",
                }}
                disabled={!valid || !scheduledFor}
                onClick={() => run("schedule")}
              >
                Schedule
              </button>
              <button
                className="abtn"
                style={{
                  font: "800 12px var(--sans)", borderRadius: 9, padding: "10px 18px",
                  border: "1px solid rgba(217, 145, 31, .5)", color: "#3a2405",
                  background: "linear-gradient(180deg, #e8b04a, #c98a1e)",
                }}
                disabled={!valid || previewing}
                onClick={() => run("send")}
              >
                Send now
              </button>
            </div>
          </div>

          {/* preview + reach */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="acard">
              <div className="field" style={{ marginBottom: 0 }}><label>Estimated reach · {CHANNEL_LABEL[channel]}</label></div>
              <div className="mono" style={{ font: "800 30px var(--mono)", color: "var(--green-lt)", marginTop: 4 }}>
                {previewing ? "…" : reach !== null ? reach.toLocaleString() : "—"}
              </div>
              <div style={{ font: "500 11px var(--sans)", color: "var(--dim)", marginTop: 3 }}>
                {SEGMENT_LABEL[segment] ?? segment} player(s) match this segment.
              </div>
            </div>
            <div className="acard" style={{ background: "var(--bg-2)" }}>
              <div className="field" style={{ marginBottom: 0 }}><label>Live preview</label></div>
              <div style={{ marginTop: 10, background: "var(--panel)", border: "1px solid var(--edge)", borderRadius: 11, padding: 14, display: "flex", gap: 11, alignItems: "flex-start" }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, flex: "none", background: "linear-gradient(135deg,#e8b04a,#c98a1e)", display: "flex", alignItems: "center", justifyContent: "center", font: "900 15px var(--serif)", color: "#3a2405" }}>D</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ font: "700 13px var(--sans)", color: "var(--ink)", wordBreak: "break-word" }}>{title || "Notification title"}</div>
                  <div style={{ font: "500 12px var(--sans)", color: "var(--ink-3)", marginTop: 3, lineHeight: 1.45, wordBreak: "break-word" }}>{body || "Your message will appear here."}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <MaintenanceCard />

        <div className="panel" style={{ overflowX: "auto" }}>
          <div className="card-header" style={{ padding: "14px 16px" }}>
            <span className="t" style={{ font: "700 12px var(--sans)", letterSpacing: ".4px", color: "#e9e0f7" }}>Campaign history</span>
          </div>
          <table className="tbl" style={{ minWidth: 760 }}>
            <thead>
              <tr className="thead-raised">
                <th>Campaign</th>
                <th>Channel</th>
                <th>Audience</th>
                <th>Status</th>
                <th className="num">Reach</th>
                <th className="num">CTR</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="dim" style={{ textAlign: "center", padding: 24 }}>Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="dim" style={{ textAlign: "center", padding: 24 }}>No campaigns yet.</td></tr>
              ) : (
                rows.map((c) => {
                  const st = STATUS_STYLE[c.status] ?? STATUS_STYLE.draft!;
                  return (
                    <tr key={c.id} className="arow">
                      <td style={{ maxWidth: 280 }}>
                        <div style={{ font: "700 13px var(--sans)", color: "var(--ink)" }}>{c.title}</div>
                        <div className="dim" style={{ fontSize: 10.5, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.body}</div>
                      </td>
                      <td className="dim" style={{ whiteSpace: "nowrap" }}>{CHANNEL_LABEL[c.channel] ?? c.channel}</td>
                      <td className="dim" style={{ whiteSpace: "nowrap" }}>{SEGMENT_LABEL[c.segment] ?? c.segment}</td>
                      <td>
                        <span className="badge-rect" style={{ color: st.color, background: st.background, borderColor: st.borderColor }}>{c.status}</span>
                      </td>
                      <td className="num mono">{c.reach.toLocaleString()}</td>
                      <td className="num mono dim">—</td>
                      <td className="mono dim" style={{ whiteSpace: "nowrap" }}>{new Date(c.scheduledFor ?? c.createdAt).toLocaleString()}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/**
 * Maintenance mode — the mockup describes a takeover toggle that "pauses matchmaking for all
 * players." No such flag exists server-side: /api/admin/config only exposes MAINTENANCE_BANNER
 * (a banner-text flag under Settings, not a matchmaking pause). Rendering a working toggle here
 * would fabricate behavior that doesn't exist, so this renders the mockup's copy as an honest,
 * disabled state instead. See apps/server/src/modules/admin-config.ts.
 */
function MaintenanceCard() {
  return (
    <div className="acard" style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px" }}>
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--dim-2)", flex: "none" }} />
      <div style={{ flex: 1 }}>
        <div style={{ font: "700 13px var(--sans)", color: "var(--ink-2)" }}>Maintenance mode</div>
        <div style={{ font: "500 11px var(--sans)", color: "var(--dim)", marginTop: 2 }}>
          Pauses matchmaking for all players and shows a takeover notice. Superadmin only. Not wired yet — no matchmaking-pause flag exists server-side.
        </div>
      </div>
      <button className="abtn btn-ghost" disabled title="Not available — no server-side matchmaking-pause flag exists yet">Unavailable</button>
    </div>
  );
}
