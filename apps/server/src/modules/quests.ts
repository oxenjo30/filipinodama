import type { FastifyInstance } from "fastify";
import type { Quest, QuestProgress } from "@prisma/client";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { applyLedger } from "../economy/ledger.js";
import { requireAuth } from "../auth/guards.js";

/**
 * Progression: quests.
 * GET  /api/quests            → daily + seasonal defs with the authed user's progress
 * POST /api/quests/:id/claim  → grant reward gold once progress >= goal & unclaimed
 *
 * QuestProgress is keyed (userId, questId, periodKey). Daily quests reset per
 * UTC day; seasonal quests use a single stable period. If a user has no row yet
 * we report an honest 0 progress / unclaimed instead of fabricating one.
 */

/** Period bucket a quest currently belongs to (drives the daily reset). */
function periodKeyFor(scope: string): string {
  if (scope === "daily") return `daily:${new Date().toISOString().slice(0, 10)}`; // YYYY-MM-DD (UTC)
  return `seasonal:current`;
}

function progressView(q: Quest, p: QuestProgress | undefined) {
  const value = p?.value ?? 0;
  const claimed = p?.claimed ?? false;
  return {
    id: q.id,
    scope: q.scope,
    title: q.title,
    description: q.description,
    goal: q.goal,
    rewardGold: q.rewardGold,
    value,
    completed: value >= q.goal,
    claimed,
    claimable: value >= q.goal && !claimed,
  };
}

export async function questRoutes(app: FastifyInstance) {
  // GET /api/quests — daily + seasonal quest defs with my progress
  app.get("/quests", { preHandler: requireAuth }, async (req) => {
    const userId = req.userId!;
    const quests = await prisma.quest.findMany({
      where: { active: true },
      orderBy: [{ scope: "asc" }, { goal: "asc" }],
    });
    const periodKeys = [...new Set(quests.map((q) => periodKeyFor(q.scope)))];
    const rows = await prisma.questProgress.findMany({
      where: { userId, periodKey: { in: periodKeys } },
    });
    const byQuest = new Map<string, QuestProgress>();
    for (const r of rows) byQuest.set(`${r.questId}:${r.periodKey}`, r);

    const items = quests.map((q) => progressView(q, byQuest.get(`${q.id}:${periodKeyFor(q.scope)}`)));
    return ok({
      daily: items.filter((i) => i.scope === "daily"),
      seasonal: items.filter((i) => i.scope !== "daily"),
    });
  });

  // POST /api/quests/:id/claim — atomic gold grant + ledger, only if earned & unclaimed
  app.post<{ Params: { id: string } }>("/quests/:id/claim", { preHandler: requireAuth }, async (req) => {
    const userId = req.userId!;
    const quest = await prisma.quest.findUnique({ where: { id: req.params.id } });
    if (!quest || !quest.active) throw err.notFound("QUEST_NOT_FOUND", "Quest not found");

    const periodKey = periodKeyFor(quest.scope);
    const progress = await prisma.questProgress.findUnique({
      where: { userId_questId_periodKey: { userId, questId: quest.id, periodKey } },
    });
    const value = progress?.value ?? 0;
    if (value < quest.goal) throw err.badRequest("QUEST_INCOMPLETE", "Quest not completed yet");
    if (progress?.claimed) throw err.conflict("QUEST_ALREADY_CLAIMED", "Reward already claimed");

    // Atomic claim: a CONDITIONAL updateMany (claimed:false → true) is the
    // concurrency gate — only the request that actually flips the row (count===1)
    // is allowed to grant the reward, so two concurrent claims can't double-pay.
    // If the completing row was never written, create it already-claimed.
    const flipped = await prisma.questProgress.updateMany({
      where: { userId, questId: quest.id, periodKey, claimed: false },
      data: { claimed: true },
    });
    if (flipped.count === 0) {
      if (!progress) {
        // no row existed → create it claimed (the completer of this claim). A
        // unique (userId,questId,periodKey) makes a concurrent first-time claim
        // throw P2002; the loser of that race treats it as already claimed.
        try {
          await prisma.questProgress.create({ data: { userId, questId: quest.id, periodKey, value, claimed: true } });
        } catch (e) {
          if (typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002") {
            throw err.conflict("QUEST_ALREADY_CLAIMED", "Reward already claimed");
          }
          throw e;
        }
      } else {
        // someone else already claimed it in a race
        throw err.conflict("QUEST_ALREADY_CLAIMED", "Reward already claimed");
      }
    }

    let balance = 0;
    if (quest.rewardGold > 0) {
      balance = await applyLedger(prisma, {
        userId,
        currency: "GOLD",
        amount: quest.rewardGold,
        reason: "quest",
        refType: "quest",
        refId: `${quest.id}:${periodKey}`,
      });
    }
    return ok({ claimed: true, rewardGold: quest.rewardGold, goldBalance: balance, questId: quest.id, value });
  });
}
