import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Window = "7d" | "30d" | "90d";

type Kpis = {
  totalPlayers: number;
  newPlayers: number;
  activePlayers: number;
  matchesInWindow: number;
  matchesTotal: number;
  goldFaucet: number;
  goldSink: number;
  guildsTotal: number;
};

type DayBucket = { day: string; count: number };

type GoldReason = { reason: string; faucet: number; sink: number };

type ModeRow = { mode: string; count: number; pct: number };

type MatchOutcomes = { redWins: number; blueWins: number; draws: number; unfinished: number; total: number };

type RankTierRow = { key: string; label: string; accent: string; count: number; pct: number };

type TopItem = { itemId: string; name: string; type: string | null; owners: number; pct: number };

type RegionRow = { code: string; count: number; pct: number };
type FunnelRow = { stage: string; count: number; pct: number };
type GoldCatRow = { category: string; gold: number; pct: number };
type RetentionRow = { day: number; eligible: number; retained: number; pct: number };

type AnalyticsData = {
  window: Window;
  days: number;
  kpis: Kpis;
  newPlayersPerDay: DayBucket[];
  activePerDay: DayBucket[];
  activePerDayNote: string;
  gold: { faucet: number; sink: number; faucetPct: number; byReason: GoldReason[] };
  matchesByMode: ModeRow[];
  matchOutcomes: MatchOutcomes;
  rankTiers: RankTierRow[];
  topItems: TopItem[];
  topRegions: RegionRow[];
  funnel: FunnelRow[];
  goldByCategory: GoldCatRow[];
  retention: RetentionRow[];
  retentionTracked: boolean;
};

const WINDOWS: Window[] = ["7d", "30d", "90d"];

/**
 * Analytics deep-dive — the honest, deeper sibling of Overview. Every panel is
 * fed by GET /api/admin/analytics?window=, a bundle of real, computed metrics
 * (no event-tracking pipeline, no revenue — see the footer). Reuses Overview's
 * CSS-bar chart style (gold-gradient bars, the --sans/--mono/--ink/--dim tokens).
 */
export function Analytics() {
  const [w, setW] = useState<Window>("30d");
  const [d, setD] = useState<AnalyticsData | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    setD(null);
    setErr(false);
    api
      .get<AnalyticsData>(`/api/admin/analytics?window=${w}`)
      .then(setD)
      .catch(() => setErr(true));
  }, [w]);

  return (
    <>
      {/* Range pills only, right-aligned — mockup secAnalytics has no page-title crumb (title lives in the topbar). */}
      <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginBottom: 14 }}>
        {WINDOWS.map((opt) => (
          <button
            key={opt}
            className={`abtn ${w === opt ? "btn-gold-pill" : "btn-ghost"}`}
            onClick={() => setW(opt)}
          >
            {opt}
          </button>
        ))}
      </div>

      {err ? (
        <div className="phase2">Couldn't load analytics.</div>
      ) : !d ? (
        <div className="dim" style={{ padding: 24 }}>Loading…</div>
      ) : (
        <AnalyticsBody d={d} />
      )}
    </>
  );
}

