import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuthStore } from "../../stores/authStore";
import { BRAND } from "../../lib/assets";

/**
 * VerifyEmailPage — the target of the email-verification link
 * (`${WEB_ORIGIN}/verify?token=...`, see server auth/service.ts). On mount it
 * POSTs /api/auth/verify { token }; success marks the email verified and (if the
 * server set a session) hydrates the user. Full-screen, no AppLayout chrome.
 */

type State = "verifying" | "ok" | "error";

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const setMe = useAuthStore((s) => s.setMe);
  const token = params.get("token") ?? "";

  const [state, setState] = useState<State>("verifying");
  const ran = useRef(false); // guard against React 18 StrictMode double-invoke

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!token) {
      setState("error");
      return;
    }
    void (async () => {
      try {
        const res = await api.post<{ user: Parameters<typeof setMe>[0] }>("/api/auth/verify", { token });
        if (res?.user) setMe(res.user);
        setState("ok");
      } catch {
        setState("error");
      }
    })();
  }, [token, setMe]);

  return (
    <Shell>
      {state === "verifying" && (
        <>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
            <span style={{ width: 30, height: 30, borderRadius: "50%", border: "3px solid rgba(232,184,75,.3)", borderTopColor: "var(--gold)", animation: "fdspin .9s linear infinite", display: "inline-block" }} />
          </div>
          <h1 style={TITLE}>Verifying your email…</h1>
          <p style={SUB}>One moment while we confirm your address.</p>
        </>
      )}
      {state === "ok" && (
        <>
          <div style={{ fontSize: 40, textAlign: "center", marginBottom: 6 }}>✅</div>
          <h1 style={TITLE}>Email verified</h1>
          <p style={SUB}>Your email is confirmed. Welcome to FilipinoDama Royal!</p>
          <button className="btn btn-gold" style={{ width: "100%" }} onClick={() => navigate("/")}>
            Enter the Game
          </button>
        </>
      )}
      {state === "error" && (
        <>
          <div style={{ fontSize: 40, textAlign: "center", marginBottom: 6 }}>⚠️</div>
          <h1 style={TITLE}>Link expired</h1>
          <p style={SUB}>This verification link is invalid or has already been used. Sign in and request a new one if needed.</p>
          <button className="btn btn-gold" style={{ width: "100%" }} onClick={() => navigate("/login")}>
            Go to Sign In
          </button>
        </>
      )}
    </Shell>
  );
}

const TITLE: React.CSSProperties = { font: "800 26px Cinzel,serif", color: "var(--gold-lt)", margin: "0 0 6px", textAlign: "center" };
const SUB: React.CSSProperties = { font: "400 14px Inter", color: "var(--ink)", margin: "0 0 20px", textAlign: "center" };

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

export default VerifyEmailPage;
