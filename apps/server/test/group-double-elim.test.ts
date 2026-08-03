import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { seedUser, truncateAll } from "./helpers.js";
import { joinTournament, startTournament, reportResult, completeTournament } from "../src/modules/tournaments-core.js";
import { maybeStartPlayoffs, groupShapeOf, recoverGroupDoubleElim } from "../src/modules/tournament-groups.js";
import { G_ROUND_OFFSET, GF_ROUND } from "@dama/shared";

/**
 * GROUP_DOUBLE_ELIM end to end.
 *
 * The load-bearing test here is the full-tournament simulation: 12 players play
 * every group fixture and every playoff match through the real reportResult
 * path, and the cup has to reach exactly one champion with a complete, coherent
 * placement set and the declared prize pool fully distributed. That is what
 * catches a bad interaction between the pre-seeded lower bracket and
 * losersDropSlot, which no unit test of the pure helpers can see.
 */

afterEach(async () => {
  await truncateAll();
});
afterAll(async () => {
  await prisma.$disconnect();
});

/** A 12-player cup: 2 groups of 6, top 4 of each qualify -> 8 in the playoff. */
async function groupCup(
  overrides: Partial<{ maxPlayers: number; groupCount: number; qualifiersPerGroup: number; players: number; prizePoolGold: number; prizeSplitGold: number[] }> = {},
) {
  const admin = await seedUser({ adminRole: "ECONOMY" });
  const maxPlayers = overrides.maxPlayers ?? 12;
  const tournament = await prisma.tournament.create({
    data: {
      name: "TI Cup",
      status: "OPEN",
      format: "GROUP_DOUBLE_ELIM",
      maxPlayers,
      groupCount: overrides.groupCount ?? 2,
      qualifiersPerGroup: overrides.qualifiersPerGroup ?? 4,
      prizePoolGold: overrides.prizePoolGold ?? 0,
      prizeSplitGold: overrides.prizeSplitGold ?? [],
      createdById: admin.id,
    },
  });
  const players = [];
  for (let i = 0; i < (overrides.players ?? maxPlayers); i++) {
    // Distinct trophy counts so the trophy seeding is fully determined.
    const u = await seedUser({ trophies: 1000 - i * 10 });
    await joinTournament(prisma, tournament.id, u.id);
    players.push(u);
  }
  return { tournament, players, adminId: admin.id };
}

/** Entry id -> seed, for "the better seed always wins" scripting. */
async function seedOf(tournamentId: string) {
  const entries = await prisma.tournamentEntry.findMany({ where: { tournamentId }, select: { id: true, seed: true } });
  return new Map(entries.map((e) => [e.id, e.seed ?? Number.MAX_SAFE_INTEGER]));
}

/**
 * Report every currently-ready slot, repeatedly, until none are left. The better
 * seed always wins, which makes both the group standings and the bracket fully
 * deterministic. Bounded so a generation bug surfaces as a failed assertion
 * rather than an infinite loop.
 */
async function playOut(tournamentId: string, opts: { bracket?: string; limit?: number } = {}) {
  const seeds = await seedOf(tournamentId);
  let played = 0;
  for (let i = 0; i < (opts.limit ?? 400); i++) {
    const ready = await prisma.tournamentMatch.findMany({
      where: { tournamentId, status: "ready", ...(opts.bracket ? { bracket: opts.bracket } : {}) },
      orderBy: [{ round: "asc" }, { slot: "asc" }],
    });
    if (ready.length === 0) break;
    for (const m of ready) {
      if (!m.redEntryId || !m.blueEntryId) continue;
      const winner = (seeds.get(m.redEntryId) ?? 0) <= (seeds.get(m.blueEntryId) ?? 0) ? m.redEntryId : m.blueEntryId;
      await reportResult(prisma, tournamentId, m.id, winner);
      played += 1;
    }
  }
  return played;
}

