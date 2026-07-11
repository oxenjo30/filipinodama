import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { useAppStore } from "../../stores/appStore";

export type Relationship = "self" | "friends" | "request-sent" | "request-received" | "none";

/**
 * FriendButton — state-aware friend action on a public profile.
 *  self       → render nothing
 *  bot        → render nothing (bots have no accept path)
 *  friends    → "Friends ✓" (disabled)
 *  request-sent     → "Request Sent" (disabled)
 *  request-received → "Accept Request" → POST /friends/request/:requestId/accept
 *  none       → "Add Friend" → POST /friends/request { toUserId }
 *  signed out → "Add Friend" that routes to /login?next=<current path>
 */
export function FriendButton({
  userId,
  relationship,
  requestId,
  isBot,
  signedIn,
}: {
  userId: string;
  relationship: Relationship;
  requestId?: string;
  isBot: boolean;
  signedIn: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const showToast = useAppStore((s) => s.showToast);
  const [rel, setRel] = useState<Relationship>(relationship);
  const [busy, setBusy] = useState(false);

  if (rel === "self" || isBot) return null;

  const base: React.CSSProperties = {
    padding: "10px 18px",
    borderRadius: 10,
    font: "700 13px Inter",
    cursor: "pointer",
    border: "1px solid var(--gold)",
  };

  if (!signedIn) {
    return (
      <button
        type="button"
        className="btn btn-gold"
        style={base}
        onClick={() => navigate(`/login?next=${encodeURIComponent(location.pathname)}`)}
      >
        Add Friend
      </button>
    );
  }

  if (rel === "friends") {
    return <button type="button" disabled style={{ ...base, opacity: 0.7, cursor: "default", background: "rgba(63,191,111,.15)", color: "#8ce0ad", borderColor: "rgba(63,191,111,.5)" }}>Friends ✓</button>;
  }
  if (rel === "request-sent") {
    return <button type="button" disabled style={{ ...base, opacity: 0.6, cursor: "default", background: "rgba(0,0,0,.3)", color: "var(--ink2)" }}>Request Sent</button>;
  }

  async function send() {
    setBusy(true);
    try {
      if (rel === "request-received" && requestId) {
        await api.post(`/api/friends/request/${requestId}/accept`, {});
        setRel("friends");
      } else {
        const res = await api.post<{ status: string }>("/api/friends/request", { toUserId: userId });
        setRel(res.status === "accepted" ? "friends" : "request-sent");
      }
    } catch (e) {
      // Surface the failure instead of a silent dead-end; state is left
      // unchanged so the button stays actionable. The server enforces the
      // real guards (e.g. can't friend a bot, already friends).
      showToast(e instanceof ApiError ? e.message : "Couldn't send friend request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="btn btn-gold" style={base} disabled={busy} onClick={send}>
      {rel === "request-received" ? "Accept Request" : "Add Friend"}
    </button>
  );
}

export default FriendButton;
