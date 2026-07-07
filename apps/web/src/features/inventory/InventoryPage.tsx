import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { useAppStore } from "../../stores/appStore";
import { useAuthStore } from "../../stores/authStore";
import { StorePreviewModal, type StorePreview } from "../store/StorePreviewModal";

/**
 * InventoryPage — reproduced verbatim from the prototype's Inventory / Locker
 * screen (handoff/FilipinoDama Royal.dc.html, lines 1152-1183): a header
 * (eyebrow + title + blurb + "Go to Store" button) followed by category-grouped
 * frames, each holding a grid of owned-cosmetic cards. Every card is a thumb +
 * name + sub-label + an equip/equipped button (plus a "Preview Animation" link
 * where the item has a preview).
 *
 * FULLY LIVE-WIRED — there is NO hardcoded collection:
 *   - The owned cosmetics come from the authed user's real inventory
 *     (GET /api/users/me/export → inventory[], the only inventory read exposed
 *     over REST). A brand-new user with nothing owned gets an honest empty state.
 *   - Item metadata (type, name) is joined from the real catalog
 *     (GET /api/store/items) by itemId — never fabricated.
 *   - Equipped state is read from the real account (me.equippedBoard /
 *     me.equippedSkin / me.frameId). Equip → PATCH /api/users/me/equip
 *     { board? | skin? | frame? } (server verifies ownership); on success we
 *     update the auth store so the equipped badge reflects the real account.
 *   - Logged out (me === null): we show a sign-in prompt, never crash.
 */

const A = (n: string) => `/assets/${n}`;

// ── catalog item shape from GET /api/store/items ──
type StoreItemApi = {
  id: string;
  type: "BOARD" | "SKIN" | "AVATAR" | "FRAME" | "EMOTE" | "BUNDLE" | "SEASON_PASS";
  name: string;
  description: string | null;
  priceGold: number | null;
  priceDiamonds: number | null;
  assetKey: string;
  previewKey: string | null;
  isPremium: boolean;
  sortOrder: number;
};

// ── owned inventory line from GET /api/users/me/export ──
type InventoryLine = { itemId: string; equipped: boolean; acquiredAt: string };

// ── thumbnails (portraits are opaque → masked circle + brightness lift) ──
type Thumb = { kind: "img"; file: string } | { kind: "portrait"; file: string };