function AnalyticsBody({ d }: { d: AnalyticsData }) {
  const maxNew = Math.max(1, ...d.newPlayersPerDay.map((b) => b.count));
  const maxActive = Math.max(1, ...d.activePerDay.map((b) => b.count));
  const maxMode = Math.max(1, ...d.matchesByMode.map((m) => m.count));
  const maxReason = Math.max(1, ...d.gold.byReason.map((r) => r.faucet + r.sink));
  const maxTier = Math.max(1, ...d.rankTiers.map((t) => t.count));

  return (
    <>
      {/* KPI grid — the mockup's 8-tile grid, all real scalars for the window. No fabricated
          trend deltas: the API doesn't return a prior-window count to diff against, so each
          tile's trend slot carries the honest window label instead of an invented ±%. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        <Card label="Total Players" value={d.kpis.totalPlayers.toLocaleString()} sub="all-time real accounts" />
        <Card label="New Players" value={d.kpis.newPlayers.toLocaleString()} sub={`in ${d.window}`} />
        <Card label="Active Players" value={d.kpis.activePlayers.toLocaleString()} sub={`seen in ${d.window}`} />
        <Card label="Matches" value={d.kpis.matchesInWindow.toLocaleString()} sub={`started in ${d.window}`} />
        <Card label="Matches (all-time)" value={d.kpis.matchesTotal.toLocaleString()} sub="played to date" />
        <Card label="Gold Faucet" value={d.kpis.goldFaucet.toLocaleString()} sub={`granted in ${d.window}`} tile="up" />
        <Card label="Gold Sink" value={d.kpis.goldSink.toLocaleString()} sub={`spent in ${d.window}`} tile="down" />
        <Card label="Guilds" value={d.kpis.guildsTotal.toLocaleString()} sub="all-time" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 14, marginTop: 14 }} className="ov-2col">
        {/* New players per day — gold gradient, same markup as Overview. */}
        <div className="acard" style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <div style={{ font: "700 13px var(--sans)", color: "var(--ink-2)" }}>New players per day</div>
            <div style={{ font: "600 11px var(--sans)", color: "var(--dim)" }}>last {d.days} days</div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: Math.max(2, 12 - Math.floor(d.newPlayersPerDay.length / 12)), height: 150, marginTop: 18, overflowX: "auto" }}>
            {d.newPlayersPerDay.map((b, i) => (
              <div key={i} style={{ flex: 1, minWidth: 4, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, height: "100%", justifyContent: "flex-end" }}>
                <div style={{ font: "600 10px var(--mono)", color: "var(--dim)" }}>{b.count}</div>
                <div style={{ width: "100%", borderRadius: "6px 6px 0 0", background: "linear-gradient(180deg,#f0cf72,#c99a2e)", height: `${Math.max(2, (b.count / maxNew) * 100)}%` }} />
              </div>
            ))}
          </div>
        </div>

        {/* Last-seen activity — cyan gradient, honest "not DAU" caveat. */}
        <div className="acard" style={{ padding: 20 }}>
          <div style={{ font: "700 13px var(--sans)", color: "var(--ink-2)" }}>Last-seen activity</div>
          <div style={{ font: "600 11px var(--sans)", color: "var(--dim)", marginTop: 2 }}>players by last-seen day · snapshot, not unique DAU</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: Math.max(2, 12 - Math.floor(d.activePerDay.length / 12)), height: 130, marginTop: 14, overflowX: "auto" }}>
            {d.activePerDay.map((b, i) => (
              <div key={i} style={{ flex: 1, minWidth: 4, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, height: "100%", justifyContent: "flex-end" }}>
                <div style={{ font: "600 10px var(--mono)", color: "var(--dim)" }}>{b.count}</div>
                <div style={{ width: "100%", borderRadius: "6px 6px 0 0", background: "linear-gradient(180deg,#5fd0e0,#2E8B9E)", height: `${Math.max(2, (b.count / maxActive) * 100)}%` }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Acquisition funnel (real cohort) + Matches by mode. */}
      <div style={{ display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: 14, marginTop: 14 }} className="ov-2col">
        <div className="acard" style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <div style={{ font: "700 13px var(--sans)", color: "var(--ink-2)" }}>Acquisition funnel</div>
            <div style={{ font: "600 11px var(--sans)", color: "var(--dim)" }}>{d.window} signup cohort</div>
          </div>
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            {d.funnel.map((s, i) => (
              <div key={s.stage}>
                <div style={{ display: "flex", justifyContent: "space-between", font: "600 12px var(--sans)", color: "var(--ink-3)" }}>
                  <span>{s.stage}</span>
                  <span className="mono dim">{s.count.toLocaleString()} · {Math.round(s.pct * 100)}%</span>
                </div>
                <div style={{ height: 12, borderRadius: 6, overflow: "hidden", marginTop: 5, background: "var(--bg-2)" }}>
                  <div style={{ width: `${Math.max(1, s.pct * 100)}%`, height: "100%", background: FUNNEL_COLORS[i % FUNNEL_COLORS.length] }} />
                </div>
              </div>
            ))}
          </div>
          <div className="dim" style={{ font: "600 10.5px var(--sans)", marginTop: 12 }}>
            Purchase = in-game gold spend (real money is disabled). "Still active" = seen in the last 7 days.
          </div>
        </div>

        {/* Matches by mode — real data. */}
        <div className="acard" style={{ padding: 20 }}>
          <div style={{ font: "700 13px var(--sans)", color: "var(--ink-2)", marginBottom: 14 }}>
            Matches by mode <span style={{ fontWeight: 500, color: "var(--dim)" }}>· {d.window}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {d.matchesByMode.map((m) => (
              <div key={m.mode}>
                <div style={{ display: "flex", justifyContent: "space-between", font: "600 12px var(--sans)", color: "var(--ink-3)" }}>
                  <span>{m.mode}</span>
                  <span className="mono dim">{m.count.toLocaleString()} · {Math.round(m.pct * 100)}%</span>
                </div>
                <div style={{ height: 9, borderRadius: 5, overflow: "hidden", marginTop: 4, background: "var(--bg-2)" }}>
                  <div style={{ width: `${(m.count / maxMode) * 100}%`, height: "100%", background: "linear-gradient(90deg,#f0cf72,#c99a2e)" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Retention + Top regions. */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }} className="ov-2col">
        <div className="acard" style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <div style={{ font: "700 13px var(--sans)", color: "var(--ink-2)" }}>Retention</div>
            <div style={{ font: "600 11px var(--sans)", color: "var(--dim)" }}>{d.window} signup cohort</div>
          </div>
          {!d.retentionTracked ? (
            <div className="dim" style={{ font: "600 12px var(--sans)", marginTop: 16, lineHeight: 1.6 }}>
              Retention tracking has just started collecting daily-activity data. Real D1/D7/D30 numbers
              appear here as activity accrues over the coming days.
            </div>
          ) : (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              {d.retention.map((r) => (
                <div key={r.day}>
                  <div style={{ display: "flex", justifyContent: "space-between", font: "600 12px var(--sans)", color: "var(--ink-3)" }}>
                    <span>Day {r.day}</span>
                    <span className="mono dim">{r.retained.toLocaleString()}/{r.eligible.toLocaleString()} · {Math.round(r.pct * 100)}%</span>
                  </div>
                  <div style={{ height: 9, borderRadius: 5, overflow: "hidden", marginTop: 4, background: "var(--bg-2)" }}>
                    <div style={{ width: `${Math.max(1, r.pct * 100)}%`, height: "100%", background: "linear-gradient(90deg,#5fd0e0,#2E8B9E)" }} />
                  </div>
                </div>
              ))}
              <div className="dim" style={{ font: "600 10.5px var(--sans)", marginTop: 4 }}>
                Real per-day activity (from the activity log). Only counts cohorts old enough for each horizon.
              </div>
            </div>
          )}
        </div>

        <div className="acard" style={{ padding: 20 }}>
          <div style={{ font: "700 13px var(--sans)", color: "var(--ink-2)" }}>Top regions <span style={{ fontWeight: 500, color: "var(--dim)" }}>· all-time</span></div>
          {d.topRegions.length === 0 ? (
            <div className="dim" style={{ font: "600 12px var(--sans)", marginTop: 16 }}>No region data yet.</div>
          ) : (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              {d.topRegions.map((r) => (
                <div key={r.code}>
                  <div style={{ display: "flex", justifyContent: "space-between", font: "600 12px var(--sans)", color: "var(--ink-3)" }}>
                    <span>{regionLabel(r.code)}</span>
                    <span className="mono dim">{r.count.toLocaleString()} · {Math.round(r.pct * 100)}%</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 5, overflow: "hidden", marginTop: 4, background: "var(--bg-2)" }}>
                    <div style={{ width: `${Math.max(1, (r.count / (d.topRegions[0]?.count || 1)) * 100)}%`, height: "100%", background: "linear-gradient(90deg,#b98cff,#8a5cf0)" }} />
                  </div>
                </div>
              ))}
              <div className="dim" style={{ font: "600 10.5px var(--sans)", marginTop: 4 }}>
                By self-reported country ("Unknown" = no country set). Not IP-geolocated.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Gold economy — faucet/sink bar + byReason breakdown. */}
      <div className="acard" style={{ padding: 20, marginTop: 14 }}>
        <div style={{ font: "700 13px var(--sans)", color: "var(--ink-2)" }}>
          Gold economy <span style={{ fontWeight: 500, color: "var(--dim)" }}>· faucet vs sink ({d.window})</span>
        </div>
        <div style={{ display: "flex", gap: 20, marginTop: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ font: "700 10px var(--sans)", letterSpacing: 1, color: "var(--green)" }}>FAUCET (granted)</div>
            <div style={{ font: "700 20px var(--mono)", color: "var(--ink-2)", marginTop: 5 }}>{d.gold.faucet.toLocaleString()}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ font: "700 10px var(--sans)", letterSpacing: 1, color: "var(--red)" }}>SINK (spent)</div>
            <div style={{ font: "700 20px var(--mono)", color: "var(--ink-2)", marginTop: 5 }}>{d.gold.sink.toLocaleString()}</div>
          </div>
        </div>
        <div style={{ height: 10, borderRadius: 6, overflow: "hidden", display: "flex", marginTop: 16, background: "var(--bg-2)" }}>
          <div style={{ width: `${d.gold.faucetPct}%`, background: "linear-gradient(90deg,#2f8f5b,#3fb574)" }} />
          <div style={{ flex: 1, background: "linear-gradient(90deg,#a53b4a,#c2495a)" }} />
        </div>
        <div style={{ marginTop: 10, font: "600 11px var(--sans)", color: d.gold.faucetPct >= 55 ? "var(--green-lt)" : "var(--amber)" }}>
          {d.gold.faucetPct >= 55 ? "Healthy — faucet ahead of sink" : d.gold.faucetPct <= 45 ? "Sink ahead of faucet — watch inflation" : "Balanced faucet vs sink"} ({d.gold.faucetPct}/{100 - d.gold.faucetPct}).
        </div>

        {/* byReason breakdown — mockup's revCats layout, real ledger reasons. */}
        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          {d.gold.byReason.length === 0 ? (
            <div className="dim" style={{ font: "600 12px var(--sans)" }}>No gold ledger activity in this window.</div>
          ) : (
            d.gold.byReason.map((r) => (
              <div key={r.reason}>
                <div style={{ display: "flex", justifyContent: "space-between", font: "600 11px var(--sans)", color: "var(--ink-3)" }}>
                  <span>{r.reason}</span>
                  <span className="mono" style={{ color: "var(--dim)" }}>
                    <span style={{ color: "var(--green-lt)" }}>+{r.faucet.toLocaleString()}</span>
                    {r.sink > 0 && <> · <span style={{ color: "var(--red-lt)" }}>-{r.sink.toLocaleString()}</span></>}
                  </span>
                </div>
                <div style={{ height: 8, borderRadius: 5, overflow: "hidden", display: "flex", marginTop: 4, background: "var(--bg-2)" }}>
                  <div style={{ width: `${(r.faucet / maxReason) * 100}%`, background: "linear-gradient(90deg,#2f8f5b,#3fb574)" }} />
                  <div style={{ width: `${(r.sink / maxReason) * 100}%`, background: "linear-gradient(90deg,#a53b4a,#c2495a)" }} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Gold spend by category (left) + Match outcomes (right) — paired into one
          balanced row so neither sits alone with dead space beside it. */}
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 14, marginTop: 14, alignItems: "start" }} className="ov-2col">
        <div className="acard" style={{ padding: 20 }}>
          <div style={{ font: "700 13px var(--sans)", color: "var(--ink-2)" }}>
            Gold spend by category <span style={{ fontWeight: 500, color: "var(--dim)" }}>· store purchases ({d.window})</span>
          </div>
          {d.goldByCategory.length === 0 ? (
            <div className="dim" style={{ font: "600 12px var(--sans)", marginTop: 16 }}>No store purchases in this window.</div>
          ) : (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              {d.goldByCategory.map((c, i) => (
                <div key={c.category}>
                  <div style={{ display: "flex", justifyContent: "space-between", font: "600 12px var(--sans)", color: "var(--ink-3)" }}>
                    <span>{catLabel(c.category)}</span>
                    <span className="mono dim">{c.gold.toLocaleString()} gold · {Math.round(c.pct * 100)}%</span>
                  </div>
                  <div style={{ height: 9, borderRadius: 5, overflow: "hidden", marginTop: 4, background: "var(--bg-2)" }}>
                    <div style={{ width: `${Math.max(1, (c.gold / (d.goldByCategory[0]?.gold || 1)) * 100)}%`, height: "100%", background: CAT_COLORS[i % CAT_COLORS.length] }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="acard" style={{ padding: 20 }}>
          <div style={{ font: "700 13px var(--sans)", color: "var(--ink-2)" }}>Match outcomes <span style={{ fontWeight: 500, color: "var(--dim)" }}>· {d.window}</span></div>
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 11 }}>
            <Stat label="Red wins" value={d.matchOutcomes.redWins} color="var(--red-lt)" />
            <Stat label="Blue wins" value={d.matchOutcomes.blueWins} color="var(--blue)" />
            <Stat label="Draws" value={d.matchOutcomes.draws} color="var(--dim-2)" />
            <Stat label="Unfinished" value={d.matchOutcomes.unfinished} color="var(--dim)" />
            <div style={{ borderTop: "1px solid var(--edge)", marginTop: 4, paddingTop: 10, display: "flex", justifyContent: "space-between", font: "700 12px var(--sans)", color: "var(--ink-2)" }}>
              <span>Total</span>
              <span className="mono">{d.matchOutcomes.total.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Rank-tier distribution (left) + Top cosmetics table (right) — paired so
          the tier bars and the ownership table fill one row with no orphan. */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14, alignItems: "start" }} className="ov-2col">
        <div className="acard" style={{ padding: 20 }}>
          <div style={{ font: "700 13px var(--sans)", color: "var(--ink-2)" }}>Rank-tier distribution <span style={{ fontWeight: 500, color: "var(--dim)" }}>· all-time</span></div>
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            {d.rankTiers.map((t) => (
              <div key={t.key}>
                <div style={{ display: "flex", justifyContent: "space-between", font: "600 12px var(--sans)", color: "var(--ink-3)" }}>
                  <span>{t.label}</span>
                  <span className="mono dim">{t.count.toLocaleString()} · {Math.round(t.pct * 100)}%</span>
                </div>
                <div style={{ height: 8, borderRadius: 5, overflow: "hidden", marginTop: 4, background: "var(--bg-2)" }}>
                  <div style={{ width: `${(t.count / maxTier) * 100}%`, height: "100%", background: t.accent }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="acard" style={{ padding: 20 }}>
          <div style={{ font: "700 13px var(--sans)", color: "var(--ink-2)", marginBottom: 14 }}>Top cosmetics <span style={{ fontWeight: 500, color: "var(--dim)" }}>· by ownership</span></div>
          <div style={{ overflowX: "auto" }}>
            <table className="tbl" style={{ width: "100%" }}>
              <thead>
                <tr><th>Item</th><th>Type</th><th className="num">Owners</th><th className="num">%</th></tr>
              </thead>
              <tbody>
                {d.topItems.length === 0 ? (
                  <tr><td colSpan={4} className="dim" style={{ textAlign: "center", padding: 24 }}>No inventory ownership data.</td></tr>
                ) : (
                  d.topItems.map((it) => (
                    <tr key={it.itemId}>
                      <td>{it.name}</td>
                      <td className="dim">{it.type ?? "—"}</td>
                      <td className="num">{it.owners.toLocaleString()}</td>
                      <td className="num">{Math.round(it.pct * 100)}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Honesty footer — the anti-fabrication point of this page. */}
      <div className="dim" style={{ marginTop: 18, padding: "14px 4px", font: "600 12px var(--sans)", lineHeight: 1.6 }}>
        Every panel here is computed directly from stored data. Retention comes from a real per-day
        activity log (accruing since it was enabled). Revenue is shown as in-game gold spend, not
        real money (real-money purchases are disabled — gold-only). Regions are self-reported country,
        not IP-geolocated. Weekly-cohort and platform-split breakdowns are intentionally omitted (no
        client-platform field is stored).
      </div>
    </>
  );
}

function Card({
  label,
  value,
  sub,
  tile,
}: {
  label: string;
  value: string;
  sub: string;
  /** Optional tile accent (`.fd-kpi.up`/`.down`) for faucet/sink tiles — shape only, no fake trend %. */
  tile?: "up" | "down";
}) {
  return (
    <div className={`fd-kpi dense${tile ? ` ${tile}` : ""}`}>
      <div className="l">{label}</div>
      <div className="v">{value}</div>
      <div className="trend">
        <span className="sub">{sub}</span>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}`, flex: "none" }} />
      <span style={{ font: "600 12px var(--sans)", color: "var(--ink-3)", flex: 1 }}>{label}</span>
      <span style={{ font: "700 12px var(--mono)", color: "var(--ink-2)" }}>{value.toLocaleString()}</span>
    </div>
  );
}

// Bar palette for the acquisition funnel stages (signup → ... → active).
const FUNNEL_COLORS = [
  "linear-gradient(90deg,#5fd0e0,#2E8B9E)",
  "linear-gradient(90deg,#f0cf72,#c99a2e)",
  "linear-gradient(90deg,#b98cff,#8a5cf0)",
  "linear-gradient(90deg,#3fb574,#2f8f5b)",
];

// Bar palette for the gold-by-category panel.
const CAT_COLORS = [
  "linear-gradient(90deg,#f0cf72,#c99a2e)",
  "linear-gradient(90deg,#b98cff,#8a5cf0)",
  "linear-gradient(90deg,#5fd0e0,#2E8B9E)",
  "linear-gradient(90deg,#ff9aa8,#c2495a)",
  "linear-gradient(90deg,#3fb574,#2f8f5b)",
];

/** Human label for a StoreItem type key. */
function catLabel(type: string): string {
  const map: Record<string, string> = {
    BOARD: "Boards",
    SKIN: "Piece skins",
    AVATAR: "Avatars",
    FRAME: "Frames",
    EMOTE: "Emotes",
    BUNDLE: "Bundles",
    SEASON_PASS: "Season passes",
    OTHER: "Other",
  };
  return map[type] ?? type;
}

/** Show the country code as-is; "Unknown" for users with no country set. */
function regionLabel(code: string): string {
  return code === "Unknown" ? "Unknown" : code;
}
