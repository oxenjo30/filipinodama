import { PrismaClient } from "@prisma/client";
import { rankTierFor } from "@dama/shared";
import { hashPassword, randomTag } from "../src/auth/tokens.js";

/**
 * seed-test-accounts.ts — create real, LOGINABLE test accounts you can sign into
 * in the browser to exercise the app end-to-end (play vs AI, browse the store,
 * queue for online, open two windows to match against each other, etc.).
 *
 * These go through the SAME shape a real registration produces — a bcrypt
 * password hash, a verified email (so login works without the email step),
 * default cosmetics granted + equipped, a unique tag, and a synced rankTier —
 * so they behave exactly like organic accounts, not display-only ladder rows.
 *
 * Idempotent: upserts by email, so re-running updates the existing rows in place
 * (and re-grants defaults) rather than creating duplicates.
 *
 * Run:  cd apps/server && npx tsx prisma/seed-test-accounts.ts
 */

const prisma = new PrismaClient();

/** Shared password for every test account (dev/staging only — never prod data). */
const PASSWORD = "TestPlay123!";

/**
 * The roster. Each account gets a distinct hero portrait (avatar key →
 * /assets/avatars/<key>.png) and a trophy count that lands it in a different
 * rank tier, so the leaderboard / profiles look varied. `wins`/`losses` are
 * plausible records; trophies drive the rankTier cache.
 */
const ACCOUNTS = [
  { username: "testplayer1", displayName: "Test Player One", email: "player1@test.dama", avatar: "champion", trophies: 1450, wins: 62, losses: 31, draws: 4 },
  { username: "testplayer2", displayName: "Test Player Two", email: "player2@test.dama", avatar: "strategist", trophies: 720, wins: 28, losses: 22, draws: 2 },
  { username: "testplayer3", displayName: "Test Player Three", email: "player3@test.dama", avatar: "mandirigma", trophies: 310, wins: 11, losses: 14, draws: 1 },
  { username: "testplayer4", displayName: "Test Player Four", email: "player4@test.dama", avatar: "priestess", trophies: 1920, wins: 104, losses: 40, draws: 6 },
  { username: "testplayer5", displayName: "Test Player Five", email: "player5@test.dama", avatar: "ermitanyo", trophies: 0, wins: 0, losses: 0, draws: 0 },
] as const;

/**
 * Grant the free default cosmetics every account should own (mirrors
 * auth/service.ts grantDefaults): every StoreItem priced at 0 gold, added to
 * inventory and equipped. Idempotent per item.
 */
async function grantDefaults(userId: string): Promise<{ equippedBoard?: string; equippedSkin?: string }> {
  const defaults = await prisma.storeItem.findMany({
    where: { active: true, priceGold: 0, priceDiamonds: null },
  });
  let equippedBoard: string | undefined;
  let equippedSkin: string | undefined;
  for (const item of defaults) {
    await prisma.inventoryItem.upsert({
      where: { userId_itemId: { userId, itemId: item.id } },
      update: {},
      create: { userId, itemId: item.id, equipped: true },
    });
    if (item.type === "BOARD" && !equippedBoard) equippedBoard = item.id;
    if (item.type === "SKIN" && !equippedSkin) equippedSkin = item.id;
  }
  return { equippedBoard, equippedSkin };
}

/** A tag not already taken (tags are globally unique). */
async function uniqueTag(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const tag = randomTag();
    if (!(await prisma.user.findUnique({ where: { tag } }))) return tag;
  }
  return "#" + String(Date.now()).slice(-4);
}

