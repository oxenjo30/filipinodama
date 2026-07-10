import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAdminMutation } from "../lib/ui";

type PersonRef = { id: string | null; username: string; tag: string; avatarUrl: string | null };
type ProfileSnapshot = { displayName: string; username: string; tag: string; avatarUrl: string | null; bio: string | null };

type Report = {
  id: string;
  reason: string;
  note: string | null;
  context: "dm" | "profile";
  channelId: string | null;
  messageId: string | null;
  excerpt: string | null;
  profileSnapshot: ProfileSnapshot | null;
  status: "OPEN" | "RESOLVED" | "DISMISSED";
  createdAt: string;
  accusedGone: boolean;
  reporter: PersonRef;
  accused: PersonRef;
};

const BADGE: Record<string, { label: string; accent: string }> = {
  HARASSMENT: { label: "Harassment", accent: "#c2495a" },
  HATE_SPEECH: { label: "Hate speech", accent: "#a8324a" },
  CHEATING: { label: "Cheating", accent: "#d98a3a" },
  INAPPROPRIATE: { label: "Inappropriate", accent: "#8b78ad" },
  SPAM: { label: "Spam", accent: "#d9911f" },
  OTHER: { label: "Other", accent: "var(--dim)" },
};

const STATUS_FILTERS = ["OPEN", "RESOLVED", "DISMISSED"] as const;
const REASON_FILTERS = Object.keys(BADGE);

/** 1.5 Moderation — the reports queue (Trust & Safety). */
export function Moderation() {
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("OPEN");
  const [reason, setReason] = useState<string>("");
  const [rows, setRows] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    const qs = new URLSearchParams({ status, limit: "100" });
    if (reason) qs.set("reason", reason);
    api
      .get<{ items: Report[]; nextCursor: string | null }>(`/api/admin/reports?${qs}`)
      .then((d) => setRows(d.items))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, [status, reason]);

  const filtersActive = status !== "OPEN" || reason !== "";
  const clearFilters = () => { setStatus("OPEN"); setReason(""); };

  return (
    <>
      <div className="crumb">Trust & Safety · Moderation</div>
      <h1 className="page">Moderation queue</h1>

      <div className="row" style={{ marginBottom: 14 }}>
        {STATUS_FILTERS.map((s) => (
          <button key={s} className={`chip${status === s ? " on" : ""}`} onClick={() => setStatus(s)}>{s.toLowerCase()}</button>
        ))}
        <div style={{ width: 1, alignSelf: "stretch", background: "var(--edge)", margin: "0 4px" }} />
        <button className={`chip${reason === "" ? " on" : ""}`} onClick={() => setReason("")}>all reasons</button>
        {REASON_FILTERS.map((r) => (
          <button key={r} className={`chip${reason === r ? " on" : ""}`} onClick={() => setReason(r)}>{BADGE[r]!.label}</button>
        ))}
      </div>

      {loading ? (
        <div className="panel panel-pad dim" style={{ textAlign: "center" }}>Loading…</div>
      ) : rows.length === 0 ? (
        filtersActive ? (
          <EmptyState
            title="No reports match these filters"
            note="Try a different status or reason, or clear filters to see the full queue."
            action={<button className="btn gold" onClick={clearFilters}>Clear filters</button>}
          />
        ) : (
          <EmptyState title="Queue clear" note="No open reports. Nicely done." />
        )
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.map((r) => (
            <ReportCard key={r.id} r={r} onDone={load} />
          ))}
        </div>
      )}
    </>
  );
}

