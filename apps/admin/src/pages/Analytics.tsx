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
type HumanMatchmakingModeRow = {
  mode: "CASUAL" | "RANKED";
  humanVsHumanStarted: number;
  humanVsHumanCompleted: number;
  humanVsBotStarted: number;
  completionRate: number;
};
type HumanMatchmaking = {
  humanVsHumanStarted: number;
  humanVsHumanCompleted: number;
  humanVsBotStarted: number;
  completionRate: number;
  byMode: HumanMatchmakingModeRow[];
};

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
  humanMatchmaking?: HumanMatchmaking;
};

const WINDOWS: Window[] = ["7d", "30d", "90d"];

/**
 * Analytics deep-dive — the honest, deeper sibling of Overview. Every panel is
 * fed by GET /api/admin/analytics?window=, a bundle of real, computed metrics
 * (no event-tracking pipeline, no revenue — see the footer).
 *
 * VISUAL LANGUAGE (redesigned): the page is zoned into four labelled bands
 * (Overview · Acquisition & engagement · Economy · Distributions) so the eye is
 * guided instead of hitting a wall of identical bars. The 8 KPI tiles are the
 * anchor (full-size mono values). Charts are differentiated by TYPE — a tapered
 * funnel, a segmented outcomes bar, distinct retention stat cells — while the
 * remaining bar lists share ONE tidy row primitive (BarRow) so the repetition
 * that stays reads as intentional, not noisy. Data is untouched from the API.
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
      <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginBottom: 18 }}>
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
  // Keep the page usable during a rolling deployment where the new admin bundle
  // may briefly reach an older server instance without this response field.
  const humanMatchmaking = d.humanMatchmaking ?? {
    humanVsHumanStarted: 0,
    humanVsHumanCompleted: 0,
    humanVsBotStarted: 0,
    completionRate: 0,
    byMode: [
      { mode: "CASUAL", humanVsHumanStarted: 0, humanVsHumanCompleted: 0, humanVsBotStarted: 0, completionRate: 0 },
      { mode: "RANKED", humanVsHumanStarted: 0, humanVsHumanCompleted: 0, humanVsBotStarted: 0, completionRate: 0 },
    ],
  } satisfies HumanMatchmaking;
  const maxNew = Math.max(1, ...d.newPlayersPerDay.map((b) => b.count));
  const maxActive = Math.max(1, ...d.activePerDay.map((b) => b.count));
  const maxMode = Math.max(1, ...d.matchesByMode.map((m) => m.count));
  const maxReason = Math.max(1, ...d.gold.byReason.map((r) => r.faucet + r.sink));
  const maxTier = Math.max(1, ...d.rankTiers.map((t) => t.count));

  return (
    <>
      {/* ── ZONE 1 · OVERVIEW ─────────────────────────────────────────────
          The 8 KPI tiles are the page anchor: full-size (not .dense) so the
          mono values read big and calm. No fabricated trend deltas — the API
          returns no prior-window count to diff, so each tile's sub-line carries
          the honest window label instead of an invented ±%. */}
      <ZoneLabel>Overview</ZoneLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }} className="ov-2col">
        <Card label="Total Players" value={d.kpis.totalPlayers.toLocaleString()} sub="all-time real accounts" />
        <Card label="New Players" value={d.kpis.newPlayers.toLocaleString()} sub={`in ${d.window}`} />
        <Card label="Active Players" value={d.kpis.activePlayers.toLocaleString()} sub={`seen in ${d.window}`} />
        <Card label="Matches" value={d.kpis.matchesInWindow.toLocaleString()} sub={`started in ${d.window}`} />
        <Card label="Matches (all-time)" value={d.kpis.matchesTotal.toLocaleString()} sub="played to date" />
        <Card label="Gold Faucet" value={d.kpis.goldFaucet.toLocaleString()} sub={`granted in ${d.window}`} tile="up" />
        <Card label="Gold Sink" value={d.kpis.goldSink.toLocaleString()} sub={`spent in ${d.window}`} tile="down" />
        <Card label="Guilds" value={d.kpis.guildsTotal.toLocaleString()} sub="all-time" />
      </div>

      {/* ── ZONE 2 · ACQUISITION & ENGAGEMENT ───────────────────────────── */}
      <ZoneLabel top>Acquisition &amp; engagement</ZoneLabel>

      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16 }} className="ov-2col">
        {/* New players per day — gold gradient column chart. */}
        <Panel title="New players per day" meta={`last ${d.days} days`}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: Math.max(2, 12 - Math.floor(d.newPlayersPerDay.length / 12)), height: 156, marginTop: 20, overflowX: "auto" }}>
            {d.newPlayersPerDay.map((b, i) => (
              <div key={i} style={{ flex: 1, minWidth: 4, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, height: "100%", justifyContent: "flex-end" }}>
                <div style={{ font: "600 10px var(--mono)", color: "var(--ink-3)" }} className="mono">{b.count}</div>
                <div style={{ width: "100%", borderRadius: "6px 6px 0 0", background: "linear-gradient(180deg,#f0cf72,#c99a2e)", height: `${Math.max(2, (b.count / maxNew) * 100)}%` }} />
              </div>
            ))}
          </div>
        </Panel>

        {/* Last-seen activity — cyan gradient column chart, honest "not DAU" caveat. */}
        <Panel title="Last-seen activity" meta="snapshot, not unique DAU">
          <div style={{ font: "500 11px var(--sans)", color: "var(--dim)", marginTop: -4 }}>players by last-seen day</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: Math.max(2, 12 - Math.floor(d.activePerDay.length / 12)), height: 130, marginTop: 16, overflowX: "auto" }}>
            {d.activePerDay.map((b, i) => (
              <div key={i} style={{ flex: 1, minWidth: 4, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, height: "100%", justifyContent: "flex-end" }}>
                <div style={{ font: "600 10px var(--mono)", color: "var(--ink-3)" }} className="mono">{b.count}</div>
                <div style={{ width: "100%", borderRadius: "6px 6px 0 0", background: "linear-gradient(180deg,#5fd0e0,#2E8B9E)", height: `${Math.max(2, (b.count / maxActive) * 100)}%` }} />
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Acquisition funnel (real tapered funnel) + Matches by mode. */}
      <div style={{ display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: 16, marginTop: 16 }} className="ov-2col">
        <Panel title="Acquisition funnel" meta={`${d.window} signup cohort`}>
          {/* Real funnel: each stage is a centered, tapering bar whose width tracks
              its share of the cohort, so the drop-off between stages is visible at
              a glance instead of reading as identical rows. The step between two
              stages is annotated with the % that survived. */}
          <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 6 }}>
            {d.funnel.map((s, i) => {
              const width = Math.max(6, s.pct * 100);
              const prev = i > 0 ? d.funnel[i - 1] : null;
              const stepPct = prev && prev.count > 0 ? Math.round((s.count / prev.count) * 100) : null;
              return (
                <div key={s.stage}>
                  {stepPct !== null && (
                    <div style={{ display: "flex", justifyContent: "center", padding: "3px 0" }}>
                      <span style={{ font: "700 10px var(--mono)", color: "var(--dim)" }} className="mono">↓&nbsp;{stepPct}%</span>
                    </div>
                  )}
                  <div
                    style={{
                      width: `${width}%`,
                      margin: "0 auto",
                      minHeight: 42,
                      borderRadius: 8,
                      background: FUNNEL_COLORS[i % FUNNEL_COLORS.length],
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      padding: "0 14px",
                      color: "#1a0e30",
                      transition: "filter .18s ease",
                    }}
                  >
                    <span style={{ font: "700 11.5px var(--sans)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.stage}</span>
                    <span style={{ font: "800 12px var(--mono)", whiteSpace: "nowrap" }} className="mono">{s.count.toLocaleString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="dim" style={{ font: "500 10.5px var(--sans)", marginTop: 16, lineHeight: 1.55 }}>
            Percentages step from the stage above. Purchase = in-game gold spend (real money is disabled). "Still active" = seen in the last 7 days.
          </div>
        </Panel>

        {/* Matches by mode — real data, standardized bar rows. */}
        <Panel title="Matches by mode" meta={d.window}>
          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 4 }}>
            {d.matchesByMode.map((m) => (
              <BarRow
                key={m.mode}
                label={m.mode}
                value={`${m.count.toLocaleString()} · ${Math.round(m.pct * 100)}%`}
                pct={(m.count / maxMode) * 100}
                fill="linear-gradient(90deg,#f0cf72,#c99a2e)"
              />
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Human matchmaking" meta={d.window}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12, marginTop: 18 }} className="ov-2col">
          <Card label="Human vs human started" value={humanMatchmaking.humanVsHumanStarted.toLocaleString()} sub="successful pairings" />
          <Card label="Human vs human completed" value={humanMatchmaking.humanVsHumanCompleted.toLocaleString()} sub="matches with an end" />
          <Card label="Human vs bot started" value={humanMatchmaking.humanVsBotStarted.toLocaleString()} sub="successful pairings" />
          <Card label="Human match completion" value={`${Math.round(humanMatchmaking.completionRate * 100)}%`} sub="human vs human starts" />
        </div>
        <div style={{ overflowX: "auto", marginTop: 18 }}>
          <table className="tbl" style={{ width: "100%", minWidth: 620 }}>
            <thead>
              <tr><th>Mode</th><th className="num">H2H started</th><th className="num">H2H completed</th><th className="num">Human vs bot</th><th className="num">Completion</th></tr>
            </thead>
            <tbody>
              {humanMatchmaking.byMode.map((m) => (
                <tr key={m.mode} className="arow">
                  <td>{m.mode === "CASUAL" ? "Casual" : "Ranked"}</td>
                  <td className="num mono">{m.humanVsHumanStarted.toLocaleString()}</td>
                  <td className="num mono">{m.humanVsHumanCompleted.toLocaleString()}</td>
                  <td className="num mono">{m.humanVsBotStarted.toLocaleString()}</td>
                  <td className="num mono">{Math.round(m.completionRate * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="dim" style={{ font: "500 10.5px var(--sans)", marginTop: 14, lineHeight: 1.55 }}>
          Started = a successful queue pairing created in this window. Completed = that human-vs-human match recorded an end; bot accounts are excluded from H2H. Legacy matches from before origin tracking are excluded.
        </div>
      </Panel>

      {/* Retention + Top regions. align-start so the compact 3-cell retention
          panel keeps its natural height instead of stretching to match the
          taller region list and leaving dead space below the cells. */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16, alignItems: "start" }} className="ov-2col">
        <Panel title="Retention" meta={`${d.window} signup cohort`}>
          {!d.retentionTracked ? (
            <div className="dim" style={{ font: "500 12px var(--sans)", marginTop: 16, lineHeight: 1.65 }}>
              Retention tracking has just started collecting daily-activity data. Real D1/D7/D30 numbers
              appear here as activity accrues over the coming days.
            </div>
          ) : (
            <>
              {/* Distinct treatment: three stat cells with the % prominent, not
                  another bar list. Each cell shows Day, the big retained-% number,
                  and the raw retained/eligible beneath it. */}
              <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: `repeat(${Math.max(1, d.retention.length)},1fr)`, gap: 12 }}>
                {d.retention.map((r) => (
                  <div
                    key={r.day}
                    style={{
                      background: "var(--bg-2)",
                      border: "1px solid var(--edge)",
                      borderRadius: 12,
                      padding: "16px 14px",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ font: "700 9.5px var(--sans)", letterSpacing: 1.2, textTransform: "uppercase", color: "var(--dim)" }}>Day {r.day}</div>
                    <div style={{ font: "800 28px var(--mono)", color: "var(--ink-2)", marginTop: 8, lineHeight: 1 }} className="mono">{Math.round(r.pct * 100)}<span style={{ font: "700 15px var(--mono)", color: "var(--dim)" }}>%</span></div>
                    <div style={{ font: "600 10.5px var(--mono)", color: "var(--dim)", marginTop: 8 }} className="mono">{r.retained.toLocaleString()}/{r.eligible.toLocaleString()}</div>
                  </div>
                ))}
              </div>
              <div className="dim" style={{ font: "500 10.5px var(--sans)", marginTop: 16, lineHeight: 1.55 }}>
                Real per-day activity (from the activity log). Only counts cohorts old enough for each horizon.
              </div>
            </>
          )}
        </Panel>

        <Panel title="Top regions" meta="all-time">
          {d.topRegions.length === 0 ? (
            <div className="dim" style={{ font: "500 12px var(--sans)", marginTop: 16 }}>No region data yet.</div>
          ) : (
            <>
              <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                {d.topRegions.map((r) => (
                  <BarRow
                    key={r.code}
                    label={regionLabel(r.code)}
                    value={`${r.count.toLocaleString()} · ${Math.round(r.pct * 100)}%`}
                    pct={(r.count / (d.topRegions[0]?.count || 1)) * 100}
                    fill="linear-gradient(90deg,#b98cff,#8a5cf0)"
                  />
                ))}
              </div>
              <div className="dim" style={{ font: "500 10.5px var(--sans)", marginTop: 14, lineHeight: 1.55 }}>
                By self-reported country ("Unknown" = no country set). Not IP-geolocated.
              </div>
            </>
          )}
        </Panel>
      </div>

      {/* ── ZONE 3 · ECONOMY ────────────────────────────────────────────── */}
      <ZoneLabel top>Economy</ZoneLabel>

      {/* Gold economy — faucet/sink split + byReason breakdown. */}
      <Panel title="Gold economy" meta={`faucet vs sink · ${d.window}`}>
        <div style={{ display: "flex", gap: 24, marginTop: 18 }}>
          <div style={{ flex: 1 }}>
            <div style={{ font: "700 10px var(--sans)", letterSpacing: 1, color: "var(--green-lt)" }}>FAUCET (granted)</div>
            <div style={{ font: "800 24px var(--mono)", color: "var(--ink-2)", marginTop: 7, lineHeight: 1 }} className="mono">{d.gold.faucet.toLocaleString()}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ font: "700 10px var(--sans)", letterSpacing: 1, color: "var(--red-lt)" }}>SINK (spent)</div>
            <div style={{ font: "800 24px var(--mono)", color: "var(--ink-2)", marginTop: 7, lineHeight: 1 }} className="mono">{d.gold.sink.toLocaleString()}</div>
          </div>
        </div>
        <div style={{ height: 12, borderRadius: 6, overflow: "hidden", display: "flex", marginTop: 18, background: "var(--bg-2)" }}>
          <div style={{ width: `${d.gold.faucetPct}%`, background: "linear-gradient(90deg,#2f8f5b,#3fb574)" }} />
          <div style={{ flex: 1, background: "linear-gradient(90deg,#a53b4a,#c2495a)" }} />
        </div>
        <div style={{ marginTop: 12, font: "600 11.5px var(--sans)", color: d.gold.faucetPct >= 55 ? "var(--green-lt)" : "var(--amber)" }}>
          {d.gold.faucetPct >= 55 ? "Healthy — faucet ahead of sink" : d.gold.faucetPct <= 45 ? "Sink ahead of faucet — watch inflation" : "Balanced faucet vs sink"} ({d.gold.faucetPct}/{100 - d.gold.faucetPct}).
        </div>

        {/* byReason breakdown — a dual faucet/sink stacked bar per ledger reason. */}
        <div style={{ marginTop: 22, borderTop: "1px solid var(--edge)", paddingTop: 18 }}>
          <div style={{ font: "700 10px var(--sans)", letterSpacing: 1.2, textTransform: "uppercase", color: "var(--dim)", marginBottom: 14 }}>By ledger reason</div>
          {d.gold.byReason.length === 0 ? (
            <div className="dim" style={{ font: "500 12px var(--sans)" }}>No gold ledger activity in this window.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {d.gold.byReason.map((r) => (
                <div key={r.reason} style={{ padding: "7px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                    <span style={{ font: "600 12px var(--sans)", color: "var(--ink-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.reason}</span>
                    <span className="mono" style={{ font: "700 11.5px var(--mono)", whiteSpace: "nowrap" }}>
                      <span style={{ color: "var(--green-lt)" }}>+{r.faucet.toLocaleString()}</span>
                      {r.sink > 0 && <span style={{ color: "var(--dim-2)" }}> · <span style={{ color: "var(--red-lt)" }}>-{r.sink.toLocaleString()}</span></span>}
                    </span>
                  </div>
                  <div style={{ height: 8, borderRadius: 5, overflow: "hidden", display: "flex", marginTop: 6, background: "var(--bg-2)" }}>
                    <div style={{ width: `${(r.faucet / maxReason) * 100}%`, background: "linear-gradient(90deg,#2f8f5b,#3fb574)" }} />
                    <div style={{ width: `${(r.sink / maxReason) * 100}%`, background: "linear-gradient(90deg,#a53b4a,#c2495a)" }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Panel>

      {/* Gold spend by category (left) + Match outcomes (right) — paired into one
          balanced row so neither sits alone with dead space beside it. */}
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16, marginTop: 16, alignItems: "start" }} className="ov-2col">
        <Panel title="Gold spend by category" meta={`store purchases · ${d.window}`}>
          {d.goldByCategory.length === 0 ? (
            <div className="dim" style={{ font: "500 12px var(--sans)", marginTop: 16 }}>No store purchases in this window.</div>
          ) : (
            <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 4 }}>
              {d.goldByCategory.map((c, i) => (
                <BarRow
                  key={c.category}
                  label={catLabel(c.category)}
                  value={`${c.gold.toLocaleString()} gold · ${Math.round(c.pct * 100)}%`}
                  pct={(c.gold / (d.goldByCategory[0]?.gold || 1)) * 100}
                  fill={CAT_COLORS[i % CAT_COLORS.length]}
                />
              ))}
            </div>
          )}
        </Panel>

        {/* Match outcomes — a segmented proportion bar over a clean legend list. */}
        <Panel title="Match outcomes" meta={d.window}>
          <OutcomesBar o={d.matchOutcomes} />
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 11 }}>
            <Stat label="Red wins" value={d.matchOutcomes.redWins} total={d.matchOutcomes.total} color="var(--red-lt)" />
            <Stat label="Blue wins" value={d.matchOutcomes.blueWins} total={d.matchOutcomes.total} color="var(--blue)" />
            <Stat label="Draws" value={d.matchOutcomes.draws} total={d.matchOutcomes.total} color="var(--dim)" />
            <Stat label="Unfinished" value={d.matchOutcomes.unfinished} total={d.matchOutcomes.total} color="var(--dim-2)" />
            <div style={{ borderTop: "1px solid var(--edge)", marginTop: 4, paddingTop: 12, display: "flex", justifyContent: "space-between", font: "700 12px var(--sans)", color: "var(--ink-2)" }}>
              <span>Total</span>
              <span className="mono" style={{ font: "700 12px var(--mono)" }}>{d.matchOutcomes.total.toLocaleString()}</span>
            </div>
          </div>
        </Panel>
      </div>

      {/* ── ZONE 4 · DISTRIBUTIONS ──────────────────────────────────────── */}
      <ZoneLabel top>Distributions</ZoneLabel>

      {/* Rank-tier distribution (left) + Top cosmetics table (right) — paired so
          the tier bars and the ownership table fill one row with no orphan. */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }} className="ov-2col">
        <Panel title="Rank-tier distribution" meta="all-time">
          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 4 }}>
            {d.rankTiers.map((t) => (
              <BarRow
                key={t.key}
                label={t.label}
                value={`${t.count.toLocaleString()} · ${Math.round(t.pct * 100)}%`}
                pct={(t.count / maxTier) * 100}
                fill={t.accent}
              />
            ))}
          </div>
        </Panel>

        <Panel title="Top cosmetics" meta="by ownership">
          <div style={{ overflowX: "auto", marginTop: 6 }}>
            <table className="tbl" style={{ width: "100%" }}>
              <thead>
                <tr><th>Item</th><th>Type</th><th className="num">Owners</th><th className="num">%</th></tr>
              </thead>
              <tbody>
                {d.topItems.length === 0 ? (
                  <tr><td colSpan={4} className="dim" style={{ textAlign: "center", padding: 24 }}>No inventory ownership data.</td></tr>
                ) : (
                  d.topItems.map((it) => (
                    <tr key={it.itemId} className="arow">
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
        </Panel>
      </div>

      {/* Honesty footer — the anti-fabrication point of this page. */}
      <div className="dim" style={{ marginTop: 24, padding: "16px 4px 4px", borderTop: "1px solid var(--edge)", font: "500 12px var(--sans)", lineHeight: 1.65, maxWidth: "90ch" }}>
        Every panel here is computed directly from stored data. Retention comes from a real per-day
        activity log (accruing since it was enabled). Revenue is shown as in-game gold spend, not
        real money (real-money purchases are disabled — gold-only). Regions are self-reported country,
        not IP-geolocated. Weekly-cohort and platform-split breakdowns are intentionally omitted (no
        client-platform field is stored).
      </div>
    </>
  );
}

/**
 * ZoneLabel — a small-caps band header that divides the page into its four
 * meaningful zones (Overview · Acquisition · Economy · Distributions). This is
 * a deliberate 4-item sectioning system, NOT a per-panel eyebrow: it gives the
 * page vertical rhythm and tells the eye where one theme ends and the next
 * begins, which the old flat "every panel looks the same" layout lacked.
 */
function ZoneLabel({ children, top }: { children: React.ReactNode; top?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        margin: top ? "32px 0 14px" : "0 0 14px",
      }}
    >
      <span style={{ font: "800 11px var(--sans)", letterSpacing: 2, textTransform: "uppercase", color: "var(--gold-lt)", whiteSpace: "nowrap" }}>{children}</span>
      <span style={{ flex: 1, height: 1, background: "var(--edge)" }} />
    </div>
  );
}

/**
 * Panel — the standardized card shell used by every chart panel. Consistent
 * 24px padding (was a scattered 20), a title/meta header in one vocabulary, and
 * a subtle border. Replaces the six ad-hoc "acard + inline header" blocks so
 * spacing and header treatment are identical everywhere.
 */
function Panel({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <div className="acard" style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div style={{ font: "700 14px var(--sans)", color: "var(--ink-2)" }}>{title}</div>
        {meta && <div style={{ font: "600 11px var(--sans)", color: "var(--dim)", whiteSpace: "nowrap" }}>{meta}</div>}
      </div>
      {children}
    </div>
  );
}

/**
 * BarRow — the ONE shared "label + value + horizontal bar" primitive. Every
 * remaining bar list (modes, regions, gold-by-category, rank tiers) uses this so
 * the repetition that stays is tidy and intentional. Numbers are legible: the
 * value is mono/tabular-nums in --ink-2 (not the old crammed --dim), the label
 * sits on its own baseline with room, and the row has a soft hover wash.
 */
function BarRow({ label, value, pct, fill }: { label: string; value: string; pct: number; fill: string }) {
  return (
    <div
      style={{ padding: "8px 8px", margin: "0 -8px", borderRadius: 8, transition: "background .18s ease" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(232,184,75,.05)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <span style={{ font: "600 12.5px var(--sans)", color: "var(--ink-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
        <span className="mono" style={{ font: "700 11.5px var(--mono)", color: "var(--ink-3)", whiteSpace: "nowrap" }}>{value}</span>
      </div>
      <div style={{ height: 9, borderRadius: 5, overflow: "hidden", marginTop: 7, background: "var(--bg-2)" }}>
        <div style={{ width: `${Math.max(1, pct)}%`, height: "100%", background: fill }} />
      </div>
    </div>
  );
}

/**
 * OutcomesBar — a single segmented proportion bar showing the red/blue/draw/
 * unfinished split at a glance, so match outcomes read as a distinct chart type
 * rather than yet another stat list. The legend below carries the exact figures.
 */
function OutcomesBar({ o }: { o: MatchOutcomes }) {
  const total = Math.max(1, o.total);
  const segs = [
    { v: o.redWins, c: "linear-gradient(90deg,#ff8fae,#c2495a)" },
    { v: o.blueWins, c: "linear-gradient(90deg,#a9c9ff,#7fb0ff)" },
    { v: o.draws, c: "var(--dim)" },
    { v: o.unfinished, c: "var(--dim-2)" },
  ];
  return (
    <div style={{ height: 12, borderRadius: 6, overflow: "hidden", display: "flex", marginTop: 18, background: "var(--bg-2)" }}>
      {segs.map((s, i) => (
        <div key={i} style={{ width: `${(s.v / total) * 100}%`, background: s.c }} />
      ))}
    </div>
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
    <div className={`fd-kpi${tile ? ` ${tile}` : ""}`}>
      <div className="l">{label}</div>
      <div className="v">{value}</div>
      <div className="trend">
        <span className="sub">{sub}</span>
      </div>
    </div>
  );
}

function Stat({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}`, flex: "none" }} />
      <span style={{ font: "600 12px var(--sans)", color: "var(--ink-3)", flex: 1 }}>{label}</span>
      <span style={{ font: "500 10.5px var(--mono)", color: "var(--dim)", marginRight: 2 }} className="mono">{pct}%</span>
      <span style={{ font: "700 12px var(--mono)", color: "var(--ink-2)", minWidth: 44, textAlign: "right" }} className="mono">{value.toLocaleString()}</span>
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
