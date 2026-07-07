import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { useAppStore } from "../../stores/appStore";
import { useAuthStore } from "../../stores/authStore";

/**
 * QuestsPage (/quests) — ported faithfully from the approved prototype
 * (handoff lines 1473-1548). Daily + seasonal quest rows with progress bars and
 * gold rewards. Same visual layout — now driven by REAL backend data.
 *
 * DATA: on mount (when logged in) we GET /api/quests → { daily, seasonal } where
 * each row has { id, title, goal, rewardGold, value, completed, claimed,
 * claimable }. Progress bars, N/goal counters, and the claim button reflect the
 * real per-user state. Claiming POSTs /api/quests/:id/claim, then updates the
 * gold balance in the auth store and re-fetches so the row flips to "Claimed".
 *
 * LOGGED OUT: no fetch fires; every row renders in the honest "not started"
 * state (0 / goal, Locked button) and the header prompts sign-in — no crash.
 */

type Quest = {
  id: string;
  scope: string;
  title: string;
  description: string | null;
  goal: number;
  rewardGold: number;
  value: number;
  completed: boolean;
  claimed: boolean;
  claimable: boolean;
};

// ── row styling (verbatim from the prototype conventions) ──
const ROW_BORDER = "rgba(232,184,75,.16)";
const ROW_BG = "rgba(255,255,255,.02)";
const BAR_FILL = "linear-gradient(90deg,#b98bff,#7a5bd6)";
const BAR_FILL_DONE = "linear-gradient(90deg,#5fd48a,#2f8f5b)";

// Locked / not-yet-claimable button (matches the prototype else-branch).
const BTN_LOCKED: React.CSSProperties = {
  flex: "none",
  padding: "8px 15px",
  borderRadius: 9,
  font: "800 12px Inter",
  letterSpacing: ".4px",
  whiteSpace: "nowrap",
  border: "1px solid rgba(232,184,75,.2)",
  background: "rgba(15,8,32,.5)",
  color: "var(--ink2)",
  cursor: "default",
};
// Claimable — active gold button.
const BTN_CLAIM: React.CSSProperties = {
  flex: "none",
  padding: "8px 15px",
  borderRadius: 9,
  font: "800 12px Inter",
  letterSpacing: ".4px",
  whiteSpace: "nowrap",
  border: "1px solid var(--gold)",
  background: "linear-gradient(180deg,#f0c24b,#c98b2e)",
  color: "#2a1607",
  cursor: "pointer",
};
// Already claimed — muted "done" pill.
const BTN_CLAIMED: React.CSSProperties = {
  ...BTN_LOCKED,
  border: "1px solid rgba(63,191,111,.4)",
  background: "rgba(47,143,91,.16)",
  color: "#7ee6a4",
};

// Live "RESETS IN 6h 12m" style label — daily quests reset at 00:00 UTC (matches
// the backend period key), so this counts down honestly to that boundary.
function timeUntilUtcMidnight(): string {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0);
  const ms = next - now.getTime();
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function QuestRow({ q, busy, onClaim }: { q: Quest; busy: boolean; onClaim: (id: string) => void }) {
  const cur = Math.min(q.value, q.goal);
  // Prototype rule: min 2% so an empty bar is still visible.
  const pct = Math.max(2, Math.min(100, Math.round((cur / Math.max(1, q.goal)) * 100)));
  const done = q.completed;

  let btn: { style: React.CSSProperties; label: string; disabled: boolean };
  if (q.claimed) btn = { style: BTN_CLAIMED, label: "Claimed", disabled: true };
  else if (q.claimable) btn = { style: BTN_CLAIM, label: busy ? "…" : "Claim", disabled: busy };
  else btn = { style: BTN_LOCKED, label: "Locked", disabled: true };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "14px 16px",
        borderRadius: 12,
        border: `1px solid ${ROW_BORDER}`,
        background: ROW_BG,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: q.description ? 3 : 9, flexWrap: "wrap" }}>
          <span style={{ font: "700 15px Inter", color: "#f2e9d2" }}>{q.title}</span>
        </div>
        {q.description ? (
          <div style={{ font: "500 12.5px Inter", color: "var(--ink2)", marginBottom: 9 }}>{q.description}</div>
        ) : null}
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div
            style={{
              flex: 1,
              height: 8,
              borderRadius: 6,
              background: "rgba(0,0,0,.4)",
              overflow: "hidden",
              border: "1px solid rgba(232,184,75,.12)",
            }}
          >
            <div style={{ height: "100%", width: `${pct}%`, background: done ? BAR_FILL_DONE : BAR_FILL, borderRadius: 6 }} />
          </div>
          <span style={{ flex: "none", font: "700 12px 'JetBrains Mono',monospace", color: "var(--ink)" }}>
            {cur} / {q.goal}
          </span>
        </div>
      </div>
      <div
        style={{
          flex: "none",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 8,
          minWidth: 96,
        }}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            font: "800 14px 'JetBrains Mono',monospace",
            color: "#f2d493",
            whiteSpace: "nowrap",
          }}
        >
          +{q.rewardGold} 🪙
        </span>
        <button type="button" disabled={btn.disabled} onClick={() => onClaim(q.id)} style={btn.style}>
          {btn.label}
        </button>
      </div>
    </div>
  );
}

