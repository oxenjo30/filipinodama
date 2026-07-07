import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { useAuthStore } from "../../stores/authStore";
import { useAppStore } from "../../stores/appStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useCosmeticsStore } from "../../stores/cosmeticsStore";

/**
 * SettingsPage (/settings) — faithful port of the approved prototype
 * (handoff lines 2110-2198), LIVE-wired to the real backend.
 *
 * Device-preference toggles (Sound / Music / Hints / Animation) are genuine
 * device preferences persisted in the zustand `settingsStore` (localStorage key
 * `fdr.settings`) — real local state, not fabricated data.
 *
 * Cosmetic toggles hit the REAL account (they must actually change what's
 * equipped, not just set dead local state):
 *   • Board Theme → PATCH /api/users/me/equip { board: <ownedBoardId> }
 *   • Piece Style → PATCH /api/users/me/equip { skin:  <ownedSkinId>  }
 * The offered options are ONLY the boards/skins the user actually owns, read
 * from GET /api/users/me/export (inventory) joined against GET /api/store/items
 * for names — exactly how InventoryPage derives them, so they never drift. The
 * equipped one is highlighted from me.equippedBoard / me.equippedSkin, and on
 * success we patchMe so the whole app reflects the real account. If the user
 * owns no alternate board/skin, the control is disabled with an honest hint.
 *
 * Account actions hit real endpoints:
 *   • Export My Data → GET  /api/users/me/export → triggers a JSON download
 *   • Privacy & Terms → navigate to /legal
 *   • Delete Account (typed DELETE confirm) → DELETE /api/users/me
 *     { confirm:"DELETE" } → logout + redirect home
 *
 * Logged-out (me === null) shows an honest sign-in prompt instead of crashing.
 */

type SettingKey = "setSound" | "setMusic" | "setHints" | "setAnim";

type Row = { key: SettingKey; label: string; opts: string[] };

const ROWS: Row[] = [
  { key: "setSound", label: "Sound Effects", opts: ["On", "Off"] },
  { key: "setMusic", label: "Background Music", opts: ["On", "Off"] },
  { key: "setHints", label: "Show Move Hints", opts: ["On", "Off"] },
  { key: "setAnim", label: "Animation Speed", opts: ["Off", "Normal", "Fast"] },
];

// ── catalog item shape from GET /api/store/items (only the fields we need) ──
type StoreItemApi = { id: string; type: "BOARD" | "SKIN" | "AVATAR" | "FRAME" | "EMOTE" | "BUNDLE" | "SEASON_PASS"; name: string };
// ── owned inventory line from GET /api/users/me/export ──
type InventoryLine = { itemId: string; equipped: boolean; acquiredAt: string };
// A resolved owned cosmetic ready to render in a segmented control.
type OwnedCosmetic = { id: string; name: string };

// Reproduces the prototype segS's per-option style (selected vs unselected).
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

// A settings frame row: a left-hand label + a right-hand segmented control.
function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="fd-setting-row"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "16px 0",
        borderTop: "1px solid rgba(232,184,75,.1)",
      }}
    >
      <span style={{ font: "600 15px Inter", color: "#efe7fb" }}>{label}</span>
      <div style={{ display: "flex", gap: 6, flex: "none", minWidth: 150, maxWidth: 260 }}>{children}</div>
    </div>
  );
}