function EmptyState({ title, note, action, icon }: { title: string; note: string; action?: React.ReactNode; icon?: string }) {
  return (
    <div className="panel panel-pad" style={{ textAlign: "center", padding: 48 }}>
      {icon && <div style={{ fontSize: 20, marginBottom: 6, opacity: 0.7 }}>{icon}</div>}
      <div style={{ fontWeight: 700, marginBottom: 6, color: "var(--gold-lt)", font: "700 15px var(--serif)" }}>{title}</div>
      <div className="dim" style={{ maxWidth: 420, margin: "6px auto 0", fontSize: 13, fontWeight: 500 }}>{note}</div>
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

function ReportCard({ r, onDone }: { r: Report; onDone: () => void }) {
  const mutate = useAdminMutation();
  const badge = BADGE[r.reason] ?? BADGE.OTHER!;
  const accusedLabel = r.accused.id ? `${r.accused.username} ${r.accused.tag}` : `${r.accused.username} (deleted)`;
  const reporterLabel = r.reporter.id ? `${r.reporter.username} ${r.reporter.tag}` : `${r.reporter.username} (deleted)`;

  const durationField = (set: (k: string, v: unknown) => void, vals: Record<string, unknown>) => (
    <div className="field">
      <label>Duration (hours, 0 = permanent)</label>
      <input className="input" type="number" value={(vals.durationHours as number) ?? ""} onChange={(e) => set("durationHours", Number(e.target.value))} />
    </div>
  );

  const dismiss = () =>
    mutate({
      title: "Dismiss this report",
      requireReason: true,
      confirmLabel: "Dismiss",
      method: "POST",
      path: `/api/admin/reports/${r.id}/dismiss`,
      successMsg: "Report dismissed.",
      onDone,
    });

  const mute = () =>
    mutate({
      title: "Mute the reported player",
      requireReason: true,
      confirmLabel: "Mute",
      method: "POST",
      path: `/api/admin/reports/${r.id}/mute`,
      successMsg: "Muted + report resolved.",
      onDone,
      extra: durationField,
    });

  const ban = () =>
    mutate({
      title: "Ban the reported player",
      requireReason: true,
      danger: true,
      confirmLabel: "Ban",
      method: "POST",
      path: `/api/admin/reports/${r.id}/ban`,
      successMsg: "Banned + report resolved.",
      onDone,
      extra: durationField,
    });

  return (
    <div className="acard" style={{ borderLeft: `3px solid ${badge.accent}`, borderRadius: 12 }}>
      <div className="row" style={{ alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div className="row" style={{ marginBottom: 6, gap: 8 }}>
            <span className="badge-rect" style={{ color: badge.accent, background: "rgba(255,255,255,.06)", borderColor: badge.accent }}>{badge.label}</span>
            <span className="dim" style={{ fontSize: 11, fontWeight: 600 }}>{timeAgo(r.createdAt)}</span>
          </div>
          <div style={{ fontWeight: 700, marginTop: 10, fontSize: 13, color: "var(--ink-3)" }}>
            <span className="dim" style={{ fontWeight: 500 }}>Reported:</span> <span style={{ color: "var(--ink-2)" }}>{accusedLabel}</span> <span className="dim" style={{ fontWeight: 500 }}>· by {reporterLabel} · in {r.context === "dm" ? "DM" : "profile"}</span>
          </div>

          {r.context === "dm" && r.excerpt && (
            <div className="quote-flagged">“{r.excerpt}”</div>
          )}

          {r.context === "profile" && r.profileSnapshot && (
            <div className="panel" style={{ marginTop: 10, padding: "10px 14px", background: "var(--panel-2)" }}>
              <div style={{ fontWeight: 600 }}>{r.profileSnapshot.displayName} <span className="dim mono">{r.profileSnapshot.username} {r.profileSnapshot.tag}</span></div>
              {r.profileSnapshot.bio && <div className="dim" style={{ marginTop: 4, fontSize: 13 }}>{r.profileSnapshot.bio}</div>}
            </div>
          )}

          {r.note && (
            <div className="dim" style={{ marginTop: 10, fontSize: 13 }}>
              <span style={{ fontWeight: 700, color: "var(--ink-2)" }}>Reporter note: </span>{r.note}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 7, minWidth: 130 }}>
          <button className="abtn btn-ghost" onClick={dismiss}>Dismiss</button>
          <button className="abtn btn-amber" disabled={r.accusedGone} title={r.accusedGone ? "Accused account no longer exists" : undefined} onClick={mute}>Mute</button>
          <button className="abtn btn-danger" disabled={r.accusedGone} title={r.accusedGone ? "Accused account no longer exists" : undefined} onClick={ban}>Ban</button>
          {r.accusedGone && <span className="dim" style={{ fontSize: 11 }}>Accused deleted — dismiss only.</span>}
        </div>
      </div>
    </div>
  );
}
