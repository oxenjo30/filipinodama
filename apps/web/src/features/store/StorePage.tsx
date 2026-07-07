import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { api, ApiError } from "../../lib/api";
import { useAppStore } from "../../stores/appStore";
import { useAuthStore } from "../../stores/authStore";

/**
 * StorePage — reproduced from the prototype's Store screen
 * (handoff/FilipinoDama Royal.dc.html, lines 1243-1358): a three-column layout
 * of Store Categories + Member Benefits (left), Featured Pack / filter tabs /
 * catalog grid / Daily Deals (center), and Your Cart + Seasonal Offer (right).
 * The visual layout is unchanged — it is now backed by real store data.
 *
 * DATA WIRING:
 *   - GET /api/store/items → the real catalog. Any prototype catalog tile whose
 *     id maps to a real StoreItem (REAL_ID map) shows that item's real PRICE and,
 *     when owned, an "Owned" badge with a disabled Buy button.
 *   - Ownership comes from the authed user's inventory (read via
 *     GET /api/users/me/export → inventory[]) on load, plus anything just bought.
 *   - Buy on a real item → POST /api/store/purchase { itemId }; on success we
 *     update gold/diamond balances (auth store) and mark the item owned. Errors
 *     (insufficient funds, already owned) surface as a toast.
 *   - Catalog tiles with no backing StoreItem (frames, emotes, bundles that
 *     aren't seeded yet) keep the prototype's add-to-cart + honest "arrives with
 *     online play" toast — no fake purchase is fabricated.
 *   - Logged out: no fetch fires; Buy prompts sign-in; the screen still renders.
 */

/**
 * Maps a prototype catalog id → the seeded StoreItem id it represents. Only
 * these are really purchasable; everything else stays cart/toast-only.
 */
const REAL_ID: Record<string, string> = {
  ebony: "board-ebony",
  marble: "board-marble",
  classicwood: "board-wood",
  obsidian: "board-obsidian",
  jadeskin: "skin-jade",
  obsidianskin: "skin-obsidian",
  bagani: "skin-bagani",
  mandirigma: "skin-mandirigma",
  diwata: "skin-diwata",
  ermitanyo: "skin-ermitanyo",
  babaylan: "skin-babaylan",
  seasonpass: "season-pass-s1",
};

// Real StoreItem shape from GET /api/store/items.
type StoreItemApi = {
  id: string;
  type: string;
  name: string;
  priceGold: number | null;
  priceDiamonds: number | null;
  isPremium: boolean;
};

const A = (n: string) => `/assets/${n}`;

