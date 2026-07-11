import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { advanceQuestsFor } from "../src/realtime/match.js";
import { seedUser } from "./helpers.js";
import type { MatchQuestContext } from "../src/lib/quest-trigger.js";

/**
 * Dynamic quest engine tests. advanceQuestsFor is the exact seam
 * recordPlayerOutcome (realtime/match.ts) calls on every match settlement —
 * driving it directly here exercises the real dynamic loop (load active
 * quests → questAdvanceFor → advanceQuest) without needing a live socket
 * match. Quest/QuestProgress aren't in helpers.ts truncateAll(), so this file
 * seeds and cleans up its own rows.
 */

const TEST_QUEST_PREFIX = "t_quest_";

async function cleanupQuests() {
  await prisma.questProgress.deleteMany({ where: { questId: { startsWith: TEST_QUEST_PREFIX } } });
  await prisma.quest.deleteMany({ where: { id: { startsWith: TEST_QUEST_PREFIX } } });
  await prisma.user.deleteMany({ where: { username: { startsWith: "t_user_" } } });
}

afterEach(cleanupQuests);
afterAll(async () => {
  await prisma.$disconnect();
});

function ctx(overrides: Partial<MatchQuestContext> = {}): MatchQuestContext {
  return { won: false, drew: false, captures: 0, isRanked: false, streak: 0, ...overrides };
}

async function progressValue(userId: string, questId: string, scope: "daily" | "seasonal") {
  const periodKey = scope === "daily" ? `daily:${new Date().toISOString().slice(0, 10)}` : "seasonal:current";
  const row = await prisma.questProgress.findUnique({
    where: { userId_questId_periodKey: { userId, questId, periodKey } },
  });
  return row?.value ?? 0;
}

describe("advanceQuestsFor — custom admin-created quest tracks via trigger", () => {
  it("a ranked_won quest advances only on ranked wins, and becomes claimable at goal", async () => {
    const user = await seedUser();
    const questId = `${TEST_QUEST_PREFIX}rankwin5`;
    await prisma.quest.create({
      data: { id: questId, scope: "daily", title: "Win 5 ranked", goal: 5, rewardGold: 1000, active: true, trigger: { event: "ranked_won" } },
    });

    // 5 ranked wins → advances to 5 (claimable).
    for (let i = 0; i < 5; i++) {
      await advanceQuestsFor(user.id, ctx({ won: true, isRanked: true }));
    }
    expect(await progressValue(user.id, questId, "daily")).toBe(5);

    // A non-ranked win does NOT advance it further.
    await advanceQuestsFor(user.id, ctx({ won: true, isRanked: false }));
    expect(await progressValue(user.id, questId, "daily")).toBe(5);

    // A ranked LOSS does not advance it either.
    await advanceQuestsFor(user.id, ctx({ won: false, isRanked: true }));
    expect(await progressValue(user.id, questId, "daily")).toBe(5);
  });

  it("a quest with no trigger never advances (draft — doesn't crash settlement)", async () => {
    const user = await seedUser();
    const questId = `${TEST_QUEST_PREFIX}notrigger`;
    await prisma.quest.create({
      data: { id: questId, scope: "daily", title: "Untracked draft", goal: 3, rewardGold: 100, active: true },
    });

    await advanceQuestsFor(user.id, ctx({ won: true, isRanked: true, captures: 5, streak: 3 }));
    expect(await progressValue(user.id, questId, "daily")).toBe(0);
  });

  it("an inactive quest does not advance even with a matching trigger", async () => {
    const user = await seedUser();
    const questId = `${TEST_QUEST_PREFIX}inactive`;
    await prisma.quest.create({
      data: { id: questId, scope: "daily", title: "Inactive", goal: 1, rewardGold: 100, active: false, trigger: { event: "match_played" } },
    });

    await advanceQuestsFor(user.id, ctx());
    expect(await progressValue(user.id, questId, "daily")).toBe(0);
  });

  it("a seasonal captures quest advances by the real per-match capture count", async () => {
    const user = await seedUser();
    const questId = `${TEST_QUEST_PREFIX}caps`;
    await prisma.quest.create({
      data: { id: questId, scope: "seasonal", title: "Capture pieces", goal: 20, rewardGold: 200, active: true, trigger: { event: "captures" } },
    });

    await advanceQuestsFor(user.id, ctx({ captures: 6 }));
    await advanceQuestsFor(user.id, ctx({ captures: 0 })); // no captures this match → no advance
    await advanceQuestsFor(user.id, ctx({ captures: 4 }));
    expect(await progressValue(user.id, questId, "seasonal")).toBe(10);
  });

  it("a win_streak quest tracks the peak (setTo) and never lowers on a later smaller streak", async () => {
    const user = await seedUser();
    const questId = `${TEST_QUEST_PREFIX}streak`;
    await prisma.quest.create({
      data: { id: questId, scope: "seasonal", title: "Win streak", goal: 5, rewardGold: 300, active: true, trigger: { event: "win_streak" } },
    });

    await advanceQuestsFor(user.id, ctx({ won: true, streak: 3 }));
    expect(await progressValue(user.id, questId, "seasonal")).toBe(3);
    await advanceQuestsFor(user.id, ctx({ won: true, streak: 5 }));
    expect(await progressValue(user.id, questId, "seasonal")).toBe(5);
    // A later, smaller streak (e.g. after a loss reset then a fresh win) never lowers the peak.
    await advanceQuestsFor(user.id, ctx({ won: true, streak: 1 }));
    expect(await progressValue(user.id, questId, "seasonal")).toBe(5);
  });
});

