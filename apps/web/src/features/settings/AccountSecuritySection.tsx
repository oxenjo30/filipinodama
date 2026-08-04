import React from "react";
import { api, ApiError } from "../../lib/api";

/**
 * Account security — change your email.
 *
 * Server-authoritative on purpose. Everything rendered here comes from the
 * `account` block on GET /api/auth/me, so this screen and the Android one show
 * the same state wherever the player signs in. In particular `canUnlink` is
 * decided by the SERVER (canChangeEmail is false for guests and for accounts
 * with no password), so the two clients cannot disagree about what is allowed.
 */

export type AccountState = {
  email: string | null;
  emailVerified: boolean;
  hasPassword: boolean;
  pendingEmail: string | null;
  canChangeEmail: boolean;
};

const CARD: React.CSSProperties = {
  border: "1px solid rgba(232,184,75,.18)",
  background: "rgba(0,0,0,.2)",
  borderRadius: 12,
  padding: 14,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};
const LABEL: React.CSSProperties = { font: "700 14px Inter", color: "#efe7fb" };
const SUB: React.CSSProperties = { font: "500 11px Inter", color: "var(--ink2)" };
const INPUT: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(232,184,75,.22)",
  background: "rgba(0,0,0,.35)",
  color: "#efe7fb",
  font: "500 13px Inter",
};
const BTN: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(232,184,75,.4)",
  background: "linear-gradient(180deg,#efc25a,#c9971f)",
  color: "#3a2405",
  font: "700 13px Inter",
  cursor: "pointer",
};
const BTN_QUIET: React.CSSProperties = {
  ...BTN,
  background: "rgba(0,0,0,.25)",
  color: "#efe7fb",
  border: "1px solid rgba(232,184,75,.22)",
};

export function AccountSecuritySection({
  account,
  onChanged,
}: {
  account: AccountState | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [newEmail, setNewEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  if (!account) return null;

  
  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await api.post("/api/auth/email/change", {
        newEmail: newEmail.trim(),
        // Omitted entirely for OAuth-only accounts — the server decides whether
        // a password is required, based on whether one is actually set.
        ...(account!.hasPassword ? { currentPassword: password } : {}),
      });
      setMsg(`Check ${newEmail.trim()} for a confirmation link. Your email changes once you click it.`);
      setNewEmail("");
      setPassword("");
      setOpen(false);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start the email change.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* ── Email ─────────────────────────────────────────────────────────── */}
      <div style={CARD}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <span>
            <span style={{ ...LABEL, display: "block" }}>Email</span>
            <span style={SUB}>
              {account.email ?? "No email on this account"}
              {account.email && !account.emailVerified ? " · unverified" : ""}
            </span>
          </span>
          {account.canChangeEmail && (
            <button type="button" style={BTN_QUIET} onClick={() => setOpen((v) => !v)} disabled={busy}>
              {open ? "Cancel" : "Change"}
            </button>
          )}
        </div>

        {!account.canChangeEmail && (
          <span style={SUB}>Set a password on your account before changing your email.</span>
        )}

        {account.pendingEmail && (
          <div style={{ ...SUB, color: "#efc25a" }}>
            Awaiting confirmation at <b>{account.pendingEmail}</b>. Your current email stays active until you
            click the link.
          </div>
        )}

        {open && (
          <form onSubmit={submitEmail} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              style={INPUT}
              type="email"
              required
              value={newEmail}
              placeholder="new@email.com"
              onChange={(e) => setNewEmail(e.target.value)}
            />
            {account.hasPassword && (
              <input
                style={INPUT}
                type="password"
                required
                value={password}
                placeholder="Current password"
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
            <button type="submit" style={BTN} disabled={busy}>
              {busy ? "Sending…" : "Send confirmation link"}
            </button>
            <span style={SUB}>
              We email the new address. Your account only moves once you click that link.
            </span>
          </form>
        )}
      </div>

      {msg && <div style={{ ...SUB, color: "#7ee6a4" }}>{msg}</div>}
      {error && <div style={{ ...SUB, color: "#ff8398" }}>{error}</div>}
    </div>
  );
}
