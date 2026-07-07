import { useState, type CSSProperties, type ReactNode } from "react";

/**
 * CheckoutModal — a faithful reproduction of the prototype's checkout
 * confirmation dialog (handoff/FilipinoDama Royal.dc.html, lines 2527-2574): a
 * centred, dimmed, blurred, click-outside-to-dismiss overlay holding an ornate
 * `.frame` card with a radial purple wash. The card is a two-state flow:
 *
 *   State A — "Review Order": every cart line with its name, sub-label, and
 *   per-currency price; a Total row summing the Gold lines and the Diamond lines
 *   separately; Cancel + "Confirm Purchase" buttons.
 *
 *   State B — "Purchase Complete": a celebratory header ("Enjoy your loot!"),
 *   the count of granted items, a ✓ list of the granted item names, and
 *   "Keep Shopping" + "View in Locker" buttons.
 *
 * FULLY LIVE-WIRED — this component owns NO purchase logic and fabricates NO
 * data. Confirming calls `onConfirm()`, which the parent (StorePage) implements
 * as the real POST /api/store/purchase loop; the granted names shown in State B
 * are exactly the ones the server reports it granted. Every cart line's
 * name/price/currency comes from a real StoreItem passed in by the parent.
 */

type Cur = "gold" | "gem";

/** A checkout cart line — name/price/currency all sourced from a real StoreItem. */
export type CheckoutLine = {
  id: string;
  name: string;
  /** optional sub-label (e.g. "Board Theme"); the prototype shows one under each name */
  sub?: string;
  price: number;
  cur: Cur;
};

export type CheckoutModalProps = {
  open: boolean;
  cart: CheckoutLine[];
  onCancel: () => void;
  /** runs the real purchases; resolves with the names of items actually granted */
  onConfirm: () => Promise<{ granted: string[] }>;
  onKeepShopping: () => void;
  /** navigate to /inventory */
  onViewLocker: () => void;
};

const A = (n: string) => `/assets/${n}`;
const curColor = (c: Cur) => (c === "gem" ? "#ff9aa8" : "#f2d493");

function CurIcon({ cur, size = 16 }: { cur: Cur; size?: number }) {
  return (
    <img
      src={cur === "gem" ? A("ic-gem.png") : A("ic-coin.png")}
      alt={cur === "gem" ? "Diamonds" : "Gold"}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 97,
  background: "rgba(8,4,18,.8)",
  backdropFilter: "blur(5px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  animation: "fdfade .2s ease",
};
const card: CSSProperties = {
  width: 520,
  maxWidth: "100%",
  padding: "30px 28px 26px",
  position: "relative",
  animation: "fdrise .26s ease both",
  background: "radial-gradient(120% 90% at 50% 0%,rgba(45,26,74,.97),rgba(20,11,36,.98))",
};
const closeBtn: CSSProperties = {
  position: "absolute",
  top: 14,
  right: 14,
  width: 34,
  height: 34,
  borderRadius: 9,
  border: "1px solid rgba(232,184,75,.25)",
  background: "rgba(0,0,0,.3)",
  color: "var(--ink2)",
  font: "700 16px Inter",
  cursor: "pointer",
};

/** A single-currency total chip. */
function TotalChip({ cur, amount }: { cur: Cur; amount: number }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6, font: "800 18px 'JetBrains Mono',monospace", color: curColor(cur) }}>
      <CurIcon cur={cur} size={18} /> {amount.toLocaleString()}
    </span>
  );
}

