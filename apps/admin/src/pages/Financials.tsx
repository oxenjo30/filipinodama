import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAdminMutation } from "../lib/ui";

type TopupRow = {
  id: string;
  orderId: string;
  player: { id: string; name: string; tag: string; username: string };
  amountCents: number;
  diamonds: number;
  provider: string;
  status: string;
  refunded: boolean;
  createdAt: string;
};

type Breakdown = { label: string; amountCents: number }[];

type Dashboard = {
  hasTopups: boolean;
  stats: { totalCents: number; todayCents: number; orders: number; avgOrderCents: number; diamondsSold: number; refundedCents: number; refundedCount: number };
  chart: { day: string; label: string; totalCents: number }[];
  recent: TopupRow[];
  breakdowns: { byPackSize: Breakdown; byPlayerTier: Breakdown; byRegion: Breakdown; byDayOfWeek: Breakdown; newVsReturning: Breakdown } | null;
  regionSource: "countryCode" | "none";
};

type Receipt = {
  id: string;
  orderId: string;
  player: { id: string; name: string; tag: string; username: string };
  diamonds: number;
  amountCents: number;
  currencyCode: string;
  provider: string;
  status: string;
  refunded: boolean;
  email: string | null;
  createdAt: string;
};

const money = (cents: number, currencyCode = "php") =>
  `${currencyCode === "php" ? "₱" : "$"}${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PROVIDER_LABEL: Record<string, string> = { paymongo: "PayMongo", stripe: "Stripe", paypal: "PayPal", xendit: "Xendit" };
const providerLabel = (p: string) => PROVIDER_LABEL[p.toLowerCase()] ?? p;

/**
 * Cluster A2 — Financials: live "Diamond top-ups" revenue dashboard
 * (handoffv3 rows 8-15). ALL data comes from real, settled/refunded Payment
 * rows — real-money top-up is currently DISABLED (gold-only economy;
 * DIAMOND_TOPUP_ENABLED=false), so in production this renders the approved
 * empty state verbatim until that changes. Nothing here is seeded/fabricated.
 *
 * Row 14: the old "Gateways & config" / "Refunds & disputes" sub-tab toggle
 * is removed — this page has no tabs; everything below the dashboard is
 * always-on (the refund action lives directly on each "Recent top-ups" row).
 */
export function Financials() {
  const [d, setD] = useState<Dashboard | null>(null);
  const [err, setErr] = useState(false);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const mutate = useAdminMutation();

  const load = () => {
    api.get<Dashboard>("/api/admin/payments").then(setD).catch(() => setErr(true));
  };
  useEffect(load, []);

  if (err) return <div className="phase2">Couldn't load financials.</div>;
  if (!d) return <div className="dim" style={{ padding: 24 }}>Loading…</div>;

  const refund = (row: TopupRow) =>
    mutate({
      title: "Refund top-up",
      body: `Refund ${money(row.amountCents)} to ${row.player.name}? This reverses ${row.diamonds} 💎 and removes the diamonds from their wallet.`,
      requireReason: true,
      danger: true,
      confirmLabel: `Refund ${money(row.amountCents)}`,
      method: "POST",
      path: `/api/admin/payments/${row.id}/refund`,
      successMsg: `Refund issued to ${row.player.name}.`,
      onDone: load,
    });

  const maxChart = Math.max(1, ...d.chart.map((c) => c.totalCents));

  return (
    <>
      {/* ── Live "Diamond top-ups" card (row 8) ─────────────────────────────── */}
      <div
        className="acard"
        style={{
          padding: 22,
          background: "linear-gradient(135deg, rgba(90,150,255,.12), #1b1030)",
          border: "1px solid rgba(90,150,255,.25)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 26 }}>💳</div>
            <div>
              <div style={{ font: "800 16px var(--serif)", color: "var(--ink)" }}>Diamond top-ups</div>
              <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>Live in-app purchases from the mobile wallet</div>
            </div>
          </div>
          <span className="badge-st st-active" style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green-lt)", boxShadow: "0 0 6px var(--green-lt)" }} />
            Real-time
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginTop: 20 }}>
          <StatTile label="Total" value={money(d.stats.totalCents)} />
          <StatTile label="Today" value={money(d.stats.todayCents)} />
          <StatTile label="Orders" value={d.stats.orders.toLocaleString()} />
          <StatTile label="Avg order" value={money(d.stats.avgOrderCents)} />
          <StatTile label="💎 Sold" value={d.stats.diamondsSold.toLocaleString()} />
          {d.stats.refundedCount > 0 && (
            <StatTile label="Refunds" value={money(d.stats.refundedCents)} sub={`${d.stats.refundedCount} order${d.stats.refundedCount === 1 ? "" : "s"}`} tone="var(--red-lt)" />
          )}
        </div>
      </div>

      {/* ── Empty state (row 11) — verbatim copy ────────────────────────────── */}
      {!d.hasTopups && (
        <div className="acard" style={{ padding: 48, textAlign: "center", marginTop: 14 }}>
          <div style={{ fontSize: 30, marginBottom: 10 }}>💳</div>
          <div style={{ font: "700 14px var(--sans)", color: "var(--ink-2)" }}>No wallet top-ups yet.</div>
          <div className="dim" style={{ marginTop: 6, fontSize: 12.5 }}>Purchases from the mobile app appear here in real time.</div>
        </div>
      )}

      {d.hasTopups && (
        <>
          {/* ── "Last 7 days" bar chart (row 9) ─────────────────────────────── */}
          <div className="acard" style={{ padding: 20, marginTop: 14 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
              <div style={{ font: "700 13px var(--sans)", color: "var(--ink-2)" }}>Last 7 days</div>
              <div style={{ font: "600 11px var(--sans)", color: "var(--dim)" }}>daily top-up revenue</div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 140, marginTop: 18 }}>
              {d.chart.map((b, i) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, height: "100%", justifyContent: "flex-end" }}>
                  <div style={{ font: "600 10px var(--mono)", color: "var(--dim)" }}>{b.totalCents > 0 ? money(b.totalCents) : ""}</div>
                  <div style={{ width: "100%", borderRadius: "6px 6px 0 0", background: "linear-gradient(180deg,#7fb0ff,#4a6fcf)", height: `${Math.max(2, (b.totalCents / maxChart) * 100)}%` }} />
                  <div style={{ font: "600 10px var(--sans)", color: "var(--dim-2)" }}>{b.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── "Recent top-ups" list (row 10) ──────────────────────────────── */}
          <div className="acard" style={{ padding: 20, marginTop: 14 }}>
            <div style={{ font: "700 13px var(--sans)", color: "var(--ink-2)" }}>Recent top-ups</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 14 }}>
              {d.recent.map((row) => (
                <div
                  key={row.id}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 11px", background: "var(--bg-2)", borderRadius: 8, cursor: "pointer" }}
                  onClick={() => setReceiptId(row.id)}
                >
                  <div className="fd-avatar" style={{ width: 32, height: 32, fontSize: 11 }}>{row.player.name.slice(0, 2).toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: "700 12px var(--sans)", color: "var(--ink-2)" }}>
                      {row.player.name} <span className="dim mono" style={{ fontSize: 10 }}>{row.player.tag}</span>
                    </div>
                    <div className="dim mono" style={{ fontSize: 10, marginTop: 2 }}>{row.orderId}</div>
                  </div>
                  {row.refunded ? (
                    <>
                      <span className="mono" style={{ fontSize: 12, color: "var(--dim)", textDecoration: "line-through" }}>{money(row.amountCents)}</span>
                      <span className="badge-st st-muted">Refunded</span>
                    </>
                  ) : (
                    <>
                      <div style={{ textAlign: "right" }}>
                        <div className="mono" style={{ fontWeight: 700, fontSize: 13, color: "var(--gold-lt)" }}>{money(row.amountCents)}</div>
                        <div className="dim" style={{ fontSize: 10, marginTop: 2 }}>{new Date(row.createdAt).toLocaleString()}</div>
                      </div>
                      <button
                        className="abtn btn-danger btn-danger-sm"
                        onClick={(e) => { e.stopPropagation(); void refund(row); }}
                      >
                        Refund
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── REVENUE BREAKDOWNS (row 12) ─────────────────────────────────── */}
          {d.breakdowns && (
            <>
              <div style={{ font: "700 11px var(--sans)", letterSpacing: 1.4, color: "var(--dim)", textTransform: "uppercase", marginTop: 22, marginBottom: 10 }}>
                Revenue breakdowns
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
                <BreakdownCard title="By pack size" rows={d.breakdowns.byPackSize} />
                <BreakdownCard title="By player tier" rows={d.breakdowns.byPlayerTier} />
                <BreakdownCard
                  title="By region"
                  rows={d.breakdowns.byRegion}
                  footnote={d.regionSource === "none" ? "No region data on file — grouped as Unknown." : undefined}
                />
                <BreakdownCard title="By day of week" rows={d.breakdowns.byDayOfWeek} noSort />
                <BreakdownCard title="New vs returning" rows={d.breakdowns.newVsReturning} />
              </div>
            </>
          )}
        </>
      )}

      {receiptId && <ReceiptModal id={receiptId} onClose={() => setReceiptId(null)} />}
    </>
  );
}

function StatTile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div style={{ background: "rgba(6,3,14,.35)", border: "1px solid rgba(232,184,75,.12)", borderRadius: 12, padding: "12px 14px" }}>
      <div style={{ font: "700 9.5px var(--sans)", letterSpacing: 1, textTransform: "uppercase", color: "var(--dim)" }}>{label}</div>
      <div className="mono" style={{ font: "800 19px var(--mono)", color: tone ?? "var(--gold-lt)", marginTop: 6 }}>{value}</div>
      {sub && <div className="dim" style={{ fontSize: 10, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function BreakdownCard({ title, rows, footnote, noSort }: { title: string; rows: Breakdown; footnote?: string; noSort?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.amountCents));
  const ordered = noSort ? rows : [...rows].sort((a, b) => b.amountCents - a.amountCents);
  return (
    <div className="acard" style={{ padding: 18 }}>
      <div style={{ font: "700 12.5px var(--sans)", color: "var(--ink-2)" }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 14 }}>
        {ordered.every((r) => r.amountCents === 0) ? (
          <div className="dim" style={{ fontSize: 11.5, padding: "10px 0" }}>No data yet.</div>
        ) : (
          ordered.map((r) => (
            <div key={r.label}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 4 }}>
                <span style={{ color: "var(--ink-3)", fontWeight: 600 }}>{r.label}</span>
                <span className="mono" style={{ color: "var(--dim)" }}>{money(r.amountCents)}</span>
              </div>
              <div style={{ height: 6, borderRadius: 4, background: "var(--bg-2)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.max(2, (r.amountCents / max) * 100)}%`, background: "linear-gradient(90deg,#7fb0ff,#4a6fcf)" }} />
              </div>
            </div>
          ))
        )}
      </div>
      {footnote && <div className="dim" style={{ fontSize: 10, marginTop: 12 }}>{footnote}</div>}
    </div>
  );
}

