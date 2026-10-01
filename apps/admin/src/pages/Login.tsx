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
  const [showPassword, setShowPassword] = useState(false);
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
      <section className="login-brand" aria-label="FilipinoDama Administration">
        <div className="login-brand-inner">
          <div className="login-wordmark">FILIPINODAMA</div>
          <h1>Admin Console</h1>
          <p className="login-intro">A focused workspace for the people who keep FilipinoDama fair, supported, and running smoothly.</p>
          <div className="login-capabilities" aria-label="Administration capabilities">
            <div className="login-capability"><strong>Players</strong><span>Accounts and activity</span></div>
            <div className="login-capability"><strong>Trust &amp; safety</strong><span>Reports and support</span></div>
            <div className="login-capability"><strong>Economy</strong><span>Store and currency</span></div>
            <div className="login-capability"><strong>Live operations</strong><span>Events and campaigns</span></div>
          </div>
        </div>
      </section>
      <section className="login-workspace">
        <form className="login-card" onSubmit={(event) => { event.preventDefault(); if (!busy) void submit(); }}>
          <h2>Welcome back</h2>
          <p className="sub">Sign in to FilipinoDama Administration.</p>

          <div className="field">
            <label htmlFor="admin-email">Email</label>
            <input id="admin-email" className="input" type="email" value={email} autoFocus autoComplete="username"
              onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div className="field">
            <label htmlFor="admin-password">Password</label>
            <div className="login-password-field">
              <input id="admin-password" className="input" type={showPassword ? "text" : "password"} value={password} autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
              <button className="login-password-toggle" type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)}>
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          {error && <div className="login-error" role="alert">{error}</div>}
          <button className="btn gold" type="submit" disabled={busy || !email.trim() || !password}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <p className="login-restricted">Restricted to authorized operators. All actions are audited.</p>
        </form>
      </section>
    </div>
  );
}
