import React from "react";
import { api, ApiError } from "../../lib/api";

/**
 * Account security — change your email, connect/disconnect Google.
 *
 * Server-authoritative on purpose. Everything rendered here comes from the
 * `account` block on GET /api/auth/me, so this screen and the Android one show
 * the same state wherever the player signs in. In particular `canUnlink` is
 * decided by the SERVER (unlinking your only sign-in method must be refused),
 * so the two clients can never disagree about whether the button is safe.
 */

export type AccountState = {
  email: string | null;
  emailVerified: boolean;
  hasPassword: boolean;
  linkedProviders: string[];
  pendingEmail: string | null;
  canUnlink: boolean;
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

  // The OAuth redirect comes back to /settings with a result in the query, since
  // the round trip through Google loses any in-page state.
  React.useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const linked = q.get("linked");
    const linkError = q.get("linkError");
    if (linked) {
      setMsg(`${linked === "google" ? "Google" : linked} connected.`);
      onChanged();
    }
    if (linkError) setError(linkError);
    if (linked || linkError) window.history.replaceState({}, "", window.location.pathname);
  }, [onChanged]);

  if (!account) return null;

  const googleLinked = account.linkedProviders.includes("google");

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

  function connectGoogle() {
    // MUST be absolute against the API origin. A relative "/api/..." goes to the
    // WEB origin, where the static host / Vite dev server just serves the SPA
    // shell — the consent screen never opens and linking silently does nothing.
    // api.base is the same VITE_API_URL every other call uses.
    window.location.href = `${api.base}/api/auth/oauth/google?link=1`;
  }

  async function disconnectGoogle() {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await api.del("/api/auth/link/google");
      setMsg("Google disconnected.");
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not disconnect Google.");
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

      {/* ── Google ────────────────────────────────────────────────────────── */}
      <div style={CARD}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <span>
            <span style={{ ...LABEL, display: "block" }}>Google</span>
            <span style={SUB}>
              {googleLinked ? "Connected — you can sign in with Google" : "Not connected"}
            </span>
          </span>
          {googleLinked ? (
            <button
              type="button"
              style={{ ...BTN_QUIET, opacity: account.canUnlink ? 1 : 0.5, cursor: account.canUnlink ? "pointer" : "not-allowed" }}
              onClick={disconnectGoogle}
              disabled={busy || !account.canUnlink}
              // The server refuses this anyway; the title explains WHY it's greyed
              // rather than letting the click fail with an error toast.
              title={account.canUnlink ? undefined : "Set a password first — this is your only way to sign in."}
            >
              Disconnect
            </button>
          ) : (
            <button type="button" style={BTN} onClick={connectGoogle} disabled={busy}>
              Connect
            </button>
          )}
        </div>
        {googleLinked && !account.canUnlink && (
          <span style={SUB}>Set a password first — Google is currently your only way to sign in.</span>
        )}
      </div>

      {msg && <div style={{ ...SUB, color: "#7ee6a4" }}>{msg}</div>}
      {error && <div style={{ ...SUB, color: "#ff8398" }}>{error}</div>}
    </div>
  );
}
