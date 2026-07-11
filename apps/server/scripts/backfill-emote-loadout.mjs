/**
 * backfill-emote-loadout.mjs — give existing users the free emote set.
 *
 * For each non-bot, non-deleted user:
 *   • upsert an InventoryItem for every free EMOTE they don't own (so store shows OWNED)
 *   • if their equippedEmotes is EMPTY, set it to the first 6 free emote ids (by sortOrder)
 *   • NEVER touch a non-empty equippedEmotes (don't clobber an intentional loadout)
 *
 * SAFE: dry-run by default; pass --confirm to apply. Idempotent.
 * Run against prod:  railway-public DATABASE_URL in env, from apps/server:
 *   node scripts/backfill-emote-loadout.mjs            # dry run
 *   node scripts/backfill-emote-loadout.mjs --confirm  # apply
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const CONFIRM = process.argv.includes("--confirm");

async function main() {
  console.log(`DB host: ${(process.env.DATABASE_URL || "").split("@")[1]?.split("/")[0] ?? "unknown"} | ${CONFIRM ? "APPLY" : "DRY RUN"}`);
  const freeEmotes = await prisma.storeItem.findMany({
    where: { type: "EMOTE", priceGold: 0, priceDiamonds: null, active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  const freeIds = freeEmotes.map((e) => e.id);
  const defaultLoadout = freeIds.slice(0, 6);
  console.log(`Free emotes: ${freeIds.length}; default loadout: ${defaultLoadout.length}`);

  const users = await prisma.user.findMany({
    where: { isBot: false, deletedAt: null },
    select: { id: true, username: true, equippedEmotes: true },
  });

  let grantedOwnership = 0, equipped = 0, skippedLoadout = 0;
  for (const u of users) {
    const owned = await prisma.inventoryItem.findMany({
      where: { userId: u.id, itemId: { in: freeIds } },
      select: { itemId: true },
    });
    const ownedSet = new Set(owned.map((o) => o.itemId));
    const missing = freeIds.filter((id) => !ownedSet.has(id));
    if (missing.length) {
      grantedOwnership++;
      if (CONFIRM) {
        for (const itemId of missing) {
          await prisma.inventoryItem.upsert({
            where: { userId_itemId: { userId: u.id, itemId } },
            update: {},
            create: { userId: u.id, itemId, equipped: false },
          });
        }
      }
    }
    if (u.equippedEmotes.length === 0) {
      equipped++;
      if (CONFIRM) {
        await prisma.user.update({ where: { id: u.id }, data: { equippedEmotes: defaultLoadout } });
      }
    } else {
      skippedLoadout++;
    }
  }
  console.log(`Users: ${users.length}`);
  console.log(`  would grant ownership to: ${grantedOwnership}`);
  console.log(`  would set default loadout on (empty): ${equipped}`);
  console.log(`  left untouched (non-empty loadout): ${skippedLoadout}`);
  if (!CONFIRM) console.log("DRY RUN — re-run with --confirm to apply.");
  else console.log("DONE.");
}
main().catch((e) => { console.error("ERR", e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
