import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { useAuthStore } from "../../stores/authStore";

/**
 * OrdersPage — reproduced from the prototype's Purchase History / Orders screen
 * (handoff/FilipinoDama Royal.dc.html, lines 1184-1241).
 *
 * FULLY LIVE-WIRED — there is NO hardcoded order data:
 *   - Every receipt comes from GET /api/orders (the authed user's real Order
 *     rows). A brand-new user with no purchases sees the honest empty state.
 *   - The order count, lifetime spend, per-order line items, prices, currency and
 *     dates are all derived from the fetched rows — nothing is faked.
 *   - Logged out (me === null): we show a sign-in prompt rather than crash, since
 *     orders belong to an account.
 *   - "Go to Store" / "Browse the Store" navigate to the real /store route.
 */

// ── the real Order shape from GET /api/orders ──
type OrderCurrency = "GOLD" | "DIAMONDS";
type OrderItem = { itemId: string; name: string; price: number };
type OrderApi = {
  id: string;
  userId: string;
  items: OrderItem[];
  currency: OrderCurrency;
  total: number;
  status: string;
  createdAt: string;
};

const A = (n: string) => `/assets/${n}`;

// ── currency helpers (mirrors StorePage curEl / curColor) ──
type Cur = "gold" | "gem";
const curOf = (c: OrderCurrency): Cur => (c === "DIAMONDS" ? "gem" : "gold");
const curColor = (c: Cur) => (c === "gem" ? "#ff9aa8" : "#f2d493");
const curLabel = (c: OrderCurrency) => (c === "DIAMONDS" ? "Diamonds" : "Gold");

function CurIcon({ cur, size = 16 }: { cur: Cur; size?: number }) {
  return (
    <img
      src={cur === "gem" ? A("ic-gem.png") : A("ic-coin.png")}
      alt={cur === "gem" ? "Diamonds" : "Gold"}
      style={{ width: size, height: size, objectFit: "contain", verticalAlign: "middle" }}
    />
  );
}

/** Price chip — the prototype's totalEl / priceEl (icon + colored amount). */
function PriceEl({ cur, amount, big }: { cur: Cur; amount: number; big?: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        font: big ? "800 17px 'JetBrains Mono',monospace" : "700 13px 'JetBrains Mono',monospace",
        color: curColor(cur),
      }}
    >
      <CurIcon cur={cur} size={big ? 17 : 14} />
      {amount.toLocaleString()}
    </span>
  );
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

