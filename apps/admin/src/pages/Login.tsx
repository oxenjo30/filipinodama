import { useState } from "react";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";

/**
 * Admin login — a dedicated sign-in on the admin domain (no redirect to the
 * player site). Signs in via the shared auth endpoint; if the account isn't an
 * admin, /admin/me returns 403 and the shell shows the "not authorized" screen.
 */
export function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!email.trim() || !password) return;
    setBusy(true);
    try {
      await login(email.trim(), password);
      // On success, AuthProvider flips state → the shell renders. If the account
      // has no admin role, the shell shows "not authorized".
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Sign in failed. Check your credentials.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="lm">☀</div>
        <h1>Admin Console</h1>
        <p className="sub">Operator sign-in · FilipinoDama Royal</p>

        <div className="field">
          <label>Email</label>
          <input className="input" type="email" value={email} autoFocus autoComplete="username"
            onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="you@example.com" />
        </div>
        <div className="field">
          <label>Password</label>
          <input className="input" type="password" value={password} autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="••••••••" />
        </div>
        {error && <div style={{ color: "var(--red-lt)", font: "600 12px var(--sans)", marginBottom: 12 }}>{error}</div>}
        <button className="btn gold" style={{ width: "100%", padding: 12, marginTop: 4 }} disabled={busy || !email.trim() || !password} onClick={submit}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p style={{ textAlign: "center", color: "var(--dim-2)", fontSize: 11, marginTop: 18 }}>
          Restricted to authorized operators. All actions are audited.
        </p>
      </div>
    </div>
  );
}
