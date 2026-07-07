import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { useAppStore } from "../../stores/appStore";
import { useAuthStore } from "../../stores/authStore";

/**
 * SeasonPage (/season) — "Season Pass" / Ranked Season overview, ported from the
 * approved prototype (handoff/FilipinoDama Royal.dc.html lines 1549-1704).
 *
 * Sections reproduced from the prototype (layout unchanged):
 *   • ← Home back button + "✦ RANKED SEASON ✦" eyebrow
 *   • Hero banner (season name, ends-in countdown, level/xp progress, rank badge)
 *   • Reward Track tab (free + premium tiers, Royal Pass unlock footer)
 *   • Season Standings tab (ranked board)
 *
 * DATA: on mount (logged in) we GET /api/season/current → { season, hasPass, xp,
 * tiers[] } where each tier is { tier, xp, freeReward, premiumReward, unlocked,
 * claimed }. The hero banner shows the real season name / ends-in / xp; each
 * reward tile shows the real reward and a Claim / Claimed / Locked button.
 * Claiming POSTs /api/season/claim { tier } and unlocking the pass POSTs
 * /api/season/pass — both then update balances and re-fetch. When the pass is
 * owned the footer shows an honest "Royal Pass Active" state.
 *
 * LOGGED OUT / no season: no personal claim is fabricated — the banner reads
 * Level 1 · 0 XP / Unranked and the Unlock-Pass footer prompts sign-in.
 *
 * SEASON STANDINGS: fetched LIVE from GET /api/leaderboard?scope=global — real
 * users ranked by trophies, with real rank tiers. The YOU row uses the real `me`
 * entry the endpoint returns (honest "not yet ranked" when the player has no
 * standing yet). No hardcoded/fake players.
 */

// ── reward → display cell (icon + label) from the real reward payload ──
type Reward = { gold?: number; diamonds?: number } | null;
type RewardCell = { tag: string; icon: string; label: string };

function rewardCell(r: Reward, premium: boolean): RewardCell {
  const tag = premium ? "ROYAL" : "FREE";
  if (!r) return { tag, icon: premium ? "👑" : "🎁", label: premium ? "Royal Reward" : "Reward" };
  if (r.diamonds && r.diamonds > 0) return { tag, icon: "💎", label: `${r.diamonds.toLocaleString()} Diamonds` };
  if (r.gold && r.gold > 0) return { tag, icon: "🪙", label: `${r.gold.toLocaleString()} Gold` };
  return { tag, icon: premium ? "👑" : "🎁", label: premium ? "Royal Reward" : "Reward" };
}

// ── real season tier shape from GET /api/season/current ──
type ApiTier = {
  tier: number;
  xp: number;
  freeReward: Reward;
  premiumReward: Reward;
  unlocked: boolean;
  claimed: boolean;
};
type SeasonData = {
  season: { id: string; name: string; startsAt: string; endsAt: string };
  hasPass: boolean;
  passPrice: number;
  xp: number;
  tiers: ApiTier[];
};

// ── level model: level = number of tiers reached; XP-to-next uses tier xp gates ──
const MAX_LEVEL_LABEL = 50;

function endsInLabel(endsAt: string | undefined): string {
  if (!endsAt) return "—";
  const ms = new Date(endsAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "Ended";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  return `${d}d ${String(h).padStart(2, "0")}h`;
}

// ── Season standings — LIVE from GET /api/leaderboard?scope=global ──
type LbRow = {
  rank: number;
  userId: string;
  displayName: string;
  trophies: number;
  rankTier: { key: string; label: string; sub: string; accent: string; img: string };
};
type LeaderboardData = { scope: string; rows: LbRow[]; me: LbRow | null };

const MEDALS = ["/assets/medal-1.png", "/assets/medal-2.png", "/assets/medal-3.png"];

// ── reward button states (matches QuestsPage claim conventions) ──
const BTN_BASE: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  borderRadius: 8,
  font: "800 11px Inter",
  letterSpacing: ".3px",
};
const LOCKED_BTN: React.CSSProperties = {
  ...BTN_BASE,
  border: "1px solid rgba(232,184,75,.2)",
  background: "rgba(15,8,32,.5)",
  color: "var(--ink2)",
  cursor: "default",
};
const CLAIM_BTN: React.CSSProperties = {
  ...BTN_BASE,
  border: "1px solid var(--gold)",
  background: "linear-gradient(180deg,#f0c24b,#c98b2e)",
  color: "#2a1607",
  cursor: "pointer",
};
const CLAIMED_BTN: React.CSSProperties = {
  ...BTN_BASE,
  border: "1px solid rgba(63,191,111,.4)",
  background: "rgba(47,143,91,.16)",
  color: "#7ee6a4",
  cursor: "default",
};