describe("GROUP_DOUBLE_ELIM start", () => {
  it("refuses to start on a short field rather than reshaping a paid cup", async () => {
    const { tournament, adminId } = await groupCup({ players: 9 });
    await expect(startTournament(prisma, tournament.id, adminId)).rejects.toMatchObject({ code: "GROUP_NEEDS_FULL_FIELD" });
    // And the cup is left OPEN so the admin can wait for it to fill or cancel.
    const after = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(after.status).toBe("OPEN");
  });

  it("seeds by trophies, snake-drafts equal groups, and creates ONLY the first group round", async () => {
    const { tournament, players, adminId } = await groupCup();
    await startTournament(prisma, tournament.id, adminId);

    const entries = await prisma.tournamentEntry.findMany({ where: { tournamentId: tournament.id }, orderBy: { seed: "asc" } });
    // Seeded by trophies desc — players were created with descending trophies.
    expect(entries.map((e) => e.userId)).toEqual(players.map((p) => p.id));

    const groups = entries.map((e) => e.groupIndex);
    expect(groups.filter((g) => g === 0)).toHaveLength(6);
    expect(groups.filter((g) => g === 1)).toHaveLength(6);
    // Snake: seeds 1,2 must NOT share a group; seeds 2,3 must.
    expect(groups[0]).not.toBe(groups[1]);
    expect(groups[1]).toBe(groups[2]);

    // bracketSize is persisted at seed time — reportResult depends on it,
    // because counting W-round-1 rows would give 0 for this format.
    const t = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(t.bracketSize).toBe(8);

    // ONLY round 1 exists. Creating every fixture up front is what allowed a
    // player to be forfeited out of a match their client never showed them.
    const rounds = await prisma.tournamentMatch.findMany({ where: { tournamentId: tournament.id }, distinct: ["round"], select: { round: true } });
    expect(rounds.map((r) => r.round)).toEqual([G_ROUND_OFFSET + 1]);
    // 2 groups x floor(6/2) = 6 fixtures, all playable, all in the G bracket.
    const first = await prisma.tournamentMatch.findMany({ where: { tournamentId: tournament.id } });
    expect(first).toHaveLength(6);
    expect(first.every((m) => m.bracket === "G" && m.status === "ready")).toBe(true);
  });

  it("gives every player exactly one live fixture at a time", async () => {
    const { tournament, adminId } = await groupCup();
    await startTournament(prisma, tournament.id, adminId);

    const entries = await prisma.tournamentEntry.findMany({ where: { tournamentId: tournament.id }, select: { id: true } });
    for (const e of entries) {
      const live = await prisma.tournamentMatch.count({
        where: { tournamentId: tournament.id, status: { not: "done" }, OR: [{ redEntryId: e.id }, { blueEntryId: e.id }] },
      });
      expect(live).toBe(1);
    }
  });
});

describe("GROUP_DOUBLE_ELIM phase transition", () => {
  it("cuts the bottom of each group and seeds the survivors into both brackets", async () => {
    const { tournament, adminId } = await groupCup();
    await startTournament(prisma, tournament.id, adminId);
    // Group stage ONLY — the assertions below describe the state at the moment
    // the transition fires, before any playoff match has been played.
    await playOut(tournament.id, { bracket: "G" });

    const shape = groupShapeOf(await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } }));
    expect(shape.groupMatches).toBe(30);

    const groupMatches = await prisma.tournamentMatch.count({ where: { tournamentId: tournament.id, bracket: "G" } });
    expect(groupMatches).toBe(30);

    // Every entry got a group placement; the bottom 2 of each group are out.
    const entries = await prisma.tournamentEntry.findMany({ where: { tournamentId: tournament.id } });
    expect(entries.every((e) => e.groupPlacement != null)).toBe(true);
    expect(entries.filter((e) => e.eliminated)).toHaveLength(4);
    expect(entries.filter((e) => (e.groupPlacement ?? 0) > 4).every((e) => e.eliminated)).toBe(true);

    // Playoff: W round 2 seeded (round 1 is the group stage and never exists),
    // L round 1 seeded, grand final waiting.
    const w1 = await prisma.tournamentMatch.count({ where: { tournamentId: tournament.id, bracket: "W", round: 1 } });
    expect(w1).toBe(0);

    const w2 = await prisma.tournamentMatch.findMany({ where: { tournamentId: tournament.id, bracket: "W", round: 2 } });
    expect(w2).toHaveLength(2);
    expect(w2.every((m) => m.status === "ready" && m.redEntryId && m.blueEntryId)).toBe(true);

    const l1 = await prisma.tournamentMatch.findMany({ where: { tournamentId: tournament.id, bracket: "L", round: 101 } });
    expect(l1).toHaveLength(2);
    // A pre-seeded L round 1 MUST be "ready": nothing else would ever promote
    // it, since only the W-drop and L-advance paths flip an L slot, and neither
    // visits a round that was filled by seeding.
    expect(l1.every((m) => m.status === "ready" && m.redEntryId && m.blueEntryId)).toBe(true);

    const gf = await prisma.tournamentMatch.findFirst({ where: { tournamentId: tournament.id, bracket: "GF", round: GF_ROUND } });
    expect(gf?.status).toBe("pending");

    // Upper bracket gets group placements 1-2, lower gets 3-4.
    const placementOf = new Map(entries.map((e) => [e.id, e.groupPlacement]));
    const upperIds = w2.flatMap((m) => [m.redEntryId!, m.blueEntryId!]);
    const lowerIds = l1.flatMap((m) => [m.redEntryId!, m.blueEntryId!]);
    expect(upperIds.map((id) => placementOf.get(id)).sort()).toEqual([1, 1, 2, 2]);
    expect(lowerIds.map((id) => placementOf.get(id)).sort()).toEqual([3, 3, 4, 4]);

    // No first-round playoff match is a same-group rematch.
    const groupOf = new Map(entries.map((e) => [e.id, e.groupIndex]));
    for (const m of [...w2, ...l1]) {
      expect(groupOf.get(m.redEntryId!)).not.toBe(groupOf.get(m.blueEntryId!));
    }
  });

  it("is idempotent — a second transition attempt does not build a second bracket", async () => {
    const { tournament, adminId } = await groupCup();
    await startTournament(prisma, tournament.id, adminId);
    await playOut(tournament.id, { bracket: "G" });

    const before = await prisma.tournamentMatch.count({ where: { tournamentId: tournament.id, bracket: { in: ["W", "L", "GF"] } } });
    const shape = groupShapeOf(await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } }));
    await prisma.$transaction((tx) => maybeStartPlayoffs(tx, tournament.id, shape));
    const after = await prisma.tournamentMatch.count({ where: { tournamentId: tournament.id, bracket: { in: ["W", "L", "GF"] } } });

    expect(after).toBe(before);
  });

  it("recovers a cup whose playoff bracket was never generated", async () => {
    const { tournament, adminId } = await groupCup();
    await startTournament(prisma, tournament.id, adminId);
    await playOut(tournament.id, { bracket: "G" });

    // Simulate the zero-generation race: the group stage is complete but the
    // bracket was lost. Complete is unreachable in that state (it needs a grand
    // final), so without a recovery path the entry fees would be stranded.
    await prisma.tournamentMatch.deleteMany({ where: { tournamentId: tournament.id, bracket: { in: ["W", "L", "GF"] } } });
    expect(await prisma.tournamentMatch.count({ where: { tournamentId: tournament.id, bracket: "W" } })).toBe(0);

    const shape = groupShapeOf(await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } }));
    await recoverGroupDoubleElim(prisma, tournament.id, shape);

    expect(await prisma.tournamentMatch.count({ where: { tournamentId: tournament.id, bracket: "W", round: 2 } })).toBe(2);
    expect(await prisma.tournamentMatch.count({ where: { tournamentId: tournament.id, bracket: "L", round: 101 } })).toBe(2);
  });
});