function ImgThumb({ file, size }: { file: string; size: number }) {
  return <img src={A(file)} alt="" style={{ width: size, height: size, objectFit: "contain", filter: "drop-shadow(0 6px 14px rgba(0,0,0,.5))" }} />;
}
function PortraitThumb({ file, size }: { file: string; size: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", flex: "none", border: "1px solid rgba(232,184,75,.4)", background: "#0f0820" }}>
      <img src={A(file)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(1.25)" }} />
    </div>
  );
}
function renderThumb(t: Thumb, size: number): ReactNode {
  if (t.kind === "portrait") return <PortraitThumb file={t.file} size={size} />;
  return <ImgThumb file={t.file} size={size} />;
}

const TYPE_FALLBACK_THUMB: Record<StoreItemApi["type"], Thumb> = {
  BOARD: { kind: "img", file: "board-marble.png" },
  SKIN: { kind: "img", file: "crimson-king.png" },
  AVATAR: { kind: "portrait", file: "avatars/sovereign.png" },
  FRAME: { kind: "img", file: "frames/laurel.png" },
  EMOTE: { kind: "img", file: "ic-chest.png" },
  BUNDLE: { kind: "img", file: "ic-chest.png" },
  SEASON_PASS: { kind: "img", file: "me-crown.png" },
};

/**
 * Resolve the thumbnail from the item's real type + assetKey — the SAME derivation
 * the Store uses (StorePage.thumbFor), so the Locker can never drift from the DB
 * seed. Keyed on assetKey (not the item id), which is the single source of truth.
 * The Inventory renderer only knows img|portrait, so the classic skin (a CSS disc
 * in the store) and emotes (emoji glyphs) fall back to a representative image here.
 */
function thumbFor(it: StoreItemApi): Thumb {
  const a = it.assetKey;
  switch (it.type) {
    case "BOARD":
      return { kind: "img", file: a.endsWith(".png") ? a : `board-${a}.png` };
    case "SKIN":
      // Premium skins have coin art at pieces/skins/<skin>/red-king.png; the
      // default "classic" skin has no art file → show the classic crimson coin.
      return a === "classic"
        ? { kind: "img", file: "crimson-king.png" }
        : { kind: "img", file: `pieces/skins/${a}/red-king.png` };
    case "AVATAR":
      return { kind: "portrait", file: a.startsWith("avatars/") ? a : `avatars/${a}` };
    case "FRAME":
      return { kind: "img", file: a.includes("/") ? a : a };
    case "EMOTE":
      return TYPE_FALLBACK_THUMB.EMOTE;
    case "BUNDLE":
      return { kind: "img", file: a.endsWith(".png") ? a : "me-banner.png" };
    case "SEASON_PASS":
      return { kind: "img", file: "me-crown.png" };
    default:
      return TYPE_FALLBACK_THUMB[it.type] ?? { kind: "img", file: "ic-chest.png" };
  }
}

// per-type display metadata (group heading label + per-item sub-label)
const TYPE_META: Record<StoreItemApi["type"], { label: string; sub: string }> = {
  BOARD: { label: "Board Themes", sub: "Board Theme" },
  SKIN: { label: "Piece Skins", sub: "Piece Skin" },
  AVATAR: { label: "Avatars", sub: "Avatar" },
  FRAME: { label: "Profile Frames", sub: "Profile Frame" },
  EMOTE: { label: "Emotes", sub: "Emote" },
  BUNDLE: { label: "Bundles", sub: "Bundle" },
  SEASON_PASS: { label: "Season Pass", sub: "Season Pass" },
};
const TYPE_ORDER: StoreItemApi["type"][] = ["BOARD", "SKIN", "AVATAR", "FRAME", "EMOTE", "BUNDLE", "SEASON_PASS"];

// Only these cosmetic types are equippable (equip endpoint accepts board/skin/frame).
const EQUIP_SLOT: Partial<Record<StoreItemApi["type"], "board" | "skin" | "frame">> = {
  BOARD: "board",
  SKIN: "skin",
  FRAME: "frame",
};

// A resolved owned item ready to render.
type OwnedItem = {
  id: string;
  type: StoreItemApi["type"];
  name: string;
  sub: string;
  assetKey: string;
  previewKey: string | null;
  thumb: Thumb;
  slot: "board" | "skin" | "frame" | null;
  hasPreview: boolean;
};

// ── preview resolution ──
// Map an owned item to the live StorePreviewModal's shape. Everything visual is
// derived from the item's real type + assetKey (the same derivation the Store
// uses), so it can never drift from the DB seed. Owned inventory items are, by
// definition, already owned, so the modal shows the "✓ Already Owned" chip.

/** The premium skin coin-art folder for a skin, from its assetKey (undefined = default). */
const SKIN_FOLDERS = new Set(["crimson", "jade", "obsidian"]);
function skinArtOf(assetKey: string): "crimson" | "jade" | "obsidian" | undefined {
  return SKIN_FOLDERS.has(assetKey) ? (assetKey as "crimson" | "jade" | "obsidian") : undefined;
}

/** Emote emoji fallback per item id; the seed's previewKey "emote:<glyph>" wins. */
const EMOTE_EMOJI: Record<string, string> = {
  victory: "👑",
  focused: "🎯",
  "emote-resolve": "💪",
};
function emoteGlyph(it: OwnedItem): string {
  if (it.previewKey?.startsWith("emote:")) return it.previewKey.slice("emote:".length);
  return EMOTE_EMOJI[it.id] ?? "👑";
}

/**
 * Build a StorePreview for an owned inventory item. Returns null only when the
 * item genuinely can't map to a preview kind (kept honest — the caller then
 * hides the preview link). Cosmetics (boards/skins/frames/emotes/avatars) always
 * map, so they always preview.
 */
function previewFor(it: OwnedItem): StorePreview | null {
  const base = { name: it.name, sub: it.sub, cur: "gold" as const, price: 0, free: false, owned: true };

  if (it.type === "BOARD") {
    return { ...base, kind: "board", boardFile: it.thumb.kind === "img" ? it.thumb.file : "board-marble.png" };
  }
  if (it.type === "SKIN") {
    // Portrait-style "skins" (babaylan etc.) render as an animated avatar token.
    if (it.thumb.kind === "portrait") return { ...base, kind: "skin", portraitFile: it.thumb.file, pieceSkin: "default" };
    // Premium skin → its real coin art (from assetKey); default "Classic" → CSS disc.
    return { ...base, kind: "skin", skinArt: skinArtOf(it.assetKey), pieceSkin: "default" };
  }
  if (it.type === "AVATAR") {
    return { ...base, kind: "avatar", portraitFile: it.thumb.kind === "portrait" ? it.thumb.file : "avatars/sovereign.png" };
  }
  if (it.type === "FRAME") {
    return { ...base, kind: "frame", frameFile: it.thumb.kind === "img" ? it.thumb.file : "frames/laurel.png" };
  }
  if (it.type === "EMOTE") {
    return { ...base, kind: "emote", emoji: emoteGlyph(it) };
  }
  if (it.type === "BUNDLE") {
    return { ...base, kind: "bundle", bundleItems: [] };
  }
  if (it.type === "SEASON_PASS") {
    return { ...base, kind: "season", bundleItems: [] };
  }
  return null;
}

export function InventoryPage() {
  const me = useAuthStore((s) => s.me);
  const patchMe = useAuthStore((s) => s.patchMe);
  const showToast = useAppStore((s) => s.showToast);
  const navigate = useNavigate();

  // null = loading; [] = loaded, nothing owned
  const [items, setItems] = useState<OwnedItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [equipping, setEquipping] = useState<string | null>(null);
  const [preview, setPreview] = useState<OwnedItem | null>(null); // open preview modal

  // Load the real catalog (for metadata) + the user's real inventory, then join.
  useEffect(() => {
    if (!me) {
      setItems(null);
      return;
    }
    let alive = true;
    setItems(null);
    setLoadError(false);
    void (async () => {
      try {
        const [catalog, exportData] = await Promise.all([
          api.get<{ items: StoreItemApi[] }>("/api/store/items"),
          api.get<{ inventory: InventoryLine[] }>("/api/users/me/export"),
        ]);
        if (!alive) return;
        const byId = new Map(catalog.items.map((it) => [it.id, it]));
        const owned: OwnedItem[] = exportData.inventory.map((line) => {
          const it = byId.get(line.itemId);
          if (it) {
            return {
              id: it.id,
              type: it.type,
              name: it.name,
              sub: TYPE_META[it.type].sub,
              assetKey: it.assetKey,
              previewKey: it.previewKey,
              thumb: thumbFor(it),
              slot: EQUIP_SLOT[it.type] ?? null,
              hasPreview: !!it.previewKey,
            };
          }
          // Item no longer in the catalog — still render it honestly rather than drop it.
          return { id: line.itemId, type: "EMOTE", name: line.itemId, sub: "Item", assetKey: "", previewKey: null, thumb: TYPE_FALLBACK_THUMB.EMOTE, slot: null, hasPreview: false };
        });
        setItems(owned);
      } catch {
        if (alive) {
          setItems([]);
          setLoadError(true);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [me]);

  // What is currently equipped, from the real account.
  const equippedFor = useCallback(
    (slot: "board" | "skin" | "frame" | null): string | null => {
      if (!me || !slot) return null;
      if (slot === "board") return me.equippedBoard;
      if (slot === "skin") return me.equippedSkin;
      return me.frameId;
    },
    [me],
  );

  // Equip an owned cosmetic (server verifies ownership).
  const equip = useCallback(
    async (it: OwnedItem) => {
      if (!it.slot) {
        showToast(`${it.name} can't be equipped.`);
        return;
      }
      setEquipping(it.id);
      try {
        const res = await api.patch<{ user: { equippedBoard: string | null; equippedSkin: string | null; frameId: string | null } }>(
          "/api/users/me/equip",
          { [it.slot]: it.id },
        );
        patchMe({
          equippedBoard: res.user.equippedBoard,
          equippedSkin: res.user.equippedSkin,
          frameId: res.user.frameId,
        });
        showToast(`${it.name} equipped!`);
      } catch (e) {
        showToast(e instanceof ApiError ? e.message : "Couldn't equip that item.");
      } finally {
        setEquipping(null);
      }
    },
    [patchMe, showToast],
  );

  // Group owned items by type, in the canonical order.
  const groups = useMemo(() => {
    if (!items) return [];
    return TYPE_ORDER.map((t) => ({
      cat: TYPE_META[t].label,
      items: items.filter((i) => i.type === t),
    })).filter((g) => g.items.length > 0);
  }, [items]);

  // ── logged-out: honest sign-in prompt (prototype chrome, never crash) ──
  if (!me) {
    return (
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 26, display: "flex", flexDirection: "column", gap: 20 }}>
        {header(() => navigate("/store"))}
        <div className="frame" style={{ padding: 40, textAlign: "center" }}>
          <div style={{ font: "700 15px Inter", color: "var(--gold-lt)", marginBottom: 8 }}>Sign in to view your Locker</div>
          <div style={{ font: "500 13px Inter", color: "var(--ink2)", marginBottom: 18 }}>Your owned boards, skins, and frames live here once you're signed in.</div>
          <button className="btn btn-gold" onClick={() => navigate("/login")} style={{ padding: "12px 26px" }}>
            Sign In
          </button>
        </div>
      </div>
    );
  }

  const loading = items === null;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 26, display: "flex", flexDirection: "column", gap: 20 }}>
      {header(() => navigate("/store"))}

      {loading ? (
        <div className="frame" style={{ padding: 34, textAlign: "center", font: "500 13px Inter", color: "var(--ink2)" }}>
          Loading your Locker…
        </div>
      ) : groups.length === 0 ? (
        <div className="frame" style={{ padding: 40, textAlign: "center" }}>
          <img src={A("ic-chest.png")} alt="" style={{ width: 84, height: 72, objectFit: "contain", margin: "0 auto 14px", display: "block", opacity: 0.85 }} />
          <div style={{ font: "700 15px Inter", color: "var(--gold-lt)", marginBottom: 6 }}>
            {loadError ? "Your Locker is unavailable right now" : "Your Locker is empty"}
          </div>
          <div style={{ font: "500 13px Inter", color: "var(--ink2)", marginBottom: 18 }}>
            {loadError ? "Please try again in a moment." : "Cosmetics you buy in the Store will land here."}
          </div>
          {!loadError && (
            <button className="btn btn-purple" onClick={() => navigate("/store")} style={{ padding: "12px 26px" }}>
              Browse the Store
            </button>
          )}
        </div>
      ) : (
        groups.map((g) => (
          <div key={g.cat} className="frame" style={{ padding: 22 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div className="ptitle" style={{ textAlign: "left", margin: 0, border: "none", padding: 0 }}>
                {g.cat}
              </div>
              <span style={{ font: "600 11px Inter", color: "var(--ink2)" }}>
                {g.items.length} {g.items.length === 1 ? "item" : "items"}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 14 }}>
              {g.items.map((it) => {
                const isEquipped = it.slot != null && equippedFor(it.slot) === it.id;
                const isEquipping = equipping === it.id;
                const cardBorder = isEquipped ? "rgba(63,191,111,.55)" : "rgba(232,184,75,.18)";
                const isPortrait = it.thumb.kind === "portrait";
                return (
                  <div key={it.id} style={{ display: "flex", gap: 14, alignItems: "center", padding: 14, borderRadius: 12, border: `1px solid ${cardBorder}`, background: "rgba(0,0,0,.2)" }}>
                    <div style={{ flex: "none" }}>{renderThumb(it.thumb, isPortrait ? 52 : 54)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: "700 13px Inter", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.name}</div>
                      <div style={{ font: "500 11px Inter", color: "var(--ink2)", margin: "2px 0 10px" }}>{it.sub}</div>
                      {it.slot == null ? (
                        <button disabled style={cosmeticBtn}>
                          Collected
                        </button>
                      ) : isEquipped ? (
                        <button disabled style={equippedBtn}>
                          ✓ Equipped
                        </button>
                      ) : (
                        <button onClick={() => equip(it)} disabled={isEquipping} style={{ ...equipBtn, opacity: isEquipping ? 0.7 : 1 }}>
                          {isEquipping ? "…" : "Equip"}
                        </button>
                      )}
                      {it.hasPreview && previewFor(it) != null && (
                        <button
                          onClick={() => setPreview(it)}
                          style={{ marginTop: 9, display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", padding: 0, color: "var(--gold)", font: "700 11px Inter", letterSpacing: ".6px", textTransform: "uppercase", cursor: "pointer" }}
                        >
                          ▶ Preview Animation
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* Inventory item preview modal — opens on a card's "▶ Preview Animation".
          Owned items always show the "✓ Already Owned" chip (no Buy button). */}
      <StorePreviewModal
        pv={preview ? previewFor(preview) : null}
        onClose={() => setPreview(null)}
        onBuy={() => setPreview(null)}
      />
    </div>
  );
}

// ── header (eyebrow + title + blurb + "Go to Store") — shared by every state ──
function header(goToStore: () => void) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
      <div>
        <div style={{ font: "700 12px Inter", letterSpacing: "2px", textTransform: "uppercase", color: "var(--gold)" }}>Your Collection</div>
        <h1 style={{ margin: "6px 0 0", font: "800 32px Cinzel,serif", color: "var(--gold-lt)" }}>Locker</h1>
        <p style={{ margin: "8px 0 0", font: "400 13px Inter", color: "var(--ink2)" }}>Equip the cosmetics you own. Purchases from the Store land here.</p>
      </div>
      <button onClick={goToStore} className="btn btn-purple" style={{ padding: "12px 22px" }}>
        Go to Store
      </button>
    </div>
  );
}

const equipBtn: CSSProperties = {
  display: "inline-block",
  padding: "8px 18px",
  borderRadius: 8,
  border: "1px solid var(--gold)",
  background: "rgba(232,184,75,.14)",
  color: "var(--gold-lt)",
  font: "700 12px Inter",
  letterSpacing: ".5px",
  cursor: "pointer",
};
const equippedBtn: CSSProperties = {
  display: "inline-block",
  padding: "8px 18px",
  borderRadius: 8,
  border: "1px solid #3fbf6f",
  background: "rgba(63,191,111,.14)",
  color: "#3fbf6f",
  font: "700 12px Inter",
  letterSpacing: ".5px",
  cursor: "default",
};
const cosmeticBtn: CSSProperties = {
  display: "inline-block",
  padding: "8px 18px",
  borderRadius: 8,
  border: "1px solid rgba(232,184,75,.25)",
  background: "rgba(0,0,0,.25)",
  color: "var(--ink2)",
  font: "700 12px Inter",
  letterSpacing: ".5px",
  cursor: "default",
};

export default InventoryPage;
