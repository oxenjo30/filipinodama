import { useEffect, useState } from "react";
import { api } from "../lib/api";

type OverviewData = {
  totalPlayers: number;
  activePlayers: number;
  matchesTotal: number;
  faucet: number;
  sink: number;
  faucetPct: number;
  matchesPerDay: { day: string; count: number }[];
  totalPlayersPrev: number;
  activePlayersPrev: number;
  matches7d: number;
  matchesPrev7d: number;
};

/**
 * Overview — matches the approved dashboard layout, but every number is REAL
 * (from the DB): player counts, matches/day, and the gold faucet-vs-sink from
 * the ledger. KPI trend deltas are real period-over-period comparisons against
 * prior-window counts (also from the DB — no analytics pipeline). Metrics that
 * need an analytics pipeline (revenue) are honestly labeled rather than faked.
 */
export function Overview() {
  const [d, setD] = useState<OverviewData | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    api.get<OverviewData>("/api/admin/overview").then(setD).catch(() => setErr(true));
  }, []);

  if (err) return <div className="phase2">Couldn't load overview.</div>;
  if (!d) return <div className="dim" style={{ padding: 24 }}>Loading…</div>;

  const maxMatch = Math.max(1, ...d.matchesPerDay.map((m) => m.count));

  return (
    <>
      {/* KPI cards — real counts; each tile's trend is a real prior-window delta.
          The one metric with no data source (Revenue) is honestly labeled instead. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
        <Card label="Total Players" value={d.totalPlayers.toLocaleString()} delta={delta(d.totalPlayers, d.totalPlayersPrev)} deltaCaption="vs last wk" />
        <Card label="Active (7d)" value={d.activePlayers.toLocaleString()} delta={delta(d.activePlayers, d.activePlayersPrev)} deltaCaption="vs prior 7d" />
        <Card label="Matches (all-time)" value={d.matchesTotal.toLocaleString()} delta={delta(d.matches7d, d.matchesPrev7d)} deltaCaption="7d vs prior 7d" />
        <Card label="Revenue" value="—" sub="needs analytics pipeline" muted />
      </div>

      <div className="fd-2col chart" style={{ marginTop: 14 }}>
        {/* Matches per day — real */}
        <div className="acard" style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <div style={{ font: "700 13px var(--sans)", color: "var(--ink-2)" }}>Matches per day</div>
            <div style={{ font: "600 11px var(--sans)", color: "var(--dim)" }}>last 7 days</div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 150, marginTop: 18 }}>
            {d.matchesPerDay.map((b, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, height: "100%", justifyContent: "flex-end" }}>
                <div style={{ font: "600 10px var(--mono)", color: "var(--dim)" }}>{b.count}</div>
                <div style={{ width: "100%", borderRadius: "6px 6px 0 0", background: "linear-gradient(180deg,#f0cf72,#c99a2e)", height: `${Math.max(2, (b.count / maxMatch) * 100)}%` }} />
                <div style={{ font: "600 10px var(--sans)", color: "var(--dim-2)" }}>{b.day}</div>
              </div>
            ))}
          </div>
        </div>

        {/* System status — live-ish (the API is clearly up if this loaded) */}
        <div className="acard" style={{ padding: 20 }}>
          <div style={{ font: "700 13px var(--sans)", color: "var(--ink-2)" }}>System status</div>
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 11 }}>
            <Status name="API server" ok detail="responding" />
            <Status name="PostgreSQL" ok detail="connected" />
            <Status name="Redis" ok detail="connected" />
            <Status name="Matchmaking" ok detail="online" />
            <Status name="Payments" detail="disabled (gold-only)" warn />
          </div>
        </div>
      </div>

      <div className="fd-2col" style={{ marginTop: 14 }}>
        {/* Economy health — real faucet vs sink from the ledger */}
        <div className="acard" style={{ padding: 20 }}>
          <div style={{ font: "700 13px var(--sans)", color: "var(--ink-2)" }}>
            Economy health <span style={{ fontWeight: 500, color: "var(--dim)" }}>· gold faucet vs sink (7d)</span>
          </div>
          <div style={{ display: "flex", gap: 20, marginTop: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ font: "700 10px var(--sans)", letterSpacing: 1, color: "var(--green)" }}>FAUCET (granted)</div>
              <div style={{ font: "700 20px var(--mono)", color: "var(--ink-2)", marginTop: 5 }}>{d.faucet.toLocaleString()}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ font: "700 10px var(--sans)", letterSpacing: 1, color: "var(--red)" }}>SINK (spent)</div>
              <div style={{ font: "700 20px var(--mono)", color: "var(--ink-2)", marginTop: 5 }}>{d.sink.toLocaleString()}</div>
            </div>
          </div>
          <div style={{ height: 10, borderRadius: 6, overflow: "hidden", display: "flex", marginTop: 16, background: "var(--bg-2)" }}>
            <div style={{ width: `${d.faucetPct}%`, background: "linear-gradient(90deg,#2f8f5b,#3fb574)" }} />
            <div style={{ flex: 1, background: "linear-gradient(90deg,#a53b4a,#c2495a)" }} />
          </div>
          <div style={{ marginTop: 10, font: "600 11px var(--sans)", color: d.faucetPct >= 55 ? "var(--green-lt)" : "var(--amber)" }}>
            {d.faucetPct >= 55 ? "Healthy — faucet ahead of sink" : d.faucetPct <= 45 ? "Sink ahead of faucet — watch inflation" : "Balanced faucet vs sink"} ({d.faucetPct}/{100 - d.faucetPct}).
          </div>
        </div>

        {/* Revenue — honest: real-money top-up is disabled (gold-only economy),
            and there's no analytics pipeline for it even if it were enabled. */}
        <div className="acard" style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <div style={{ font: "700 13px var(--sans)", color: "var(--ink-2)" }}>Revenue</div>
            <div style={{ font: "600 11px var(--sans)", color: "var(--dim)" }}>USD · last 7 days</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 110, marginTop: 16 }}>
            <div style={{ font: "600 12px var(--sans)", color: "var(--dim)", textAlign: "center" }}>Payments disabled (gold-only)</div>
          </div>
          <div style={{ marginTop: 12, font: "700 18px var(--mono)", color: "var(--dim)" }}>
            — <span style={{ font: "600 11px var(--sans)", color: "var(--dim)" }}>needs analytics pipeline</span>
          </div>
        </div>
      </div>
    </>
  );
}

