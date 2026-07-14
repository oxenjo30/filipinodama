import { useAuthStore } from "../../stores/authStore";

/**
 * SanctionBanner — a top-anchored notice shown to a signed-in user who is
 * currently MUTED or BANNED (from me.sanction, derived server-side from the
 * User.mutedUntil / bannedUntil columns).
 *
 * A ban is normally rejected at the auth guard (403), so in practice this
 * mainly surfaces MUTES — the only sanction that keeps a user logged in while
 * silencing their chat. Without this banner a muted player has no way to learn
 * why their messages don't send. It's non-dismissible while the sanction is
 * active (unlike the cookie bar) because the state is meaningful, not
 * incidental — it disappears on its own when the sanction expires and /me
 * reports `muted:false`.
 */

function untilLabel(iso: string | null): string {
  if (!iso) return "indefinitely";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "shortly";
  const h = Math.round(ms / 3_600_000);
  if (h < 24) return `for about ${h}h`;
  const d = Math.round(h / 24);
  return `for about ${d}d`;
}

export function SanctionBanner() {
  const me = useAuthStore((s) => s.me);
  const s = me?.sanction;
  if (!s || (!s.muted && !s.banned)) return null;

  const banned = s.banned;
  const label = banned
    ? `Your account is suspended ${untilLabel(s.bannedUntil)}.`
    : `You've been muted ${untilLabel(s.mutedUntil)} — you can't send chat messages.`;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 370,
        display: "flex",
        justifyContent: "center",
        padding: "10px 16px",
        paddingTop: "calc(10px + env(safe-area-inset-top))",
        background: banned
          ? "linear-gradient(180deg,#5a1522,#3a0e18)"
          : "linear-gradient(180deg,#5a3a1a,#3a2410)",
        borderBottom: `1px solid ${banned ? "rgba(217,59,82,.5)" : "rgba(232,184,75,.4)"}`,
        boxShadow: "0 6px 20px rgba(0,0,0,.4)",
        animation: "fdslidein .3s ease",
      }}
      role="alert"
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, maxWidth: 860 }}>
        <span style={{ fontSize: 16, flex: "none" }}>{banned ? "⛔" : "🔇"}</span>
        <span style={{ font: "600 12.5px Inter", color: "#f7e6c8" }}>{label}</span>
      </div>
    </div>
  );
}

export default SanctionBanner;
