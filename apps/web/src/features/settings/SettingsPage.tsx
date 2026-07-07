import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../../stores/appStore";

/**
 * SettingsPage (/settings) — ported faithfully from the approved prototype
 * (handoff lines 2110-2198, settingsRows at line 3799).
 *
 * The prototype drives each row through a segmented control (`segS`) bound to
 * component state (setSound / setMusic / setHints / setBoard / setPiece /
 * setAnim). Here those become REAL local React state so the toggles actually
 * toggle and reflect the selected option's gold-highlighted styling — these are
 * genuine UI preferences, not fabricated activity data.
 *
 * Account actions are destructive/backend operations we have no server for yet:
 * Export My Data and Privacy & Terms and the final delete confirmation all route
 * to a toast (STALE-DATA / NO-DEAD-CONTROLS rules). Delete Account opens the
 * typed-confirm modal exactly as the prototype does; "Delete Forever" only
 * enables once the user types DELETE, then fires the toast.
 *
 * NOTE ON "language": the screen brief mentions a language row, but the
 * owner-approved prototype's actual `settingsRows` array (line 3799) contains no
 * language control — reproducing it faithfully means the 6 rows below and no
 * invented 7th. (The sc-for hint-placeholder-count of 7 is a loose hint, not the
 * real data.)
 */

type SettingKey = "setSound" | "setMusic" | "setHints" | "setBoard" | "setPiece" | "setAnim";

type Row = { key: SettingKey; label: string; opts: string[] };

const ROWS: Row[] = [
  { key: "setSound", label: "Sound Effects", opts: ["On", "Off"] },
  { key: "setMusic", label: "Background Music", opts: ["On", "Off"] },
  { key: "setHints", label: "Show Move Hints", opts: ["On", "Off"] },
  { key: "setBoard", label: "Board Theme", opts: ["Marble", "Aubergine", "Walnut"] },
  { key: "setPiece", label: "Piece Style", opts: ["Gem", "Classic", "Flat"] },
  { key: "setAnim", label: "Animation Speed", opts: ["Off", "Normal", "Fast"] },
];

// Default selections mirror the prototype's implicit initial state.
const DEFAULTS: Record<SettingKey, string> = {
  setSound: "On",
  setMusic: "On",
  setHints: "On",
  setBoard: "Marble",
  setPiece: "Gem",
  setAnim: "Normal",
};

// Reproduces segS's per-option style (selected vs unselected).
function segStyle(selected: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    border: `1px solid ${selected ? "var(--gold)" : "rgba(232,184,75,.2)"}`,
    background: selected ? "rgba(232,184,75,.15)" : "transparent",
    color: selected ? "var(--gold-lt)" : "var(--ink)",
    font: "700 12px Inter",
    letterSpacing: ".5px",
    cursor: "pointer",
  };
}

const ACCOUNT_BTN: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "14px 16px",
  borderRadius: 11,
  cursor: "pointer",
};

