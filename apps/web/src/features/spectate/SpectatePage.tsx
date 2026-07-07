import { useNavigate } from "react-router-dom";
import { useAppStore } from "../../stores/appStore";

/**
 * SpectatePage — reproduced from the prototype's Spectate / Watch Live screen
 * (handoff/FilipinoDama Royal.dc.html, lines 704-769).
 *
 * The prototype renders a full "watching a live ranked match" view: two player
 * cards (Lakan vs Maganda), a live board, a move-history rail and a viewer
 * count. Those are prototype demo values — there is NO live-spectate backend
 * yet, so per the LIVE-DATA mandate we do NOT fabricate a match. Instead the
 * live-games list is an HONEST empty state ("No live matches to watch right
 * now") inside the same three-column Spectate shell, and every control routes
 * somewhere real. When a spectate backend lands, populated cards/board/history
 * slot into the same layout.
 */

/** bulb icon — matches the prototype's {{ icoBulb }} used in the info card. */
function BulbIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 18h6M10 21h4M12 3a6 6 0 0 1 4 10c-.7.7-1 1.4-1 2H9c0-.6-.3-1.3-1-2A6 6 0 0 1 12 3z" />
    </svg>
  );
}

export function SpectatePage() {
  const navigate = useNavigate();
  const showToast = useAppStore((s) => s.showToast);

  return (
    <div
      data-screen-label="Spectate"
      style={{
        maxWidth: 1560,
        margin: "0 auto",
        padding: "22px 26px 60px",
        display: "grid",
        gridTemplateColumns: "280px minmax(0,1fr) 300px",
        gap: 18,
        alignItems: "start",
      }}
    >
      {/* LEFT: stop watching + live-match list (honest empty) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <button className="btn btn-purple" onClick={() => navigate("/")} style={{ width: "100%" }}>
          ← Stop Watching
        </button>
        <div className="frame" style={{ padding: 16 }}>
          <div className="ptitle">Live Matches</div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              padding: "26px 12px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 30 }}>👁</div>
            <div style={{ font: "700 14px Cinzel,serif", color: "var(--gold-lt)" }}>
              No live matches
            </div>
            <div style={{ font: "400 12px/1.5 Inter", color: "var(--ink2)" }}>
              There are no live ranked games to watch right now.
            </div>
          </div>
        </div>
        <div className="frame" style={{ padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <span style={{ font: "600 12px Inter", color: "var(--ink)" }}>👁 Watching now</span>
          <span style={{ font: "800 15px 'JetBrains Mono',monospace", color: "var(--gold-lt)" }}>0</span>
        </div>
      </div>

      {/* CENTER: board area → honest empty state (no fake match) */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 15px",
              borderRadius: 100,
              border: "1px solid rgba(232,184,75,.3)",
              background: "rgba(15,8,32,.5)",
              font: "800 12px Inter",
              letterSpacing: "1.5px",
              color: "var(--ink2)",
            }}
          >
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--ink2)" }} />
            OFFLINE
          </span>
        </div>

        <div
          style={{
            position: "relative",
            width: "min(92vw,600px)",
            padding: "3.2%",
            borderRadius: 16,
            background: "linear-gradient(145deg,#f5d88a 0%,#d3a63c 45%,#8a5a1e 100%)",
            boxShadow:
              "0 0 0 1px rgba(0,0,0,.55),inset 0 2px 3px rgba(255,245,210,.55),inset 0 -4px 7px rgba(0,0,0,.4),0 22px 44px rgba(0,0,0,.55)",
          }}
        >
          <div
            style={{
              aspectRatio: "1 / 1",
              borderRadius: 8,
              background: "rgba(15,8,32,.55)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              padding: 24,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 40 }}>👁</div>
            <div style={{ font: "800 18px Cinzel,serif", color: "var(--gold-lt)" }}>
              No live matches to watch right now
            </div>
            <div style={{ font: "400 13px/1.5 Inter", color: "var(--ink)", maxWidth: 360 }}>
              Live spectating is coming with online play. When ranked matches go live,
              you'll be able to watch them unfold move by move right here.
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button className="btn btn-red" onClick={() => navigate("/play")}>
                ▶ Play a Match
              </button>
              <button
                className="btn btn-purple"
                onClick={() => showToast("No live matches to watch right now.")}
              >
                ↻ Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT: move history (empty) + spectator-mode info */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="frame" style={{ padding: 16 }}>
          <div className="ptitle">Move History</div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              padding: "24px 12px",
              textAlign: "center",
            }}
          >
            <div style={{ font: "700 13px Cinzel,serif", color: "var(--ink2)" }}>No moves yet</div>
            <div style={{ font: "400 12px/1.5 Inter", color: "var(--ink2)" }}>
              Moves appear here once you're watching a live match.
            </div>
          </div>
        </div>
        <div className="frame" style={{ padding: 16, display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ color: "var(--gold)", flex: "none" }}>
            <BulbIcon />
          </span>
          <div>
            <div
              style={{
                font: "700 12px Inter",
                letterSpacing: "1px",
                color: "var(--gold-lt)",
                textTransform: "uppercase",
                marginBottom: 5,
              }}
            >
              Spectator Mode
            </div>
            <div style={{ font: "400 13px/1.5 Inter", color: "var(--ink)" }}>
              Watch live ranked matches play out in real time — study the tactics and pick up
              new strategies. Live spectating turns on with online play.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SpectatePage;
