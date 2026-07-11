import { create } from "zustand";
import { api } from "../lib/api";

/**
 * cosmeticsStore — the bridge between an account's EQUIPPED cosmetics (stored as
 * store-item IDs on the user: equippedSkin / frameId, and the emote loadout) and
 * the ART KEYS the renderers actually need.
 *
 * The problem this solves: the user carries item ids like "sarimanokskin" /
 * "jadedragonf", but the piece/frame/emote renderers key on the item's assetKey
 * ("sarimanok" / "frames/jade-dragon.png") or its emote glyph. That mapping lives
 * only in the store catalog (GET /api/store/items). We load it ONCE and expose
 * pure resolvers so every surface (nav, board, profile, emote tray) turns an
 * equipped id into the right art the same way.
 *
 * Falls back gracefully: an unknown id resolves to null so callers can use their
 * own default (e.g. the classic disc / no frame).
 */

type CatalogItem = {
  id: string;
  type: string;
  assetKey: string;
  previewKey: string | null;
  priceGold: number | null;
};

interface CosmeticsState {
  /** id → assetKey, for every catalog item (loaded once). */
  byId: Record<string, CatalogItem>;
  loaded: boolean;
  loading: boolean;
  /** fetch the catalog once; safe to call repeatedly. */
  load: () => Promise<void>;
  /** equipped SKIN item id → PieceSkin art key (assetKey), or "default". */
  skinKey: (equippedSkinId: string | null | undefined) => string;
  /** equipped FRAME item id → frame art key (the assetKey path frameArt accepts), or null. */
  frameKey: (frameId: string | null | undefined) => string | null;
  /** equipped BOARD item id → board texture key (assetKey), or null. */
  boardKey: (equippedBoardId: string | null | undefined) => string | null;
  /** emote item id → emoji glyph (from previewKey "emote:<glyph>"), or the id. */
  emoteGlyph: (emoteId: string) => string;
  /** glyphs of ALL free (priceGold 0) EMOTE items — the in-match reactions row. */
  freeEmoteGlyphs: () => string[];
}

export const useCosmeticsStore = create<CosmeticsState>((set, get) => ({
  byId: {},
  loaded: false,
  loading: false,

  load: async () => {
    if (get().loaded || get().loading) return;
    set({ loading: true });
    try {
      const { items } = await api.get<{ items: CatalogItem[] }>("/api/store/items");
      const byId: Record<string, CatalogItem> = {};
      for (const it of items) byId[it.id] = it;
      set({ byId, loaded: true, loading: false });
    } catch {
      set({ loading: false }); // leave loaded=false; resolvers fall back
    }
  },

  skinKey: (id) => {
    if (!id) return "default";
    const it = get().byId[id];
    // The SKIN item's assetKey IS the PieceSkin art key ("sarimanok" etc.).
    // "classic" maps to the default disc.
    const key = it?.assetKey;
    if (!key || key === "classic") return "default";
    return key;
  },

  frameKey: (id) => {
    if (!id) return null;
    const it = get().byId[id];
    // FRAME assetKey is a path like "frames/jade-dragon.png" — frameArt() accepts
    // that (it contains "/"), resolving under /assets. Fall back to the raw id so
    // a legacy frame whose id already equals its key still works.
    return it?.assetKey ?? id;
  },

  boardKey: (id) => {
    if (!id) return null;
    const it = get().byId[id];
    if (!it?.assetKey) return null;
    // A BOARD item's assetKey is a filename like "board-ebony.png", but the
    // Board component keys on a BoardTextureKey ("ebony"/"marble"/"wood"/...).
    // Derive it: strip the "board-" prefix + extension, then only return it if
    // it's a real texture key — otherwise null so the caller keeps the default
    // and the board never renders blank.
    const derived = it.assetKey.replace(/^board-/, "").replace(/\.\w+$/, "");
    const known = new Set(["marble", "classic", "wood", "ebony", "obsidian"]);
    return known.has(derived) ? derived : null;
  },

  emoteGlyph: (id) => {
    const it = get().byId[id];
    if (it?.previewKey?.startsWith("emote:")) return it.previewKey.slice("emote:".length);
    return id;
  },

  freeEmoteGlyphs: () => {
    const items = Object.values(get().byId);
    return items
      .filter((it) => it.type === "EMOTE" && it.priceGold === 0 && it.previewKey?.startsWith("emote:"))
      .map((it) => it.previewKey!.slice("emote:".length));
  },
}));
