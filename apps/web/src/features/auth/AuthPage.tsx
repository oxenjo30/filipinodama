import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore, ApiError } from "../../stores/authStore";
import { api } from "../../lib/api";
import { BRAND } from "../../lib/assets";

/**
 * AuthPage — Login / Register / Guest, reproduced faithfully from the prototype's
 * Login screen (handoff/FilipinoDama Royal.dc.html, lines 2682-2738) using the
 * approved global classes (.frame/.btn/.btn-gold). Wires to the real authStore
 * actions; on success navigates to "/".
 *
 * Google is the only social provider (Facebook removed). Its button is enabled
 * only when providers.google is true, and clicking it hands off to the backend
 * OAuth start route which redirects to Google's consent screen. A Terms &
 * Conditions checkbox must be accepted before any account is created / signed in.
 *
 * DELIBERATE DEVIATIONS from the prototype (kept on purpose):
 *  - The required Terms & Conditions checkbox is a legal improvement the prototype
 *    lacks — it is intentionally KEPT.
 *  - The prototype renders three social buttons; only Google OAuth is actually
 *    configured server-side, so we intentionally show ONLY Google (no dead
 *    Apple/Facebook buttons).
 */

/** Where the API (and its OAuth start routes) live — mirrors lib/api.ts. */
const API_BASE = (import.meta.env.VITE_API_URL as string) || "http://localhost:4000";

type Mode = "signin" | "signup";

const INPUT: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "13px 14px",
  borderRadius: 11,
  border: "1px solid rgba(232,184,75,.25)",
  background: "rgba(0,0,0,.35)",
  color: "#fff",
  font: "600 14px Inter",
  outline: "none",
};

const LABEL_TEXT: React.CSSProperties = {
  display: "block",
  font: "700 11px Inter",
  letterSpacing: ".5px",
  color: "var(--ink2)",
  marginBottom: 6,
};

function tabStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: "10px 0",
    borderRadius: 9,
    border: "none",
    cursor: "pointer",
    font: "700 13px Inter",
    background: active ? "linear-gradient(180deg,#f0cf72,#c99a2e)" : "transparent",
    color: active ? "#3a2405" : "var(--ink2)",
    transition: "background .15s ease,color .15s ease",
  };
}

