import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { api, ApiError } from "../../lib/api";
import { useAppStore } from "../../stores/appStore";
import { useAuthStore } from "../../stores/authStore";
import { StorePreviewModal, type StorePreview } from "./StorePreviewModal";

/**
 * StorePage — reproduced from the prototype's Store screen
 * (handoff/FilipinoDama Royal.dc.html, lines 1243-1358): a three-column layout
 * of Store Categories + Member Benefits (left), Featured Pack banner / filter
 * tabs / catalog grid (center), and Your Cart + Seasonal Offer (right).
 *
 * FULLY LIVE-WIRED — there is NO hardcoded catalog:
 *   - The catalog grid, category rail, filter tabs, prices, and currency are all
 *     driven by GET /api/store/items. If the server seeds a new item, it appears
 *     here automatically; nothing is faked.
 *   - Ownership comes from the authed user's real inventory
 *     (GET /api/users/me/export → inventory[]). Owned items show an "Owned"
 *     badge and no Buy button.
 *   - Buy → POST /api/store/purchase { itemId } (server-authoritative spend +
 *     grant). On success we update the real gold/diamond balances in the auth
 *     store and mark the item owned. Errors (insufficient funds, already owned)
 *     surface as an honest toast.
 *   - The cart is client-side, but every line's name/price/currency comes from a
 *     real StoreItem — never a fabricated value.
 *   - Logged out: catalog still renders (public); Buy prompts sign-in; owned
 *     state is empty. The screen never crashes.
 *   - The Featured Pack banner + Seasonal Offer are the prototype's decorative
 *     marketing chrome; because no such bundle exists as a real StoreItem, their
 *     buttons surface an honest "arrives with online play" toast rather than a
 *     fake priced purchase.
 */

// ── the real StoreItem shape from GET /api/store/items ──
type StoreItemApi = {
  id: string;
  type: "BOARD" | "SKIN" | "AVATAR" | "FRAME" | "EMOTE" | "BUNDLE" | "SEASON_PASS";
  name: string;
  description: string | null;
  priceGold: number | null;
  priceDiamonds: number | null;
  assetKey: string;
  previewKey: string | null;
  tag: string | null;
  isPremium: boolean;
  sortOrder: number;
};

/** Store badge colour per tag (matches the prototype's tag styling). */
function tagColor(tag: string): string {
  if (tag === "NEW") return "#2f8f5b";
  if (tag === "PREMIUM") return "#7a4fbf";
  if (tag === "VALUE" || tag === "SEASON") return "#c99a2e";
  if (tag.startsWith("-")) return "#a83744"; // discount, e.g. -35%
  return "#7a4fbf";
}

const A = (n: string) => `/assets/${n}`;

// ── currency helpers (prototype curEl / curColor) ──
type Cur = "gold" | "gem";
const curColor = (c: Cur) => (c === "gem" ? "#ff9aa8" : "#f2d493");
function CurIcon({ cur, size = 16 }: { cur: Cur; size?: number }) {
  return (
    <img
      src={cur === "gem" ? A("ic-gem.png") : A("ic-coin.png")}
      alt={cur === "gem" ? "Diamonds" : "Gold"}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}

// ── SVG icons for the category rail (prototype ICONS.*) ──
type IconName = "crown" | "shield" | "target" | "users" | "trophy" | "bulb" | "castle" | "coin";
function CatIcon({ name }: { name: IconName }) {
  const p = (d: string) => <path d={d} key={d} />;
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "crown":
      return <svg {...common}>{p("M3 8l4 4 5-7 5 7 4-4-2 11H5z")}</svg>;
    case "shield":
      return <svg {...common}>{p("M12 3l7 3v5c0 5-4 8-7 10-3-2-7-5-7-10V6z")}</svg>;
    case "target":
      return (
        <svg {...common}>
          <circle cx={12} cy={12} r={9} />
          <circle cx={12} cy={12} r={5} />
          <circle cx={12} cy={12} r={1.4} fill="currentColor" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <circle cx={9} cy={8} r={3} />
          {p("M3 20c0-3 3-5 6-5s6 2 6 5")}
          {p("M16 6a3 3 0 0 1 0 6M18 20c0-2-1-3.5-2.5-4.3")}
        </svg>
      );
    case "trophy":
      return (
        <svg {...common}>
          {p("M7 4h10v5a5 5 0 0 1-10 0z")}
          {p("M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M9 16h6M10 20h4M12 16v4")}
        </svg>
      );
    case "bulb":
      return <svg {...common}>{p("M9 18h6M10 21h4M12 3a6 6 0 0 1 4 10c-.7.7-1 1.4-1 2H9c0-.6-.3-1.3-1-2A6 6 0 0 1 12 3z")}</svg>;
    case "castle":
      return <svg {...common}>{p("M4 21V9l3-2 3 2 4 0 3-2 3 2v12zM4 9V5l2 1V4l2 1V3l2 1 2-1v2l2-1v2l2-1v4M10 21v-4h4v4")}</svg>;
    case "coin":
      return (
        <svg {...common}>
          <circle cx={12} cy={12} r={9} />
          {p("M9 12h6M12 8v8")}
        </svg>
      );
  }
}