// ── currency helpers (prototype curEl / curColor, lines 3878-3879) ──
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
// Opaque avatar/portrait pngs must render inside a masked circle w/ brightness lift.
function AvatarThumb({ file, size }: { file: string; size: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", flex: "none", border: "1px solid rgba(232,184,75,.4)", background: "#0f0820" }}>
      <img src={A(file)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(1.25)" }} />
    </div>
  );
}
function ImgThumb({ file, size }: { file: string; size: number }) {
  return <img src={A(file)} alt="" style={{ width: size, height: size, objectFit: "contain", filter: "drop-shadow(0 6px 14px rgba(0,0,0,.5))" }} />;
}
function EmoteThumb({ emoji, size }: { emoji: string; size: number }) {
  return <span style={{ fontSize: size * 0.72, lineHeight: 1, filter: "drop-shadow(0 4px 10px rgba(0,0,0,.5))" }}>{emoji}</span>;
}

// ── thumb descriptor: which renderer + payload for a catalog entry ──
type Thumb =
  | { kind: "avatar"; file: string }
  | { kind: "img"; file: string }
  | { kind: "emote"; emoji: string };

function renderThumb(t: Thumb, size: number): ReactNode {
  if (t.kind === "avatar") return <AvatarThumb file={t.file} size={size} />;
  if (t.kind === "emote") return <EmoteThumb emoji={t.emoji} size={size} />;
  return <ImgThumb file={t.file} size={size} />;
}

// ── catalog (prototype `catalog`, lines 3890-3916) ──
// thumb paths remapped to assets that exist (flat filenames per assets.ts).
type CatKey = "Board Themes" | "Piece Skins" | "Avatars" | "Profile Frames" | "Emotes" | "Bundles" | "Season Pass";
interface Item {
  id: string;
  name: string;
  cat: CatKey;
  cur: Cur;
  price: number;
  tag?: string;
  thumb: Thumb;
}

const subFor: Record<CatKey, string> = {
  "Board Themes": "Board Theme",
  "Piece Skins": "Piece Skin",
  Avatars: "Avatar",
  "Profile Frames": "Profile Frame",
  Emotes: "Emote",
  Bundles: "Bundle",
  "Season Pass": "Season Pass",
};

const CATALOG: Item[] = [
  { id: "ebony", name: "Imperial Ebony Board", cat: "Board Themes", cur: "gem", price: 480, tag: "NEW", thumb: { kind: "img", file: "board-ebony.png" } },
  { id: "marble", name: "Marble Court Board", cat: "Board Themes", cur: "gold", price: 4200, thumb: { kind: "img", file: "board-marble.png" } },
  { id: "classicwood", name: "Classic Wood Board", cat: "Board Themes", cur: "gold", price: 3200, thumb: { kind: "img", file: "board-wood.png" } },
  { id: "obsidian", name: "Obsidian Court Board", cat: "Board Themes", cur: "gem", price: 520, tag: "PREMIUM", thumb: { kind: "img", file: "board-obsidian.png" } },
  { id: "jadeskin", name: "Jade Dragon Pieces", cat: "Piece Skins", cur: "gem", price: 360, tag: "NEW", thumb: { kind: "img", file: "jade-king.png" } },
  { id: "crimsonskin", name: "Crimson Legion Pieces", cat: "Piece Skins", cur: "gem", price: 380, thumb: { kind: "img", file: "crimson-king.png" } },
  { id: "obsidianskin", name: "Obsidian Court Pieces", cat: "Piece Skins", cur: "gem", price: 420, tag: "PREMIUM", thumb: { kind: "img", file: "obsidian-king.png" } },
  { id: "sovereign", name: "Royal Sovereign", cat: "Avatars", cur: "gem", price: 280, tag: "NEW", thumb: { kind: "avatar", file: "avatars/sovereign.png" } },
  { id: "dayang", name: "Dayang Warrior", cat: "Avatars", cur: "gold", price: 2600, thumb: { kind: "avatar", file: "avatars/dayang.png" } },
  { id: "priestess", name: "Jade Dragon Priestess", cat: "Avatars", cur: "gem", price: 320, tag: "PREMIUM", thumb: { kind: "avatar", file: "avatars/priestess.png" } },
  { id: "champion", name: "Horned Champion", cat: "Avatars", cur: "gem", price: 300, thumb: { kind: "avatar", file: "avatars/champion.png" } },
  { id: "sultan", name: "Golden Rajah", cat: "Avatars", cur: "gold", price: 3200, thumb: { kind: "avatar", file: "avatars/sultan.png" } },
  { id: "strategist", name: "Bronze Strategist", cat: "Avatars", cur: "gold", price: 2400, thumb: { kind: "avatar", file: "avatars/strategist.png" } },
  { id: "bagani", name: "Bagani Warrior", cat: "Avatars", cur: "gold", price: 2200, thumb: { kind: "avatar", file: "avatars/bagani.png" } },
  { id: "mandirigma", name: "Mandirigma", cat: "Avatars", cur: "gold", price: 2200, thumb: { kind: "avatar", file: "avatars/mandirigma.png" } },
  { id: "babaylan", name: "Babaylan Elder", cat: "Avatars", cur: "gold", price: 2000, thumb: { kind: "avatar", file: "avatars/babaylan.png" } },
  { id: "diwata", name: "Diwata Spirit", cat: "Avatars", cur: "gem", price: 260, thumb: { kind: "avatar", file: "avatars/diwata.png" } },
  { id: "ermitanyo", name: "Ermitaño Hermit", cat: "Avatars", cur: "gold", price: 1800, thumb: { kind: "avatar", file: "avatars/ermitanyo.png" } },
  { id: "laurel", name: "Golden Laurel Frame", cat: "Profile Frames", cur: "gold", price: 2200, thumb: { kind: "img", file: "frames/laurel.png" } },
  { id: "silver", name: "Silver Knight Frame", cat: "Profile Frames", cur: "gold", price: 1500, thumb: { kind: "img", file: "frames/silver.png" } },
  { id: "obsidianf", name: "Obsidian Sovereign Frame", cat: "Profile Frames", cur: "gem", price: 340, tag: "PREMIUM", thumb: { kind: "img", file: "frames/obsidian.png" } },
  { id: "victory", name: "Victory Royale", cat: "Emotes", cur: "gold", price: 1500, thumb: { kind: "emote", emoji: "👑" } },
  { id: "focused", name: "Focused", cat: "Emotes", cur: "gold", price: 1200, thumb: { kind: "emote", emoji: "🎯" } },
  { id: "resolve", name: "Warrior's Resolve", cat: "Emotes", cur: "gold", price: 0, thumb: { kind: "emote", emoji: "💪" } },
  { id: "heritage", name: "Royal Heritage Pack", cat: "Bundles", cur: "gem", price: 1200, tag: "VALUE", thumb: { kind: "img", file: "ic-chest.png" } },
  { id: "lunar", name: "Lunar New Year Bundle", cat: "Bundles", cur: "gem", price: 1080, tag: "-35%", thumb: { kind: "img", file: "ic-chest.png" } },
  { id: "seasonpass", name: "Royal Season Pass", cat: "Season Pass", cur: "gem", price: 900, tag: "SEASON", thumb: { kind: "img", file: "ic-chest.png" } },
];

const FEATURED_IDS = ["ebony", "jadeskin", "sovereign", "laurel"];

// ── category rail (prototype storeCats, line 3881) ──
const CAT_ROWS: { label: string; tab: string; icon: IconName }[] = [
  { label: "Featured", tab: "All", icon: "crown" },
  { label: "Board Themes", tab: "Board Themes", icon: "shield" },
  { label: "Piece Skins", tab: "Piece Skins", icon: "target" },
  { label: "Avatars", tab: "Avatars", icon: "users" },
  { label: "Profile Frames", tab: "Profile Frames", icon: "trophy" },
  { label: "Emotes", tab: "Emotes", icon: "bulb" },
  { label: "Bundles", tab: "Bundles", icon: "castle" },
  { label: "Currency", tab: "Currency", icon: "coin" },
  { label: "Season Pass", tab: "Season Pass", icon: "crown" },
];

// ── filter tabs (prototype storeFilters, line 3882) ──
const FILTER_TABS: { label: string; tab: string }[] = [
  { label: "All Items", tab: "All" },
  { label: "Board Themes", tab: "Board Themes" },
  { label: "Piece Skins", tab: "Piece Skins" },
  { label: "Avatars", tab: "Avatars" },
  { label: "Frames", tab: "Profile Frames" },
  { label: "Emotes", tab: "Emotes" },
  { label: "Bundles", tab: "Bundles" },
];

// ── daily deals (prototype storeDeals, lines 3925-3929) ──
interface Deal {
  id: string;
  name: string;
  sub: string;
  cur: Cur;
  price: string;
  raw: number;
  old: string;
  off: string;
  thumb: Thumb;
}
const DEALS: Deal[] = [
  { id: "d_classicwood", name: "Classic Wood Board", sub: "Board Theme", cur: "gold", price: "2,250", raw: 2250, old: "4,500", off: "-50%", thumb: { kind: "img", file: "board-wood.png" } },
  { id: "d_dragon", name: "Crimson Legion Pieces", sub: "Piece Skin", cur: "gem", price: "180", raw: 180, old: "300", off: "-40%", thumb: { kind: "img", file: "crimson-king.png" } },
  { id: "d_focused", name: "Focused", sub: "Emote", cur: "gold", price: "1,200", raw: 1200, old: "2,000", off: "-40%", thumb: { kind: "emote", emoji: "🎯" } },
  { id: "d_silver", name: "Silver Knight Frame", sub: "Profile Frame", cur: "gold", price: "1,500", raw: 1500, old: "2,500", off: "-40%", thumb: { kind: "img", file: "frames/silver.png" } },
];

// local cart line
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

  // Real catalog (by StoreItem id) + owned item ids + in-flight purchase id.
  const [realItems, setRealItems] = useState<Record<string, StoreItemApi>>({});
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [buying, setBuying] = useState<string | null>(null);

  // Load the real catalog (public) once; load ownership only when logged in.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const data = await api.get<{ items: StoreItemApi[] }>("/api/store/items");
        if (!alive) return;
        const map: Record<string, StoreItemApi> = {};
        for (const it of data.items) map[it.id] = it;
        setRealItems(map);
      } catch {
        /* catalog visuals still render from the prototype defaults */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

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

  // Real, server-authoritative purchase for catalog tiles backed by a StoreItem.
  const buyReal = useCallback(
    async (realId: string, name: string) => {
      if (!me) {
        showToast("Sign in to buy items.");
        return;
      }
      setBuying(realId);
      try {
        const res = await api.post<{ balances: { gold: number; diamonds: number; trophies: number } }>(
          "/api/store/purchase",
          { itemId: realId },
        );
        patchMe({ gold: res.balances.gold, diamonds: res.balances.diamonds });
        setOwned((s) => new Set(s).add(realId));
        showToast(`${name} purchased!`);
      } catch (e) {
        showToast(e instanceof ApiError ? e.message : "Purchase failed.");
      } finally {
        setBuying(null);
      }
    },
    [me, patchMe, showToast],
  );

  const grid = useMemo(() => {
    if (tab === "All") return FEATURED_IDS.map((id) => CATALOG.find((it) => it.id === id)).filter(Boolean) as Item[];
    return CATALOG.filter((it) => it.cat === tab);
  }, [tab]);
  const gridTitle = tab === "All" ? "Featured Items" : tab;
  const showDeals = tab === "All";

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

  return (
    <div style={{ maxWidth: 1560, margin: "0 auto", padding: 26, display: "grid", gridTemplateColumns: "230px minmax(0,1fr) 320px", gap: 20, alignItems: "start" }}>
      {/* LEFT: categories */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div className="frame" style={{ padding: "14px 12px" }}>
          <div className="ptitle">Store Categories</div>
          {CAT_ROWS.map((c) => {
            const active = c.tab === "Currency" ? false : tab === c.tab;
            return (
              <button
                key={c.label}
                onClick={() => (c.tab === "Currency" ? showToast("Diamond top-ups arrive with online play.") : setTab(c.tab))}
                style={catBtn(active)}
              >
                <span style={{ color: active ? "var(--gold-lt)" : "var(--gold)", display: "flex" }}>
                  <CatIcon name={c.icon} />
                </span>
                <span style={{ font: "600 13px Inter" }}>{c.label}</span>
              </button>
            );
          })}
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
        {/* FEATURED PACK */}
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
              <button
                className="btn btn-gold"
                onClick={() => addToCart({ id: "heritage", name: "Royal Heritage Pack", sub: "Bundle", price: 1200, cur: "gem", thumb: { kind: "img", file: "ic-chest.png" } })}
                style={{ padding: "13px 28px" }}
              >
                Add to Cart
              </button>
            </div>
          </div>
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "radial-gradient(circle at 60% 45%,rgba(120,80,180,.4),transparent 70%)" }}>
            <img src={A("me-banner.png")} alt="Royal Heritage Pack" style={{ width: "min(80%,180px)", objectFit: "contain", filter: "drop-shadow(0 14px 26px rgba(0,0,0,.5))" }} />
          </div>
        </div>

        {/* FILTER TABS */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {FILTER_TABS.map((f) => (
            <button key={f.label} onClick={() => setTab(f.tab)} style={filterBtn(tab === f.tab)}>
              {f.label}
            </button>
          ))}
        </div>

        {/* FEATURED ITEMS */}
        <div className="divider">
          <i />
          <span>
            <Diamond /> {gridTitle} <Diamond />
          </span>
          <i />
        </div>
        {grid.length === 0 ? (
          <div className="frame" style={{ padding: 34, textAlign: "center", font: "500 13px Inter", color: "var(--ink2)" }}>
            No items in this category yet — check back soon.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
            {grid.map((it) => {
              const isSkin = it.cat === "Piece Skins";
              // Prefer the real StoreItem (price + currency + ownership) when this
              // catalog tile is backed by one; otherwise use the prototype values.
              const realId = REAL_ID[it.id];
              const real = realId ? realItems[realId] : undefined;
              const cur: Cur = real ? (real.priceDiamonds != null ? "gem" : "gold") : it.cur;
              const price = real ? (real.priceDiamonds ?? real.priceGold ?? 0) : it.price;
              const free = price === 0;
              const isOwned = !!realId && owned.has(realId);
              const isBuying = !!realId && buying === realId;
              const line: CartLine = { id: it.id, name: it.name, sub: subFor[it.cat], price: it.price, cur: it.cur, thumb: it.thumb };
              return (
                <div key={it.id} className="frame" style={{ padding: "16px 14px", position: "relative", display: "flex", flexDirection: "column", gap: 10, alignItems: "center", textAlign: "center" }}>
                  {isOwned ? (
                    <span style={{ position: "absolute", top: 9, left: 9, font: "700 9px Inter", letterSpacing: "1px", padding: "3px 7px", borderRadius: 5, background: "#2f8f5b", color: "#fff", zIndex: 2 }}>OWNED</span>
                  ) : it.tag ? (
                    <span style={{ position: "absolute", top: 9, left: 9, font: "700 9px Inter", letterSpacing: "1px", padding: "3px 7px", borderRadius: 5, background: "#2f8f5b", color: "#fff", zIndex: 2 }}>{it.tag}</span>
                  ) : null}
                  <div onClick={() => showToast(`${it.name} preview arrives with online play.`)} title="Preview" style={{ height: 70, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", width: "100%" }}>
                    {renderThumb(it.thumb, isSkin ? 52 : 64)}
                  </div>
                  <div>
                    <div style={{ font: "700 14px Inter", color: "#fff" }}>{it.name}</div>
                    <div style={{ font: "500 11px Inter", color: "var(--ink2)", marginTop: 2 }}>{subFor[it.cat]}</div>
                  </div>
                  <button onClick={() => showToast(`${it.name} preview arrives with online play.`)} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", padding: 0, color: "var(--gold)", font: "700 10px Inter", letterSpacing: ".8px", textTransform: "uppercase", cursor: "pointer" }}>
                    🔍 Preview
                  </button>
                  {isOwned ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, width: "100%", marginTop: "auto", font: "700 13px Inter", color: "#7ee6a4" }}>✓ Owned</div>
                  ) : free ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, width: "100%", marginTop: "auto", font: "700 14px 'JetBrains Mono',monospace", color: "var(--ink)" }}>Free</div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, width: "100%", marginTop: "auto" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 5, font: "700 14px 'JetBrains Mono',monospace", color: curColor(cur) }}>
                        <CurIcon cur={cur} /> {price.toLocaleString()}
                      </span>
                      <button
                        className="btn btn-purple"
                        disabled={isBuying}
                        onClick={() => (realId ? buyReal(realId, it.name) : addToCart(line))}
                        style={{ padding: "8px 16px", fontSize: 11, opacity: isBuying ? 0.7 : 1 }}
                      >
                        {isBuying ? "…" : "Buy"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* DAILY DEALS */}
        {showDeals && (
          <>
            <div className="divider">
              <i />
              <span>
                <Diamond /> Daily Deals · Ends in 12:45:32 <Diamond />
              </span>
              <i />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14 }}>
              {DEALS.map((d) => (
                <div key={d.id} className="frame" style={{ padding: 16, display: "flex", alignItems: "center", gap: 14, position: "relative" }}>
                  <div onClick={() => showToast(`${d.name} preview arrives with online play.`)} title="Preview" style={{ flex: "none", display: "flex", alignItems: "center", justifyContent: "center", width: 60, cursor: "pointer" }}>
                    {renderThumb(d.thumb, d.thumb.kind === "img" ? 58 : 42)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ font: "700 14px Inter", color: "#fff" }}>{d.name}</div>
                    <div style={{ font: "500 11px Inter", color: "var(--ink2)", margin: "2px 0 8px" }}>{d.sub}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 5, font: "700 14px 'JetBrains Mono',monospace", color: curColor(d.cur) }}>
                        <CurIcon cur={d.cur} /> {d.price}
                      </span>
                      <span style={{ font: "500 12px 'JetBrains Mono',monospace", color: "var(--ink2)", textDecoration: "line-through" }}>{d.old}</span>
                    </div>
                    <div style={{ display: "flex", gap: 14, marginTop: 10 }}>
                      <button onClick={() => showToast(`${d.name} preview arrives with online play.`)} style={{ background: "none", border: "none", padding: 0, color: "var(--gold)", font: "700 10px Inter", letterSpacing: ".8px", textTransform: "uppercase", cursor: "pointer" }}>
                        🔍 Preview
                      </button>
                      <button onClick={() => addToCart({ id: d.id, name: d.name, sub: d.sub, price: d.raw, cur: d.cur, thumb: d.thumb })} style={{ background: "none", border: "none", padding: 0, color: "#c9a6ff", font: "700 10px Inter", letterSpacing: ".8px", textTransform: "uppercase", cursor: "pointer" }}>
                        ＋ Add to Cart
                      </button>
                    </div>
                  </div>
                  <span style={{ position: "absolute", top: 12, right: 12, font: "700 11px Inter", padding: "4px 8px", borderRadius: 6, background: "#a83744", color: "#fff" }}>{d.off}</span>
                </div>
              ))}
            </div>
          </>
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
                <div style={{ width: 46, height: 46, flex: "none", marginRight: 2, display: "flex", alignItems: "center", justifyContent: "center" }}>{renderThumb(ci.thumb, ci.thumb.kind === "avatar" ? 46 : 40)}</div>
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
          <button className="btn btn-gold" onClick={() => showToast(cart.length ? "Checkout arrives with online play." : "Your cart is empty.")} style={{ width: "100%", marginTop: 12 }}>
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
          <button
            className="btn btn-red"
            onClick={() => addToCart({ id: "bundle_lny", name: "Lunar New Year Bundle", sub: "Bundle", price: 1080, cur: "gem", thumb: { kind: "img", file: "ic-chest.png" } })}
            style={{ width: "100%" }}
          >
            View Bundle
          </button>
        </div>
      </div>
    </div>
  );
}

export default StorePage;