export function AuthPage({ initialMode = "signin" }: { initialMode?: Mode }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/";
  const providers = useAuthStore((s) => s.providers);
  const loading = useAuthStore((s) => s.loading);
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const guest = useAuthStore((s) => s.guest);

  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Forgot-password flow: null = not open, otherwise the small inline panel is
  // shown. `forgotDone` flips to the honest "check your email" confirmation once
  // the request has been POSTed.
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotDone, setForgotDone] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  const isSignup = mode === "signup";
  const disabled = busy || loading;

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
  }

  /** Every path that creates or enters an account first requires accepting Terms. */
  function requireTerms(): boolean {
    if (agreed) return true;
    setError("Please accept the Terms & Conditions to continue.");
    return false;
  }

  /** Hand off to the backend OAuth start route (full-page redirect to Google). */
  function startOAuth(provider: "google") {
    if (!requireTerms()) return;
    // Preserve where the user was headed so the callback can return them there.
    const url = `${API_BASE}/api/auth/oauth/${provider}?next=${encodeURIComponent(next)}`;
    window.location.assign(url);
  }

  async function submit() {
    if (!requireTerms()) return;
    setError(null);
    // Normalize the email (lowercase + trim) so a stray capital or space from
    // autocorrect/autofill can't cause a false "wrong password". Trim the
    // password of surrounding whitespace only (never alter the middle).
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = pass.trim();

    // Client-side validation: show a friendly message for empty/invalid input
    // instead of firing a request that 400s (and logs a console error).
    if (isSignup && !name.trim()) {
      setError("Please enter a display name.");
      return;
    }
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!cleanPass) {
      setError("Please enter your password.");
      return;
    }

    setBusy(true);
    try {
      if (isSignup) {
        await register({ email: cleanEmail, password: cleanPass, username: name.trim() });
      } else {
        await login({ email: cleanEmail, password: cleanPass });
      }
      navigate(next);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function playAsGuest() {
    if (!requireTerms()) return;
    setError(null);
    setBusy(true);
    try {
      await guest();
      navigate(next);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  /** Open the reset panel, pre-filling whatever email is already typed. */
  function openForgot() {
    setForgotEmail(email.trim());
    setForgotError(null);
    setForgotDone(false);
    setForgotOpen(true);
  }

  /**
   * Fire the real password-reset request. The backend
   * (POST /api/auth/password/forgot) always returns { sent: true } and never
   * reveals whether the address exists — so we show the same honest
   * "check your email" confirmation regardless.
   */
  async function submitForgot() {
    const cleanEmail = forgotEmail.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setForgotError("Please enter a valid email address.");
      return;
    }
    setForgotError(null);
    setForgotBusy(true);
    try {
      await api.post("/api/auth/password/forgot", { email: cleanEmail });
      setForgotDone(true);
    } catch (e) {
      setForgotError(
        e instanceof ApiError ? e.message : "Something went wrong. Please try again.",
      );
    } finally {
      setForgotBusy(false);
    }
  }

  // Google is the only social provider (Facebook removed per product decision).
  const googleOn = providers.google;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 360,
        overflow: "auto",
        background:
          "radial-gradient(1200px 700px at 50% -8%,rgba(90,50,140,.6),#0c0618 60%),#0c0618",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        animation: "fdfade .25s ease",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.4,
          backgroundImage: "radial-gradient(rgba(232,184,75,.06) 1px,transparent 1px)",
          backgroundSize: "30px 30px",
          pointerEvents: "none",
        }}
      />
      <div
        className="frame"
        style={{
          position: "relative",
          width: "min(94vw,420px)",
          padding: "34px 32px 26px",
          background: "linear-gradient(180deg,#1c1130,#140a24)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
            <img src={BRAND.logoSun} alt="" width={54} height={54} style={{ objectFit: "contain" }} />
          </div>
          <div style={{ font: "700 10px Inter", letterSpacing: "3px", textTransform: "uppercase", color: "var(--gold)" }}>
            ✦ FilipinoDama Royal ✦
          </div>
          <h1 style={{ margin: "8px 0 4px", font: "800 26px Cinzel,serif", color: "var(--gold-lt)" }}>
            {isSignup ? "Create Account" : "Welcome Back"}
          </h1>
          <p style={{ margin: 0, font: "400 12.5px Inter", color: "var(--ink2)" }}>
            {isSignup ? "Join the board and start climbing the ranks." : "Sign in to return to the board."}
          </p>
        </div>

        {/* mode toggle */}
        <div
          style={{
            display: "flex",
            gap: 6,
            padding: 5,
            borderRadius: 12,
            background: "rgba(0,0,0,.3)",
            border: "1px solid rgba(232,184,75,.14)",
            marginBottom: 22,
          }}
        >
          <button type="button" onClick={() => switchMode("signin")} style={tabStyle(!isSignup)}>
            Sign In
          </button>
          <button type="button" onClick={() => switchMode("signup")} style={tabStyle(isSignup)}>
            Create Account
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!disabled) submit();
          }}
          style={{ display: "flex", flexDirection: "column", gap: 14 }}
        >
          {isSignup && (
            <label style={{ display: "block" }}>
              {/* Label matches the prototype ("DISPLAY NAME"); the field still
                  maps to the register endpoint's `username`. */}
              <span style={LABEL_TEXT}>DISPLAY NAME</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your player name"
                autoComplete="username"
                style={INPUT}
              />
            </label>
          )}
          <label style={{ display: "block" }}>
            <span style={LABEL_TEXT}>EMAIL</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              style={INPUT}
            />
          </label>
          <label style={{ display: "block" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
            >
              <span style={{ ...LABEL_TEXT, marginBottom: 0 }}>PASSWORD</span>
              {!isSignup && (
                <button
                  type="button"
                  onClick={openForgot}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "var(--gold)",
                    font: "700 11px Inter",
                    cursor: "pointer",
                    padding: 0,
                    textDecoration: "underline",
                    whiteSpace: "nowrap",
                  }}
                >
                  Forgot?
                </button>
              )}
            </div>
            <input
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              type="password"
              placeholder="••••••••"
              autoComplete={isSignup ? "new-password" : "current-password"}
              style={INPUT}
            />
          </label>

          {error && <div style={{ font: "600 12px Inter", color: "#ff9aa8" }}>{error}</div>}

          <button
            type="submit"
            className="btn btn-gold"
            disabled={disabled}
            style={{
              width: "100%",
              justifyContent: "center",
              padding: 15,
              fontSize: 15,
              marginTop: 2,
              opacity: disabled ? 0.7 : 1,
              cursor: disabled ? "default" : "pointer",
            }}
          >
            {disabled ? "Please wait…" : isSignup ? "Create Account" : "Sign In"}
          </button>

          {/* Forgot-password — signin mode only, always visible under the button. */}
          {!isSignup && (
            <button
              type="button"
              onClick={openForgot}
              style={{
                display: "block",
                margin: "12px auto 0",
                border: "none",
                background: "transparent",
                color: "var(--gold)",
                font: "600 12px Inter",
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Forgot your password?
            </button>
          )}
        </form>

        {/* divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
          <div style={{ flex: 1, height: 1, background: "rgba(232,184,75,.16)" }} />
          <span style={{ font: "600 11px Inter", color: "var(--ink2)" }}>or continue with</span>
          <div style={{ flex: 1, height: 1, background: "rgba(232,184,75,.16)" }} />
        </div>
        <button
          type="button"
          disabled={!googleOn}
          title={googleOn ? "Continue with Google" : "Google sign-in is not configured yet."}
          onClick={() => {
            if (!googleOn) {
              setError("Google sign-in is not configured yet.");
              return;
            }
            startOAuth("google");
          }}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 9,
            padding: 13,
            borderRadius: 11,
            border: "1px solid rgba(232,184,75,.22)",
            background: "rgba(0,0,0,.3)",
            cursor: googleOn ? "pointer" : "not-allowed",
            opacity: googleOn ? 1 : 0.45,
          }}
        >
          <span style={{ font: "900 16px Inter", color: "#e8b84b" }}>G</span>
          <span style={{ font: "700 13px Inter", color: "#efe7fb" }}>Continue with Google</span>
        </button>

        <button
          type="button"
          onClick={playAsGuest}
          disabled={disabled}
          style={{
            width: "100%",
            marginTop: 16,
            padding: 12,
            borderRadius: 11,
            border: "1px dashed rgba(232,184,75,.3)",
            background: "transparent",
            color: "var(--ink)",
            font: "700 13px Inter",
            cursor: disabled ? "default" : "pointer",
            opacity: disabled ? 0.7 : 1,
          }}
        >
          Continue as Guest
        </button>
        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 9,
            margin: "18px 0 0",
            font: "400 11px Inter",
            color: "var(--ink2)",
            lineHeight: 1.5,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => {
              setAgreed(e.target.checked);
              if (e.target.checked) setError(null);
            }}
            style={{
              width: 16,
              height: 16,
              marginTop: 1,
              flex: "none",
              accentColor: "#c99a2e",
              cursor: "pointer",
            }}
          />
          <span>
            I agree to the{" "}
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--gold-lt)", fontWeight: 700, textDecoration: "underline" }}
            >
              Terms &amp; Conditions
            </a>{" "}
            and{" "}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--gold-lt)", fontWeight: 700, textDecoration: "underline" }}
            >
              Privacy Policy
            </a>
            .
          </span>
        </label>

        {/* Forgot-password panel — a real, wired reset flow. */}
        {forgotOpen && (
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 5,
              borderRadius: "inherit",
              background: "rgba(12,6,24,.92)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 14,
              padding: "34px 32px",
            }}
          >
            {forgotDone ? (
              <>
                <div style={{ textAlign: "center", fontSize: 30 }}>📧</div>
                <h2
                  style={{
                    margin: 0,
                    textAlign: "center",
                    font: "800 20px Cinzel,serif",
                    color: "var(--gold-lt)",
                  }}
                >
                  Check your email
                </h2>
                <p
                  style={{
                    margin: 0,
                    textAlign: "center",
                    font: "400 12.5px/1.6 Inter",
                    color: "var(--ink2)",
                  }}
                >
                  If an account exists for <b style={{ color: "#fff" }}>{forgotEmail.trim()}</b>,
                  we&rsquo;ve sent a password-reset link. It may take a minute to arrive — check
                  your spam folder too.
                </p>
                <button
                  type="button"
                  className="btn btn-gold"
                  onClick={() => setForgotOpen(false)}
                  style={{ width: "100%", justifyContent: "center", padding: 13, marginTop: 4 }}
                >
                  Back to Sign In
                </button>
              </>
            ) : (
              <>
                <h2
                  style={{
                    margin: 0,
                    textAlign: "center",
                    font: "800 20px Cinzel,serif",
                    color: "var(--gold-lt)",
                  }}
                >
                  Reset your password
                </h2>
                <p
                  style={{
                    margin: 0,
                    textAlign: "center",
                    font: "400 12.5px/1.6 Inter",
                    color: "var(--ink2)",
                  }}
                >
                  Enter your account email and we&rsquo;ll send you a link to set a new password.
                </p>
                <label style={{ display: "block" }}>
                  <span style={LABEL_TEXT}>EMAIL</span>
                  <input
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !forgotBusy) submitForgot();
                    }}
                    style={INPUT}
                  />
                </label>
                {forgotError && (
                  <div style={{ font: "600 12px Inter", color: "#ff9aa8" }}>{forgotError}</div>
                )}
                <button
                  type="button"
                  className="btn btn-gold"
                  onClick={submitForgot}
                  disabled={forgotBusy}
                  style={{
                    width: "100%",
                    justifyContent: "center",
                    padding: 13,
                    opacity: forgotBusy ? 0.7 : 1,
                    cursor: forgotBusy ? "default" : "pointer",
                  }}
                >
                  {forgotBusy ? "Sending…" : "Send reset link"}
                </button>
                <button
                  type="button"
                  onClick={() => setForgotOpen(false)}
                  disabled={forgotBusy}
                  style={{
                    width: "100%",
                    padding: 10,
                    borderRadius: 11,
                    border: "1px solid rgba(232,184,75,.22)",
                    background: "transparent",
                    color: "var(--ink)",
                    font: "700 12px Inter",
                    cursor: forgotBusy ? "default" : "pointer",
                  }}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default AuthPage;