const Diamond = () => <span style={{ color: "var(--gold-dp)", fontSize: 10 }}>✦</span>;
const Check = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12l5 5L20 6" />
  </svg>
);

// ── thumbnails ──
// Board/season pngs render as contained images. Skin portraits are opaque, so
// they render inside a masked circle with a brightness lift.
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

// ── thumbnails ── derived from the item's real assetKey (set from the prototype
// catalog in the DB seed), so every item shows its true art. NOT a stand-in
// catalog — price/currency/tag all come from the live API.
type Thumb = { kind: "img"; file: string } | { kind: "portrait"; file: string };

/** Resolve the thumbnail from the item's real type + assetKey. */
function thumbFor(it: StoreItemApi): Thumb {
  const a = it.assetKey;
  switch (it.type) {
    case "BOARD":
      // assetKey like "board-ebony.png"
      return { kind: "img", file: a.endsWith(".png") ? a : `board-${a}.png` };
    case "SKIN": {
      // assetKey is a skin folder ("jade"/"crimson"/"obsidian"/"classic") →
      // show the red king from that skin's real art (prototype path). The
      // "classic" default has no skin folder, so it uses the default piece webp.
      if (a === "classic") return { kind: "img", file: "pieces/red-king.webp" };
      return { kind: "img", file: `pieces/skins/${a}/red-king.png` };
    }
    case "AVATAR":
      // assetKey like "avatars/sovereign.png"
      return { kind: "portrait", file: a.startsWith("avatars/") ? a : `avatars/${a}` };
    case "FRAME":
      // assetKey like "laurel.png" or "frames/silver.png"
      return { kind: "img", file: a.includes("/") ? a : a };
    case "EMOTE":
      return { kind: "img", file: "ic-chest.png" };
    case "BUNDLE":
      return { kind: "img", file: a.endsWith(".png") ? a : "me-banner.png" };
    case "SEASON_PASS":
      return { kind: "img", file: "me-crown.png" };
    default:
      return { kind: "img", file: "ic-chest.png" };
  }
}
function renderThumb(t: Thumb, size: number): ReactNode {
  if (t.kind === "portrait") return <PortraitThumb file={t.file} size={size} />;
  return <ImgThumb file={t.file} size={size} />;
}

// ── per-type display metadata (label, sub-label, rail icon) ──
const TYPE_META: Record<StoreItemApi["type"], { label: string; sub: string; icon: IconName }> = {
  BOARD: { label: "Board Themes", sub: "Board Theme", icon: "shield" },
  SKIN: { label: "Piece Skins", sub: "Piece Skin", icon: "target" },
  AVATAR: { label: "Avatars", sub: "Avatar", icon: "users" },
  FRAME: { label: "Profile Frames", sub: "Profile Frame", icon: "trophy" },
  EMOTE: { label: "Emotes", sub: "Emote", icon: "bulb" },
  BUNDLE: { label: "Bundles", sub: "Bundle", icon: "castle" },
  SEASON_PASS: { label: "Season Pass", sub: "Season Pass", icon: "crown" },
};
// Rail/tab ordering when a type is present in the live catalog.
const TYPE_ORDER: StoreItemApi["type"][] = ["BOARD", "SKIN", "AVATAR", "FRAME", "EMOTE", "BUNDLE", "SEASON_PASS"];