export function CheckoutModal({ open, cart, onCancel, onConfirm, onKeepShopping, onViewLocker }: CheckoutModalProps) {
  // null = Review Order (State A); string[] = Purchase Complete (State B) with granted names
  const [granted, setGranted] = useState<string[] | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (!open) return null;

  const gold = cart.filter((c) => c.cur === "gold").reduce((n, c) => n + c.price, 0);
  const gem = cart.filter((c) => c.cur === "gem").reduce((n, c) => n + c.price, 0);

  // Backdrop / ✕ dismiss: cancel while reviewing; while showing the receipt it's
  // effectively "keep shopping" (parent decides how to reset).
  const dismiss = () => {
    if (granted != null) {
      onKeepShopping();
    } else if (!confirming) {
      onCancel();
    }
  };

  const confirm = async () => {
    if (confirming) return;
    setConfirming(true);
    try {
      const res = await onConfirm();
      // Only advance to State B if the server actually granted something.
      setGranted(res.granted);
    } catch {
      // Purchase failed — the parent surfaces the honest toast; stay in Review.
    } finally {
      setConfirming(false);
    }
  };

  let body: ReactNode;
  if (granted != null) {
    // ── State B: Purchase Complete ──
    body = (
      <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
        <div style={{ font: "700 11px Inter", letterSpacing: "3px", textTransform: "uppercase", color: "#7ee6a4", animation: "fdrise .4s ease .5s both" }}>
          Purchase Complete
        </div>
        <h2 style={{ margin: "8px 0 4px", font: "800 26px Cinzel,serif", color: "var(--gold-lt)", animation: "fdrise .4s ease .58s both" }}>
          Enjoy your loot!
        </h2>
        <p style={{ margin: "0 0 18px", font: "400 13px Inter", color: "var(--ink)", animation: "fdrise .4s ease .64s both" }}>
          {granted.length} item{granted.length === 1 ? "" : "s"} added to your Locker.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, textAlign: "left", marginBottom: 20 }}>
          {granted.map((name, i) => (
            <div key={`${name}-${i}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 4px", borderBottom: "1px solid rgba(232,184,75,.1)" }}>
              <span style={{ color: "#3fbf6f", font: "700 13px Inter" }}>✓</span>
              <div style={{ font: "700 13px Inter", color: "#fff" }}>{name}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-purple" onClick={onKeepShopping} style={{ flex: 1 }}>
            Keep Shopping
          </button>
          <button className="btn btn-gold" onClick={onViewLocker} style={{ flex: 1 }}>
            View in Locker
          </button>
        </div>
      </div>
    );
  } else {
    // ── State A: Review Order ──
    body = (
      <>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ font: "700 11px Inter", letterSpacing: "3px", textTransform: "uppercase", color: "var(--gold)" }}>Review Order</div>
          <h2 style={{ margin: "8px 0 0", font: "800 26px Cinzel,serif", color: "var(--gold-lt)" }}>Confirm Purchase</h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 16 }}>
          {cart.map((ci) => (
            <div key={ci.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, padding: "12px 4px", borderBottom: "1px solid rgba(232,184,75,.12)" }}>
              <div>
                <div style={{ font: "700 14px Inter", color: "#fff" }}>{ci.name}</div>
                {ci.sub ? <div style={{ font: "500 11px Inter", color: "var(--ink2)", marginTop: 2 }}>{ci.sub}</div> : null}
              </div>
              <span style={{ display: "flex", alignItems: "center", gap: 5, font: "700 14px 'JetBrains Mono',monospace", color: curColor(ci.cur) }}>
                <CurIcon cur={ci.cur} /> {ci.price.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 4px 4px" }}>
          <span style={{ font: "700 13px Inter", color: "var(--ink)" }}>Total</span>
          <span style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {gold > 0 || gem === 0 ? <TotalChip cur="gold" amount={gold} /> : null}
            {gem > 0 ? <TotalChip cur="gem" amount={gem} /> : null}
          </span>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button className="btn btn-purple" onClick={onCancel} disabled={confirming} style={{ flex: 1, opacity: confirming ? 0.7 : 1 }}>
            Cancel
          </button>
          <button className="btn btn-gold" onClick={() => void confirm()} disabled={confirming} style={{ flex: 1.6, opacity: confirming ? 0.7 : 1 }}>
            {confirming ? "Processing…" : "Confirm Purchase"}
          </button>
        </div>
      </>
    );
  }

  return (
    <div onClick={dismiss} style={overlay}>
      <div className="frame" onClick={(e) => e.stopPropagation()} style={card}>
        <button onClick={dismiss} aria-label="Close" style={closeBtn}>
          ✕
        </button>
        {body}
      </div>
    </div>
  );
}

export default CheckoutModal;
