import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

/**
 * Seeds the store catalog, quests, a season, demo bots, and a few finished
 * matches. Asset keys map to files listed in handoff/ASSETS.md (served from
 * apps/web/public/assets). CONFIRM prices against the prototype Store.
 */
/**
 * The store catalog — the EXACT 26-item catalog from the prototype
 * (FilipinoDama Royal.dc.html line 3889). Same ids, names, categories, prices,
 * currency (gold/gem→diamonds), tags, and preview asset keys. Do not reduce or
 * rename — this is the approved catalog, forked verbatim.
 *
 * cur 'gem' → priceDiamonds; cur 'gold' → priceGold. previewKey carries the
 * prototype pv.{img|art|asset|emoji|bundle} so the preview renders correctly.
 * The two free defaults every player owns: skin-classic ("Crimson & Royal") is
 * NOT in the paid catalog list; the default board is board-marble but the
 * prototype prices Marble Court at 4,200 gold — so we keep a separate free
 * default board/skin (below) and add the full paid catalog here.
 */
const STORE = [
  // ── free defaults (granted to every new player) ──
  { id: "board-marble-default", type: "BOARD", name: "Marble & Gold", description: "The classic default board.", assetKey: "board-marble.png", previewKey: "board:board-marble.png", priceGold: 0, sortOrder: 0 },
  { id: "skin-classic", type: "SKIN", name: "Classic", description: "The classic default pieces.", assetKey: "classic", previewKey: "skin:classic", priceGold: 0, sortOrder: 1 },
  { id: "emote-resolve", type: "EMOTE", name: "Warrior's Resolve", assetKey: "victory", previewKey: "emote:💪", priceGold: 0, sortOrder: 2 },

  // ── Board Themes ──
  { id: "ebony", type: "BOARD", name: "Imperial Ebony Board", assetKey: "board-ebony.png", previewKey: "board:board-ebony.png", priceDiamonds: 480, tag: "NEW", featured: true, sortOrder: 10 },
  { id: "marble", type: "BOARD", name: "Marble Court Board", assetKey: "board-marble.png", previewKey: "board:board-marble.png", priceGold: 4200, sortOrder: 11 },
  { id: "classicwood", type: "BOARD", name: "Classic Wood Board", assetKey: "board-wood.png", previewKey: "board:board-wood.png", priceGold: 4500, salePrice: 2250, onSale: true, sortOrder: 12 },
  { id: "obsidian", type: "BOARD", name: "Obsidian Court Board", assetKey: "board-obsidian.png", previewKey: "board:board-obsidian.png", priceDiamonds: 520, tag: "PREMIUM", isPremium: true, sortOrder: 13 },

  // ── Piece Skins ──
  { id: "jadeskin", type: "SKIN", name: "Jade Dragon Pieces", assetKey: "jade", previewKey: "skin:jade", priceDiamonds: 360, tag: "NEW", featured: true, sortOrder: 20 },
  { id: "crimsonskin", type: "SKIN", name: "Crimson Legion Pieces", assetKey: "crimson", previewKey: "skin:crimson", priceDiamonds: 300, salePrice: 180, onSale: true, featured: true, sortOrder: 21 },
  { id: "obsidianskin", type: "SKIN", name: "Obsidian Court Pieces", assetKey: "obsidian", previewKey: "skin:obsidian", priceDiamonds: 420, tag: "PREMIUM", isPremium: true, sortOrder: 22 },

  // ── Avatars ──
  { id: "sovereign", type: "AVATAR", name: "Royal Sovereign", assetKey: "avatars/sovereign.png", previewKey: "avatar:avatars/sovereign.png", priceDiamonds: 280, tag: "NEW", sortOrder: 30 },
  { id: "dayang", type: "AVATAR", name: "Dayang Warrior", assetKey: "avatars/dayang.png", previewKey: "avatar:avatars/dayang.png", priceGold: 2600, sortOrder: 31 },
  { id: "priestess", type: "AVATAR", name: "Jade Dragon Priestess", assetKey: "avatars/priestess.png", previewKey: "avatar:avatars/priestess.png", priceDiamonds: 320, tag: "PREMIUM", isPremium: true, sortOrder: 32 },
  { id: "champion", type: "AVATAR", name: "Horned Champion", assetKey: "avatars/champion.png", previewKey: "avatar:avatars/champion.png", priceDiamonds: 300, sortOrder: 33 },
  { id: "sultan", type: "AVATAR", name: "Golden Rajah", assetKey: "avatars/sultan.png", previewKey: "avatar:avatars/sultan.png", priceGold: 3200, sortOrder: 34 },
  { id: "strategist", type: "AVATAR", name: "Bronze Strategist", assetKey: "avatars/strategist.png", previewKey: "avatar:avatars/strategist.png", priceGold: 2400, sortOrder: 35 },
  { id: "bagani", type: "AVATAR", name: "Bagani Warrior", assetKey: "avatars/bagani.png", previewKey: "avatar:avatars/bagani.png", priceGold: 2200, sortOrder: 36 },
  { id: "mandirigma", type: "AVATAR", name: "Mandirigma", assetKey: "avatars/mandirigma.png", previewKey: "avatar:avatars/mandirigma.png", priceGold: 2200, sortOrder: 37 },
  { id: "babaylan", type: "AVATAR", name: "Babaylan Elder", assetKey: "avatars/babaylan.png", previewKey: "avatar:avatars/babaylan.png", priceGold: 2000, sortOrder: 38 },
  { id: "diwata", type: "AVATAR", name: "Diwata Spirit", assetKey: "avatars/diwata.png", previewKey: "avatar:avatars/diwata.png", priceDiamonds: 260, sortOrder: 39 },
  { id: "ermitanyo", type: "AVATAR", name: "Ermitaño Hermit", assetKey: "avatars/ermitanyo.png", previewKey: "avatar:avatars/ermitanyo.png", priceGold: 1800, sortOrder: 40 },

  // ── Profile Frames ──
  { id: "laurel", type: "FRAME", name: "Golden Laurel Frame", assetKey: "laurel.png", previewKey: "frame:laurel.png", priceGold: 2200, sortOrder: 50 },
  { id: "silver", type: "FRAME", name: "Silver Knight Frame", assetKey: "frames/silver.png", previewKey: "frame:frames/silver.png", priceGold: 2500, salePrice: 1500, onSale: true, sortOrder: 51 },
  { id: "obsidianf", type: "FRAME", name: "Obsidian Sovereign Frame", assetKey: "frames/obsidian.png", previewKey: "frame:frames/obsidian.png", priceDiamonds: 340, tag: "PREMIUM", isPremium: true, sortOrder: 52 },

  // ── Emotes ──
  { id: "victory", type: "EMOTE", name: "Victory Royale", assetKey: "victory", previewKey: "emote:👑", priceGold: 1500, sortOrder: 60 },
  { id: "focused", type: "EMOTE", name: "Focused", assetKey: "focused", previewKey: "emote:🎯", priceGold: 2000, salePrice: 1200, onSale: true, sortOrder: 61 },

  // ── Bundles ──
  { id: "heritage", type: "BUNDLE", name: "Royal Heritage Pack", assetKey: "me-banner.png", previewKey: "bundle:heritage", priceDiamonds: 1200, tag: "VALUE", isPremium: true, bundleItems: ["ebony", "crimsonskin", "laurel", "victory"], featured: true, sortOrder: 70 },
  { id: "lunar", type: "BUNDLE", name: "Lunar New Year Bundle", assetKey: "me-banner.png", previewKey: "bundle:lunar", priceDiamonds: 1080, tag: "-35%", isPremium: true, bundleItems: ["jadeskin", "marble", "focused"], sortOrder: 71 },

  // ── Season Pass ── active:false so it is NOT sold via the generic /store/purchase
  // path (which wouldn't set hasPass). It exists only as the price source for
  // POST /api/season/pass; the Season page is the sole purchase entry point.
  { id: "seasonpass", type: "SEASON_PASS", name: "Royal Season Pass", assetKey: "me-crown.png", previewKey: "bundle:season", priceDiamonds: 900, tag: "SEASON", isPremium: true, active: false, sortOrder: 80 },
] as const;

