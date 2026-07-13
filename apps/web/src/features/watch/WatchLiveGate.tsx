import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../../lib/api";
import { WatchPage } from "./WatchPage";

/**
 * WatchLiveGate — owner directive 2026-07-12: HIDE the Watch Live PAGE
 * (reversibly) behind the WATCH_LIVE_ENABLED public config flag.
 *
 * Wraps the /watch route in App.tsx. Reads the same unauthenticated
 * GET /api/config/public that AppLayout uses for the maintenance banner /
 * daily-login gate; semantics are SAFE-OFF: only an explicit "true" renders
 * WatchPage — a missing key, a "false" value, or a failed fetch all redirect
 * to /play. Renders nothing while the flag is in flight so an enabled page
 * doesn't get bounced by a premature redirect.
 *
 * Deliberately NOT gated here: the actual spectate flows the Watch page links
 * into — /play/online?spectate=<id> and /rooms?code=X&spectate=1 — which must
 * keep working from direct/shared links, plus GET /api/matches/live itself.
 * WatchPage stays fully intact (hidden, not deleted): flipping the
 * WATCH_LIVE_ENABLED Config row in Admin → Settings → Config restores it
 * without a deploy.
 */
export function WatchLiveGate() {
  // null = flag still loading; boolean = resolved.
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ WATCH_LIVE_ENABLED?: string }>("/api/config/public")
      .then((cfg) => {
        if (!cancelled) setEnabled(cfg?.WATCH_LIVE_ENABLED === "true");
      })
      .catch(() => {
        if (!cancelled) setEnabled(false); // unreachable config = safe-off
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (enabled === null) return null;
  return enabled ? <WatchPage /> : <Navigate to="/play" replace />;
}
