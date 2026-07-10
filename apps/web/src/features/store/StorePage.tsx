import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { useAppStore } from "../../stores/appStore";
import { useAuthStore } from "../../stores/authStore";
import { Piece } from "../../components/Piece";
import { StorePreviewModal, type StorePreview } from "./StorePreviewModal";
import { TopUpModal } from "./TopUpModal";
import { CheckoutModal, type CheckoutLine } from "./CheckoutModal";

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
 *   - The Featured Pack banner + Seasonal Offer are backed by real BUNDLE
 *     StoreItems (id "heritage" / "lunar"). "Add to Cart" adds the Royal Heritage
 *     Pack to the same client cart the tiles use; "View Bundle" opens the real
 *     StorePreviewModal (kind bundle) for the Lunar New Year Bundle, whose Buy
 *     action runs POST /api/store/purchase { itemId } like any other item.
 */

// ── the real StoreItem shape from GET /api/store/items ──
type StoreItemApi = {
  id: string;
  type: "BOARD" | "SKIN" | "AVATAR" | "FRAME" | "EMOTE" | "BUNDLE" | "SEASON_PASS";
  name: string;
  description: string | null;
  priceGold: number | null;
  priceDiamonds: number | null;
  /** Sale price (same currency as the item's base price) when onSale — from GET /api/store/items. */
  salePrice: number | null;
  /** Whether the item is currently discounted (drives the Daily Deals section). */
  onSale: boolean;
  /** Whether the item is curated onto the Featured tab. */
  featured: boolean;
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
type Thumb =
  | { kind: "img"; file: string }
  | { kind: "portrait"; file: string }
  | { kind: "disc" }
  | { kind: "emoji"; glyph: string };

/**
 * The emote's emoji — the prototype renders emotes as emoji glyphs, not images
 * (there is NO emote art file in the handoff). The seed stores it on the item as
 * previewKey "emote:<glyph>"; we read that first (single source of truth), and
 * fall back to a per-id map only if an older seed lacks it.
 */
const EMOTE_EMOJI: Record<string, string> = {
  victory: "👑",
  focused: "🎯",
  "emote-resolve": "💪",
};
function emoteGlyph(it: StoreItemApi): string {
  if (it.previewKey?.startsWith("emote:")) return it.previewKey.slice("emote:".length);
  return EMOTE_EMOJI[it.id] ?? "👑";
}

/** Resolve the thumbnail from the item's real type + assetKey. */
function thumbFor(it: StoreItemApi): Thumb {
  const a = it.assetKey;
  switch (it.type) {
    case "BOARD":
      // assetKey like "board-ebony.png"
      return { kind: "img", file: a.endsWith(".png") ? a : `board-${a}.png` };
    case "SKIN": {
      // The premium skins have real coin art at pieces/skins/<skin>/<color>-<rank>.
      // The default "Classic" skin (assetKey "classic") has NO art in the
      // prototype — it renders as the procedural CSS disc piece.
      if (a === "classic") return { kind: "disc" };
      return { kind: "img", file: `pieces/skins/${a}/red-king.png` };
    }
    case "AVATAR":
      // assetKey like "avatars/sovereign.png"
      return { kind: "portrait", file: a.startsWith("avatars/") ? a : `avatars/${a}` };
    case "FRAME":
      // assetKey like "laurel.png" or "frames/silver.png"
      return { kind: "img", file: a.includes("/") ? a : a };
    case "EMOTE":
      // Emotes are emoji, not images — render the item's own glyph (💪/👑/🎯),
      // never a shared placeholder chest.
      return { kind: "emoji", glyph: emoteGlyph(it) };
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
  if (t.kind === "disc")
    return (
      <div style={{ position: "relative", width: size, height: size }}>
        <Piece color="red" king />
      </div>
    );
  if (t.kind === "emoji")
    // Big emoji glyph in a soft gold radial glow — matches the prototype's emote
    // thumbnail (fontSize ≈ size × 0.8).
    return (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: Math.round(size * 0.8),
          lineHeight: 1,
          background: "radial-gradient(circle at 50% 45%,rgba(232,184,75,.18),transparent 70%)",
        }}
      >
        {t.glyph}
      </div>
    );
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
// When onSale, `price` is the (discounted) sale price the buyer pays and adds to
// cart; `origPrice` is the struck-through base price and `discountPct` the badge.
type ShopItem = StoreItemApi & {
  cur: Cur;
  price: number;
  free: boolean;
  sub: string;
  thumb: Thumb;
  /** The item's base (pre-sale) price in `cur` — always the real priceGold/priceDiamonds. */
  origPrice: number;
  /** True only when the API flags it onSale AND a valid, cheaper salePrice exists. */
  deal: boolean;
  /** Whole-percent discount for the "-N%" badge (0 when not a deal). */
  discountPct: number;
};

function resolve(it: StoreItemApi): ShopItem {
  const cur: Cur = it.priceDiamonds != null ? "gem" : "gold";
  const origPrice = it.priceDiamonds ?? it.priceGold ?? 0;
  // A real deal: server says onSale, salePrice is present, positive, and below base.
  const deal = it.onSale && it.salePrice != null && it.salePrice > 0 && it.salePrice < origPrice;
  const price = deal ? (it.salePrice as number) : origPrice;
  const discountPct = deal ? Math.round((1 - price / origPrice) * 100) : 0;
  return {
    ...it,
    cur,
    price,
    free: price === 0,
    sub: TYPE_META[it.type].sub,
    thumb: thumbFor(it),
    origPrice,
    deal,
    discountPct,
  };
}

// ── preview resolution ──
// Flat piece-art PNGs that exist under public/assets for the built-in skins
// (crimson-/jade-/obsidian-<color>-<man|king>.png). Portrait "skins" (babaylan
// etc.) fall through to a portrait token instead.
/** Premium skin folders that have real coin art under pieces/skins/<folder>/. */
const SKIN_FOLDERS = new Set([
  "crimson", "jade", "obsidian",
  // Meshy-generated premium skins (red+blue × man+king coins present in each).
  "sarimanok", "bakunawa", "sunstars", "tamaraw", "baybayin",
]);
/** The premium skin folder for an item, from its assetKey; undefined = default. */
function skinArtOf(assetKey: string): string | undefined {
  return SKIN_FOLDERS.has(assetKey) ? assetKey : undefined;
}

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
    // Premium skin → its real coin art (crimson/jade/obsidian). Default "Classic"
    // (assetKey "classic") → the procedural CSS disc, NOT any character webp.
    return { ...base, kind: "skin", skinArt: skinArtOf(it.assetKey), pieceSkin: "default" };
  }
  if (it.type === "AVATAR") {
    return { ...base, kind: "avatar", portraitFile: thumb.kind === "portrait" ? thumb.file : `avatars/${it.assetKey}` };
  }
  if (it.type === "FRAME") {
    return { ...base, kind: "frame", frameFile: thumb.kind === "img" ? thumb.file : `frames/${it.assetKey}` };
  }
  if (it.type === "EMOTE") {
    return { ...base, kind: "emote", emoji: emoteGlyph(it) };
  }
  if (it.type === "BUNDLE") {
    return { ...base, kind: "bundle", bundleItems: BUNDLE_CONTENTS[it.id] ?? [] };
  }
  if (it.type === "SEASON_PASS") {
    return { ...base, kind: "season", bundleItems: BUNDLE_CONTENTS.seasonpass ?? [] };
  }
  // safe fallback
  if (thumb.kind === "portrait") return { ...base, kind: "avatar", portraitFile: thumb.file };
  if (thumb.kind === "disc") return { ...base, kind: "skin", skinArt: undefined, pieceSkin: "default" };
  if (thumb.kind === "emoji") return { ...base, kind: "emote", emoji: thumb.glyph };
  return { ...base, kind: "board", boardFile: thumb.file };
}

