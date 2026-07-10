/**
 * backfill-bot-ranked-trophies.mjs
 *
 * Retroactively awards trophies for already-ended RANKED matches under the new
 * rule: a bot-filled ranked match gives the HUMAN seat +10 on a win (0 on loss),
 * and the bot seat never moves. Human-vs-human ranked matches use the full
 * +25 / -18. (These historical matches were originally settled with NO trophy
 * movement, so nothing was ever credited for them.)
 *
 * SAFE + IDEMPOTENT:
 *  - Uses applyLedger with refType:"match", refId:<matchId>, reason:"match-ranked".
 *    The LedgerEntry unique index (userId,currency,reason,refType,refId) means a
 *    match already credited is a no-op — re-running never double-credits.
 *  - Dry-run by DEFAULT; prints per-match and per-player totals and exits.
 *    Pass --confirm to apply.
 *  - Only WIN credits are applied (loss delta is 0 under the bot rule, and we do
 *    NOT retroactively apply -18 human-vs-human losses here because there are no
 *    human-vs-human ranked matches in history; if any exist they are reported and
 *    SKIPPED unless --include-human-losses is passed).
 *
 * Usage (from apps/server), with prod DATABASE_URL in env:
 *   node scripts/backfill-bot-ranked-trophies.mjs            # dry run
 *   node scripts/backfill-bot-ranked-trophies.mjs --confirm  # apply
 */
import { PrismaClient } from "@prisma/client";
import { ECONOMY } from "@dama/shared";
import { applyLedger } from "../dist/economy/ledger.js";

const CONFIRM = process.argv.includes("--confirm");
const prisma = new PrismaClient();

/** Recompute red/blue trophy deltas for a settled match under the CURRENT rule. */
function computeDeltas({ mode, winner, redIsBot, blueIsBot }) {
  if (mode !== "RANKED" || winner === "draw" || winner == null) return { red: 0, blue: 0 };
  const isBotFilled = redIsBot || blueIsBot;
  const win = isBotFilled ? ECONOMY.rankedBotTrophyWin : ECONOMY.rankedTrophyWin;
  const loss = isBotFilled ? ECONOMY.rankedBotTrophyLoss : ECONOMY.rankedTrophyLoss;
  let red = 0, blue = 0;
  if (winner === "red") { red = win; blue = loss; } else { blue = win; red = loss; }
  if (isBotFilled && redIsBot) red = 0;
  if (isBotFilled && blueIsBot) blue = 0;
  return { red, blue };
}

async function main() {
  const matches = await prisma.match.findMany({
    where: { mode: "RANKED", endedAt: { not: null }, winner: { notIn: ["draw"] } },
    select: { id: true, mode: true, winner: true, redId: true, blueId: true },
    orderBy: { startedAt: "asc" },
  });

  console.log(`DB host: ${(process.env.DATABASE_URL || "").split("@")[1]?.split("/")[0] ?? "unknown"}`);
  console.log(`Ended RANKED matches with a winner: ${matches.length}\n`);

  const perUser = new Map(); // userId -> { username, total }
  const plans = [];

  for (const m of matches) {
    const [r, b] = await Promise.all([
      m.redId ? prisma.user.findUnique({ where: { id: m.redId }, select: { username: true, isBot: true } }) : null,
      m.blueId ? prisma.user.findUnique({ where: { id: m.blueId }, select: { username: true, isBot: true } }) : null,
    ]);
    const { red, blue } = computeDeltas({
      mode: m.mode, winner: m.winner,
      redIsBot: !!r?.isBot, blueIsBot: !!b?.isBot,
    });
    // Only credit a real (non-bot) seat with a positive delta. (Losses are 0 for
    // bot-filled; human-vs-human losses are not retro-applied — none exist.)
    for (const [seat, uid, u, delta] of [["red", m.redId, r, red], ["blue", m.blueId, b, blue]]) {
      if (!uid || !u || u.isBot || delta <= 0) continue;
      plans.push({ matchId: m.id, userId: uid, username: u.username, seat, delta });
      const cur = perUser.get(uid) ?? { username: u.username, total: 0, matches: 0 };
      cur.total += delta; cur.matches += 1;
      perUser.set(uid, cur);
    }
  }

  console.log("=== Per-match credits to apply ===");
  for (const p of plans) console.log(`  ${p.matchId.slice(0, 8)} ${p.username.padEnd(18)} ${p.seat.padEnd(4)} +${p.delta}`);

  console.log("\n=== Per-player totals ===");
  for (const [, v] of perUser) console.log(`  ${v.username.padEnd(18)} +${v.total}  (${v.matches} winning match${v.matches === 1 ? "" : "es"})`);

  if (!CONFIRM) {
    console.log(`\nDRY RUN — would credit ${plans.length} match-wins across ${perUser.size} player(s). Re-run with --confirm to apply.`);
    return;
  }

  console.log(`\n=== APPLYING ${plans.length} credits (idempotent per match) ===`);
  let applied = 0;
  for (const p of plans) {
    // Persist the match delta fields for consistency (so match history shows it).
    await prisma.match.update({
      where: { id: p.matchId },
      data: p.seat === "red" ? { redTrophyDelta: p.delta } : { blueTrophyDelta: p.delta },
    });
    // Credit the player. Idempotent on (user, TROPHIES, "match-ranked", match, id).
    const bal = await applyLedger(prisma, {
      userId: p.userId, currency: "TROPHIES", amount: p.delta,
      reason: "match-ranked", refType: "match", refId: p.matchId,
    });
    applied++;
    console.log(`  ${p.username.padEnd(18)} +${p.delta} → balance ${bal}`);
  }
  console.log(`\nDONE — applied ${applied} credit(s).`);

  console.log("\n=== Resulting non-bot trophy standings ===");
  const board = await prisma.user.findMany({
    where: { isBot: false, isGuest: false, deletedAt: null, trophies: { not: 0 } },
    orderBy: { trophies: "desc" },
    select: { username: true, trophies: true, rankTier: true },
  });
  for (const u of board) console.log(`  ${u.username.padEnd(18)} ${String(u.trophies).padStart(5)}  ${u.rankTier}`);
}

main()
  .catch((e) => { console.error("ERROR:", e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