export function OrdersPage() {
  const me = useAuthStore((s) => s.me);
  const navigate = useNavigate();

  const [orders, setOrders] = useState<OrderApi[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!me) {
      setOrders(null);
      return;
    }
    let alive = true;
    setError(null);
    setOrders(null);
    api
      .get<{ orders: OrderApi[] }>("/api/orders")
      .then((res) => {
        if (alive) setOrders(res.orders);
      })
      .catch((e) => {
        if (alive) setError(e instanceof ApiError ? e.message : "Could not load your orders.");
      });
    return () => {
      alive = false;
    };
  }, [me]);

  // lifetime spend, grouped by currency (honest — derived from real totals)
  const spendByCur = useMemo(() => {
    const acc: Record<OrderCurrency, number> = { GOLD: 0, DIAMONDS: 0 };
    for (const o of orders ?? []) acc[o.currency] += o.total;
    return acc;
  }, [orders]);

  const totalSpendEl: ReactNode = useMemo(() => {
    const parts: ReactNode[] = [];
    if (spendByCur.GOLD > 0) parts.push(<PriceEl key="g" cur="gold" amount={spendByCur.GOLD} />);
    if (spendByCur.DIAMONDS > 0) parts.push(<PriceEl key="d" cur="gem" amount={spendByCur.DIAMONDS} />);
    if (parts.length === 0) return <span style={{ color: "var(--gold-lt)" }}>—</span>;
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 12, verticalAlign: "middle" }}>
        {parts}
      </span>
    );
  }, [spendByCur]);

  const goToStore = () => navigate("/store");

  // ── header (shared across states) ──
  const header = (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
      <div>
        <div style={{ font: "700 12px Inter", letterSpacing: "2px", textTransform: "uppercase", color: "var(--gold)" }}>
          Receipts
        </div>
        <h1 style={{ margin: "6px 0 0", font: "800 32px Cinzel,serif", color: "var(--gold-lt)" }}>Purchase History</h1>
        <p style={{ margin: "8px 0 0", font: "400 13px Inter", color: "var(--ink2)" }}>
          Every order you've placed — Store items and Diamond top-ups.
        </p>
      </div>
      <button onClick={goToStore} className="btn btn-purple" style={{ padding: "12px 22px" }}>
        Go to Store
      </button>
    </div>
  );

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: 26, display: "flex", flexDirection: "column", gap: 20 }}>
      {header}

      {/* logged out — orders belong to an account; prompt sign-in, never crash */}
      {!me && (
        <div className="frame" style={{ padding: "56px 26px", textAlign: "center" }}>
          <div style={{ fontSize: 44, lineHeight: 1, marginBottom: 12 }}>🔒</div>
          <div style={{ font: "800 19px Cinzel,serif", color: "var(--gold-lt)" }}>Sign in to see your orders</div>
          <p style={{ margin: "8px 0 18px", font: "400 13px Inter", color: "var(--ink2)" }}>
            Your receipts are tied to your account. Sign in to view your purchase history.
          </p>
          <button onClick={() => navigate("/login")} className="btn btn-gold" style={{ padding: "12px 26px" }}>
            Sign In / Sign Up
          </button>
        </div>
      )}

      {/* error */}
      {me && error && (
        <div className="frame" style={{ padding: "56px 26px", textAlign: "center" }}>
          <div style={{ fontSize: 44, lineHeight: 1, marginBottom: 12 }}>⚠️</div>
          <div style={{ font: "800 19px Cinzel,serif", color: "var(--gold-lt)" }}>Couldn't load your orders</div>
          <p style={{ margin: "8px 0 0", font: "400 13px Inter", color: "var(--ink2)" }}>{error}</p>
        </div>
      )}

      {/* loading */}
      {me && !error && orders === null && (
        <div className="frame" style={{ padding: "56px 26px", textAlign: "center" }}>
          <div style={{ font: "700 13px Inter", letterSpacing: "1.5px", color: "var(--ink2)" }}>Loading your receipts…</div>
        </div>
      )}

      {/* empty — honest state for a user with no purchases */}
      {me && !error && orders !== null && orders.length === 0 && (
        <div className="frame" style={{ padding: "56px 26px", textAlign: "center" }}>
          <div style={{ fontSize: 44, lineHeight: 1, marginBottom: 12 }}>🧾</div>
          <div style={{ font: "800 19px Cinzel,serif", color: "var(--gold-lt)" }}>No purchases yet</div>
          <p style={{ margin: "8px 0 18px", font: "400 13px Inter", color: "var(--ink2)" }}>
            When you buy from the Store, your receipts will appear here.
          </p>
          <button onClick={goToStore} className="btn btn-gold" style={{ padding: "12px 26px" }}>
            Browse the Store
          </button>
        </div>
      )}

      {/* orders list */}
      {me && !error && orders !== null && orders.length > 0 && (
        <>
          <div
            className="frame"
            style={{
              padding: "16px 22px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div style={{ font: "600 12px Inter", color: "var(--ink2)" }}>{orders.length} order(s) on record</div>
            <div style={{ font: "600 12px Inter", color: "var(--ink2)", display: "inline-flex", alignItems: "center", gap: 8 }}>
              Lifetime spend · <span style={{ display: "inline-flex", alignItems: "center" }}>{totalSpendEl}</span>
            </div>
          </div>

          {orders.map((o) => {
            const cur = curOf(o.currency);
            const shortId = `#${o.id.slice(-8).toUpperCase()}`;
            const items = Array.isArray(o.items) ? o.items : [];
            return (
              <div key={o.id} className="frame" style={{ padding: "20px 22px" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 16,
                    flexWrap: "wrap",
                    paddingBottom: 14,
                    borderBottom: "1px solid rgba(232,184,75,.15)",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span
                        style={{
                          font: "800 15px 'JetBrains Mono',monospace",
                          color: "var(--gold-lt)",
                          letterSpacing: ".5px",
                        }}
                      >
                        {shortId}
                      </span>
                      <span
                        style={{
                          font: "700 10px Inter",
                          letterSpacing: "1px",
                          textTransform: "uppercase",
                          color: "var(--ink2)",
                          border: "1px solid rgba(232,184,75,.25)",
                          borderRadius: 100,
                          padding: "3px 9px",
                        }}
                      >
                        {items.length === 1 ? "Store item" : `${items.length} items`}
                      </span>
                    </div>
                    <div style={{ marginTop: 6, font: "500 12px Inter", color: "var(--ink2)" }}>
                      {fmtDate(o.createdAt)} · Paid with {curLabel(o.currency)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <PriceEl cur={cur} amount={o.total} big />
                    <div style={{ marginTop: 4, font: "600 11px Inter", color: "#7fe0a3" }}>
                      {o.status === "completed" ? "Completed" : o.status}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 12 }}>
                  {items.map((it, i) => (
                    <div
                      key={`${o.id}-${it.itemId}-${i}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "9px 2px",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            font: "700 13px Inter",
                            color: "#fff",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {it.name}
                        </div>
                        <div style={{ font: "500 11px Inter", color: "var(--ink2)", marginTop: 1 }}>{it.itemId}</div>
                      </div>
                      <div style={{ flex: "none" }}>
                        <PriceEl cur={cur} amount={it.price} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
