import { useEffect, useState } from "react";
import { Modal } from "../shared/Modal";
import { api, ApiError } from "../../lib/api";
import { useAppStore } from "../../stores/appStore";
import { useAuthStore } from "../../stores/authStore";
import { ICONS } from "../../lib/assets";

/**
 * DailyLoginBonusModal — the prototype's "Daily Login Bonus" (handoff line 2599),
 * rebuilt server-authoritative. On first mount per browser day (for a signed-in,
 * non-guest account) it fetches GET /api/rewards/daily-login; if today's bonus
 * isn't claimed yet it pops the modal showing the 7-day gold track with today
 * highlighted. Claiming POSTs the endpoint, credits gold, and closes.
 *
 * A per-day localStorage marker only suppresses the AUTO-POP (so it doesn't
 * reopen on every navigation) — it never gates the reward itself; the server is
 * the sole authority on whether the bonus is claimable.
 */

type LoginStatus = {
  day: number;
  claimedToday: boolean;
  rewardToday: number;
  track: number[];
  streak: number;
};

const SEEN_KEY = "fdr.loginBonusSeen"; // stores the UTC day-key we last auto-popped

function utcDayKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function DailyLoginBonusModal() {
  const me = useAuthStore((s) => s.me);
  const patchMe = useAuthStore((s) => s.patchMe);
  const showToast = useAppStore((s) => s.showToast);

  const [status, setStatus] = useState<LoginStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    // Signed-in real accounts only (guests don't earn the bonus).
    if (!me || me.isGuest) return;
    // Only auto-pop once per UTC day per browser — avoids reopening on every route.
    let seen = "";
    try {
      seen = localStorage.getItem(SEEN_KEY) ?? "";
    } catch {
      /* localStorage unavailable — fall through and just fetch */
    }
    if (seen === utcDayKey()) return;

    let cancelled = false;
    void (async () => {
      try {
        const s = await api.get<LoginStatus>("/api/rewards/daily-login");
        if (cancelled) return;
        setStatus(s);
        if (!s.claimedToday) setOpen(true);
        // Mark today seen regardless, so we don't re-pop on navigation. If they
        // close without claiming, they can still claim from the Home card / next day.
        try {
          localStorage.setItem(SEEN_KEY, utcDayKey());
        } catch {
          /* ignore */
        }
      } catch {
        /* silent — the bonus is opportunistic; a failed fetch just shows nothing */
      }
    })();
    return () => {
      cancelled = true;
    };
    // Re-run when the account changes (login/logout).
  }, [me]);

  const onClaim = async () => {
    if (claiming || !status) return;
    setClaiming(true);
    try {
      const res = await api.post<{ rewardGold: number; goldBalance: number; day: number }>("/api/rewards/daily-login");
      patchMe({ gold: res.goldBalance });
      showToast(`Daily bonus · +${res.rewardGold.toLocaleString()} Gold (Day ${res.day})`);
      setOpen(false);
    } catch (e) {
      // Already claimed (e.g. another tab) → just close gracefully.
      if (e instanceof ApiError && e.code === "ALREADY_CLAIMED") {
        setOpen(false);
      } else {
        showToast(e instanceof ApiError ? e.message : "Couldn't claim your daily bonus.");
      }
    } finally {
      setClaiming(false);
    }
  };

  if (!status) return null;

  const today = status.day; // 1..7
  return (
    <Modal open={open} onBackdrop={() => setOpen(false)} maxWidth={460}>
      <div style={{ fontSize: 40, lineHeight: 1, marginBottom: 4 }}>🎁</div>
      <h2 style={{ margin: "8px 0 4px", font: "800 28px Cinzel,serif", color: "var(--gold-lt)" }}>Daily Login Bonus</h2>
      <p style={{ margin: "0 0 20px", font: "400 13px Inter", color: "var(--ink)" }}>
        Log in every day to keep your streak — rewards grow all week.
      </p>

      {/* 7-day track — today highlighted, earlier days marked done. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 7, marginBottom: 22 }}>
        {status.track.map((gold, i) => {
          const day = i + 1;
          const isToday = day === today;
          const isPast = day < today;
          return (
            <div
              key={day}
              style={{
                borderRadius: 10,
                padding: "10px 4px",
                border: isToday ? "1.5px solid var(--gold)" : "1px solid rgba(232,184,75,.18)",
                background: isToday
                  ? "linear-gradient(180deg,rgba(240,194,75,.22),rgba(201,139,46,.12))"
                  : isPast
                    ? "rgba(140,224,173,.10)"
                    : "rgba(15,8,32,.5)",
                opacity: isPast ? 0.8 : 1,
              }}
            >
              <div style={{ font: "700 9px Inter", letterSpacing: ".5px", color: isToday ? "var(--gold-lt)" : "var(--ink2)", textTransform: "uppercase" }}>
                Day {day}
              </div>
              <img src={ICONS.coin} alt="" width={20} height={20} style={{ objectFit: "contain", margin: "5px auto 3px", display: "block" }} />
              <div style={{ font: "700 11px 'JetBrains Mono',monospace", color: isToday ? "#f2d493" : "var(--ink)" }}>
                {gold.toLocaleString()}
              </div>
              {isPast && <div style={{ font: "700 10px Inter", color: "#8ce0ad", marginTop: 2 }}>✓</div>}
            </div>
          );
        })}
      </div>

      <button
        className="btn btn-gold"
        onClick={onClaim}
        disabled={claiming}
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "14px 32px", fontSize: 15, width: "100%", opacity: claiming ? 0.7 : 1 }}
      >
        <img src={ICONS.coin} alt="" width={20} height={20} style={{ objectFit: "contain" }} />
        {claiming ? "Claiming…" : `Claim ${status.rewardToday.toLocaleString()} Gold`}
      </button>
    </Modal>
  );
}

export default DailyLoginBonusModal;