/** Bundle contents (prototype _bundleContents): the items each bundle includes. */
const BUNDLE_CONTENTS: Record<string, { name: string; sub: string }[]> = {
  heritage: [
    { name: "Imperial Ebony Board", sub: "Board Theme" },
    { name: "Crimson Legion Pieces", sub: "Piece Skin" },
    { name: "Golden Laurel Frame", sub: "Profile Frame" },
    { name: "Victory Royale", sub: "Emote" },
  ],
  lunar: [
    { name: "Jade Dragon Pieces", sub: "Piece Skin" },
    { name: "Marble Court Board", sub: "Board Theme" },
    { name: "Focused", sub: "Emote" },
  ],
  seasonpass: [
    { name: "30 Tiers of Rewards", sub: "Gold, Diamonds & Cosmetics" },
    { name: "Exclusive Season Skin", sub: "Premium Track" },
    { name: "Bonus XP Boost", sub: "Season-long" },
  ],
};

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
  // Real-money diamond top-up is off by default (gold-only store). When off we
  // hide the "Currency" (buy-Diamonds) category entirely.
  const diamondTopUp = useAuthStore((s) => s.providers.diamondTopUp);
  const showToast = useAppStore((s) => s.showToast);
  const navigate = useNavigate();

  const [tab, setTab] = useState<string>("All");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false); // checkout confirmation modal
  const [checkoutSeq, setCheckoutSeq] = useState(0); // bumped on each open to reset the modal's internal Review/Receipt state

  const [items, setItems] = useState<ShopItem[] | null>(null); // null = loading
  const [loadError, setLoadError] = useState(false);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [buying, setBuying] = useState<string | null>(null);
  const [preview, setPreview] = useState<ShopItem | null>(null); // open preview modal
  const [topUpOpen, setTopUpOpen] = useState(false); // open Diamond top-up modal

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

  // ── Deep link: /store?item=<id> opens that item's preview + its category tab ──
  // Used by Home's "Hot in the Store" card so a click lands ON the item, not just
  // the store. Runs once the catalog is loaded; the param is then cleaned so a
  // refresh / back-nav doesn't re-open it.
  useEffect(() => {
    if (!items || !items.length) return;
    const params = new URLSearchParams(window.location.search);
    const wantId = params.get("item");
    if (!wantId) return;
    const target = items.find((i) => i.id === wantId);
    if (target) {
      setTab(TYPE_META[target.type].label); // switch to its category so it's visible behind the modal
      setPreview(target); // open the preview modal on the item
    }
    // Strip ?item so a reload doesn't re-trigger.
    params.delete("item");
    const clean = window.location.pathname + (params.toString() ? `?${params}` : "");
    window.history.replaceState(null, "", clean);
  }, [items]);

  // ── Post-payment reconciliation ──
  // PayMongo redirects back to /store?purchase=success right after checkout, but
  // the diamonds are credited ASYNCHRONOUSLY by the signature-verified webhook —
  // which can land a few seconds AFTER the redirect. So on return we poll
  // /api/auth/me until the diamond balance rises (or a timeout), updating the UI
  // the moment the credit arrives instead of leaving the old balance on screen.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("purchase");
    if (!outcome) return;

    // Clean the query param immediately so a refresh / back-nav doesn't re-trigger.
    params.delete("purchase");
    const clean = window.location.pathname + (params.toString() ? `?${params}` : "");
    window.history.replaceState(null, "", clean);

    if (outcome === "cancelled") {
      showToast("Checkout cancelled — no charge was made.");
      return;
    }
    if (outcome !== "success") return;

    let alive = true;
    let settled = false;
    const startDiamonds = useAuthStore.getState().me?.diamonds ?? 0;
    showToast("Payment received — crediting your Diamonds…");

    // Poll ~every 2.5s for up to ~25s (webhook usually lands within a few seconds).
    const MAX_TRIES = 10;
    let tries = 0;
    const tick = async () => {
      if (!alive || settled) return;
      tries += 1;
      try {
        const { user } = await api.get<{ user: { diamonds: number; gold: number } }>("/api/auth/me");
        if (!alive) return;
        if (user.diamonds > startDiamonds) {
          settled = true;
          patchMe({ diamonds: user.diamonds, gold: user.gold });
          showToast(`✓ ${(user.diamonds - startDiamonds).toLocaleString()} Diamonds added!`);
          return;
        }
      } catch {
        /* transient — keep polling */
      }
      if (tries < MAX_TRIES) {
        timer = window.setTimeout(tick, 2500);
      } else if (alive) {
        // Credit hadn't landed yet — reassure rather than alarm; it will appear.
        showToast("Payment confirmed. Your Diamonds will appear shortly.");
      }
    };
    let timer = window.setTimeout(tick, 1200);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
    // Run once on mount (the redirect is a full page load).
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // A real StoreItem → a cart line (name/price/currency all straight from the API).
  const cartLineOf = (it: ShopItem): CartLine => ({ id: it.id, name: it.name, sub: it.sub, price: it.price, cur: it.cur, thumb: it.thumb });

  // Look up a live catalog item by id (used by the Featured Pack / Seasonal Offer
  // marketing banners, which are backed by real BUNDLE items "heritage"/"lunar").
  const itemById = useCallback((id: string) => items?.find((i) => i.id === id) ?? null, [items]);

  // Server-authoritative purchase. Returns true on success, false on failure, so
  // callers (e.g. cart checkout) can react to a partial failure instead of
  // assuming every line succeeded.
  const buy = useCallback(
    async (it: ShopItem): Promise<boolean> => {
      if (!me) {
        showToast("Sign in to buy items.");
        return false;
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
        return true;
      } catch (e) {
        showToast(e instanceof ApiError ? e.message : "Purchase failed.");
        return false;
      } finally {
        setBuying(null);
      }
    },
    [me, patchMe, showToast],
  );

  // Checkout confirmation: run the REAL purchase loop for every cart line and
  // report back exactly which items the server actually granted. Successful
  // lines are removed from the cart; any line that fails (e.g. insufficient
  // funds) — and every line after it — stays in the cart. The granted names are
  // the real StoreItem names of the lines the server confirmed, never fabricated.
  const checkoutConfirm = useCallback(async (): Promise<{ granted: string[] }> => {
    const lines = [...cart];
    const granted: string[] = [];
    let failedFrom = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const it = items?.find((x) => x.id === line.id);
      const okBuy = it ? await buy(it) : false;
      if (okBuy) {
        granted.push(line.name);
      } else {
        // this line + all remaining lines stay in the cart
        failedFrom = i;
        break;
      }
    }
    setCart(failedFrom >= 0 ? lines.slice(failedFrom) : []);
    if (granted.length === 0) {
      // Nothing was granted (e.g. first line failed) — surface it and keep the
      // modal in Review so the CheckoutModal never shows an empty receipt.
      throw new Error("CHECKOUT_NONE_GRANTED");
    }
    return { granted };
  }, [cart, items, buy]);

  // Types actually present in the live catalog → drives rail + filter tabs.
  const presentTypes = useMemo(() => {
    if (!items) return [];
    const set = new Set(items.map((i) => i.type));
    return TYPE_ORDER.filter((t) => set.has(t));
  }, [items]);

  const isFeaturedTab = tab === "All";

  // On-sale items → the "Daily Deals" section (Featured/All tab only). Backed by
  // real StoreItems flagged onSale with a valid salePrice; never fabricated.
  const deals = useMemo(() => (items ? items.filter((i) => i.deal) : []), [items]);

  // Grid contents for the active tab. The Featured/All tab shows only the CURATED
  // featured items (featured===true), NOT the whole catalog. Every other tab shows
  // the full contents of that item type.
  const grid = useMemo(() => {
    if (!items) return [];
    if (isFeaturedTab) return items.filter((i) => i.featured);
    return items.filter((i) => TYPE_META[i.type].label === tab);
  }, [items, tab, isFeaturedTab]);
  const gridTitle = isFeaturedTab ? "Featured Items" : tab;

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
    <div className="fd-stack fd-page-pad" style={{ maxWidth: 1560, margin: "0 auto", padding: 26, display: "grid", gridTemplateColumns: "230px minmax(0,1fr) 320px", gap: 20, alignItems: "start" }}>
      {/* LEFT: categories */}
      <div className="fd-order-last" style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
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
          {diamondTopUp && (
            <button key="Currency" onClick={() => setTopUpOpen(true)} style={catBtn(false)}>
              <span style={{ color: "var(--gold)", display: "flex" }}>
                <CatIcon name="coin" />
              </span>
              <span style={{ font: "600 13px Inter" }}>Currency</span>
            </button>
          )}
        </div>
        <div className="frame" style={{ padding: 20, textAlign: "center" }}>
          <div className="ptitle">Member Benefits</div>
          <div style={{ font: "400 12px/1.5 Inter", color: "var(--ink)", marginBottom: 14 }}>Exclusive discounts, free items, and monthly rewards!</div>
          {/* The "member benefits" ARE the Royal Season Pass (free + premium reward
              track, monthly rewards). Send the player to the real Season page where
              they can view and unlock it — instead of a dead toast. */}
          <button className="btn btn-gold" onClick={() => navigate("/season")} style={{ width: "100%", padding: 11, fontSize: 12 }}>
            View Benefits
          </button>
        </div>
      </div>

      {/* CENTER */}
      <div className="fd-order-1" style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
        {/* FEATURED PACK (prototype marketing chrome — no real StoreItem backs it) */}
        <div className="frame fd-collapse-2" style={{ padding: 0, overflow: "hidden", display: "grid", gridTemplateColumns: "1.1fr .9fr" }}>
          <div style={{ padding: 28 }}>
            <div style={{ font: "700 11px Inter", letterSpacing: "2px", color: "var(--gold)" }}>✦ FEATURED COLLECTION ✦</div>
            <h1 style={{ margin: "10px 0 6px", font: "800 clamp(22px,6vw,34px) Cinzel,serif", color: "var(--gold-lt)" }}>Royal Heritage Pack</h1>
            <div style={{ font: "500 14px Inter", color: "#fff", marginBottom: 16 }}>Rule the board with timeless royalty.</div>
            <div className="fd-collapse-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", marginBottom: 20 }}>
              {["Exclusive Royal Board", "Royal Avatar & Frame", "Crown Piece Skins", "Victory Emotes"].map((w) => (
                <span key={w} style={{ display: "flex", alignItems: "center", gap: 8, font: "500 13px Inter", color: "var(--ink)" }}>
                  <Check /> {w}
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              {(() => {
                // Show the Heritage Pack's real, live catalog price (gold-only
                // store), not a hardcoded diamond figure. Falls back gracefully
                // if the item hasn't loaded yet.
                const h = itemById("heritage");
                const cur: Cur = h?.cur ?? "gold";
                return (
                  <span className="pill" style={{ color: cur === "gem" ? "#ff9aa8" : "#f2d493" }}>
                    <CurIcon cur={cur} /> {(h?.price ?? 12000).toLocaleString()}
                  </span>
                );
              })()}
              <button
                className="btn btn-gold"
                onClick={() => {
                  const heritage = itemById("heritage");
                  if (!heritage) {
                    showToast("The Royal Heritage Pack is unavailable right now.");
                    return;
                  }
                  if (owned.has(heritage.id)) {
                    showToast("You already own the Royal Heritage Pack.");
                    return;
                  }
                  addToCart(cartLineOf(heritage));
                }}
                style={{ padding: "13px 28px" }}
              >
                Add to Cart
              </button>
            </div>
          </div>
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, minWidth: 0, background: "radial-gradient(circle at 60% 45%,rgba(120,80,180,.4),transparent 70%)" }}>
            <img src={A("me-banner.png")} alt="Royal Heritage Pack" style={{ width: "min(80%,180px)", maxWidth: "100%", objectFit: "contain", filter: "drop-shadow(0 14px 26px rgba(0,0,0,.5))" }} />
          </div>
        </div>

        {/* FILTER TABS (derived from the live catalog's item types) */}
        <div className="fd-chip-strip" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
          <div className="fd-grid-2up" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14 }}>
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
                  {/* Preview + Add-to-Cart action row (matches the handoff store
                      card: 🔍 Preview  ＋ Add to Cart). Owned/free items skip the
                      cart action. */}
                  <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
                    <button className="fd-tap" onClick={() => setPreview(it)} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", padding: 0, color: "var(--gold)", font: "700 10px Inter", letterSpacing: ".8px", textTransform: "uppercase", cursor: "pointer" }}>
                      🔍 Preview
                    </button>
                    {!isOwned && !it.free && (
                      <button
                        className="fd-tap"
                        disabled={isBuying}
                        onClick={() => addToCart(cartLineOf(it))}
                        title="Add to Cart"
                        style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", padding: 0, color: "#c9a6ff", font: "700 10px Inter", letterSpacing: ".8px", textTransform: "uppercase", cursor: isBuying ? "default" : "pointer", opacity: isBuying ? 0.6 : 1 }}
                      >
                        ＋ Add to Cart
                      </button>
                    )}
                  </div>
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

        {/* DAILY DEALS — on-sale items (Featured/All tab only). Each card shows the
            discounted price (added to cart), the struck-through base price, and a
            red "-N%" badge. Buying still POSTs /api/store/purchase {itemId}; the
            server charges the real (sale) price. */}
        {isFeaturedTab && deals.length > 0 && (
          <>
            <div className="divider">
              <i />
              <span>
                <Diamond /> Daily Deals <Diamond />
              </span>
              <i />
            </div>
            <div className="fd-collapse-2" style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14 }}>
              {deals.map((it) => {
                const isOwned = owned.has(it.id);
                const isBuying = buying === it.id;
                return (
                  <div key={it.id} className="frame" style={{ padding: 16, display: "flex", alignItems: "center", gap: 14, position: "relative", minWidth: 0 }}>
                    <div onClick={() => setPreview(it)} title="Preview" style={{ flex: "none", display: "flex", alignItems: "center", justifyContent: "center", width: 60, cursor: "pointer" }}>
                      {renderThumb(it.thumb, it.thumb.kind === "portrait" ? 56 : 60)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: "700 14px Inter", color: "#fff" }}>{it.name}</div>
                      <div style={{ font: "500 11px Inter", color: "var(--ink2)", margin: "2px 0 8px" }}>{it.sub}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 5, font: "700 14px 'JetBrains Mono',monospace", color: curColor(it.cur) }}>
                          <CurIcon cur={it.cur} /> {it.price.toLocaleString()}
                        </span>
                        <span style={{ font: "500 12px 'JetBrains Mono',monospace", color: "var(--ink2)", textDecoration: "line-through" }}>{it.origPrice.toLocaleString()}</span>
                      </div>
                      <div style={{ display: "flex", gap: 14, marginTop: 10 }}>
                        <button className="fd-tap" onClick={() => setPreview(it)} style={{ background: "none", border: "none", padding: 0, color: "var(--gold)", font: "700 10px Inter", letterSpacing: ".8px", textTransform: "uppercase", cursor: "pointer" }}>
                          🔍 Preview
                        </button>
                        {isOwned ? (
                          <span style={{ font: "700 10px Inter", letterSpacing: ".8px", textTransform: "uppercase", color: "#3fbf6f" }}>✓ Owned</span>
                        ) : (
                          <button
                            className="fd-tap"
                            disabled={isBuying}
                            onClick={() => addToCart(cartLineOf(it))}
                            style={{ background: "none", border: "none", padding: 0, color: "#c9a6ff", font: "700 10px Inter", letterSpacing: ".8px", textTransform: "uppercase", cursor: isBuying ? "default" : "pointer", opacity: isBuying ? 0.6 : 1 }}
                          >
                            ＋ Add to Cart
                          </button>
                        )}
                      </div>
                    </div>
                    <span style={{ position: "absolute", top: 12, right: 12, font: "700 11px Inter", padding: "4px 8px", borderRadius: 6, background: "#a83744", color: "#fff" }}>-{it.discountPct}%</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* RIGHT: cart + seasonal */}
      <div className="fd-order-2" style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
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
                <button className="fd-tap" onClick={() => removeFromCart(ci.id)} style={{ width: 26, height: 26, flex: "none", borderRadius: 6, border: "1px solid rgba(232,184,75,.25)", background: "rgba(0,0,0,.3)", color: "var(--ink2)", cursor: "pointer" }}>
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
              // Open the prototype's Review Order → Confirm Purchase modal. The
              // actual server-authoritative purchases run only when the buyer
              // confirms inside the modal (see checkoutConfirm below). Bump the
              // key so the modal always opens fresh on the Review state.
              setCheckoutSeq((n) => n + 1);
              setCheckoutOpen(true);
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
            <span style={{ display: "flex", alignItems: "center", gap: 6, font: "800 18px 'JetBrains Mono',monospace", color: "#f2d493" }}>
              <CurIcon cur="gold" size={18} /> 10,800
            </span>
            <span style={{ font: "500 13px 'JetBrains Mono',monospace", color: "var(--ink2)", textDecoration: "line-through" }}>16,800</span>
            <span style={{ font: "700 11px Inter", padding: "3px 8px", borderRadius: 6, background: "#a83744", color: "#fff" }}>-35%</span>
          </div>
          <button
            className="btn btn-red"
            onClick={() => {
              const lunar = itemById("lunar");
              if (!lunar) {
                showToast("The Lunar New Year Bundle is unavailable right now.");
                return;
              }
              setPreview(lunar);
            }}
            style={{ width: "100%" }}
          >
            View Bundle
          </button>
        </div>
      </div>

      {/* Store item preview modal — opens on a tile's thumb / "🔍 Preview" link.
          For an on-sale item the modal already receives the discounted price via
          previewFor (base.price = it.price = salePrice). The struck-through ORIGINAL
          price can't be shown here yet: StorePreview (StorePreviewModal.tsx, not in
          this task's editable scope) exposes no old-price prop, so we skip it
          gracefully rather than pass an unsupported field. */}
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

      {/* Checkout confirmation modal (prototype Review Order → Purchase Complete).
          Cart lines carry the real StoreItem name/sub/price/currency; confirming
          runs the real POST /api/store/purchase loop and the receipt lists exactly
          the items the server granted. */}
      <CheckoutModal
        key={checkoutSeq}
        open={checkoutOpen}
        cart={cart.map<CheckoutLine>((c) => ({ id: c.id, name: c.name, sub: c.sub, price: c.price, cur: c.cur }))}
        onCancel={() => setCheckoutOpen(false)}
        onConfirm={checkoutConfirm}
        onKeepShopping={() => setCheckoutOpen(false)}
        onViewLocker={() => {
          setCheckoutOpen(false);
          navigate("/inventory");
        }}
      />

      {/* Diamond top-up modal — opens from the "Currency" category button. */}
      <TopUpModal open={topUpOpen} onClose={() => setTopUpOpen(false)} />
    </div>
  );
}

export default StorePage;
