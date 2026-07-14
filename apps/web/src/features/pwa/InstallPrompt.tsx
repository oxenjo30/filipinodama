import { useEffect, useState } from "react";

/**
 * InstallPrompt — a branded "Add to Home Screen" prompt for the web app.
 *
 * The PWA itself (manifest + service worker) is already configured via
 * vite-plugin-pwa, so the app is installable; this component only adds the
 * custom, on-brand prompt the owner asked for, layered over the browser's
 * default affordance.
 *
 * Two platform paths, because the web platform gives us different tools:
 *  - Chromium (Android/desktop Chrome/Edge): the browser fires
 *    `beforeinstallprompt`. We capture + defer it, show our own banner, and on
 *    "Install" call the saved event's `.prompt()` — a real one-tap install.
 *  - iOS Safari: there is NO `beforeinstallprompt` (Apple blocks programmatic
 *    install). The best we can do is detect iOS Safari and show guided
 *    instructions ("tap Share, then Add to Home Screen"). This is the platform
 *    ceiling, not a limitation of our build.
 *
 * It shows tastefully: never when already installed (standalone display mode),
 * never after the user dismisses or installs (persisted in localStorage), and
 * only after a short delay so it doesn't slam the very first paint.
 */

const DISMISS_KEY = "fdr.installPromptDismissed";
const SHOW_DELAY_MS = 8000;

// Minimal shape of the (non-standard, Chromium-only) beforeinstallprompt event.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function alreadyInstalled(): boolean {
  try {
    // Running as an installed PWA (standalone) — no prompt needed.
    if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
    // iOS marks installed PWAs via navigator.standalone.
    if ((navigator as unknown as { standalone?: boolean }).standalone) return true;
  } catch {
    /* matchMedia can be absent in old browsers — assume not installed */
  }
  return false;
}

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function markDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* private mode / disabled — dismiss for this session anyway */
  }
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent || "";
  const iOS = /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports as Mac; disambiguate by touch support.
    (navigator.platform === "MacIntel" && (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints !== undefined &&
      ((navigator as unknown as { maxTouchPoints: number }).maxTouchPoints > 1));
  const webkit = /WebKit/.test(ua);
  const notChromeOrFirefox = !/CriOS|FxiOS|EdgiOS/.test(ua);
  return iOS && webkit && notChromeOrFirefox;
}

type Mode = "hidden" | "android" | "ios";

export function InstallPrompt() {
  const [mode, setMode] = useState<Mode>("hidden");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (alreadyInstalled() || wasDismissed()) return;

    let showTimer: ReturnType<typeof setTimeout> | null = null;

    // Chromium path — capture the event, defer it, reveal our banner.
    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // stop the browser's own mini-infobar
      setDeferred(e as BeforeInstallPromptEvent);
      showTimer = setTimeout(() => setMode("android"), SHOW_DELAY_MS);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // If the app gets installed (any path), never show again.
    const onInstalled = () => {
      markDismissed();
      setMode("hidden");
    };
    window.addEventListener("appinstalled", onInstalled);

    // iOS path — no beforeinstallprompt ever fires, so show guided steps on a delay.
    let iosTimer: ReturnType<typeof setTimeout> | null = null;
    if (isIosSafari()) {
      iosTimer = setTimeout(() => setMode("ios"), SHOW_DELAY_MS);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      if (showTimer) clearTimeout(showTimer);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, []);

  function dismiss() {
    markDismissed();
    setMode("hidden");
  }

  async function install() {
    if (!deferred) return;
    try {
      await deferred.prompt();
      await deferred.userChoice; // 'accepted' | 'dismissed' — either way we're done
    } catch {
      /* prompt can only be called once; ignore double-invoke errors */
    }
    markDismissed();
    setDeferred(null);
    setMode("hidden");
  }

  if (mode === "hidden") return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        // Sit just below the cookie bar (z 365) so they don't overlap awkwardly.
        zIndex: 360,
        display: "flex",
        justifyContent: "center",
        padding: 16,
        paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
        pointerEvents: "none",
        animation: "fdslidein .3s ease",
      }}
    >
      <div
        className="frame"
        style={{
          pointerEvents: "auto",
          width: "min(96vw,520px)",
          padding: "18px 20px",
          display: "flex",
          alignItems: mode === "ios" ? "flex-start" : "center",
          gap: 16,
          flexWrap: "wrap",
          background: "linear-gradient(180deg,#1c1130,#140a24)",
          boxShadow: "0 18px 46px rgba(0,0,0,.55)",
        }}
      >
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
            <img
              src="/assets/brand/icon-192.png"
              alt=""
              width={26}
              height={26}
              style={{ borderRadius: 7, flex: "none" }}
            />
            <span style={{ font: "800 15px Cinzel,serif", color: "var(--gold-lt)" }}>
              Add FilipinoDama to your home screen
            </span>
          </div>
          {mode === "android" ? (
            <p style={{ margin: 0, font: "400 12.5px/1.55 Inter", color: "var(--ink)" }}>
              Install the app for a full-screen, one-tap experience — no app store needed.
            </p>
          ) : (
            <p style={{ margin: 0, font: "400 12.5px/1.6 Inter", color: "var(--ink)" }}>
              In Safari, tap the <strong style={{ color: "var(--gold-lt)" }}>Share</strong> button{" "}
              <span aria-hidden style={{ fontSize: 14 }}>⬆️</span>, then choose{" "}
              <strong style={{ color: "var(--gold-lt)" }}>“Add to Home Screen”</strong>.
            </p>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, flex: "none", flexWrap: "wrap" }}>
          <button
            className="btn"
            onClick={dismiss}
            style={{
              padding: "11px 18px",
              fontSize: 12,
              border: "1px solid rgba(232,184,75,.35)",
              background: "rgba(255,255,255,.04)",
              color: "#efe7fb",
            }}
          >
            {mode === "ios" ? "Got it" : "Not now"}
          </button>
          {mode === "android" && (
            <button className="btn btn-gold" onClick={install} style={{ padding: "11px 20px", fontSize: 12 }}>
              Install
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default InstallPrompt;
