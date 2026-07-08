import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { ApiError } from "../../stores/authStore";
import { BRAND } from "../../lib/assets";

/**
 * ResetPasswordPage — the target of the password-reset email link
 * (`${WEB_ORIGIN}/reset?token=...`, see server auth/service.ts). Reads the token
 * from the query string, takes a new password, and POSTs
 * /api/auth/password/reset { token, password }. On success it sends the user to
 * /login to sign in with the new password. Full-screen (no AppLayout chrome),
 * matching the auth screens.
 */

const INPUT: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "13px 14px",
  borderRadius: 11,
  border: "1px solid rgba(232,184,75,.25)",
  background: "rgba(0,0,0,.35)",
  color: "#fff",
  font: "600 14px Inter",
};

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError(null);
    if (!token) {
      setError("This reset link is invalid or has expired. Request a new one from the sign-in page.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await api.post("/api/auth/password/reset", { token, password });
      setDone(true);
    } catch (e) {
      // A bad/expired token comes back as a 400 from the server.
      setError(
        e instanceof ApiError
          ? e.code === "BAD_REQUEST" || e.status === 400
            ? "This reset link is invalid or has expired. Request a new one from the sign-in page."
            : e.message
          : "Couldn't reset your password. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      {done ? (
        <>
          <h1 style={TITLE}>Password updated</h1>
          <p style={SUB}>Your password has been changed. You can now sign in with it.</p>
          <button className="btn btn-gold" style={{ width: "100%", marginTop: 8 }} onClick={() => navigate("/login")}>
            Go to Sign In
          </button>
        </>
      ) : (
        <>
          <h1 style={TITLE}>Reset your password</h1>
          <p style={SUB}>Choose a new password for your account.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input
              type="password"
              placeholder="New password (min 8 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              style={INPUT}
              autoComplete="new-password"
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              style={INPUT}
              autoComplete="new-password"
            />
            {error && <div style={{ font: "600 13px Inter", color: "#ff8fae" }}>{error}</div>}
            <button className="btn btn-gold" style={{ width: "100%", opacity: busy ? 0.7 : 1 }} disabled={busy} onClick={submit}>
              {busy ? "Updating…" : "Update Password"}
            </button>
            <button
              onClick={() => navigate("/login")}
              style={{ background: "none", border: "none", color: "var(--gold)", font: "600 13px Inter", cursor: "pointer", marginTop: 2 }}
            >
              Back to Sign In
            </button>
          </div>
        </>
      )}
    </Shell>
  );
}

const TITLE: React.CSSProperties = { font: "800 26px Cinzel,serif", color: "var(--gold-lt)", margin: "0 0 6px", textAlign: "center" };
const SUB: React.CSSProperties = { font: "400 14px Inter", color: "var(--ink)", margin: "0 0 20px", textAlign: "center" };

/** Shared full-screen auth shell (background field + centered frame + brand). */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 22,
        background: "radial-gradient(1200px 700px at 50% -8%,rgba(90,50,140,.6),#0c0618 60%),#0c0618",
      }}
    >
      <div className="frame" style={{ width: "min(94vw,440px)", padding: 34 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 22 }}>
          <img src={BRAND.logoSun} alt="" width={40} height={40} style={{ objectFit: "contain" }} />
          <div style={{ font: "900 22px Cinzel,serif", letterSpacing: "2px", background: "linear-gradient(180deg,#f7e2a0,#d5a63a)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
            FILIPINO DAMA
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

export default ResetPasswordPage;