/** Top-up Receipt modal (row 15) — real order data, no hardcoded provider/method. */
function ReceiptModal({ id, onClose }: { id: string; onClose: () => void }) {
  const [r, setR] = useState<Receipt | null>(null);

  useEffect(() => {
    api.get<Receipt>(`/api/admin/payments/${id}`).then(setR).catch(() => setR(null));
  }, [id]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: "min(94vw, 420px)" }}>
        {!r ? (
          <div className="dim" style={{ padding: 24, textAlign: "center" }}>Loading…</div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ font: "700 10px var(--sans)", letterSpacing: 1.4, color: "var(--dim)", textTransform: "uppercase" }}>Purchase receipt</div>
              <button className="abtn btn-ghost btn-ghost-sm" onClick={onClose}>✕</button>
            </div>
            <div style={{ font: "800 26px var(--mono)", color: "var(--gold-lt)", marginTop: 10 }}>{money(r.amountCents, r.currencyCode)}</div>
            <div className="dim" style={{ fontSize: 11.5, marginTop: 4 }}>{new Date(r.createdAt).toLocaleString()}</div>
            {r.refunded && <span className="badge-st st-muted" style={{ marginTop: 8, display: "inline-block" }}>Refunded</span>}

            <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
              <ReceiptRow label="Order ID" value={r.orderId} mono />
              <ReceiptRow label="Player" value={`${r.player.name} ${r.player.tag}`} />
              <ReceiptRow label="Diamonds" value={`${r.diamonds.toLocaleString()} 💎`} />
              <ReceiptRow label="Total credited" value={`${r.diamonds.toLocaleString()} 💎`} />
              <ReceiptRow label="Method" value={providerLabel(r.provider)} />
              <ReceiptRow label="Receipt sent to" value={r.email ?? "—"} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ReceiptRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5 }}>
      <span className="dim">{label}</span>
      <span className={mono ? "mono" : undefined} style={{ color: "var(--ink-2)", fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}