export function SettingsPage() {
  const navigate = useNavigate();
  const showToast = useAppStore((s) => s.showToast);

  const [prefs, setPrefs] = useState<Record<SettingKey, string>>(DEFAULTS);
  const [deleteShow, setDeleteShow] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const setPref = (key: SettingKey, value: string) => setPrefs((p) => ({ ...p, [key]: value }));

  const deleteReady = deleteConfirm.trim().toUpperCase() === "DELETE";

  const closeDelete = () => {
    setDeleteShow(false);
    setDeleteConfirm("");
  };

  const confirmDelete = () => {
    if (!deleteReady) return;
    closeDelete();
    showToast("Account deletion arrives with online play.");
  };

  return (
    <>
      <div data-screen-label="Settings" style={{ maxWidth: 640, margin: "0 auto", padding: 26 }}>
        <div style={{ textAlign: "center", margin: "6px 0 24px" }}>
          <div
            style={{
              font: "700 12px Inter",
              letterSpacing: 2,
              textTransform: "uppercase",
              color: "var(--gold)",
            }}
          >
            Preferences
          </div>
          <h1 style={{ margin: "8px 0 0", font: "800 32px Cinzel,serif", color: "var(--gold-lt)" }}>Settings</h1>
        </div>

        {/* Preference toggles */}
        <div className="frame" style={{ padding: "10px 22px" }}>
          {ROWS.map((row) => (
            <div
              key={row.key}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                padding: "16px 0",
                borderTop: "1px solid rgba(232,184,75,.1)",
              }}
            >
              <span style={{ font: "600 15px Inter", color: "#efe7fb" }}>{row.label}</span>
              <div style={{ display: "flex", gap: 6, flex: "none", minWidth: 150, maxWidth: 260 }}>
                {row.opts.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setPref(row.key, o)}
                    style={segStyle(prefs[row.key] === o)}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Account */}
        <div className="frame" style={{ padding: 22, marginTop: 18 }}>
          <div className="ptitle" style={{ textAlign: "left" }}>
            Account
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              type="button"
              onClick={() => showToast("Data export arrives with online play.")}
              style={{
                ...ACCOUNT_BTN,
                border: "1px solid rgba(232,184,75,.18)",
                background: "rgba(0,0,0,.2)",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 18 }}>🗂️</span>
                <span style={{ textAlign: "left" }}>
                  <span style={{ display: "block", font: "700 14px Inter", color: "#efe7fb" }}>Export My Data</span>
                  <span style={{ font: "500 11px Inter", color: "var(--ink2)" }}>
                    Download a copy of your account data
                  </span>
                </span>
              </span>
              <span style={{ color: "var(--ink2)" }}>›</span>
            </button>

            <button
              type="button"
              onClick={() => showToast("Privacy & Terms arrive with online play.")}
              style={{
                ...ACCOUNT_BTN,
                border: "1px solid rgba(232,184,75,.18)",
                background: "rgba(0,0,0,.2)",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 18 }}>🔒</span>
                <span style={{ textAlign: "left" }}>
                  <span style={{ display: "block", font: "700 14px Inter", color: "#efe7fb" }}>Privacy &amp; Terms</span>
                  <span style={{ font: "500 11px Inter", color: "var(--ink2)" }}>Review our policies</span>
                </span>
              </span>
              <span style={{ color: "var(--ink2)" }}>›</span>
            </button>

            <button
              type="button"
              onClick={() => setDeleteShow(true)}
              style={{
                ...ACCOUNT_BTN,
                border: "1px solid rgba(232,93,115,.4)",
                background: "rgba(232,93,115,.08)",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 18 }}>⚠️</span>
                <span style={{ textAlign: "left" }}>
                  <span style={{ display: "block", font: "700 14px Inter", color: "#ff8398" }}>Delete Account</span>
                  <span style={{ font: "500 11px Inter", color: "rgba(255,131,152,.7)" }}>
                    Permanently erase your account and data
                  </span>
                </span>
              </span>
              <span style={{ color: "#ff8398" }}>›</span>
            </button>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 18 }}>
          <button
            type="button"
            className="btn btn-purple"
            onClick={() => navigate("/profile")}
            style={{ padding: "12px 26px" }}
          >
            Back to Profile
          </button>
        </div>
      </div>

      {/* Delete Account modal */}
      {deleteShow && (
        <div
          onClick={closeDelete}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 90,
            background: "rgba(8,4,18,.78)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 440,
              borderRadius: 18,
              border: "1px solid rgba(232,93,115,.45)",
              background: "linear-gradient(180deg,#25121d,#1a0d18)",
              boxShadow: "0 30px 80px rgba(0,0,0,.65)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "24px 26px 18px",
                textAlign: "center",
                borderBottom: "1px solid rgba(232,93,115,.2)",
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  margin: "0 auto 12px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(232,93,115,.14)",
                  border: "1px solid rgba(232,93,115,.4)",
                  fontSize: 26,
                }}
              >
                ⚠️
              </div>
              <div style={{ font: "800 20px Cinzel,serif", color: "#ff8398" }}>Delete Your Account?</div>
            </div>
            <div style={{ padding: "22px 26px", display: "flex", flexDirection: "column", gap: 16 }}>
              <p style={{ margin: 0, font: "400 13.5px/1.6 Inter", color: "var(--ink)", textWrap: "pretty" }}>
                This permanently erases your profile, stats, match history, trophies, lessons, friends, and guild
                membership. <b style={{ color: "#ff8398" }}>This cannot be undone.</b>
              </p>
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 10,
                  background: "rgba(0,0,0,.28)",
                  border: "1px solid rgba(232,184,75,.14)",
                  font: "400 12px/1.55 Inter",
                  color: "var(--ink2)",
                }}
              >
                Any active purchases are handled by the App Store or Google Play. Deletion completes within 30 days per
                our Privacy Policy.
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    font: "700 11px Inter",
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    color: "var(--ink2)",
                    marginBottom: 8,
                  }}
                >
                  Type <b style={{ color: "#ff8398" }}>DELETE</b> to confirm
                </label>
                <input
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder="DELETE"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "12px 14px",
                    borderRadius: 10,
                    border: "1px solid rgba(232,93,115,.35)",
                    background: "rgba(0,0,0,.3)",
                    color: "#fff",
                    font: "700 15px 'JetBrains Mono',monospace",
                    letterSpacing: 2,
                    textAlign: "center",
                    outline: "none",
                  }}
                />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  onClick={closeDelete}
                  style={{
                    flex: 1,
                    padding: 13,
                    borderRadius: 10,
                    border: "1px solid rgba(232,184,75,.25)",
                    background: "rgba(15,8,32,.5)",
                    color: "var(--ink)",
                    font: "700 13px Inter",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  disabled={!deleteReady}
                  style={{
                    flex: 1,
                    padding: 13,
                    borderRadius: 10,
                    border: `1px solid ${deleteReady ? "rgba(232,93,115,.9)" : "rgba(232,93,115,.25)"}`,
                    background: deleteReady ? "linear-gradient(180deg,#c94257,#8a1f30)" : "rgba(232,93,115,.08)",
                    color: deleteReady ? "#fff" : "rgba(255,131,152,.5)",
                    font: "800 13px Inter",
                    letterSpacing: ".4px",
                    cursor: deleteReady ? "pointer" : "not-allowed",
                  }}
                >
                  Delete Forever
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default SettingsPage;