// A cosmetic row (Board Theme / Piece Style) driven by REAL owned items.
//   • owned === null → still loading (honest "Loading…" hint, no dead buttons)
//   • fewer than 2 owned → nothing to switch to → disabled honest hint
//   • otherwise → one segment per owned item; the equipped one is highlighted
function CosmeticRow({
  label,
  owned,
  equippedId,
  busy,
  emptyHint,
  onSelect,
}: {
  label: string;
  owned: OwnedCosmetic[] | null;
  equippedId: string | null;
  busy: boolean;
  emptyHint: string;
  onSelect: (c: OwnedCosmetic) => void;
}) {
  const hint = (text: string) => (
    <span style={{ font: "500 12px Inter", color: "var(--ink2)", textAlign: "right" }}>{text}</span>
  );

  let control: React.ReactNode;
  if (owned === null) {
    control = hint("Loading…");
  } else if (owned.length < 2) {
    // With only the free default (or nothing), there's no alternate to equip.
    control = hint(emptyHint);
  } else {
    control = owned.map((c) => (
      <button
        key={c.id}
        type="button"
        disabled={busy}
        onClick={() => onSelect(c)}
        title={c.name}
        style={{
          ...segStyle(equippedId === c.id),
          opacity: busy ? 0.6 : 1,
          cursor: busy ? "wait" : "pointer",
          // Keep segments even on phones: allow shrink + ellipsis so a long
          // owned name never forces a ragged wrap into uneven rows.
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {c.name}
      </button>
    ));
  }

  return (
    <div
      className="fd-setting-row"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "16px 0",
        borderTop: "1px solid rgba(232,184,75,.1)",
      }}
    >
      <span style={{ font: "600 15px Inter", color: "#efe7fb" }}>{label}</span>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "flex-end",
          gap: 6,
          flex: "none",
          minWidth: 150,
          maxWidth: 260,
        }}
      >
        {control}
      </div>
    </div>
  );
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

  const me = useAuthStore((s) => s.me);
  const logout = useAuthStore((s) => s.logout);
  const patchMe = useAuthStore((s) => s.patchMe);

  const s = useSettingsStore();

  const [deleteShow, setDeleteShow] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Real owned cosmetics. null = still loading; [] = loaded, none owned.
  const [ownedBoards, setOwnedBoards] = useState<OwnedCosmetic[] | null>(null);
  const [ownedSkins, setOwnedSkins] = useState<OwnedCosmetic[] | null>(null);
  const [equipping, setEquipping] = useState<"board" | "skin" | null>(null);

  // Load the real catalog (for names) + the user's real inventory, then join —
  // exactly the derivation InventoryPage uses, so the offered boards/skins are
  // precisely the ones the account owns (never fabricated).
  useEffect(() => {
    if (!me) {
      setOwnedBoards(null);
      setOwnedSkins(null);
      return;
    }
    let alive = true;
    setOwnedBoards(null);
    setOwnedSkins(null);
    void (async () => {
      try {
        const [catalog, exportData] = await Promise.all([
          api.get<{ items: StoreItemApi[] }>("/api/store/items"),
          api.get<{ inventory: InventoryLine[] }>("/api/users/me/export"),
        ]);
        if (!alive) return;
        const byId = new Map(catalog.items.map((it) => [it.id, it]));
        const boards: OwnedCosmetic[] = [];
        const skins: OwnedCosmetic[] = [];
        for (const line of exportData.inventory) {
          const it = byId.get(line.itemId);
          if (!it) continue;
          if (it.type === "BOARD") boards.push({ id: it.id, name: it.name });
          else if (it.type === "SKIN") skins.push({ id: it.id, name: it.name });
        }
        setOwnedBoards(boards);
        setOwnedSkins(skins);
      } catch {
        if (alive) {
          // Honest empty state on failure — the control disables itself.
          setOwnedBoards([]);
          setOwnedSkins([]);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [me]);

  // Map each device-preference row's key to the live value + setter from the store.
  const selected = (key: SettingKey): string => {
    switch (key) {
      case "setSound":
        return s.sound ? "On" : "Off";
      case "setMusic":
        return s.music ? "On" : "Off";
      case "setHints":
        return s.hints ? "On" : "Off";
      case "setAnim":
        return s.animPref;
    }
  };

  const choose = (key: SettingKey, value: string) => {
    switch (key) {
      case "setSound":
        s.setSound(value === "On");
        break;
      case "setMusic":
        s.setMusic(value === "On");
        break;
      case "setHints":
        s.setHints(value === "On");
        break;
      case "setAnim":
        s.setAnimPref(value as typeof s.animPref);
        break;
    }
  };

  // Equip an owned board/skin against the REAL account. The server verifies
  // ownership + slot type; the returned user carries the fresh equipped ids,
  // which we mirror into the auth store so the whole app reflects it.
  const equipCosmetic = async (slot: "board" | "skin", id: string, name: string) => {
    if (equipping) return;
    const current = slot === "board" ? me?.equippedBoard : me?.equippedSkin;
    if (current === id) return; // already equipped — no-op
    setEquipping(slot);
    try {
      const res = await api.patch<{ user: { equippedBoard: string | null; equippedSkin: string | null } }>(
        "/api/users/me/equip",
        { [slot]: id },
      );
      patchMe({ equippedBoard: res.user.equippedBoard, equippedSkin: res.user.equippedSkin });
      // Immediately reflect the equipped skin/board into the live game settings
      // so the board + pieces update without waiting for a reload. Item ids →
      // art keys via the shared cosmetics catalog.
      const cosmetics = useCosmeticsStore.getState();
      void cosmetics.load();
      if (slot === "skin") {
        s.setSkin(cosmetics.skinKey(res.user.equippedSkin) as Parameters<typeof s.setSkin>[0]);
      } else {
        const boardKey = cosmetics.boardKey(res.user.equippedBoard);
        if (boardKey) s.setBoardTheme(boardKey as Parameters<typeof s.setBoardTheme>[0]);
      }
      showToast(`${name} equipped!`);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : "Couldn't equip that. Try again.");
    } finally {
      setEquipping(null);
    }
  };

  const deleteReady = deleteConfirm.trim().toUpperCase() === "DELETE";

  const closeDelete = () => {
    if (deleting) return;
    setDeleteShow(false);
    setDeleteConfirm("");
  };

  const exportData = async () => {
    if (!me || exporting) return;
    setExporting(true);
    try {
      const data = await api.get<unknown>("/api/users/me/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `filipinodama-data-${me.tag.replace(/[^a-z0-9]/gi, "") || "account"}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast("Your data export has downloaded.");
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : "Couldn't export your data. Try again.");
    } finally {
      setExporting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteReady || deleting) return;
    setDeleting(true);
    try {
      await api.del("/api/users/me", { confirm: "DELETE" });
      await logout();
      setDeleteShow(false);
      setDeleteConfirm("");
      showToast("Your account has been deleted.");
      navigate("/");
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : "Couldn't delete your account. Try again.");
      setDeleting(false);
    }
  };

  // ── Logged-out guard: honest sign-in prompt, never crash ──
  if (!me) {
    return (
      <div className="fd-page-pad" style={{ maxWidth: 640, margin: "0 auto", padding: 26 }}>
        <div style={{ textAlign: "center", margin: "6px 0 24px" }}>
          <div
            style={{ font: "700 12px Inter", letterSpacing: 2, textTransform: "uppercase", color: "var(--gold)" }}
          >
            Preferences
          </div>
          <h1 style={{ margin: "8px 0 0", font: "800 32px Cinzel,serif", color: "var(--gold-lt)" }}>Settings</h1>
        </div>
        <div className="frame" style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>🔒</div>
          <p style={{ margin: "0 0 20px", font: "500 15px/1.6 Inter", color: "var(--ink)" }}>
            Sign in to manage your preferences and account.
          </p>
          <button
            type="button"
            className="btn btn-gold"
            onClick={() => navigate("/login")}
            style={{ padding: "12px 26px" }}
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div data-screen-label="Settings" className="fd-page-pad" style={{ maxWidth: 640, margin: "0 auto", padding: 26 }}>
        <div style={{ textAlign: "center", margin: "6px 0 24px" }}>
          <div
            style={{ font: "700 12px Inter", letterSpacing: 2, textTransform: "uppercase", color: "var(--gold)" }}
          >
            Preferences
          </div>
          <h1 style={{ margin: "8px 0 0", font: "800 32px Cinzel,serif", color: "var(--gold-lt)" }}>Settings</h1>
        </div>

        {/* Preference toggles */}
        <div className="frame" style={{ padding: "10px 22px" }}>
          {/* Device preferences (Sound / Music / Hints) — persisted locally. */}
          {ROWS.filter((r) => r.key !== "setAnim").map((row) => (
            <SettingRow key={row.key} label={row.label}>
              {row.opts.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => choose(row.key, o)}
                  style={segStyle(selected(row.key) === o)}
                >
                  {o}
                </button>
              ))}
            </SettingRow>
          ))}

          {/* Board Theme — equips a REAL owned board on the account. */}
          <CosmeticRow
            label="Board Theme"
            owned={ownedBoards}
            equippedId={me.equippedBoard}
            busy={equipping === "board"}
            emptyHint="Buy a board in the Store to unlock themes"
            onSelect={(c) => equipCosmetic("board", c.id, c.name)}
          />

          {/* Piece Style — equips a REAL owned skin on the account. */}
          <CosmeticRow
            label="Piece Style"
            owned={ownedSkins}
            equippedId={me.equippedSkin}
            busy={equipping === "skin"}
            emptyHint="Buy a piece skin in the Store to unlock styles"
            onSelect={(c) => equipCosmetic("skin", c.id, c.name)}
          />

          {/* Animation Speed — persisted locally. */}
          {ROWS.filter((r) => r.key === "setAnim").map((row) => (
            <SettingRow key={row.key} label={row.label}>
              {row.opts.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => choose(row.key, o)}
                  style={segStyle(selected(row.key) === o)}
                >
                  {o}
                </button>
              ))}
            </SettingRow>
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
              onClick={exportData}
              disabled={exporting}
              style={{
                ...ACCOUNT_BTN,
                border: "1px solid rgba(232,184,75,.18)",
                background: "rgba(0,0,0,.2)",
                opacity: exporting ? 0.6 : 1,
                cursor: exporting ? "wait" : "pointer",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 18 }}>🗂️</span>
                <span style={{ textAlign: "left" }}>
                  <span style={{ display: "block", font: "700 14px Inter", color: "#efe7fb" }}>
                    {exporting ? "Preparing…" : "Export My Data"}
                  </span>
                  <span style={{ font: "500 11px Inter", color: "var(--ink2)" }}>
                    Download a copy of your account data
                  </span>
                </span>
              </span>
              <span style={{ color: "var(--ink2)" }}>›</span>
            </button>

            <button
              type="button"
              onClick={() => navigate("/legal")}
              style={{
                ...ACCOUNT_BTN,
                border: "1px solid rgba(232,184,75,.18)",
                background: "rgba(0,0,0,.2)",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 18 }}>🔒</span>
                <span style={{ textAlign: "left" }}>
                  <span style={{ display: "block", font: "700 14px Inter", color: "#efe7fb" }}>
                    Privacy &amp; Terms
                  </span>
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
          className="fd-sheet-overlay"
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
            className="fd-sheet"
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
                  disabled={deleting}
                  className="fd-nozoom"
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
              <div className="fd-sheet-actions" style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  onClick={closeDelete}
                  disabled={deleting}
                  style={{
                    flex: 1,
                    padding: 13,
                    borderRadius: 10,
                    border: "1px solid rgba(232,184,75,.25)",
                    background: "rgba(15,8,32,.5)",
                    color: "var(--ink)",
                    font: "700 13px Inter",
                    cursor: deleting ? "not-allowed" : "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  disabled={!deleteReady || deleting}
                  style={{
                    flex: 1,
                    padding: 13,
                    borderRadius: 10,
                    border: `1px solid ${deleteReady && !deleting ? "rgba(232,93,115,.9)" : "rgba(232,93,115,.25)"}`,
                    background:
                      deleteReady && !deleting
                        ? "linear-gradient(180deg,#c94257,#8a1f30)"
                        : "rgba(232,93,115,.08)",
                    color: deleteReady && !deleting ? "#fff" : "rgba(255,131,152,.5)",
                    font: "800 13px Inter",
                    letterSpacing: ".4px",
                    cursor: deleteReady && !deleting ? "pointer" : "not-allowed",
                  }}
                >
                  {deleting ? "Deleting…" : "Delete Forever"}
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