describe("REGRESSION — the 9 seeded quests advance identically to the old hardcoded engine", () => {
  // Mirrors seed.ts QUESTS exactly (id, scope, goal, trigger) so this test
  // proves the dynamic loop reproduces the OLD hardcoded advanceQuest() calls
  // it replaced in recordPlayerOutcome.
  const SEEDED = [
    { id: "daily-play5", scope: "daily" as const, goal: 5, trigger: { event: "match_played" } },
    { id: "daily-win1", scope: "daily" as const, goal: 1, trigger: { event: "match_won" } },
    { id: "daily-win3", scope: "daily" as const, goal: 3, trigger: { event: "match_won" } },
    { id: "daily-capture10", scope: "daily" as const, goal: 10, trigger: { event: "captures" } },
    { id: "daily-capture20", scope: "daily" as const, goal: 20, trigger: { event: "captures" } },
    { id: "daily-ranked3", scope: "daily" as const, goal: 3, trigger: { event: "ranked_played" } },
    { id: "season-win50", scope: "seasonal" as const, goal: 50, trigger: { event: "ranked_won" } },
    { id: "season-play100", scope: "seasonal" as const, goal: 100, trigger: { event: "match_played" } },
    { id: "season-capture500", scope: "seasonal" as const, goal: 500, trigger: { event: "captures" } },
    { id: "season-streak5", scope: "seasonal" as const, goal: 5, trigger: { event: "win_streak" } },
  ];

  async function seedRealQuests() {
    // Use the REAL prod quest ids (not the t_quest_ prefix) since this test
    // verifies the actual seeded rows behave correctly. Clean up in afterEach
    // below via a dedicated cleanup (these ids are NOT under TEST_QUEST_PREFIX).
    for (const q of SEEDED) {
      await prisma.quest.upsert({
        where: { id: q.id },
        update: { scope: q.scope, goal: q.goal, active: true, trigger: q.trigger },
        create: { id: q.id, scope: q.scope, title: q.id, goal: q.goal, rewardGold: 100, active: true, trigger: q.trigger },
      });
    }
  }

  afterEach(async () => {
    await prisma.questProgress.deleteMany({ where: { questId: { in: SEEDED.map((q) => q.id) } } });
    // Don't delete the Quest rows themselves — they mirror real prod seed
    // data other parts of the app may expect to exist; only wipe progress.
  });

  it("a ranked WIN with 4 captures and a fresh streak of 1 advances exactly the quests the old hardcoded block advanced", async () => {
    await seedRealQuests();
    const user = await seedUser();

    // Ranked win, 4 captures, streak 1 (first win) — same inputs the OLD
    // hardcoded Promise.allSettled block in recordPlayerOutcome consumed.
    await advanceQuestsFor(user.id, ctx({ won: true, isRanked: true, captures: 4, streak: 1 }));

    // Daily
    expect(await progressValue(user.id, "daily-play5", "daily")).toBe(1); // match_played
    expect(await progressValue(user.id, "daily-win1", "daily")).toBe(1); // match_won
    expect(await progressValue(user.id, "daily-win3", "daily")).toBe(1); // match_won
    expect(await progressValue(user.id, "daily-capture10", "daily")).toBe(4); // captures
    expect(await progressValue(user.id, "daily-capture20", "daily")).toBe(4); // captures
    expect(await progressValue(user.id, "daily-ranked3", "daily")).toBe(1); // ranked_played

    // Seasonal
    expect(await progressValue(user.id, "season-win50", "seasonal")).toBe(1); // ranked_won
    expect(await progressValue(user.id, "season-play100", "seasonal")).toBe(1); // match_played
    expect(await progressValue(user.id, "season-capture500", "seasonal")).toBe(4); // captures
    expect(await progressValue(user.id, "season-streak5", "seasonal")).toBe(1); // win_streak (peak)
  });

  it("a non-ranked LOSS with 0 captures advances only match_played quests, matching old behavior", async () => {
    await seedRealQuests();
    const user = await seedUser();

    await advanceQuestsFor(user.id, ctx({ won: false, isRanked: false, captures: 0, streak: 0 }));

    // Only the two match_played quests advance.
    expect(await progressValue(user.id, "daily-play5", "daily")).toBe(1);
    expect(await progressValue(user.id, "season-play100", "seasonal")).toBe(1);

    // Nothing else does.
    expect(await progressValue(user.id, "daily-win1", "daily")).toBe(0);
    expect(await progressValue(user.id, "daily-win3", "daily")).toBe(0);
    expect(await progressValue(user.id, "daily-capture10", "daily")).toBe(0);
    expect(await progressValue(user.id, "daily-capture20", "daily")).toBe(0);
    expect(await progressValue(user.id, "daily-ranked3", "daily")).toBe(0);
    expect(await progressValue(user.id, "season-win50", "seasonal")).toBe(0);
    expect(await progressValue(user.id, "season-capture500", "seasonal")).toBe(0);
    expect(await progressValue(user.id, "season-streak5", "seasonal")).toBe(0);
  });

  it("a casual (non-ranked) WIN advances match_won quests but NOT ranked or streak quests other than via win_streak", async () => {
    await seedRealQuests();
    const user = await seedUser();

    await advanceQuestsFor(user.id, ctx({ won: true, isRanked: false, captures: 0, streak: 2 }));

    expect(await progressValue(user.id, "daily-win1", "daily")).toBe(1);
    expect(await progressValue(user.id, "daily-win3", "daily")).toBe(1);
    expect(await progressValue(user.id, "daily-ranked3", "daily")).toBe(0); // not ranked
    expect(await progressValue(user.id, "season-win50", "seasonal")).toBe(0); // ranked_won requires isRanked
    expect(await progressValue(user.id, "season-streak5", "seasonal")).toBe(2); // win_streak only needs won+streak>0
  });

  it("progress caps at the quest goal and never exceeds it across repeated advances", async () => {
    await seedRealQuests();
    const user = await seedUser();

    for (let i = 0; i < 3; i++) {
      await advanceQuestsFor(user.id, ctx({ won: true, isRanked: false }));
    }
    // daily-win1 has goal 1 — must cap at 1, not 3.
    expect(await progressValue(user.id, "daily-win1", "daily")).toBe(1);
    // daily-win3 has goal 3 — exactly at cap.
    expect(await progressValue(user.id, "daily-win3", "daily")).toBe(3);
  });
});