async function main() {
  const passwordHash = await hashPassword(PASSWORD);
  const now = new Date();
  const created: { displayName: string; email: string; username: string }[] = [];

  for (const a of ACCOUNTS) {
    const rankTier = rankTierFor(a.trophies).key;

    // Preserve an existing account's tag on re-run; mint one only when creating.
    const existing = await prisma.user.findUnique({ where: { email: a.email }, select: { tag: true } });
    const tag = existing?.tag ?? (await uniqueTag());

    const user = await prisma.user.upsert({
      where: { email: a.email },
      update: {
        passwordHash,
        emailVerified: now,
        isGuest: false,
        displayName: a.displayName,
        avatarUrl: a.avatar,
        trophies: a.trophies,
        rankTier,
        wins: a.wins,
        losses: a.losses,
        draws: a.draws,
        // a little currency so store/economy screens have something to work with
        gold: 5000,
        diamonds: 200,
      },
      create: {
        email: a.email,
        passwordHash,
        emailVerified: now,
        isGuest: false,
        username: a.username,
        displayName: a.displayName,
        tag,
        avatarUrl: a.avatar,
        trophies: a.trophies,
        rankTier,
        wins: a.wins,
        losses: a.losses,
        draws: a.draws,
        gold: 5000,
        diamonds: 200,
      },
    });

    const { equippedBoard, equippedSkin } = await grantDefaults(user.id);
    if (equippedBoard || equippedSkin) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          ...(equippedBoard ? { equippedBoard } : {}),
          ...(equippedSkin ? { equippedSkin } : {}),
        },
      });
    }

    created.push({ displayName: a.displayName, email: a.email, username: user.username });
  }

  // ── Seed the "Dama Kings" guild so the Guild Hall is viewable end-to-end ──
  // testplayer1 is the LEADER; a couple others join as members so the roster and
  // banner render. Crest = "swords" (Crossed Blades). Idempotent by guild name.
  const leader = await prisma.user.findUnique({ where: { email: "player1@test.dama" }, select: { id: true } });
  if (leader) {
    const guild = await prisma.guild.upsert({
      where: { name: "Dama Kings" },
      update: {
        crestKey: "swords",
        minTrophies: 1200,
        weeklyPoints: 125430,
        description:
          "Elite tacticians of Filipino Dama. We drill openings nightly, run weekly war strats, and lift each other up the ladder — respect, discipline, and dominion.",
      },
      create: {
        name: "Dama Kings",
        tag: "DK",
        crestKey: "swords",
        minTrophies: 1200,
        weeklyPoints: 125430,
        description:
          "Elite tacticians of Filipino Dama. We drill openings nightly, run weekly war strats, and lift each other up the ladder — respect, discipline, and dominion.",
      },
    });

    // Enroll players 1 (LEADER), 2 & 4 (MEMBER). GuildMember.userId is @unique,
    // so upsert-by-userId keeps this idempotent across re-runs.
    const enroll: { email: string; role: "LEADER" | "OFFICER" | "MEMBER"; contrib: number }[] = [
      { email: "player1@test.dama", role: "LEADER", contrib: 4820 },
      { email: "player2@test.dama", role: "OFFICER", contrib: 3110 },
      { email: "player4@test.dama", role: "MEMBER", contrib: 2260 },
    ];
    for (const m of enroll) {
      const u = await prisma.user.findUnique({ where: { email: m.email }, select: { id: true } });
      if (!u) continue;
      await prisma.guildMember.upsert({
        where: { userId: u.id },
        update: { guildId: guild.id, role: m.role, weeklyContribution: m.contrib },
        create: { guildId: guild.id, userId: u.id, role: m.role, weeklyContribution: m.contrib },
      });
    }
    // eslint-disable-next-line no-console
    console.log('\nGuild "Dama Kings" [#DK] ready — testplayer1 is the Leader (crest: Crossed Blades).');
  }

  // eslint-disable-next-line no-console
  console.log("\nTest accounts ready (all share the same password):\n");
  // eslint-disable-next-line no-console
  console.log("  Password:  " + PASSWORD + "\n");
  for (const c of created) {
    // eslint-disable-next-line no-console
    console.log(`  ${c.displayName.padEnd(18)}  email: ${c.email.padEnd(20)}  username: ${c.username}`);
  }
  // eslint-disable-next-line no-console
  console.log("\nSign in with the EMAIL + password above. Open two in separate windows to test online matchmaking.\n");
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error("seed-test-accounts failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
