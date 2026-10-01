import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export const CONSENT_KEY = "fdr.consent.v2";
export const CONSENT_SETTINGS_EVENT = "fdr:consent-settings";
const GA_ID = "G-48RNYS7P4C";
type Choice = "all" | "necessary";
type Tracker = ((...args: unknown[]) => void);
type TrackingWindow = Window & { dataLayer?: unknown[][]; gtag?: Tracker };
let choice: Choice | null = null;
let initialized = false;
let lastPage: string | null = null;

export function readConsent(): Choice | null {
  if (typeof window === "undefined") return null;
  if (choice !== null) return choice;
  try {
    const saved = window.localStorage.getItem(CONSENT_KEY);
    return saved === "all" || saved === "necessary" ? saved : choice;
  } catch { return choice; }
}

function clearTrackingCookies() {
  const domains = window.location.hostname.split(".");
  const scopes = ["", ...domains.map((_, index) => `; domain=${domains.slice(index).join(".")}`)];
  const parts = window.location.pathname.split("/");
  const paths = ["/", ...parts.map((_, index) => parts.slice(0, index + 1).join("/") || "/")];
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.trim().split("=")[0];
    if (!/^(_ga(?:_|$)|_gid$|_gat(?:_|$)|_fbp$|_fbc$)/.test(name)) continue;
    for (const scope of scopes) for (const path of paths) {
      document.cookie = `${name}=; Max-Age=0; path=${path}${scope}; SameSite=Lax`;
    }
  }
}

export function saveConsent(next: Choice) {
  choice = next;
  let saved = false;
  try { window.localStorage.setItem(CONSENT_KEY, next); saved = true; } catch {
    // Remove a stale grant if storage still allows deletion. The explicit session
    // choice always wins, even if reading storage succeeds but writing fails.
    if (next === "necessary") { try { window.localStorage.removeItem(CONSENT_KEY); } catch { /* Storage unavailable. */ } }
  }
  if (next === "necessary") {
    const target = window as TrackingWindow;
    (window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`] = true;
    target.gtag?.("consent", "update", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    clearTrackingCookies();
    // Unload third-party code after withdrawing a previously granted choice.
    if (initialized && saved) window.location.reload();
  }
  window.dispatchEvent(new Event("fdr:consent-changed"));
}

export function openConsentSettings() {
  window.dispatchEvent(new Event(CONSENT_SETTINGS_EVENT));
}

function trackPage() {
  const publicPage = /^\/(?:$|learn\/?$|blog(?:\/[a-z0-9-]+)?\/?$|about\/?$|contact\/?$|privacy\/?$|terms\/?$|community\/?$|anti-cheat\/?$)/.test(window.location.pathname) && !window.location.search && !window.location.hash;
  if (readConsent() !== "all" || !publicPage) {
    (window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`] = true;
    clearTrackingCookies();
    return;
  }
  const target = window as TrackingWindow;
  (window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`] = false;
  if (!initialized) {
    initialized = true;
    target.dataLayer = target.dataLayer || [];
    target.gtag = (...args: unknown[]) => { target.dataLayer!.push(args); };
    target.gtag("consent", "default", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    target.gtag("js", new Date());
    target.gtag("set", { page_location: `${window.location.origin}/`, page_referrer: "", page_title: "FilipinoDama" });
    target.gtag("config", GA_ID, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, page_location: `${window.location.origin}/`, page_referrer: "", page_title: "FilipinoDama" });
    const script = document.createElement("script");
    script.async = true; script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.appendChild(script);
  }
  target.gtag?.("consent", "update", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
  const path = window.location.pathname;
  if (path === lastPage) return;
  lastPage = path;
  // The explicit Analytics page location excludes query parameters.
  target.gtag?.("event", "page_view", { page_location: `${window.location.origin}${path}`, page_path: path, page_referrer: "", page_title: "FilipinoDama" });
}

export function ConsentTracking() {
  const { pathname, search, hash } = useLocation();
  useEffect(() => {
    trackPage();
    const onChange = () => trackPage();
    window.addEventListener("fdr:consent-changed", onChange);
    return () => window.removeEventListener("fdr:consent-changed", onChange);
  }, [pathname, search, hash]);
  return null;
}
