import { useEffect, useState, type CSSProperties } from "react";
import { api, ApiError } from "../../lib/api";
import { useAppStore } from "../../stores/appStore";
import { useAuthStore } from "../../stores/authStore";

/**
 * TopUpModal — the Diamond Top-Up dialog, a faithful reproduction of the
 * prototype's "Get Diamonds" modal (handoff/FilipinoDama Royal.dc.html, lines
 * 2147-2174): a centred, dimmed, click-outside-to-dismiss overlay with a
 * rose-tinted frame, a gem-icon header ("Get Diamonds" + live balance), a
 * vertical stack of diamond-pack rows (gem icon + amount, optional bonus chip,
 * tag sub-label, gold price pill), and a virtual-currency legal footnote.
 *
 * FULLY LIVE-WIRED — no hardcoded packs:
 *   - On open, GET /api/payments/packs → { packs, enabled, currency } drives the
 *     rows. Each pack is { id, diamonds, bonus, priceCents, label }. Price is
 *     rendered as ₱ (currency PHP) from priceCents/100.
 *   - Clicking a pack → POST /api/payments/checkout { packId } → { url }, then
 *     window.location.href = url to hand off to the PayMongo checkout.
 *   - If payments are disabled the server answers with a notConfigured / 501
 *     error on checkout; we surface an honest toast and keep the modal usable so
 *     the packs still preview.
 */

type Pack = {
  id: string;
  diamonds: number;
  bonus: number;
  priceCents: number;
  label: string;
};
type PacksResponse = { packs: Pack[]; enabled: boolean; currency: string };

const A = (n: string) => `/assets/${n}`;

