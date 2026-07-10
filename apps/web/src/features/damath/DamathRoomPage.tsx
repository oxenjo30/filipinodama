import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { DamathPlayerId, DamathVariant } from "@dama/shared";
import { EV } from "@dama/shared";
import { Button } from "../../components";
import { useAppStore } from "../../stores/appStore";
import { useAuthStore } from "../../stores/authStore";
import { connectSocket, getSocket } from "../../lib/socket";
import { useDamathOnlineStore } from "../../stores/damathOnlineStore";
import { variantInfo } from "./variants";

type RoomMember = { userId: string; name: string; avatarUrl: string | null; tag: string } | null;
type RoomSnapshot = {
  code: string;
  hostId: string;
  host: RoomMember;
  guest: RoomMember;
  variant: DamathVariant;
  matchId: string | null;
  error?: string;
  closed?: boolean;
};

const goldHeading: React.CSSProperties = {
  background: "linear-gradient(180deg,#f7e2a0,#d5a63a)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
};

/**
 * DamathRoomPage — private Math Dama room. Host creates a room (6-char code),
 * shares it, a friend joins by code, host starts → both drop into the online
 * board on two devices. Built on the Damath room socket events + the Damath
 * match loop; Classic's rooms are untouched.
 */
export function DamathRoomPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const variant = (params.get("variant") as DamathVariant) || "whole";
  const showToast = useAppStore((s) => s.showToast);
  const myId = useAuthStore((s) => s.me?.id ?? null);
  const attachMatch = useDamathOnlineStore((s) => s.attachMatch);

  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const wired = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await connectSocket();
      } catch {
        if (!cancelled) setError("Sign in to play private Math Dama.");
        return;
      }
      const s = getSocket();
      if (!wired.current) {
        wired.current = true;
        s.on(EV.damathRoomState, (snap: RoomSnapshot) => {
          if (snap.closed) {
            setRoom(null);
            showToast("The room was closed.");
            return;
          }
          if (snap.error) {
            setError(snap.error === "not-found" ? "No room with that code." : snap.error === "full" ? "That room is full." : snap.error);
            return;
          }
          setError(null);
          setRoom(snap);
        });
        s.on(
          EV.damathRoomStart,
          (p: { matchId: string; yourColor: DamathPlayerId; variant: DamathVariant }) => {
            void attachMatch(p.matchId, p.yourColor, p.variant);
            navigate("/damath/online?from=room");
          },
        );
      }
    })();
    return () => {
      cancelled = true;
      // Leaving the page tears the room down (host) / drops the guest.
      try {
        getSocket().emit(EV.damathRoomLeave);
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = () => {
    try {
      getSocket().emit(EV.damathRoomCreate, { variant });
    } catch {
      setError("Couldn't reach the server.");
    }
  };
  const join = () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) return;
    try {
      getSocket().emit(EV.damathRoomJoin, { code });
    } catch {
      setError("Couldn't reach the server.");
    }
  };
  const start = () => {
    try {
      getSocket().emit(EV.damathRoomStart);
    } catch {
      setError("Couldn't reach the server.");
    }
  };

  const iAmHost = !!room && !!myId && myId === room.hostId;
  const info = variantInfo(variant);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 26px 60px" }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ font: "700 12px Inter", letterSpacing: 3, color: "var(--gold)" }}>✦ PRIVATE MATCH ✦</div>
        <h1 style={{ margin: "10px 0 6px", font: "800 clamp(26px,4vw,36px) Cinzel,serif" }}>
          <span style={goldHeading}>Math Dama · Private Room</span>
        </h1>
        <p style={{ font: "400 14px Inter", color: "var(--ink)", margin: 0 }}>
          {info?.label ?? "Whole"} · Invite a friend with a code and play on two devices.
        </p>
      </div>

      {error && (
        <div style={{ textAlign: "center", marginBottom: 16, color: "#f27a86", font: "600 13px Inter" }}>{error}</div>
      )}

      {!room ? (
        <div style={{ display: "grid", gap: 16 }}>
          <div className="frame" style={{ padding: 22, textAlign: "center" }}>
            <div className="ptitle">Host a room</div>
            <p style={{ font: "400 13px Inter", color: "var(--ink)", margin: "6px 0 16px" }}>
              Create a room and share the code with your friend.
            </p>
            <Button variant="gold" onClick={create}>Create Room</Button>
          </div>
          <div className="frame" style={{ padding: 22, textAlign: "center" }}>
            <div className="ptitle">Join a room</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12, flexWrap: "wrap" }}>
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && join()}
                placeholder="ENTER CODE"
                maxLength={6}
                style={{
                  padding: "12px 16px",
                  borderRadius: 8,
                  border: "1px solid rgba(232,184,75,.35)",
                  background: "rgba(0,0,0,.3)",
                  color: "#fff",
                  font: "700 16px 'JetBrains Mono',monospace",
                  letterSpacing: 3,
                  textAlign: "center",
                  width: 180,
                }}
              />
              <Button variant="purple" onClick={join}>Join</Button>
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <button onClick={() => navigate("/damath")} style={backBtn}>← Back</button>
          </div>
        </div>
      ) : (
        <div className="frame" style={{ padding: 24 }}>
          <div style={{ textAlign: "center", marginBottom: 18 }}>
            <div style={{ font: "600 12px Inter", letterSpacing: 1, color: "var(--ink2)", textTransform: "uppercase" }}>Room Code</div>
            <div style={{ font: "800 34px 'JetBrains Mono',monospace", letterSpacing: 6, color: "var(--gold-lt)", margin: "6px 0" }}>
              {room.code}
            </div>
            <button
              onClick={() => { void navigator.clipboard?.writeText(room.code); showToast("Code copied."); }}
              style={{ ...backBtn, padding: "8px 16px" }}
            >
              Copy code
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
            <Seat label="Host (Red)" member={room.host} />
            <Seat label="Guest (Blue)" member={room.guest} waiting="Waiting for a friend…" />
          </div>

          {iAmHost ? (
            <Button variant="gold" block disabled={!room.guest} onClick={start}>
              {room.guest ? "Start Match" : "Waiting for guest…"}
            </Button>
          ) : (
            <div style={{ textAlign: "center", font: "600 13px Inter", color: "var(--ink)" }}>
              Waiting for the host to start…
            </div>
          )}
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <button onClick={() => { getSocket().emit(EV.damathRoomLeave); setRoom(null); }} style={backBtn}>
              Leave room
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Seat({ label, member, waiting }: { label: string; member: RoomMember; waiting?: string }) {
  return (
    <div style={{ padding: "16px 12px", borderRadius: 10, border: "1px solid rgba(232,184,75,.2)", background: "rgba(0,0,0,.25)", textAlign: "center" }}>
      <div style={{ font: "600 11px Inter", letterSpacing: 1, color: "var(--ink2)", textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
      {member ? (
        <div style={{ font: "700 15px Cinzel,serif", color: "var(--gold-lt)" }}>{member.name}</div>
      ) : (
        <div style={{ font: "500 12px Inter", color: "var(--ink2)" }}>{waiting ?? "—"}</div>
      )}
    </div>
  );
}

const backBtn: React.CSSProperties = {
  padding: "12px 22px",
  borderRadius: 8,
  border: "1px solid rgba(232,184,75,.35)",
  background: "rgba(15,8,32,.5)",
  color: "var(--gold-lt)",
  font: "700 12px Inter",
  letterSpacing: 1,
  textTransform: "uppercase",
  cursor: "pointer",
};

export default DamathRoomPage;