describe("GROUP_DOUBLE_ELIM full tournament", () => {
  it("plays 12 players from first group fixture to champion and pays out the whole pool", async () => {
    const pool = 1000;
    const split = [500, 300, 200];
    const { tournament, adminId } = await groupCup({ prizePoolGold: pool, prizeSplitGold: split });
    await startTournament(prisma, tournament.id, adminId);

    const played = await playOut(tournament.id);
    // 30 group + 10 playoff (7 W-from-round-2 + L + GF). The grand final can add
    // a reset game, so assert the floor rather than an exact count.
    expect(played).toBeGreaterThanOrEqual(40);

    const unfinished = await prisma.tournamentMatch.count({ where: { tournamentId: tournament.id, status: { not: "done" } } });
    expect(unfinished).toBe(0);

    const goldBefore = await totalGold();
    const result = await completeTournament(prisma, tournament.id, adminId, "test");

    // Exactly one champion, and the placement set covers every entrant.
    expect(result.championEntryId).toBeTruthy();
    const champions = result.placements.filter((p) => p.placement === 1);
    expect(champions).toHaveLength(1);

    const entries = await prisma.tournamentEntry.findMany({ where: { tournamentId: tournament.id } });
    expect(result.placements).toHaveLength(entries.length);
    expect(new Set(result.placements.map((p) => p.entryId)).size).toBe(entries.length);

    // Group-stage exits rank below every playoff finisher.
    const cutIds = new Set(entries.filter((e) => (e.groupPlacement ?? 0) > 4).map((e) => e.id));
    for (const p of result.placements) {
      if (cutIds.has(p.entryId)) expect(p.placement).toBeGreaterThan(8);
      else expect(p.placement).toBeLessThanOrEqual(8);
    }

    // The declared pool is fully distributed — no gold vanishes into a gap or a
    // tie, which is what the old "pay the first row matching placement i" loop
    // did whenever placements tied.
    const goldAfter = await totalGold();
    expect(goldAfter - goldBefore).toBe(pool);
  });

  it("splits a tied placement's pooled share instead of dropping the remainder", async () => {
    // Placements 5 and 7 tie in an 8-player double elim (5,5,7,7), so a split
    // that pays 4 places must hand places 5 and 6 to the two players tied at 5th.
    const pool = 1000;
    const split = [400, 300, 200, 60, 24, 16];
    const { tournament, adminId } = await groupCup({ prizePoolGold: pool, prizeSplitGold: split });
    await startTournament(prisma, tournament.id, adminId);
    await playOut(tournament.id);

    const goldBefore = await totalGold();
    const result = await completeTournament(prisma, tournament.id, adminId, "test");

    const tied = result.placements.filter((p) => p.placement === 5);
    expect(tied.length).toBeGreaterThan(1);

    // Whatever the shape of the tie, every declared gold leaves the pool.
    expect((await totalGold()) - goldBefore).toBe(pool);
  });
});

/** Total gold held by all users — the conservation check for payouts. */
async function totalGold(): Promise<number> {
  const agg = await prisma.user.aggregate({ _sum: { gold: true } });
  return agg._sum.gold ?? 0;
}