type TileState = "locked" | "claimable" | "claimed";

function RewardTile({
  cell,
  premium,
  state,
  busy,
  onClaim,
}: {
  cell: RewardCell;
  premium: boolean;
  state: TileState;
  busy: boolean;
  onClaim: () => void;
}) {
  let btn: { style: React.CSSProperties; label: string; disabled: boolean };
  if (state === "claimed") btn = { style: CLAIMED_BTN, label: "Claimed", disabled: true };
  else if (state === "claimable") btn = { style: CLAIM_BTN, label: busy ? "…" : "Claim", disabled: busy };
  else btn = { style: LOCKED_BTN, label: "Locked", disabled: true };
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 11,
        borderRadius: 12,
        border: premium ? "1px solid rgba(232,184,75,.35)" : "1px solid rgba(232,184,75,.14)",
        background: premium
          ? "linear-gradient(160deg,rgba(232,184,75,.12),rgba(15,8,32,.25))"
          : "rgba(0,0,0,.22)",
      }}
    >
      <span
        style={{
          alignSelf: "flex-start",
          padding: "2px 8px",
          borderRadius: 100,
          font: "800 9px Inter",
          letterSpacing: ".5px",
          color: premium ? "#2a1607" : "var(--ink2)",
          background: premium ? "linear-gradient(180deg,#f7e2a0,#d5a63a)" : "rgba(255,255,255,.06)",
          border: premium ? "none" : "1px solid rgba(232,184,75,.18)",
        }}
      >
        {cell.tag}
      </span>
      <div
        style={{
          width: 46,
          height: 46,
          margin: "2px auto",
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 24,
          background: "rgba(0,0,0,.28)",
          border: "1px solid rgba(232,184,75,.16)",
        }}
      >
        {cell.icon}
      </div>
      <div
        style={{
          font: "700 12px Inter",
          color: "#f2e9d2",
          minHeight: 30,
          display: "flex",
          alignItems: "center",
          textAlign: "center",
          justifyContent: "center",
        }}
      >
        {cell.label}
      </div>
      <button type="button" disabled={btn.disabled} onClick={onClaim} style={btn.style}>
        {btn.label}
      </button>
    </div>
  );
}

