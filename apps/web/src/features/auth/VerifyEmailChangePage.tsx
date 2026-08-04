import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { useAuthStore } from "../../stores/authStore";
import { BRAND } from "../../lib/assets";

/**
 * VerifyEmailChangePage — target of the email-CHANGE confirmation link
 * (`${WEB_ORIGIN}/verify-email-change?token=...`, see auth/service.ts
 * requestEmailChange). Posting this token is what actually moves the account to
 * the new address; until then the old one stays live.
 *
 * Deliberately works WITHOUT a session: the link is usually opened in whatever
 * browser holds the new mailbox, which is often not the one the player is signed
 * in on. The single-use, one-hour token is the credential. If a session does
 * happen to exist, bootstrap() refreshes it so the Settings screen stops showing
 * "awaiting confirmation".
 */

type State = "working" | "ok" | "error";

export function VerifyEmailChangePage() {
  const [params] = useSearchParams();
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const token = params.get("token") ?? "";

  const [state, setState] = useState<State>("working");
  const [email, setEmail] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("That link is invalid or has expired.");
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
        const res = await api.post<{ email: string }>("/api/auth/email/confirm", { token });
        setEmail(res.email);
        setState("ok");
        // No-op when signed out; refreshes the Settings state when signed in.
        void bootstrap();
      } catch (err) {
        if (err instanceof ApiError) setMessage(err.message);
        setState("error");
      }
    })();
  }, [token, bootstrap]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--bg,#160b28)",
        padding: 24,
      }}
    >
      <div
        className="frame"
        style={{ padding: 28, maxWidth: 460, width: "100%", textAlign: "center", display: "grid", gap: 12 }}
      >
        <img src={BRAND.logoSun} alt="" width={56} height={56} style={{ margin: "0 auto" }} />
        {state === "working" && (
          <div style={{ font: "600 15px Inter", color: "var(--ink2)" }}>Confirming your new email…</div>
        )}
        {state === "ok" && (
          <>
            <div style={{ font: "800 20px Cinzel,serif", color: "#7ee6a4" }}>Email updated</div>
            <div style={{ font: "500 13px Inter", color: "var(--ink2)" }}>
              Your account now uses <b style={{ color: "#efe7fb" }}>{email}</b>. Use it next time you sign in.
            </div>
          </>
        )}
        {state === "error" && (
          <>
            <div style={{ font: "800 20px Cinzel,serif", color: "#ff8398" }}>Couldn't confirm</div>
            <div style={{ font: "500 13px Inter", color: "var(--ink2)" }}>{message}</div>
            <div style={{ font: "500 12px Inter", color: "var(--ink2)" }}>
              Confirmation links last one hour. Start the change again from Settings.
            </div>
          </>
        )}
        <Link to="/settings" style={{ font: "700 13px Inter", color: "#efc25a" }}>
          Go to Settings
        </Link>
      </div>
    </div>
  );
}