export function QuestsPage() {
  const me = useAuthStore((s) => s.me);
  const patchMe = useAuthStore((s) => s.patchMe);
  const showToast = useAppStore((s) => s.showToast);
  // Real balance only — 0 when logged out. Never fall back to a placeholder.
  const gold = me?.gold ?? 0;

  const [daily, setDaily] = useState<Quest[]>([]);
  const [seasonal, setSeasonal] = useState<Quest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [resetLabel, setResetLabel] = useState(timeUntilUtcMidnight());

  // Tick the daily-reset countdown once a minute.
  useEffect(() => {
    const t = setInterval(() => setResetLabel(timeUntilUtcMidnight()), 60_000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    if (!me) return;
    try {
      const data = await api.get<{ daily: Quest[]; seasonal: Quest[] }>("/api/quests");
      setDaily(data.daily);
      setSeasonal(data.seasonal);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) {
        showToast("Couldn't load quests. Try again in a moment.");
      }
    } finally {
      setLoaded(true);
    }
  }, [me, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const onClaim = useCallback(
    async (id: string) => {
      if (!me) {
        showToast("Sign in to claim quest rewards.");
        return;
      }
      setClaiming(id);
      try {
        const res = await api.post<{ rewardGold: number; goldBalance: number }>(`/api/quests/${id}/claim`);
        patchMe({ gold: res.goldBalance });
        showToast(`Claimed +${res.rewardGold} Gold!`);
        await load(); // reflect claimed state / any other rows
      } catch (e) {
        showToast(e instanceof ApiError ? e.message : "Couldn't claim reward.");
      } finally {
        setClaiming(null);
      }
    },
    [me, patchMe, showToast, load],
  );

  const dailyClaimed = daily.filter((q) => q.claimed).length;
  const seasonalClaimed = seasonal.filter((q) => q.claimed).length;

  return (
    <div
      data-screen-label="Quests"
      style={{
        maxWidth: 860,
        margin: "0 auto",
        padding: 26,
        display: "flex",
        flexDirection: "column",
        gap: 22,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ font: "700 12px Inter", letterSpacing: 3, color: "var(--gold)" }}>✦ PROGRESSION ✦</div>
          <h1 style={{ margin: "9px 0 5px", font: "800 clamp(26px,3.4vw,36px) Cinzel,serif", color: "var(--gold-lt)" }}>
            Quests &amp; Achievements
          </h1>
          <p style={{ margin: 0, maxWidth: 520, font: "400 14px Inter", color: "var(--ink)", lineHeight: 1.5 }}>
            {me
              ? "Complete goals to earn 🪙 Gold you can spend in the Store. Daily quests refresh at midnight; seasonal goals last all season."
              : "Sign in to track your quest progress and claim 🪙 Gold rewards. Daily quests refresh at midnight; seasonal goals last all season."}
          </p>
        </div>
        <span className="pill" style={{ color: "#f2d493", whiteSpace: "nowrap" }}>
          <img
            src="/assets/ic-coin.png"
            alt=""
            style={{ width: 18, height: 18, display: "block" }}
          />
          {gold.toLocaleString()}
        </span>
      </div>

      {/* DAILY */}
      <div className="frame" style={{ padding: "22px 22px 8px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <span style={{ font: "800 19px Cinzel,serif", color: "var(--gold-lt)" }}>Daily Quests</span>
            <span
              style={{
                font: "700 10px 'JetBrains Mono',monospace",
                letterSpacing: ".5px",
                color: "var(--ink2)",
                border: "1px solid rgba(232,184,75,.22)",
                borderRadius: 100,
                padding: "3px 9px",
              }}
            >
              RESETS IN {resetLabel}
            </span>
          </div>
          <span style={{ font: "700 12px Inter", color: "var(--ink2)" }}>
            {dailyClaimed} / {daily.length} claimed
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 14 }}>
          {!me ? (
            <div style={{ padding: "22px 4px", textAlign: "center", font: "500 13px Inter", color: "var(--ink2)" }}>
              Sign in to see your daily quests.
            </div>
          ) : loaded && daily.length === 0 ? (
            <div style={{ padding: "22px 4px", textAlign: "center", font: "500 13px Inter", color: "var(--ink2)" }}>
              No daily quests right now — check back soon.
            </div>
          ) : (
            daily.map((q) => <QuestRow key={q.id} q={q} busy={claiming === q.id} onClaim={onClaim} />)
          )}
        </div>
      </div>

      {/* SEASONAL */}
      <div className="frame" style={{ padding: "22px 22px 8px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <span style={{ font: "800 19px Cinzel,serif", color: "var(--gold-lt)" }}>Seasonal Goals</span>
            <span
              style={{
                font: "700 10px 'JetBrains Mono',monospace",
                letterSpacing: ".5px",
                color: "#d5a63a",
                border: "1px solid rgba(232,184,75,.35)",
                borderRadius: 100,
                padding: "3px 9px",
              }}
            >
              SEASON OF THE RAJAH
            </span>
          </div>
          <span style={{ font: "700 12px Inter", color: "var(--ink2)" }}>
            {seasonalClaimed} / {seasonal.length} claimed
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 14 }}>
          {!me ? (
            <div style={{ padding: "22px 4px", textAlign: "center", font: "500 13px Inter", color: "var(--ink2)" }}>
              Sign in to see your seasonal goals.
            </div>
          ) : loaded && seasonal.length === 0 ? (
            <div style={{ padding: "22px 4px", textAlign: "center", font: "500 13px Inter", color: "var(--ink2)" }}>
              No seasonal goals right now — check back soon.
            </div>
          ) : (
            seasonal.map((q) => <QuestRow key={q.id} q={q} busy={claiming === q.id} onClaim={onClaim} />)
          )}
        </div>
      </div>
    </div>
  );
}

export default QuestsPage;