export function SeasonPage() {
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.me);
  const patchMe = useAuthStore((s) => s.patchMe);
  const showToast = useAppStore((s) => s.showToast);
  const [tab, setTab] = useState<"rewards" | "ranking">("rewards");

  const [data, setData] = useState<SeasonData | null>(null);
  const [claimingTier, setClaimingTier] = useState<number | null>(null);
  const [buyingPass, setBuyingPass] = useState(false);
  const [seasonEndOpen, setSeasonEndOpen] = useState(false);
  const [claimingAll, setClaimingAll] = useState(false);

  // Live season standings (real users, ranked by trophies).
  const [board, setBoard] = useState<LeaderboardData | null>(null);
  const [boardLoading, setBoardLoading] = useState(true);

  const load = useCallback(async () => {
    if (!me) return;
    try {
      const d = await api.get<SeasonData>("/api/season/current");
      setData(d);
    } catch (e) {
      if (!(e instanceof ApiError && (e.status === 401 || e.code === "NO_SEASON"))) {
        showToast("Couldn't load the season. Try again in a moment.");
      }
    }
  }, [me, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Standings require an authenticated leaderboard read; skip when logged out.
  useEffect(() => {
    if (!me) {
      setBoard(null);
      setBoardLoading(false);
      return;
    }
    let alive = true;
    setBoardLoading(true);
    api
      .get<LeaderboardData>("/api/leaderboard?scope=global&limit=10")
      .then((d) => {
        if (alive) setBoard(d);
      })
      .catch(() => {
        if (alive) setBoard(null);
      })
      .finally(() => {
        if (alive) setBoardLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [me]);

  // Level = count of tiers whose xp gate is reached (min 1). XP shown is raw.
  const xp = data?.xp ?? 0;
  const hasPass = data?.hasPass ?? false;
  const level = Math.max(1, (data?.tiers ?? []).filter((t) => xp >= t.xp).length);
  const totalTiers = data?.tiers.length ?? 0;
  const nextTier = (data?.tiers ?? []).find((t) => xp < t.xp);
  const levelPct = nextTier && nextTier.xp > 0 ? Math.max(2, Math.min(100, Math.round((xp / nextTier.xp) * 100))) : xp > 0 ? 100 : 2;
  const seasonName = data?.season.name ?? "Ranked Season";
  const endsLabel = endsInLabel(data?.season.endsAt);
  const passPrice = data?.passPrice ?? 900; // real price from the API (matches what /season/pass charges)

  // Tiers still claimable: unlocked & not yet claimed. A tier is "claimable" if the
  // free reward is available, or (with the pass) a premium reward is available.
  // Since a claim marks the whole tier claimed, count each still-unclaimed unlocked tier once.
  const claimableTiers = (data?.tiers ?? []).filter((t) => t.unlocked && !t.claimed);
  const claimableCount = claimableTiers.length;

  // Season has ended once we pass its endsAt — drives the season-end banner + modal.
  const seasonEnded = !!data && new Date(data.season.endsAt).getTime() <= Date.now();

  // Re-pull balances after a claim (gold/diamonds may both change).
  const refreshBalances = useCallback(async () => {
    try {
      const { user } = await api.get<{ user: { gold: number; diamonds: number } }>("/api/auth/me");
      patchMe({ gold: user.gold, diamonds: user.diamonds });
    } catch {
      /* non-fatal */
    }
  }, [patchMe]);

  const onClaimTier = useCallback(
    async (tier: number) => {
      if (!me) {
        showToast("Sign in to claim season rewards.");
        return;
      }
      setClaimingTier(tier);
      try {
        const res = await api.post<{ freeReward: Reward; premiumReward: Reward }>("/api/season/claim", { tier });
        const gold = (res.freeReward?.gold ?? 0) + (res.premiumReward?.gold ?? 0);
        const diamonds = (res.freeReward?.diamonds ?? 0) + (res.premiumReward?.diamonds ?? 0);
        const gained = gold ? `+${gold.toLocaleString()} Gold` : diamonds ? `+${diamonds.toLocaleString()} Diamonds` : "Reward claimed";
        showToast(gained);
        await Promise.all([load(), refreshBalances()]);
      } catch (e) {
        showToast(e instanceof ApiError ? e.message : "Couldn't claim reward.");
      } finally {
        setClaimingTier(null);
      }
    },
    [me, showToast, load, refreshBalances],
  );

  const onUnlockPass = useCallback(async () => {
    if (!me) {
      showToast("Sign in to unlock the Royal Season Pass.");
      return;
    }
    setBuyingPass(true);
    try {
      const res = await api.post<{ spentDiamonds: number; diamondBalance: number }>("/api/season/pass");
      patchMe({ diamonds: res.diamondBalance });
      showToast("Royal Season Pass unlocked!");
      await load();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : "Couldn't unlock the season pass.");
    } finally {
      setBuyingPass(false);
    }
  }, [me, patchMe, showToast, load]);

  // Season-end "Claim All" — claim every still-claimable tier via the existing per-tier endpoint.
  const onClaimAll = useCallback(async () => {
    if (!me) {
      showToast("Sign in to claim season rewards.");
      return;
    }
    if (claimableTiers.length === 0) return;
    setClaimingAll(true);
    try {
      let gold = 0;
      let diamonds = 0;
      // Claim sequentially so the ledger applies each tier cleanly.
      for (const t of claimableTiers) {
        const res = await api.post<{ freeReward: Reward; premiumReward: Reward }>("/api/season/claim", { tier: t.tier });
        gold += (res.freeReward?.gold ?? 0) + (res.premiumReward?.gold ?? 0);
        diamonds += (res.freeReward?.diamonds ?? 0) + (res.premiumReward?.diamonds ?? 0);
      }
      const parts: string[] = [];
      if (gold) parts.push(`+${gold.toLocaleString()} Gold`);
      if (diamonds) parts.push(`+${diamonds.toLocaleString()} Diamonds`);
      showToast(parts.length ? parts.join(" · ") : "Rewards claimed");
      await Promise.all([load(), refreshBalances()]);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : "Couldn't claim rewards.");
    } finally {
      setClaimingAll(false);
    }
  }, [me, showToast, claimableTiers, load, refreshBalances]);

  // Final placement for the season-end modal comes from the live leaderboard rank
  // (no season-end backend endpoint yet). Honest "unranked" when the player has no standing.
  const finalRank = board?.me?.rank ?? null;
  const finalTierLabel = board?.me?.rankTier.label ?? (me && (me.trophies ?? 0) > 0 ? me.rankTier : "Unranked");

  // Real reward tiles for the season-end grid — built from the tiers' actual rewards
  // (no fabricated numbers). Shows each still-claimable reward the player earned.
  const seasonEndItems = claimableTiers.flatMap((t) => {
    const items: { icon: string; label: string; sub: string }[] = [];
    const free = rewardCell(t.freeReward, false);
    items.push({ icon: free.icon, label: free.label, sub: `Level ${t.tier} · Free` });
    if (hasPass) {
      const prem = rewardCell(t.premiumReward, true);
      items.push({ icon: prem.icon, label: prem.label, sub: `Level ${t.tier} · Royal` });
    }
    return items;
  });

  const tabStyle = (on: boolean): React.CSSProperties => ({
    padding: "10px 20px",
    borderRadius: 10,
    font: "800 13px Inter",
    letterSpacing: ".3px",
    cursor: "pointer",
    border: on ? "1px solid var(--gold)" : "1px solid rgba(232,184,75,.2)",
    background: on ? "rgba(232,184,75,.16)" : "rgba(15,8,32,.5)",
    color: on ? "var(--gold-lt)" : "var(--ink)",
  });

  return (
    <div
      data-screen-label="Season Pass"
      style={{ maxWidth: 1080, margin: "0 auto", padding: 26, display: "flex", flexDirection: "column", gap: 20 }}
    >
      {/* Back + eyebrow */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={() => navigate("/")}
          style={{
            padding: "9px 16px",
            borderRadius: 9,
            border: "1px solid rgba(232,184,75,.25)",
            background: "rgba(15,8,32,.5)",
            color: "var(--ink)",
            font: "700 12px Inter",
            cursor: "pointer",
          }}
        >
          ← Home
        </button>
        <span style={{ font: "700 12px Inter", letterSpacing: "3px", color: "var(--gold)" }}>✦ RANKED SEASON ✦</span>
      </div>

      {/* Hero banner */}
      <div className="frame" style={{ padding: 0, overflow: "hidden", position: "relative" }}>
        <div
          style={{
            padding: "28px 30px",
            display: "flex",
            gap: 26,
            alignItems: "center",
            flexWrap: "wrap",
            background: "linear-gradient(135deg,rgba(122,75,191,.32),rgba(15,8,32,.15))",
          }}
        >
          <img
            src="/assets/me-banner.png"
            alt="Season banner"
            style={{ width: 96, height: 114, objectFit: "contain", flex: "none", filter: "drop-shadow(0 8px 20px rgba(0,0,0,.55))" }}
          />
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h1 style={{ margin: 0, font: "800 clamp(26px,3.4vw,38px) Cinzel,serif", color: "var(--gold-lt)" }}>
                {seasonName}
              </h1>
              {hasPass && (
                <span
                  style={{
                    padding: "4px 11px",
                    borderRadius: 100,
                    border: "1px solid rgba(63,191,111,.4)",
                    background: "rgba(47,143,91,.16)",
                    font: "700 11px Inter",
                    color: "#7ee6a4",
                  }}
                >
                  ROYAL PASS
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, font: "600 13px Inter", color: "var(--ink)" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#ff8fae", boxShadow: "0 0 8px #ff8fae" }} />
              Ends in <b style={{ color: "#ffd0d8", fontFamily: "'JetBrains Mono',monospace" }}>{endsLabel}</b>
            </div>
            {/* level / xp progress — real per-user progression */}
            <div style={{ marginTop: 16, maxWidth: 460 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 7 }}>
                <span style={{ font: "800 15px Cinzel,serif", color: "#fff" }}>
                  Level {level}{" "}
                  <span style={{ font: "600 12px Inter", color: "var(--ink2)" }}>/ {totalTiers || MAX_LEVEL_LABEL}</span>
                </span>
                <span style={{ font: "600 12px Inter", color: "var(--gold-lt)" }}>{xp.toLocaleString()} XP</span>
              </div>
              <div
                style={{
                  height: 12,
                  borderRadius: 100,
                  background: "rgba(0,0,0,.4)",
                  border: "1px solid rgba(232,184,75,.2)",
                  overflow: "hidden",
                }}
              >
                <div style={{ height: "100%", width: `${levelPct}%`, background: "linear-gradient(90deg,#c98b2e,#f7e2a0)", borderRadius: 100 }} />
              </div>
            </div>
          </div>
          {/* rank badge — real trophies drive the tier; honest "unranked" when none yet */}
          <div
            style={{
              flex: "none",
              textAlign: "center",
              padding: "14px 20px",
              borderRadius: 16,
              background: "rgba(0,0,0,.28)",
              border: "1px solid rgba(232,184,75,.18)",
            }}
          >
            <div style={{ font: "600 10px Inter", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--ink2)", marginBottom: 8 }}>
              Your Rank
            </div>
            {me && (me.trophies ?? 0) > 0 ? (
              <>
                <div style={{ fontSize: 34, lineHeight: 1 }}>🏆</div>
                <div style={{ font: "800 15px Cinzel,serif", color: "var(--gold-lt)", marginTop: 6 }}>{me.rankTier}</div>
                <div style={{ font: "500 11px 'JetBrains Mono',monospace", color: "var(--ink2)" }}>{me.trophies.toLocaleString()} 🏆</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 34, lineHeight: 1 }}>❔</div>
                <div style={{ font: "800 15px Cinzel,serif", color: "var(--gold-lt)", marginTop: 6 }}>Unranked</div>
                <div style={{ font: "500 11px Inter", color: "var(--ink2)" }}>Play placement matches</div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Season-end rewards banner — shown once the season's endsAt has passed */}
      {seasonEnded && (
        <div
          className="frame"
          style={{
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            gap: 15,
            flexWrap: "wrap",
            background: "linear-gradient(135deg,rgba(63,191,111,.16),rgba(232,184,75,.12))",
            borderColor: "rgba(63,191,111,.45)",
          }}
        >
          <span style={{ font: "800 26px", lineHeight: 1 }}>🎉</span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ font: "800 15px Cinzel,serif", color: "#8ff0b6" }}>{seasonName} has ended!</div>
            <div style={{ font: "500 12px Inter", color: "var(--ink2)" }}>
              {claimableCount > 0 ? "Your end-of-season rewards are ready to claim." : "See where you finished this season."}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSeasonEndOpen(true)}
            style={{
              flex: "none",
              padding: "11px 22px",
              borderRadius: 100,
              border: "1px solid rgba(63,191,111,.6)",
              background: "linear-gradient(180deg,#3fbf6f,#2a8f52)",
              color: "#fff",
              font: "800 13px Inter",
              cursor: "pointer",
            }}
          >
            {claimableCount > 0 ? "Claim Rewards" : "View Results"}
          </button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => setTab("rewards")} style={tabStyle(tab === "rewards")}>
          Reward Track
        </button>
        <button onClick={() => setTab("ranking")} style={tabStyle(tab === "ranking")}>
          Season Standings
        </button>
      </div>

      {/* REWARD TRACK TAB */}
      {tab === "rewards" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Royal Pass Active banner — shown above the Reward Track when the pass is owned */}
          {hasPass && (
            <div
              className="frame"
              style={{
                padding: "16px 22px",
                display: "flex",
                alignItems: "center",
                gap: 14,
                flexWrap: "wrap",
                background: "linear-gradient(135deg,rgba(232,184,75,.14),rgba(15,8,32,.1))",
                borderColor: "rgba(232,184,75,.4)",
              }}
            >
              <span style={{ font: "800 22px", lineHeight: 1 }}>👑</span>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ font: "800 15px Cinzel,serif", color: "var(--gold-lt)" }}>Royal Pass Active</div>
                <div style={{ font: "500 12px Inter", color: "var(--ink2)" }}>
                  You're unlocking premium rewards on every level this season.
                </div>
              </div>
              <span
                style={{
                  padding: "7px 16px",
                  borderRadius: 100,
                  background: "rgba(63,191,111,.16)",
                  border: "1px solid rgba(63,191,111,.4)",
                  font: "800 12px Inter",
                  color: "#7fe0a3",
                }}
              >
                ACTIVE
              </span>
            </div>
          )}

          {/* Reward track */}
          <div className="frame" style={{ padding: 22 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              <span style={{ font: "800 19px Cinzel,serif", color: "var(--gold-lt)" }}>Reward Track</span>
              {claimableCount > 0 && (
                <span
                  style={{
                    padding: "5px 12px",
                    borderRadius: 100,
                    background: "rgba(232,184,75,.16)",
                    border: "1px solid rgba(232,184,75,.4)",
                    font: "800 11px Inter",
                    color: "#f2d493",
                  }}
                >
                  {claimableCount} ready to claim
                </span>
              )}
            </div>
            {!me ? (
              <div style={{ padding: "28px 4px", textAlign: "center", font: "500 13px Inter", color: "var(--ink2)" }}>
                Sign in to view and claim your season reward track.
              </div>
            ) : !data ? (
              <div style={{ padding: "28px 4px", textAlign: "center", font: "500 13px Inter", color: "var(--ink2)" }}>
                No active season right now — check back soon.
              </div>
            ) : (
              <div style={{ display: "flex", gap: 14, overflowX: "auto", padding: "4px 2px 12px" }}>
                {data.tiers.map((t) => {
                  const freeState: TileState = t.claimed ? "claimed" : t.unlocked ? "claimable" : "locked";
                  // Premium reward is claimable only with the pass (and once claimed, the whole tier is marked claimed).
                  const premState: TileState = t.claimed ? "claimed" : t.unlocked && hasPass ? "claimable" : "locked";
                  const busy = claimingTier === t.tier;
                  return (
                    <div key={t.tier} style={{ flex: "none", width: 138, display: "flex", flexDirection: "column", gap: 11 }}>
                      <div
                        style={{
                          textAlign: "center",
                          font: "800 13px 'JetBrains Mono',monospace",
                          color: "var(--gold-lt)",
                          padding: "6px 0",
                          borderRadius: 8,
                          background: "rgba(0,0,0,.28)",
                          border: "1px solid rgba(232,184,75,.16)",
                        }}
                      >
                        LV {t.tier}
                      </div>
                      <RewardTile cell={rewardCell(t.freeReward, false)} premium={false} state={freeState} busy={busy} onClaim={() => onClaimTier(t.tier)} />
                      <RewardTile cell={rewardCell(t.premiumReward, true)} premium state={premState} busy={busy} onClaim={() => onClaimTier(t.tier)} />
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ font: "500 12px Inter", color: "var(--ink2)", marginTop: 6 }}>
              Free rewards unlock as you level up. <b style={{ color: "var(--gold-lt)" }}>Royal Pass</b> unlocks the premium reward on every level.
            </div>
          </div>

          {/* Unlock pass footer — not owned (honest: no fake "Active" banner) */}
          <div
            className="frame"
            style={{
              padding: "22px 24px",
              display: "flex",
              alignItems: "center",
              gap: 18,
              flexWrap: "wrap",
              background: "linear-gradient(135deg,rgba(122,75,191,.24),rgba(15,8,32,.1))",
              borderColor: "rgba(232,184,75,.35)",
            }}
          >
            <span style={{ font: "800 34px", lineHeight: 1 }}>👑</span>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ font: "800 18px Cinzel,serif", color: "var(--gold-lt)" }}>
                {hasPass ? "Royal Season Pass Active" : "Unlock the Royal Season Pass"}
              </div>
              <div style={{ font: "500 13px Inter", color: "var(--ink)", lineHeight: 1.5, marginTop: 4 }}>
                {hasPass
                  ? "You own the pass — claim the premium reward on every level you reach this season."
                  : "Claim the premium reward on every level — exclusive skins, frames, and bonus Diamonds all season long."}
              </div>
            </div>
            {hasPass ? (
              <span
                style={{
                  flex: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "13px 24px",
                  borderRadius: 11,
                  border: "1px solid rgba(63,191,111,.4)",
                  background: "rgba(47,143,91,.16)",
                  color: "#7ee6a4",
                  font: "800 14px Inter",
                }}
              >
                ✓ Active
              </span>
            ) : (
              <button
                onClick={onUnlockPass}
                disabled={buyingPass}
                style={{
                  flex: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "13px 24px",
                  borderRadius: 11,
                  border: "1px solid var(--gold)",
                  background: "linear-gradient(180deg,#f0c24b,#c98b2e)",
                  color: "#2a1607",
                  font: "800 14px Inter",
                  cursor: buyingPass ? "default" : "pointer",
                  opacity: buyingPass ? 0.7 : 1,
                }}
              >
                <img src="/assets/ic-gem.png" alt="" style={{ width: 18, height: 18, objectFit: "contain" }} />
                {buyingPass ? "…" : `${passPrice} · Unlock`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* SEASON STANDINGS TAB — live leaderboard (real users, ranked by trophies) */}
      {tab === "ranking" && (
        <div className="frame" style={{ padding: 22 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <span style={{ font: "800 19px Cinzel,serif", color: "var(--gold-lt)" }}>Season Standings</span>
            <span style={{ font: "600 12px Inter", color: "var(--ink2)" }}>Ranked by trophies</span>
          </div>
          {!me ? (
            <div style={{ padding: "28px 4px", textAlign: "center", font: "500 13px Inter", color: "var(--ink2)" }}>
              Sign in to see the season standings.
            </div>
          ) : boardLoading ? (
            <div style={{ padding: "28px 4px", textAlign: "center", font: "500 13px Inter", color: "var(--ink2)" }}>
              Loading standings…
            </div>
          ) : !board || board.rows.length === 0 ? (
            <div style={{ padding: "28px 4px", textAlign: "center", font: "500 13px Inter", color: "var(--ink2)" }}>
              No ranked players yet — be the first to climb the ladder.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {board.rows.map((r) => {
                const top3 = r.rank <= 3;
                const isMe = board.me?.userId === r.userId;
                return (
                  <div
                    key={r.userId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 13,
                      padding: "12px 14px",
                      borderRadius: 12,
                      border: isMe ? "1px solid var(--gold)" : "1px solid rgba(232,184,75,.1)",
                      background: isMe
                        ? "linear-gradient(135deg,rgba(232,184,75,.16),rgba(15,8,32,.1))"
                        : top3
                          ? "rgba(232,184,75,.06)"
                          : "rgba(0,0,0,.2)",
                    }}
                  >
                    <div style={{ width: 34, flex: "none", display: "flex", justifyContent: "center", alignItems: "center" }}>
                      {top3 ? (
                        <img src={MEDALS[r.rank - 1]} alt={`Rank ${r.rank}`} style={{ width: 26, height: 26, objectFit: "contain" }} />
                      ) : (
                        <span style={{ font: "800 15px 'JetBrains Mono',monospace", color: "var(--ink2)" }}>{r.rank}</span>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ font: "700 15px Inter", color: isMe ? "var(--gold-lt)" : "#f2e9d2" }}>{r.displayName}</span>
                        {isMe && (
                          <span
                            style={{
                              font: "800 9px Inter",
                              letterSpacing: ".5px",
                              color: "#1a0f2e",
                              background: "linear-gradient(180deg,#f7e2a0,#d5a63a)",
                              padding: "2px 8px",
                              borderRadius: 100,
                            }}
                          >
                            YOU
                          </span>
                        )}
                      </div>
                      <div style={{ font: "600 12px Inter", color: r.rankTier.accent }}>
                        {r.rankTier.label} · {r.rankTier.sub}
                      </div>
                    </div>
                    <div style={{ font: "800 15px 'JetBrains Mono',monospace", color: "#f2d493", flex: "none" }}>{r.trophies.toLocaleString()}</div>
                  </div>
                );
              })}
            </div>
          )}
          {/* Real YOU row when signed in but not in the visible top slice (or unranked) */}
          {me && !boardLoading && board && !board.rows.some((r) => r.userId === board.me?.userId) && (
            <div
              style={{
                marginTop: 14,
                display: "flex",
                alignItems: "center",
                gap: 13,
                padding: "14px 16px",
                borderRadius: 12,
                background: "linear-gradient(135deg,rgba(232,184,75,.12),rgba(15,8,32,.1))",
                border: "1px solid rgba(232,184,75,.35)",
              }}
            >
              <div style={{ width: 34, flex: "none", textAlign: "center", font: "800 15px 'JetBrains Mono',monospace", color: board.me ? "var(--gold-lt)" : "var(--ink2)" }}>
                {board.me ? board.me.rank : "—"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ font: "800 15px Inter", color: "var(--gold-lt)" }}>
                    {board.me ? board.me.displayName : "You are not yet ranked"}
                  </span>
                  <span
                    style={{
                      font: "800 9px Inter",
                      letterSpacing: ".5px",
                      color: "#1a0f2e",
                      background: "linear-gradient(180deg,#f7e2a0,#d5a63a)",
                      padding: "2px 8px",
                      borderRadius: 100,
                    }}
                  >
                    YOU
                  </span>
                </div>
                <div style={{ font: "600 12px Inter", color: board.me ? board.me.rankTier.accent : "var(--ink2)" }}>
                  {board.me ? `${board.me.rankTier.label} · ${board.me.rankTier.sub}` : "Play placement matches to earn your season rank."}
                </div>
              </div>
              {board.me ? (
                <div style={{ font: "800 15px 'JetBrains Mono',monospace", color: "#f2d493", flex: "none" }}>{board.me.trophies.toLocaleString()}</div>
              ) : (
                <button
                  onClick={() => navigate("/play")}
                  style={{
                    flex: "none",
                    padding: "9px 16px",
                    borderRadius: 8,
                    border: "1px solid rgba(232,184,75,.4)",
                    background: "rgba(232,184,75,.1)",
                    color: "var(--gold-lt)",
                    font: "700 12px Inter",
                    cursor: "pointer",
                  }}
                >
                  Play
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Season Rewards modal — final placement (from the live leaderboard) + real earned rewards */}
      {seasonEndOpen && (
        <div
          onClick={() => setSeasonEndOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 96,
            background: "rgba(8,4,18,.82)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="frame"
            style={{
              width: 560,
              maxWidth: "100%",
              maxHeight: "92vh",
              overflow: "auto",
              padding: "34px 32px 28px",
              textAlign: "center",
              position: "relative",
              background: "radial-gradient(130% 90% at 50% 0%,rgba(52,30,84,.97),rgba(20,11,36,.98))",
            }}
          >
            <button
              type="button"
              onClick={() => setSeasonEndOpen(false)}
              style={{
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
              }}
            >
              ✕
            </button>
            <div style={{ font: "700 11px Inter", letterSpacing: "3px", textTransform: "uppercase", color: "var(--gold)" }}>
              ✦ {seasonName} Complete ✦
            </div>
            <h2 style={{ margin: "9px 0 4px", font: "800 30px Cinzel,serif", color: "var(--gold-lt)" }}>Season Rewards</h2>
            <p style={{ margin: "0 0 22px", font: "400 13px Inter", color: "var(--ink)" }}>
              The season has ended — here's what your rank earned you.
            </p>

            {/* Final placement — real rank from the leaderboard */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 18,
                marginBottom: 24,
                padding: "18px 22px",
                borderRadius: 16,
                background: "rgba(0,0,0,.28)",
                border: "1px solid rgba(232,184,75,.2)",
              }}
            >
              <div style={{ fontSize: 40, lineHeight: 1 }}>{finalRank ? "🏆" : "❔"}</div>
              <div style={{ textAlign: "left" }}>
                <div style={{ font: "600 10px Inter", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--ink2)" }}>
                  Final Placement
                </div>
                <div style={{ font: "800 26px 'JetBrains Mono',monospace", color: "var(--gold-lt)", lineHeight: 1.1, margin: "2px 0" }}>
                  {finalRank ? `#${finalRank}` : "Unranked"}
                </div>
                <div style={{ font: "600 12px Inter", color: "#8ff0b6" }}>{finalTierLabel}</div>
              </div>
            </div>

            {/* Rewards grid — real earned rewards (no fabricated numbers) */}
            {seasonEndItems.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 24 }}>
                {seasonEndItems.map((r, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 8,
                      padding: "18px 10px 14px",
                      borderRadius: 14,
                      background: "rgba(232,184,75,.08)",
                      border: "1px solid rgba(232,184,75,.25)",
                    }}
                  >
                    <div
                      style={{
                        width: 56,
                        height: 56,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 13,
                        background: "rgba(0,0,0,.32)",
                        fontSize: 26,
                      }}
                    >
                      {r.icon}
                    </div>
                    <div style={{ font: "800 13px Inter", color: "#f2e9d2" }}>{r.label}</div>
                    <div style={{ font: "500 10px Inter", color: "var(--ink2)" }}>{r.sub}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ marginBottom: 24, font: "500 13px Inter", color: "var(--ink2)" }}>
                You've claimed every reward this season — nothing left to collect.
              </div>
            )}

            {claimableCount > 0 ? (
              <button
                type="button"
                onClick={onClaimAll}
                disabled={claimingAll}
                className="btn btn-gold"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "15px 40px",
                  fontSize: 15,
                  cursor: claimingAll ? "default" : "pointer",
                  opacity: claimingAll ? 0.7 : 1,
                }}
              >
                🎁 {claimingAll ? "Claiming…" : "Claim All Rewards"}
              </button>
            ) : (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "14px 26px",
                  borderRadius: 11,
                  border: "1px solid rgba(63,191,111,.5)",
                  background: "rgba(63,191,111,.14)",
                  color: "#7ee6a4",
                  font: "700 13px Inter",
                  letterSpacing: ".5px",
                }}
              >
                ✓ Rewards claimed — good luck next season!
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default SeasonPage;