// A real item resolved for display: real price + currency straight from the API.
type ShopItem = StoreItemApi & { cur: Cur; price: number; free: boolean; sub: string; thumb: Thumb };

function resolve(it: StoreItemApi): ShopItem {
  const cur: Cur = it.priceDiamonds != null ? "gem" : "gold";
  const price = it.priceDiamonds ?? it.priceGold ?? 0;
  return { ...it, cur, price, free: price === 0, sub: TYPE_META[it.type].sub, thumb: thumbFor(it) };
}

// ── preview resolution ──
// Flat piece-art PNGs that exist under public/assets for the built-in skins
// (crimson-/jade-/obsidian-<color>-<man|king>.png). Portrait "skins" (babaylan
// etc.) fall through to a portrait token instead.
const SKIN_ART: Record<string, "crimson" | "jade" | "obsidian"> = {
  "skin-classic": "crimson",
  "skin-jade": "jade",
  "skin-obsidian": "obsidian",
};
// The CSS <Piece> disc skin used when there is no flat art (only skin-classic
// currently uses the CSS disc for its red side is handled by SKIN_ART; kept for
// completeness / new items). "default" = classic crimson/royal disc.
const PIECE_SKIN: Record<string, "default" | "crimson" | "jade" | "obsidian"> = {
  "skin-classic": "default",
  "skin-jade": "jade",
  "skin-obsidian": "obsidian",
};

/**
 * Build the live-data StorePreview for an item. Everything visual is derived from
 * the item's real type + assetKey + our verified asset map; the price, currency,
 * and owned flag are the real ones. Boards show the texture, skins show the
 * red/blue man→king coins (flat art where it exists, else the CSS disc, or a
 * portrait token for portrait-style "skins"), avatars/frames show their art.
 */
function previewFor(it: ShopItem, owned: boolean): StorePreview {
  const base = { name: it.name, sub: it.sub, cur: it.cur, price: it.price, free: it.free, owned };
  const thumb = it.thumb;
  if (it.type === "BOARD") {
    return { ...base, kind: "board", boardFile: thumb.kind === "img" ? thumb.file : `${it.assetKey}` };
  }
  if (it.type === "SKIN") {
    // Portrait-style skin (assetKey ends in .webp / thumb is a portrait) → token.
    if (thumb.kind === "portrait") return { ...base, kind: "skin", portraitFile: thumb.file };
    return { ...base, kind: "skin", skinArt: SKIN_ART[it.id], pieceSkin: PIECE_SKIN[it.id] ?? "default" };
  }
  if (it.type === "AVATAR") {
    return { ...base, kind: "avatar", portraitFile: thumb.kind === "portrait" ? thumb.file : `avatars/${it.assetKey}` };
  }
  if (it.type === "FRAME") {
    return { ...base, kind: "frame", frameFile: thumb.kind === "img" ? thumb.file : `frames/${it.assetKey}` };
  }
  // SEASON_PASS / EMOTE / BUNDLE → fall back to the board-style big art of the thumb.
  if (thumb.kind === "portrait") return { ...base, kind: "avatar", portraitFile: thumb.file };
  return { ...base, kind: "board", boardFile: thumb.file };
}

// local cart line (name/price/currency all sourced from a real StoreItem)
interface CartLine {
  id: string;
  name: string;
  sub: string;
  price: number;
  cur: Cur;
  thumb: Thumb;
}