/** Format minor units → a localized currency string (default PHP → "₱"). */
function priceLabel(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency }).format(cents / 100);
  } catch {
    // Unknown currency code → plain peso-style fallback.
    return `₱${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

function GemIcon({ size }: { size: number }) {
  return <img src={A("ic-gem.png")} alt="Diamonds" style={{ width: size, height: size, objectFit: "contain" }} />;
}

export type TopUpModalProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * TopUpModal — renders nothing when `open` is false. Clicking the dimmed backdrop
 * or the ✕ dismisses; the inner card stops propagation.
 */
export function TopUpModal({ open, onClose }: TopUpModalProps) {
  const me = useAuthStore((s) => s.me);
  const showToast = useAppStore((s) => s.showToast);

  const [packs, setPacks] = useState<Pack[] | null>(null); // null = loading
  const [currency, setCurrency] = useState<string>("PHP");
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // pack id being checked out

  const diamonds = me?.diamonds ?? 0;

  // Load the real pack list each time the modal opens.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setPacks(null);
    setLoadError(false);
    void (async () => {
      try {
        const data = await api.get<PacksResponse>("/api/payments/packs");
        if (!alive) return;
        setPacks(data.packs);
        setCurrency(data.currency || "PHP");
      } catch {
        if (alive) {
          setPacks([]);
          setLoadError(true);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  if (!open) return null;

  const buy = async (pack: Pack) => {
    setBusy(pack.id);
    try {
      const res = await api.post<{ url: string }>("/api/payments/checkout", { packId: pack.id });
      // Hand off to the hosted PayMongo checkout page.
      window.location.href = res.url;
    } catch (e) {
      if (e instanceof ApiError && (e.status === 503 || e.code === "NOT_CONFIGURED")) {
        showToast("Diamond top-ups arrive soon.");
      } else {
        showToast(e instanceof ApiError ? e.message : "Could not start checkout — please try again.");
      }
      setBusy(null);
    }
  };

  const loading = packs === null;

  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={card}>
        {/* header — gem icon + title + live balance */}
        <div style={header}>
          <div style={{ flex: "none" }}>
            <GemIcon size={44} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "800 19px Cinzel,serif", color: "#ffd0d8" }}>Get Diamonds</div>
            <div style={{ font: "600 12px Inter", color: "var(--ink2)", marginTop: 2 }}>
              Balance:{" "}
              <b style={{ color: "#ff9aa8", display: "inline-flex", alignItems: "center", gap: 4 }}>
                {diamonds.toLocaleString()} <GemIcon size={13} />
              </b>{" "}
              · premium currency
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={closeBtn}>
            ✕
          </button>
        </div>

        {/* pack list */}
        <div style={{ padding: "20px 26px", display: "flex", flexDirection: "column", gap: 11 }}>
          {loading ? (
            <div style={emptyText}>Loading Diamond packs…</div>
          ) : packs.length === 0 ? (
            <div style={emptyText}>
              {loadError
                ? "Diamond packs are unavailable right now — please try again soon."
                : "No Diamond packs available yet — check back soon."}
            </div>
          ) : (
            packs.map((p, i) => {
              const hasBonus = p.bonus > 0;
              const isBusy = busy === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => void buy(p)}
                  disabled={isBusy}
                  style={packRow(hasBonus, isBusy)}
                >
                  <div style={{ flex: "none" }}>
                    <GemIcon size={i >= 2 ? 36 : 28} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, font: "800 17px 'JetBrains Mono',monospace", color: "#fff" }}>
                        {p.diamonds.toLocaleString()} <GemIcon size={15} />
                      </span>
                      {hasBonus && (
                        <span style={bonusChip}>+{p.bonus.toLocaleString()} bonus</span>
                      )}
                    </div>
                    <div style={{ font: "500 11px Inter", color: "var(--ink2)", marginTop: 2 }}>{p.label}</div>
                  </div>
                  <span style={pricePill}>{isBusy ? "…" : priceLabel(p.priceCents, currency)}</span>
                </button>
              );
            })
          )}
          <div style={{ font: "500 11px/1.55 Inter", color: "var(--ink2)", textAlign: "center", marginTop: 6 }}>
            Payments are processed securely by PayMongo. Diamonds are a virtual currency with no cash value.
          </div>
        </div>
      </div>
    </div>
  );
}

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 96,
  background: "rgba(8,4,18,.78)",
  backdropFilter: "blur(6px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  animation: "fdfade .2s ease",
};
const card: CSSProperties = {
  width: "100%",
  maxWidth: 440,
  maxHeight: "88vh",
  overflowY: "auto",
  overflowX: "hidden",
  borderRadius: 18,
  border: "1px solid rgba(255,120,140,.4)",
  background: "linear-gradient(180deg,#241227,#170c1c)",
  boxShadow: "0 30px 80px rgba(0,0,0,.65)",
  animation: "fdrise .25s ease both",
};
const header: CSSProperties = {
  padding: "22px 26px 18px",
  borderBottom: "1px solid rgba(255,120,140,.2)",
  display: "flex",
  alignItems: "center",
  gap: 14,
};
const closeBtn: CSSProperties = {
  flex: "none",
  width: 34,
  height: 34,
  borderRadius: 9,
  border: "1px solid rgba(232,184,75,.2)",
  background: "transparent",
  color: "var(--ink2)",
  font: "700 17px Inter",
  cursor: "pointer",
};
const emptyText: CSSProperties = {
  padding: "18px 0",
  font: "500 12px/1.5 Inter",
  color: "var(--ink2)",
  textAlign: "center",
};
function packRow(hasBonus: boolean, isBusy: boolean): CSSProperties {
  return {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "14px 16px",
    borderRadius: 13,
    border: `1px solid ${hasBonus ? "rgba(63,191,111,.3)" : "rgba(232,184,75,.18)"}`,
    background: hasBonus ? "rgba(63,191,111,.06)" : "rgba(0,0,0,.22)",
    cursor: isBusy ? "default" : "pointer",
    textAlign: "left",
    opacity: isBusy ? 0.7 : 1,
  };
}
const bonusChip: CSSProperties = {
  font: "700 10px Inter",
  letterSpacing: ".5px",
  padding: "2px 7px",
  borderRadius: 100,
  background: "rgba(63,191,111,.18)",
  border: "1px solid rgba(63,191,111,.4)",
  color: "#7ee6a4",
};
const pricePill: CSSProperties = {
  flex: "none",
  padding: "9px 16px",
  borderRadius: 9,
  border: "1px solid var(--gold)",
  background: "linear-gradient(180deg,#f0cf72,#c99a2e)",
  color: "#3a2405",
  font: "800 13px Inter",
};

export default TopUpModal;