const QUESTS = [
  { id: "daily-win3", scope: "daily", title: "Win 3 matches", description: "Claim victory in 3 matches today", goal: 3, rewardGold: 500 },
  { id: "daily-play5", scope: "daily", title: "Play 5 matches", description: "Play 5 matches of any mode today", goal: 5, rewardGold: 250 },
  { id: "daily-capture20", scope: "daily", title: "Capture 20 pieces", description: "Capture 20 enemy pieces today", goal: 20, rewardGold: 300 },
  { id: "season-win50", scope: "seasonal", title: "Win 50 ranked matches", description: "Win 50 ranked matches this season", goal: 50, rewardGold: 5000 },
];

async function main() {
  for (const it of STORE) {
    await prisma.storeItem.upsert({ where: { id: it.id }, update: it as any, create: it as any });
  }
  for (const q of QUESTS) {
    await prisma.quest.upsert({ where: { id: q.id }, update: q, create: q });
  }
  await prisma.season.upsert({
    where: { id: "S1" },
    update: {},
    create: {
      id: "S1",
      name: "Season 1 — Rise of the Bagani",
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 60 * 864e5),
      tiers: Array.from({ length: 30 }, (_, i) => ({
        tier: i + 1,
        xp: (i + 1) * 100,
        freeReward: { gold: 100 },
        premiumReward: i % 5 === 4 ? { diamonds: 50 } : { gold: 300 },
      })),
    },
  });

  // demo bots across rank tiers to populate leaderboard + matchmaking. Each bot
  // gets a DISTINCT hero portrait (avatar key → /assets/avatars/<key>.png) so the
  // ladder doesn't render every player with the same default face. Keys are drawn
  // from AVATARS in apps/web/src/lib/assets.ts; the mapping fits each mythic name.
  const bots = [
    ["Lakan", 2740, "sultan"],
    ["Mayari", 2410, "diwata"],
    ["Amihan", 2180, "babaylan"],
    ["Tala", 1950, "dayang"],
    ["Bathala", 1620, "sovereign"],
    ["Dumakulem", 1180, "bagani"],
  ] as const;
  for (const [name, trophies, avatar] of bots) {
    await prisma.user.upsert({
      where: { username: name.toLowerCase() },
      // backfill the avatar on existing rows too, so re-seeding fixes the ladder.
      update: { avatarUrl: avatar },
      create: {
        username: name.toLowerCase(),
        displayName: name,
        tag: `#${1000 + trophies}`,
        avatarUrl: avatar,
        trophies,
        isGuest: false,
        wins: Math.floor(trophies / 20),
        losses: Math.floor(trophies / 40),
      },
    });
  }
  console.log("Seed complete.");
}

main().finally(() => prisma.$disconnect());