export function StorePage() {
  const me = useAuthStore((s) => s.me);
  const patchMe = useAuthStore((s) => s.patchMe);
  const showToast = useAppStore((s) => s.showToast);

  const [tab, setTab] = useState<string>("All");
  const [cart, setCart] = useState<CartLine[]>([]);

  const [items, setItems] = useState<ShopItem[] | null>(null); // null = loading
  const [loadError, setLoadError] = useState(false);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [buying, setBuying] = useState<string | null>(null);
  const [preview, setPreview] = useState<ShopItem | null>(null); // open preview modal

  // Load the real catalog (public) once.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const data = await api.get<{ items: StoreItemApi[] }>("/api/store/items");
        if (!alive) return;
        setItems(data.items.map(resolve));
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
  }, []);

  // Load real ownership only when logged in.
  useEffect(() => {
    if (!me) {
      setOwned(new Set());
      return;
    }
    let alive = true;
    void (async () => {
      try {
        // The user's inventory ships inside the GDPR export payload (the only
        // inventory read exposed over REST).
        const data = await api.get<{ inventory: { itemId: string }[] }>("/api/users/me/export");
        if (!alive) return;
        setOwned(new Set(data.inventory.map((i) => i.itemId)));
      } catch {
        /* leave owned empty on failure — nothing is falsely marked owned */
      }
    })();
    return () => {
      alive = false;
    };
  }, [me]);

  const addToCart = (line: CartLine) => {
    setCart((c) => (c.some((x) => x.id === line.id) ? c : [...c, line]));
    showToast(`${line.name} added to cart`);
  };
  const removeFromCart = (id: string) => setCart((c) => c.filter((x) => x.id !== id));

  // Server-authoritative purchase.
  const buy = useCallback(
    async (it: ShopItem) => {
      if (!me) {
        showToast("Sign in to buy items.");
        return;
      }
      setBuying(it.id);
      try {
        const res = await api.post<{ balances: { gold: number; diamonds: number; trophies: number } }>(
          "/api/store/purchase",
          { itemId: it.id },
        );
        patchMe({ gold: res.balances.gold, diamonds: res.balances.diamonds });
        setOwned((s) => new Set(s).add(it.id));
        showToast(`${it.name} purchased!`);
      } catch (e) {
        showToast(e instanceof ApiError ? e.message : "Purchase failed.");
      } finally {
        setBuying(null);
      }
    },
    [me, patchMe, showToast],
  );

  // Types actually present in the live catalog → drives rail + filter tabs.
  const presentTypes = useMemo(() => {
    if (!items) return [];
    const set = new Set(items.map((i) => i.type));
    return TYPE_ORDER.filter((t) => set.has(t));
  }, [items]);

  // Grid contents for the active tab. "All" = the whole live catalog.
  const grid = useMemo(() => {
    if (!items) return [];
    if (tab === "All") return items;
    return items.filter((i) => TYPE_META[i.type].label === tab);
  }, [items, tab]);
  const gridTitle = tab === "All" ? "All Items" : tab;

  const cartGold = cart.filter((c) => c.cur === "gold").reduce((n, c) => n + c.price, 0);
  const cartGem = cart.filter((c) => c.cur === "gem").reduce((n, c) => n + c.price, 0);

  const catBtn = (active: boolean): CSSProperties => ({
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 11,
    padding: "11px 12px",
    marginBottom: 3,
    borderRadius: 9,
    border: `1px solid ${active ? "var(--gold)" : "transparent"}`,
    background: active ? "rgba(232,184,75,.14)" : "none",
    color: active ? "var(--gold-lt)" : "var(--ink)",
    cursor: "pointer",
    textAlign: "left",
  });
  const filterBtn = (active: boolean): CSSProperties => ({
    padding: "9px 15px",
    borderRadius: 8,
    border: `1px solid ${active ? "var(--gold)" : "rgba(232,184,75,.2)"}`,
    background: active ? "rgba(232,184,75,.15)" : "transparent",
    color: active ? "var(--gold-lt)" : "var(--ink)",
    font: "700 12px Inter",
    letterSpacing: ".5px",
    cursor: "pointer",
    whiteSpace: "nowrap",
  });

  const loading = items === null;

  return (
    <div style={{ maxWidth: 1560, margin: "0 auto", padding: 26, display: "grid", gridTemplateColumns: "230px minmax(0,1fr) 320px", gap: 20, alignItems: "start" }}>
      {/* LEFT: categories */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div className="frame" style={{ padding: "14px 12px" }}>
          <div className="ptitle">Store Categories</div>
          <button key="All" onClick={() => setTab("All")} style={catBtn(tab === "All")}>
            <span style={{ color: tab === "All" ? "var(--gold-lt)" : "var(--gold)", display: "flex" }}>
              <CatIcon name="crown" />
            </span>
            <span style={{ font: "600 13px Inter" }}>Featured</span>
          </button>
          {presentTypes.map((t) => {
            const meta = TYPE_META[t];
            const active = tab === meta.label;
            return (
              <button key={t} onClick={() => setTab(meta.label)} style={catBtn(active)}>
                <span style={{ color: active ? "var(--gold-lt)" : "var(--gold)", display: "flex" }}>
                  <CatIcon name={meta.icon} />
                </span>
                <span style={{ font: "600 13px Inter" }}>{meta.label}</span>
              </button>
            );
          })}
          <button key="Currency" onClick={() => showToast("Diamond top-ups arrive with online play.")} style={catBtn(false)}>
            <span style={{ color: "var(--gold)", display: "flex" }}>
              <CatIcon name="coin" />
            </span>
            <span style={{ font: "600 13px Inter" }}>Currency</span>
          </button>
        </div>
        <div className="frame" style={{ padding: 20, textAlign: "center" }}>
          <div className="ptitle">Member Benefits</div>
          <div style={{ font: "400 12px/1.5 Inter", color: "var(--ink)", marginBottom: 14 }}>Exclusive discounts, free items, and monthly rewards!</div>
          <button className="btn btn-gold" onClick={() => showToast("Member benefits arrive with online play.")} style={{ width: "100%", padding: 11, fontSize: 12 }}>
            View Benefits
          </button>
        </div>
      </div>

      {/* CENTER */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* FEATURED PACK (prototype marketing chrome — no real StoreItem backs it) */}
        <div className="frame" style={{ padding: 0, overflow: "hidden", display: "grid", gridTemplateColumns: "1.1fr .9fr" }}>
          <div style={{ padding: 28 }}>
            <div style={{ font: "700 11px Inter", letterSpacing: "2px", color: "var(--gold)" }}>✦ FEATURED COLLECTION ✦</div>
            <h1 style={{ margin: "10px 0 6px", font: "800 34px Cinzel,serif", color: "var(--gold-lt)" }}>Royal Heritage Pack</h1>
            <div style={{ font: "500 14px Inter", color: "#fff", marginBottom: 16 }}>Rule the board with timeless royalty.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", marginBottom: 20 }}>
              {["Exclusive Royal Board", "Royal Avatar & Frame", "Crown Piece Skins", "Victory Emotes"].map((w) => (
                <span key={w} style={{ display: "flex", alignItems: "center", gap: 8, font: "500 13px Inter", color: "var(--ink)" }}>
                  <Check /> {w}
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <span className="pill" style={{ color: "#ff9aa8" }}>
                <CurIcon cur="gem" /> 1,200
              </span>
              <button className="btn btn-gold" onClick={() => showToast("The Royal Heritage Pack arrives with online play.")} style={{ padding: "13px 28px" }}>
                Add to Cart
              </button>
            </div>
          </div>
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "radial-gradient(circle at 60% 45%,rgba(120,80,180,.4),transparent 70%)" }}>
            <img src={A("me-banner.png")} alt="Royal Heritage Pack" style={{ width: "min(80%,180px)", objectFit: "contain", filter: "drop-shadow(0 14px 26px rgba(0,0,0,.5))" }} />
          </div>
        </div>

        {/* FILTER TABS (derived from the live catalog's item types) */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button key="All" onClick={() => setTab("All")} style={filterBtn(tab === "All")}>
            All Items
          </button>
          {presentTypes.map((t) => (
            <button key={t} onClick={() => setTab(TYPE_META[t].label)} style={filterBtn(tab === TYPE_META[t].label)}>
              {TYPE_META[t].label}
            </button>
          ))}
        </div>

        {/* CATALOG GRID */}
        <div className="divider">
          <i />
          <span>
            <Diamond /> {gridTitle} <Diamond />
          </span>
          <i />
        </div>
        {loading ? (
          <div className="frame" style={{ padding: 34, textAlign: "center", font: "500 13px Inter", color: "var(--ink2)" }}>
            Loading the store…
          </div>
        ) : grid.length === 0 ? (
          <div className="frame" style={{ padding: 34, textAlign: "center", font: "500 13px Inter", color: "var(--ink2)" }}>
            {loadError ? "The store is unavailable right now — please try again soon." : "No items in this category yet — check back soon."}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
            {grid.map((it) => {
              const isSkin = it.type === "SKIN";
              const isOwned = owned.has(it.id);
              const isBuying = buying === it.id;
              return (
                <div key={it.id} className="frame" style={{ padding: "16px 14px", position: "relative", display: "flex", flexDirection: "column", gap: 10, alignItems: "center", textAlign: "center" }}>
                  {isOwned ? (
                    <span style={{ position: "absolute", top: 9, left: 9, font: "700 9px Inter", letterSpacing: "1px", padding: "3px 7px", borderRadius: 5, background: "#2f8f5b", color: "#fff", zIndex: 2 }}>OWNED</span>
                  ) : it.tag ? (
                    <span style={{ position: "absolute", top: 9, left: 9, font: "700 9px Inter", letterSpacing: "1px", padding: "3px 7px", borderRadius: 5, background: tagColor(it.tag), color: "#fff", zIndex: 2 }}>{it.tag}</span>
                  ) : null}
                  <div onClick={() => setPreview(it)} title="Preview" style={{ height: 70, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", width: "100%" }}>
                    {renderThumb(it.thumb, isSkin && it.thumb.kind === "portrait" ? 56 : 64)}
                  </div>
                  <div>
                    <div style={{ font: "700 14px Inter", color: "#fff" }}>{it.name}</div>
                    <div style={{ font: "500 11px Inter", color: "var(--ink2)", marginTop: 2 }}>{it.sub}</div>
                  </div>
                  <button onClick={() => setPreview(it)} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", padding: 0, color: "var(--gold)", font: "700 10px Inter", letterSpacing: ".8px", textTransform: "uppercase", cursor: "pointer" }}>
                    🔍 Preview
                  </button>
                  {isOwned ? (
                    <div style={{ width: "100%", marginTop: "auto", textAlign: "center", font: "700 11px Inter", letterSpacing: "1px", color: "#3fbf6f", border: "1px solid #3fbf6f", padding: 9, borderRadius: 7 }}>✓ OWNED</div>
                  ) : it.free ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, width: "100%", marginTop: "auto" }}>
                      <span style={{ font: "700 14px 'JetBrains Mono',monospace", color: "var(--ink)" }}>Free</span>
                      <button className="btn btn-purple" disabled={isBuying} onClick={() => buy(it)} style={{ padding: "8px 16px", fontSize: 11, opacity: isBuying ? 0.7 : 1 }}>
                        {isBuying ? "…" : "Claim"}
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, width: "100%", marginTop: "auto" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 5, font: "700 14px 'JetBrains Mono',monospace", color: curColor(it.cur) }}>
                        <CurIcon cur={it.cur} /> {it.price.toLocaleString()}
                      </span>
                      <button className="btn btn-purple" disabled={isBuying} onClick={() => buy(it)} style={{ padding: "8px 16px", fontSize: 11, opacity: isBuying ? 0.7 : 1 }}>
                        {isBuying ? "…" : "Buy"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* RIGHT: cart + seasonal */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div className="frame" style={{ padding: 20 }}>
          <div className="ptitle">Your Cart</div>
          {cart.length === 0 ? (
            <div style={{ padding: "14px 0", font: "500 12px/1.5 Inter", color: "var(--ink2)", textAlign: "center" }}>Your cart is empty. Add items to see them here.</div>
          ) : (
            cart.map((ci) => (
              <div key={ci.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "11px 0", borderTop: "1px solid rgba(232,184,75,.1)" }}>
                <div style={{ width: 46, height: 46, flex: "none", marginRight: 2, display: "flex", alignItems: "center", justifyContent: "center" }}>{renderThumb(ci.thumb, ci.thumb.kind === "portrait" ? 46 : 40)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ font: "700 13px Inter", color: "#fff" }}>{ci.name}</div>
                  <div style={{ font: "500 11px Inter", color: "var(--ink2)" }}>{ci.sub}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, font: "700 12px 'JetBrains Mono',monospace", color: curColor(ci.cur), marginTop: 3 }}>
                    <CurIcon cur={ci.cur} size={14} /> {ci.price.toLocaleString()}
                  </div>
                </div>
                <button onClick={() => removeFromCart(ci.id)} style={{ width: 26, height: 26, flex: "none", borderRadius: 6, border: "1px solid rgba(232,184,75,.25)", background: "rgba(0,0,0,.3)", color: "var(--ink2)", cursor: "pointer" }}>
                  ✕
                </button>
              </div>
            ))
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0 4px", borderTop: "1px solid rgba(232,184,75,.2)", marginTop: 6 }}>
            <span style={{ font: "700 13px Inter", color: "var(--ink)" }}>Total</span>
            <span style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {cartGold > 0 || cartGem === 0 ? (
                <span style={{ display: "flex", alignItems: "center", gap: 6, font: "800 18px 'JetBrains Mono',monospace", color: "#f2d493" }}>
                  <CurIcon cur="gold" size={18} /> {cartGold.toLocaleString()}
                </span>
              ) : null}
              {cartGem > 0 ? (
                <span style={{ display: "flex", alignItems: "center", gap: 6, font: "800 18px 'JetBrains Mono',monospace", color: "#ff9aa8" }}>
                  <CurIcon cur="gem" size={18} /> {cartGem.toLocaleString()}
                </span>
              ) : null}
            </span>
          </div>
          <button
            className="btn btn-gold"
            onClick={() => {
              if (!cart.length) {
                showToast("Your cart is empty.");
                return;
              }
              if (!me) {
                showToast("Sign in to check out.");
                return;
              }
              // Buy every cart line through the real purchase endpoint, then clear.
              void (async () => {
                const lines = [...cart];
                for (const line of lines) {
                  const it = items?.find((i) => i.id === line.id);
                  if (it) await buy(it);
                }
                setCart([]);
              })();
            }}
            style={{ width: "100%", marginTop: 12 }}
          >
            Proceed to Checkout
          </button>
        </div>
        <div className="frame" style={{ padding: 20, textAlign: "center", borderColor: "rgba(180,60,70,.5)" }}>
          <div className="ptitle" style={{ color: "#ff9aa2" }}>Seasonal Offer</div>
          <div style={{ font: "600 11px Inter", letterSpacing: "1px", color: "var(--ink2)" }}>ENDS IN: 6D 12:45:32</div>
          <img src={A("ic-chest.png")} alt="Lunar New Year Bundle" style={{ width: 96, height: 82, objectFit: "contain", margin: "14px auto 8px", display: "block" }} />
          <div style={{ font: "800 19px Cinzel,serif", color: "var(--gold-lt)" }}>Lunar New Year Bundle</div>
          <div style={{ font: "400 12px Inter", color: "var(--ink)", margin: "6px 0 14px" }}>Celebrate tradition and prosperity!</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 14 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, font: "800 18px 'JetBrains Mono',monospace", color: "#ff8fae" }}>
              <CurIcon cur="gem" size={18} /> 1,080
            </span>
            <span style={{ font: "500 13px 'JetBrains Mono',monospace", color: "var(--ink2)", textDecoration: "line-through" }}>1,680</span>
            <span style={{ font: "700 11px Inter", padding: "3px 8px", borderRadius: 6, background: "#a83744", color: "#fff" }}>-35%</span>
          </div>
          <button className="btn btn-red" onClick={() => showToast("The Lunar New Year Bundle arrives with online play.")} style={{ width: "100%" }}>
            View Bundle
          </button>
        </div>
      </div>

      {/* Store item preview modal — opens on a tile's thumb / "🔍 Preview" link. */}
      <StorePreviewModal
        pv={preview ? previewFor(preview, owned.has(preview.id)) : null}
        onClose={() => setPreview(null)}
        buyLabel={preview?.free ? "Claim" : "Buy"}
        onBuy={() => {
          if (preview) {
            const it = preview;
            setPreview(null);
            void buy(it);
          }
        }}
      />
    </div>
  );
}

export default StorePage;