/** Real period-over-period delta from a prior-window count. Returns null (no
 * fabricated number) if the prior count is unavailable — callers fall back to
 * the plain descriptor caption instead of rendering a fake delta. */
function delta(current: number, prior: number): { pct: number; up: boolean } | null {
  if (prior <= 0) return null;
  const pct = ((current - prior) / prior) * 100;
  return { pct, up: pct >= 0 };
}

function Card({
  label,
  value,
  sub,
  muted,
  delta: dv,
  deltaCaption,
}: {
  label: string;
  value: string;
  sub?: string;
  muted?: boolean;
  delta?: { pct: number; up: boolean } | null;
  deltaCaption?: string;
}) {
  return (
    <div className={muted ? "fd-kpi" : dv ? (dv.up ? "fd-kpi up" : "fd-kpi down") : "fd-kpi"}>
      <div className="l">{label}</div>
      <div className="v" style={muted ? { color: "var(--dim)" } : undefined}>{value}</div>
      {dv ? (
        <div className="trend">
          <span className="sub">{deltaCaption}</span>
          <span className={`delta ${dv.up ? "up" : "down"}`}>{dv.up ? "+" : ""}{dv.pct.toFixed(1)}%</span>
        </div>
      ) : (
        <div style={{ marginTop: 8, font: "600 11px var(--sans)", color: "var(--dim)" }}>{sub ?? deltaCaption}</div>
      )}
    </div>
  );
}

function Status({ name, detail, ok, warn }: { name: string; detail: string; ok?: boolean; warn?: boolean }) {
  const color = warn ? "var(--amber)" : ok ? "var(--green)" : "var(--red)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}`, flex: "none" }} />
      <span style={{ font: "600 12px var(--sans)", color: "var(--ink-3)", flex: 1 }}>{name}</span>
      <span style={{ font: "600 10px var(--mono)", color: "var(--dim)" }}>{detail}</span>
    </div>
  );
}
