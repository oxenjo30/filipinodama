import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

/**
 * Seeds the store catalog, quests, a season, demo bots, and a few finished
 * matches. Asset keys map to files listed in handoff/ASSETS.md (served from
 * apps/web/public/assets). CONFIRM prices against the prototype Store.
 */
const STORE = [
  // boards
  { id: "board-marble", type: "BOARD", name: "Marble & Gold", assetKey: "board-marble.png", priceGold: 0, sortOrder: 0 },
  { id: "board-wood", type: "BOARD", name: "Classic Wood", assetKey: "board-wood.png", priceGold: 2500 },
  { id: "board-obsidian", type: "BOARD", name: "Obsidian", assetKey: "board-obsidian.png", priceGold: 4500 },
  { id: "board-ebony", type: "BOARD", name: "Ebony", assetKey: "board-ebony.png", priceDiamonds: 120, isPremium: true },
  // skins
  { id: "skin-classic", type: "SKIN", name: "Crimson & Royal", assetKey: "crimson", priceGold: 0 },
  { id: "skin-jade", type: "SKIN", name: "Jade", assetKey: "jade", priceGold: 3000 },
  { id: "skin-obsidian", type: "SKIN", name: "Obsidian", assetKey: "obsidian", priceGold: 3000 },
  { id: "skin-babaylan", type: "SKIN", name: "Babaylan", assetKey: "babaylan.webp", priceDiamonds: 150, isPremium: true },
  { id: "skin-bagani", type: "SKIN", name: "Bagani", assetKey: "bagani.webp", priceDiamonds: 150, isPremium: true },
  { id: "skin-mandirigma", type: "SKIN", name: "Mandirigma", assetKey: "mandirigma.webp", priceDiamonds: 180, isPremium: true },
  { id: "skin-diwata", type: "SKIN", name: "Diwata", assetKey: "diwata.webp", priceDiamonds: 180, isPremium: true },
  { id: "skin-ermitanyo", type: "SKIN", name: "Ermitanyo", assetKey: "ermitanyo.webp", priceDiamonds: 200, isPremium: true },
  // season pass
  { id: "season-pass-s1", type: "SEASON_PASS", name: "Season 1 Royal Pass", assetKey: "me-crown.png", priceDiamonds: 400, isPremium: true },
] as const;

const QUESTS = [
  { id: "daily-win3", scope: "daily", title: "Win 3 matches", goal: 3, rewardGold: 500 },
  { id: "daily-play5", scope: "daily", title: "Play 5 matches", goal: 5, rewardGold: 250 },
  { id: "daily-capture20", scope: "daily", title: "Capture 20 pieces", goal: 20, rewardGold: 300 },
  { id: "season-win50", scope: "seasonal", title: "Win 50 ranked matches", goal: 50, rewardGold: 5000 },
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

  // demo bots across rank tiers to populate leaderboard + matchmaking
  const bots = [
    ["Lakan", 2740], ["Mayari", 2410], ["Amihan", 2180], ["Tala", 1950], ["Bathala", 1620], ["Dumakulem", 1180],
  ] as const;
  for (const [name, trophies] of bots) {
    await prisma.user.upsert({
      where: { username: name.toLowerCase() },
      update: {},
      create: {
        username: name.toLowerCase(),
        displayName: name,
        tag: `#${1000 + trophies}`,
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
