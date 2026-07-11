import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { seedUser, truncateAll } from "./helpers.js";
import {
  joinTournament,
  leaveTournament,
  startTournament,
  reportResult,
  completeTournament,
  cancelTournament,
} from "../src/modules/tournaments-core.js";
import { ApiError } from "../src/lib/errors.js";

afterEach(async () => {
  await truncateAll();
});
afterAll(async () => {
  await prisma.$disconnect();
});

async function seedTournament(overrides: Partial<{
  status: "DRAFT" | "OPEN" | "RUNNING" | "COMPLETED" | "CANCELLED";
  entryFeeGold: number;
  prizePoolGold: number;
  prizeSplitGold: number[];
  maxPlayers: number;
  minTrophies: number;
  registeredCount: number;
  createdById: string;
}> = {}) {
  const admin = overrides.createdById ? { id: overrides.createdById } : await seedUser({ adminRole: "ECONOMY" });
  return prisma.tournament.create({
    data: {
      name: "Test Cup",
      status: overrides.status ?? "OPEN",
      entryFeeGold: overrides.entryFeeGold ?? 0,
      prizePoolGold: overrides.prizePoolGold ?? 0,
      prizeSplitGold: overrides.prizeSplitGold ?? [],
      maxPlayers: overrides.maxPlayers ?? 8,
      minTrophies: overrides.minTrophies ?? 0,
      registeredCount: overrides.registeredCount ?? 0,
      createdById: admin.id,
    },
  });
}

async function goldOf(userId: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return u.gold;
}

/** A distinct acting admin, deliberately NOT the tournament's createdById — proves
 * start/complete/cancel audit rows attribute to the ACTOR, not the creator. */
async function actingAdmin() {
  const admin = await seedUser({ adminRole: "ECONOMY" });
  return admin.id;
}

describe("joinTournament — idempotency + capacity (money-critical)", () => {
  it("charges entryFeeGold, creates the entry, increments registeredCount, writes exactly one ledger row", async () => {
    const t = await seedTournament({ entryFeeGold: 100, maxPlayers: 8 });
    const player = await seedUser({ gold: 500 });

    const entry = await joinTournament(prisma, t.id, player.id);

    expect(entry.userId).toBe(player.id);
    expect(await goldOf(player.id)).toBe(400);
    const after = await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } });
    expect(after.registeredCount).toBe(1);
    const ledgerRows = await prisma.ledgerEntry.findMany({ where: { userId: player.id, reason: "tournament-entry" } });
    expect(ledgerRows.length).toBe(1);
    expect(ledgerRows[0]!.amount).toBe(-100);
    expect(ledgerRows[0]!.refId).toBe(entry.id);
    expect(ledgerRows[0]!.refType).toBe("tournament");
  });

  it("re-join by the same user after already joined → 409 ALREADY_JOINED, balance unchanged, still exactly one debit", async () => {
    const t = await seedTournament({ entryFeeGold: 100, maxPlayers: 8 });
    const player = await seedUser({ gold: 500 });
    await joinTournament(prisma, t.id, player.id);

    await expect(joinTournament(prisma, t.id, player.id)).rejects.toMatchObject({ status: 409, code: "ALREADY_JOINED" });

    expect(await goldOf(player.id)).toBe(400);
    const ledgerRows = await prisma.ledgerEntry.findMany({ where: { userId: player.id, reason: "tournament-entry" } });
    expect(ledgerRows.length).toBe(1);
    const after = await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } });
    expect(after.registeredCount).toBe(1);
  });

  it("insufficient gold → 400 INSUFFICIENT_GOLD, no entry, no ledger row, no registeredCount change", async () => {
    const t = await seedTournament({ entryFeeGold: 100, maxPlayers: 8 });
    const player = await seedUser({ gold: 50 });

    await expect(joinTournament(prisma, t.id, player.id)).rejects.toMatchObject({ status: 400, code: "INSUFFICIENT_GOLD" });

    expect(await goldOf(player.id)).toBe(50);
    expect(await prisma.tournamentEntry.count({ where: { tournamentId: t.id } })).toBe(0);
    expect(await prisma.ledgerEntry.count({ where: { userId: player.id } })).toBe(0);
    const after = await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } });
    expect(after.registeredCount).toBe(0);
  });

  it("below minTrophies → 403 TROPHY_GATE, no entry, no ledger row", async () => {
    const t = await seedTournament({ minTrophies: 500 });
    const player = await seedUser({ gold: 500, trophies: 100 });

    await expect(joinTournament(prisma, t.id, player.id)).rejects.toMatchObject({ status: 403, code: "TROPHY_GATE" });
    expect(await prisma.tournamentEntry.count({ where: { tournamentId: t.id } })).toBe(0);
  });

  it("at capacity → 409 TOURNAMENT_FULL, no entry, no ledger row", async () => {
    const t = await seedTournament({ maxPlayers: 1, registeredCount: 1 });
    const player = await seedUser({ gold: 500 });

    await expect(joinTournament(prisma, t.id, player.id)).rejects.toMatchObject({ status: 409, code: "TOURNAMENT_FULL" });
    expect(await prisma.tournamentEntry.count({ where: { tournamentId: t.id } })).toBe(0);
    expect(await prisma.ledgerEntry.count({ where: { userId: player.id } })).toBe(0);
  });

  it("not OPEN → rejected, no entry", async () => {
    const t = await seedTournament({ status: "DRAFT" });
    const player = await seedUser({ gold: 500 });
    await expect(joinTournament(prisma, t.id, player.id)).rejects.toThrow();
    expect(await prisma.tournamentEntry.count({ where: { tournamentId: t.id } })).toBe(0);
  });

  it("free entry (entryFeeGold=0) → no ledger row written, entry still created", async () => {
    const t = await seedTournament({ entryFeeGold: 0 });
    const player = await seedUser({ gold: 500 });
    const entry = await joinTournament(prisma, t.id, player.id);
    expect(entry.userId).toBe(player.id);
    expect(await goldOf(player.id)).toBe(500);
    expect(await prisma.ledgerEntry.count({ where: { userId: player.id } })).toBe(0);
  });

  it("JOIN RACE (HIGH #1 regression): Promise.all of two identical concurrent joins by the SAME user → exactly one entry, exactly one debit, one success one 409, never a 500", async () => {
    const t = await seedTournament({ entryFeeGold: 100, maxPlayers: 8 });
    const player = await seedUser({ gold: 500 });

    const results = await Promise.allSettled([
      joinTournament(prisma, t.id, player.id),
      joinTournament(prisma, t.id, player.id),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejectionReason).toBeInstanceOf(ApiError);
    expect(rejectionReason.status).toBe(409);
    expect(rejectionReason.code).toBe("ALREADY_JOINED");

    expect(await prisma.tournamentEntry.count({ where: { tournamentId: t.id, userId: player.id } })).toBe(1);
    const ledgerRows = await prisma.ledgerEntry.findMany({ where: { userId: player.id, reason: "tournament-entry" } });
    expect(ledgerRows.length).toBe(1);
    expect(await goldOf(player.id)).toBe(400);
    const after = await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } });
    expect(after.registeredCount).toBe(1);
  });

  it("CAPACITY RACE (MEDIUM #3 regression): N concurrent joins from DIFFERENT users for the last seat → entries never exceed maxPlayers", async () => {
    const t = await seedTournament({ entryFeeGold: 0, maxPlayers: 8, registeredCount: 7 });
    // pre-fill 7 real entries so registeredCount and actual entry count agree
    for (let i = 0; i < 7; i++) {
      const u = await seedUser({ gold: 500 });
      await prisma.tournamentEntry.create({ data: { tournamentId: t.id, userId: u.id, seed: null } });
    }
    const contenders = await Promise.all(Array.from({ length: 5 }, () => seedUser({ gold: 500 })));

    const results = await Promise.allSettled(contenders.map((u) => joinTournament(prisma, t.id, u.id)));
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(4);
    for (const r of rejected) {
      const reason = (r as PromiseRejectedResult).reason;
      expect(reason).toBeInstanceOf(ApiError);
      expect(reason.status).toBe(409);
      expect(reason.code).toBe("TOURNAMENT_FULL");
    }

    const finalEntryCount = await prisma.tournamentEntry.count({ where: { tournamentId: t.id } });
    expect(finalEntryCount).toBe(8);
    expect(finalEntryCount).toBeLessThanOrEqual(8);
    const after = await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } });
    expect(after.registeredCount).toBe(8);
    expect(after.registeredCount).toBe(finalEntryCount);
  });
});

describe("leaveTournament — refund keyed to entry.id, hard delete", () => {
  it("leave while OPEN refunds, hard-deletes entry, decrements registeredCount", async () => {
    const t = await seedTournament({ entryFeeGold: 100, maxPlayers: 8 });
    const player = await seedUser({ gold: 500 });
    const entry = await joinTournament(prisma, t.id, player.id);
    expect(await goldOf(player.id)).toBe(400);

    await leaveTournament(prisma, t.id, player.id);

    expect(await goldOf(player.id)).toBe(500);
    expect(await prisma.tournamentEntry.findUnique({ where: { id: entry.id } })).toBeNull();
    const after = await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } });
    expect(after.registeredCount).toBe(0);
    const refundRows = await prisma.ledgerEntry.findMany({ where: { userId: player.id, reason: "tournament-refund" } });
    expect(refundRows.length).toBe(1);
    expect(refundRows[0]!.amount).toBe(100);
    expect(refundRows[0]!.refId).toBe(entry.id);
  });

  it("leave while RUNNING → 409 BAD_STATE, entry NOT deleted, no refund", async () => {
    const t = await seedTournament({ entryFeeGold: 100, maxPlayers: 8, status: "OPEN" });
    const player = await seedUser({ gold: 500 });
    const entry = await joinTournament(prisma, t.id, player.id);
    await prisma.tournament.update({ where: { id: t.id }, data: { status: "RUNNING" } });

    await expect(leaveTournament(prisma, t.id, player.id)).rejects.toMatchObject({ status: 409, code: "BAD_STATE" });

    expect(await prisma.tournamentEntry.findUnique({ where: { id: entry.id } })).not.toBeNull();
    expect(await goldOf(player.id)).toBe(400);
    expect(await prisma.ledgerEntry.count({ where: { userId: player.id, reason: "tournament-refund" } })).toBe(0);
  });

  it("leave with no entry → rejected, nothing changes", async () => {
    const t = await seedTournament({ entryFeeGold: 100 });
    const player = await seedUser({ gold: 500 });
    await expect(leaveTournament(prisma, t.id, player.id)).rejects.toThrow();
    expect(await goldOf(player.id)).toBe(500);
  });
});

describe("join → leave → rejoin → cancel (HIGH #2 regression: refId=entry.id keying)", () => {
  it("exactly one debit + one refund per distinct entry; net balance unchanged; cancel refund never swallowed by leave refund's slot", async () => {
    const t = await seedTournament({ entryFeeGold: 100, maxPlayers: 8, status: "OPEN" });
    const player = await seedUser({ gold: 500 });

    // join → entry A, debit -100, refId=A.id
    const entryA = await joinTournament(prisma, t.id, player.id);
    expect(await goldOf(player.id)).toBe(400);

    // leave while OPEN → refund +100, refId=A.id, entry A hard-deleted
    await leaveTournament(prisma, t.id, player.id);
    expect(await goldOf(player.id)).toBe(500);

    // rejoin → entry B (NEW id), debit -100, refId=B.id
    const entryB = await joinTournament(prisma, t.id, player.id);
    expect(entryB.id).not.toBe(entryA.id);
    expect(await goldOf(player.id)).toBe(400);

    // cancel → refund +100, refId=B.id
    await cancelTournament(prisma, t.id, await actingAdmin(), "test cancel");
    expect(await goldOf(player.id)).toBe(500);

    // exactly one debit row per entry (two total: A and B)
    const debits = await prisma.ledgerEntry.findMany({ where: { userId: player.id, reason: "tournament-entry" }, orderBy: { createdAt: "asc" } });
    expect(debits.length).toBe(2);
    expect(debits.map((d) => d.refId).sort()).toEqual([entryA.id, entryB.id].sort());
    expect(debits.every((d) => d.amount === -100)).toBe(true);

    // exactly one refund row per entry (two total: A and B) — this is the crux
    // assertion: the cancel refund (refId=B.id) must NOT have been swallowed as
    // "already applied" by colliding with the leave refund (refId=A.id).
    const refunds = await prisma.ledgerEntry.findMany({ where: { userId: player.id, reason: "tournament-refund" }, orderBy: { createdAt: "asc" } });
    expect(refunds.length).toBe(2);
    expect(refunds.map((r) => r.refId).sort()).toEqual([entryA.id, entryB.id].sort());
    expect(refunds.every((r) => r.amount === 100)).toBe(true);

    // net balance is exactly back to where it started
    expect(await goldOf(player.id)).toBe(500);
  });
});

describe("startTournament — bracket seeding", () => {
  it("seeds by join order, byes for top seeds when n < B, all round slots created", async () => {
    const t = await seedTournament({ entryFeeGold: 0, maxPlayers: 8, status: "OPEN" });
    const players = [] as { id: string }[];
    for (let i = 0; i < 6; i++) {
      const u = await seedUser({ gold: 0 });
      await joinTournament(prisma, t.id, u.id);
      players.push(u);
      await new Promise((r) => setTimeout(r, 2)); // ensure distinct joinedAt ordering
    }

    const admin = await actingAdmin();
    await startTournament(prisma, t.id, admin);

    const after = await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } });
    expect(after.status).toBe("RUNNING");
    expect(after.startedAt).toBeTruthy();

    const entries = await prisma.tournamentEntry.findMany({ where: { tournamentId: t.id }, orderBy: { joinedAt: "asc" } });
    expect(entries.length).toBe(6);
    // seeds assigned 1..6 by join order
    const seeds = entries.map((e) => e.seed).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(seeds).toEqual([1, 2, 3, 4, 5, 6]);

    // B=8 (smallest power of two >= 6), rounds = log2(8) = 3
    const round1 = await prisma.tournamentMatch.findMany({ where: { tournamentId: t.id, round: 1 } });
    expect(round1.length).toBe(4);
    const round2 = await prisma.tournamentMatch.findMany({ where: { tournamentId: t.id, round: 2 } });
    expect(round2.length).toBe(2);
    const round3 = await prisma.tournamentMatch.findMany({ where: { tournamentId: t.id, round: 3 } });
    expect(round3.length).toBe(1);

    // seeds 7,8 don't exist → byes for seed 1 and seed 2 (auto-resolved, status done)
    const doneR1 = round1.filter((m) => m.status === "done");
    expect(doneR1.length).toBe(2);
    for (const m of doneR1) {
      expect(m.winnerEntryId).toBeTruthy();
    }
    // the byes' winners should already be advanced into round 2
    const seed1Entry = entries.find((e) => e.seed === 1)!;
    const seed2Entry = entries.find((e) => e.seed === 2)!;
    const advancedIds = round2.flatMap((m) => [m.redEntryId, m.blueEntryId]).filter(Boolean);
    expect(advancedIds).toContain(seed1Entry.id);
    expect(advancedIds).toContain(seed2Entry.id);
  });

  it("start with fewer than 2 entries → 400 TOO_FEW_PLAYERS", async () => {
    const t = await seedTournament({ status: "OPEN" });
    const u = await seedUser({ gold: 0 });
    await joinTournament(prisma, t.id, u.id);
    await expect(startTournament(prisma, t.id, await actingAdmin())).rejects.toMatchObject({ status: 400, code: "TOO_FEW_PLAYERS" });
    const after = await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } });
    expect(after.status).toBe("OPEN");
  });

  it("start twice concurrently → one succeeds, other 409s", async () => {
    const t = await seedTournament({ status: "OPEN" });
    for (let i = 0; i < 4; i++) {
      const u = await seedUser({ gold: 0 });
      await joinTournament(prisma, t.id, u.id);
    }
    const admin = await actingAdmin();
    const results = await Promise.allSettled([startTournament(prisma, t.id, admin), startTournament(prisma, t.id, admin)]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect((rejected[0] as PromiseRejectedResult).reason.status).toBe(409);

    const round1 = await prisma.tournamentMatch.findMany({ where: { tournamentId: t.id, round: 1 } });
    expect(round1.length).toBe(2); // seeded exactly once, not twice
  });

  it("n=3 entries → bracket size 4, two byes", async () => {
    const t = await seedTournament({ status: "OPEN", maxPlayers: 4 });
    for (let i = 0; i < 3; i++) {
      const u = await seedUser({ gold: 0 });
      await joinTournament(prisma, t.id, u.id);
      await new Promise((r) => setTimeout(r, 2));
    }
    await startTournament(prisma, t.id, await actingAdmin());
    const round1 = await prisma.tournamentMatch.findMany({ where: { tournamentId: t.id, round: 1 } });
    expect(round1.length).toBe(2);
    const byes = round1.filter((m) => m.status === "done");
    expect(byes.length).toBe(1); // one bye (seed 1 vs absent seed 4)
    const round2 = await prisma.tournamentMatch.findMany({ where: { tournamentId: t.id, round: 2 } });
    expect(round2.length).toBe(1);
  });

  it("n=5 entries → bracket size 8", async () => {
    const t = await seedTournament({ status: "OPEN", maxPlayers: 8 });
    for (let i = 0; i < 5; i++) {
      const u = await seedUser({ gold: 0 });
      await joinTournament(prisma, t.id, u.id);
      await new Promise((r) => setTimeout(r, 2));
    }
    await startTournament(prisma, t.id, await actingAdmin());
    const total = await prisma.tournamentMatch.count({ where: { tournamentId: t.id } });
    expect(total).toBe(7); // B-1 = 7 total slots for B=8
  });

  it("n=7 entries → bracket size 8, one bye", async () => {
    const t = await seedTournament({ status: "OPEN", maxPlayers: 8 });
    for (let i = 0; i < 7; i++) {
      const u = await seedUser({ gold: 0 });
      await joinTournament(prisma, t.id, u.id);
      await new Promise((r) => setTimeout(r, 2));
    }
    await startTournament(prisma, t.id, await actingAdmin());
    const round1 = await prisma.tournamentMatch.findMany({ where: { tournamentId: t.id, round: 1 } });
    const byes = round1.filter((m) => m.status === "done");
    expect(byes.length).toBe(1);
  });
});

describe("reportResult — advance the bracket (the only V1 advance path)", () => {
  async function startedTournamentOf(n: number) {
    const t = await seedTournament({ status: "OPEN", maxPlayers: 8, entryFeeGold: 0 });
    const players = [];
    for (let i = 0; i < n; i++) {
      const u = await seedUser({ gold: 0 });
      const entry = await joinTournament(prisma, t.id, u.id);
      players.push({ user: u, entry });
      await new Promise((r) => setTimeout(r, 2));
    }
    await startTournament(prisma, t.id, await actingAdmin());
    return { tournament: t, players };
  }

  it("resolves a ready slot: marks done, eliminates loser, fills parent slot; parent flips to ready when both sides filled", async () => {
    const { tournament } = await startedTournamentOf(4); // B=4, no byes
    const round1 = await prisma.tournamentMatch.findMany({ where: { tournamentId: tournament.id, round: 1 }, orderBy: { slot: "asc" } });
    expect(round1.length).toBe(2);
    const slot0 = round1[0]!;
    const winnerId = slot0.redEntryId!;
    const loserId = slot0.blueEntryId!;

    const result = await reportResult(prisma, tournament.id, slot0.id, winnerId);
    expect(result.status).toBe("done");

    const loserEntry = await prisma.tournamentEntry.findUniqueOrThrow({ where: { id: loserId } });
    expect(loserEntry.eliminated).toBe(true);

    const parent = await prisma.tournamentMatch.findFirstOrThrow({ where: { tournamentId: tournament.id, round: 2, slot: 0 } });
    expect(parent.redEntryId).toBe(winnerId); // slot 0 is even → red

    // resolve the other round-1 slot too → parent should flip to ready
    const slot1 = round1[1]!;
    const winner1 = slot1.redEntryId!;
    await reportResult(prisma, tournament.id, slot1.id, winner1);
    const parentAfter = await prisma.tournamentMatch.findUniqueOrThrow({ where: { id: parent.id } });
    expect(parentAfter.blueEntryId).toBe(winner1); // slot 1 is odd → blue
    expect(parentAfter.status).toBe("ready");
  });

  it("re-report on an already-done slot → 409 SLOT_DONE, no double-advance", async () => {
    const { tournament } = await startedTournamentOf(4);
    const round1 = await prisma.tournamentMatch.findMany({ where: { tournamentId: tournament.id, round: 1 }, orderBy: { slot: "asc" } });
    const slot0 = round1[0]!;
    const winnerId = slot0.redEntryId!;
    await reportResult(prisma, tournament.id, slot0.id, winnerId);

    await expect(reportResult(prisma, tournament.id, slot0.id, winnerId)).rejects.toMatchObject({ status: 409, code: "SLOT_DONE" });

    // parent slot unaffected by the second (rejected) call
    const parent = await prisma.tournamentMatch.findFirstOrThrow({ where: { tournamentId: tournament.id, round: 2, slot: 0 } });
    expect(parent.redEntryId).toBe(winnerId);
  });

  it("report on a pending slot (not ready — feeders unresolved) → 409 SLOT_NOT_READY", async () => {
    const { tournament } = await startedTournamentOf(4);
    const round2 = await prisma.tournamentMatch.findMany({ where: { tournamentId: tournament.id, round: 2 } });
    const finalSlot = round2[0]!;
    expect(finalSlot.status).toBe("pending");

    await expect(reportResult(prisma, tournament.id, finalSlot.id, "someone")).rejects.toMatchObject({ status: 409, code: "SLOT_NOT_READY" });
  });

  it("winner not a participant of that slot → 400", async () => {
    const { tournament } = await startedTournamentOf(4);
    const round1 = await prisma.tournamentMatch.findMany({ where: { tournamentId: tournament.id, round: 1 } });
    const slot0 = round1[0]!;
    await expect(reportResult(prisma, tournament.id, slot0.id, "not-a-real-entry-id")).rejects.toMatchObject({ status: 400 });
  });

  it("optional matchId stored as-is with no live-match validation (abandoned match case)", async () => {
    const { tournament } = await startedTournamentOf(4);
    const round1 = await prisma.tournamentMatch.findMany({ where: { tournamentId: tournament.id, round: 1 } });
    const slot0 = round1[0]!;
    const winnerId = slot0.redEntryId!;
    // no matchId passed at all — a "match never played" abandoned case
    const result = await reportResult(prisma, tournament.id, slot0.id, winnerId);
    expect(result.status).toBe("done");
    expect(result.matchId).toBeNull();
  });

  it("full 4-player bracket reported to a champion via report calls only", async () => {
    const { tournament, players } = await startedTournamentOf(4);
    const round1 = await prisma.tournamentMatch.findMany({ where: { tournamentId: tournament.id, round: 1 }, orderBy: { slot: "asc" } });
    const w0 = round1[0]!.redEntryId!;
    const w1 = round1[1]!.redEntryId!;
    await reportResult(prisma, tournament.id, round1[0]!.id, w0);
    await reportResult(prisma, tournament.id, round1[1]!.id, w1);

    const final = await prisma.tournamentMatch.findFirstOrThrow({ where: { tournamentId: tournament.id, round: 2, slot: 0 } });
    expect(final.status).toBe("ready");
    const championEntryId = final.redEntryId!;
    const finalResult = await reportResult(prisma, tournament.id, final.id, championEntryId);
    expect(finalResult.status).toBe("done");
    expect(finalResult.winnerEntryId).toBe(championEntryId);
    void players;
  });
});

describe("completeTournament — pay champion + runner-up only (money-critical)", () => {
  async function finishedFourPlayerTournament(prizePoolGold: number, prizeSplitGold: number[]) {
    const t = await seedTournament({ status: "OPEN", maxPlayers: 4, entryFeeGold: 0, prizePoolGold, prizeSplitGold });
    const players = [];
    for (let i = 0; i < 4; i++) {
      const u = await seedUser({ gold: 0 });
      const entry = await joinTournament(prisma, t.id, u.id);
      players.push({ user: u, entry });
      await new Promise((r) => setTimeout(r, 2));
    }
    await startTournament(prisma, t.id, await actingAdmin());
    const round1 = await prisma.tournamentMatch.findMany({ where: { tournamentId: t.id, round: 1 }, orderBy: { slot: "asc" } });
    const w0 = round1[0]!.redEntryId!;
    const w1 = round1[1]!.redEntryId!;
    await reportResult(prisma, t.id, round1[0]!.id, w0);
    await reportResult(prisma, t.id, round1[1]!.id, w1);
    const final = await prisma.tournamentMatch.findFirstOrThrow({ where: { tournamentId: t.id, round: 2, slot: 0 } });
    const championEntryId = final.redEntryId!;
    const runnerUpEntryId = final.blueEntryId!;
    await reportResult(prisma, t.id, final.id, championEntryId);
    return { tournament: t, championEntryId, runnerUpEntryId, players };
  }

  it("pays champion prizeSplitGold[0], runner-up prizeSplitGold[1], sets placements, marks COMPLETED", async () => {
    const { tournament, championEntryId, runnerUpEntryId } = await finishedFourPlayerTournament(1000, [700, 300]);

    const completingAdmin = await actingAdmin();
    await completeTournament(prisma, tournament.id, completingAdmin, "payout");

    const after = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(after.status).toBe("COMPLETED");
    expect(after.completedAt).toBeTruthy();

    const champEntry = await prisma.tournamentEntry.findUniqueOrThrow({ where: { id: championEntryId } });
    const runnerEntry = await prisma.tournamentEntry.findUniqueOrThrow({ where: { id: runnerUpEntryId } });
    expect(champEntry.placement).toBe(1);
    expect(runnerEntry.placement).toBe(2);

    const champUser = await prisma.user.findUniqueOrThrow({ where: { id: champEntry.userId } });
    const runnerUser = await prisma.user.findUniqueOrThrow({ where: { id: runnerEntry.userId } });
    expect(champUser.gold).toBe(700);
    expect(runnerUser.gold).toBe(300);

    const prizeRows = await prisma.ledgerEntry.findMany({ where: { reason: "tournament-prize" } });
    expect(prizeRows.length).toBe(2);
    const champRow = prizeRows.find((r) => r.refId === championEntryId)!;
    const runnerRow = prizeRows.find((r) => r.refId === runnerUpEntryId)!;
    expect(champRow.amount).toBe(700);
    expect(runnerRow.amount).toBe(300);

    // no prize for the semifinal losers even if placement=3 is stamped for display
    const semiLoserIds = (await prisma.tournamentEntry.findMany({ where: { tournamentId: tournament.id, id: { notIn: [championEntryId, runnerUpEntryId] } } })).map((e) => e.id);
    const strayPrizes = await prisma.ledgerEntry.findMany({ where: { reason: "tournament-prize", refId: { in: semiLoserIds } } });
    expect(strayPrizes.length).toBe(0);

    // audit actor attribution (Minor fix regression guard): the audit row for
    // tournament.complete must attribute to the ACTING admin who called
    // completeTournament, never to the tournament's createdById.
    expect(completingAdmin).not.toBe(tournament.createdById);
    const completeAudit = await prisma.auditLog.findFirstOrThrow({ where: { action: "tournament.complete", targetId: tournament.id } });
    expect(completeAudit.actorId).toBe(completingAdmin);
    expect(completeAudit.actorId).not.toBe(tournament.createdById);
  });

  it("prizeSplitGold not summing to prizePoolGold → 400 PRIZE_SPLIT_MISMATCH, no payout, status unchanged", async () => {
    const { tournament } = await finishedFourPlayerTournament(1000, [700, 200]); // sums to 900, not 1000

    await expect(completeTournament(prisma, tournament.id, await actingAdmin(), "payout")).rejects.toMatchObject({ status: 400, code: "PRIZE_SPLIT_MISMATCH" });

    const after = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(after.status).toBe("RUNNING");
    expect(await prisma.ledgerEntry.count({ where: { reason: "tournament-prize" } })).toBe(0);
  });

  // NOTE: prizeSplitGold was generalized from a fixed 2-tuple to a top-N array
  // (length 1..maxPlayers) — see "top-N prize splits (money-critical)" below
  // for the length-1/3/4 + mismatch + zero-middle-slot coverage. A length-1
  // split is now a VALID winner-takes-all payout (not a 400), which the next
  // test proves.
  it("prizeSplitGold length 1 (winner-takes-all) → pays only the champion, no runner-up payout", async () => {
    const { tournament, championEntryId, runnerUpEntryId } = await finishedFourPlayerTournament(1000, [1000]);
    await completeTournament(prisma, tournament.id, await actingAdmin(), "payout");

    const champUser = await prisma.user.findUniqueOrThrow({
      where: { id: (await prisma.tournamentEntry.findUniqueOrThrow({ where: { id: championEntryId } })).userId },
    });
    expect(champUser.gold).toBe(1000);

    const prizeRows = await prisma.ledgerEntry.findMany({ where: { reason: "tournament-prize" } });
    expect(prizeRows.length).toBe(1);
    expect(prizeRows[0]!.refId).toBe(championEntryId);
    expect(prizeRows[0]!.refId).not.toBe(runnerUpEntryId);
  });

  it("complete before a champion exists (still RUNNING, final not done) → 409 NOT_FINISHED", async () => {
    const t = await seedTournament({ status: "OPEN", maxPlayers: 4, prizePoolGold: 1000, prizeSplitGold: [700, 300] });
    for (let i = 0; i < 4; i++) {
      const u = await seedUser({ gold: 0 });
      await joinTournament(prisma, t.id, u.id);
      await new Promise((r) => setTimeout(r, 2));
    }
    await startTournament(prisma, t.id, await actingAdmin());
    await expect(completeTournament(prisma, t.id, await actingAdmin(), "too early")).rejects.toMatchObject({ status: 409, code: "NOT_FINISHED" });
  });

  it("re-run complete after success → 409 ALREADY_TERMINAL, no double-pay", async () => {
    const { tournament } = await finishedFourPlayerTournament(1000, [700, 300]);
    await completeTournament(prisma, tournament.id, await actingAdmin(), "first");
    await expect(completeTournament(prisma, tournament.id, await actingAdmin(), "second")).rejects.toMatchObject({ status: 409, code: "ALREADY_TERMINAL" });
    expect(await prisma.ledgerEntry.count({ where: { reason: "tournament-prize" } })).toBe(2);
  });

  it("CONCURRENT COMPLETE RACE: Promise.all of two completes → exactly one 200(success), other 409 ALREADY_TERMINAL; exactly two tournament-prize rows total (never four)", async () => {
    const { tournament } = await finishedFourPlayerTournament(1000, [700, 300]);

    const admin = await actingAdmin();
    const results = await Promise.allSettled([
      completeTournament(prisma, tournament.id, admin, "race-a"),
      completeTournament(prisma, tournament.id, admin, "race-b"),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect((rejected[0] as PromiseRejectedResult).reason.status).toBe(409);
    expect((rejected[0] as PromiseRejectedResult).reason.code).toBe("ALREADY_TERMINAL");

    const prizeRows = await prisma.ledgerEntry.findMany({ where: { reason: "tournament-prize" } });
    expect(prizeRows.length).toBe(2); // never 4
  });

  it("zero-amount prize (e.g. split [1000,0]) skips the grant for the zero side — no ledger row for amount 0", async () => {
    const { tournament, runnerUpEntryId } = await finishedFourPlayerTournament(1000, [1000, 0]);
    await completeTournament(prisma, tournament.id, await actingAdmin(), "winner-take-all");
    const prizeRows = await prisma.ledgerEntry.findMany({ where: { reason: "tournament-prize" } });
    expect(prizeRows.length).toBe(1);
    expect(prizeRows[0]!.refId).not.toBe(runnerUpEntryId);
  });

  it("prize pool conservation: sum(prizeSplitGold) === prizePoolGold always, verified against actual paid ledger total", async () => {
    const { tournament, championEntryId, runnerUpEntryId } = await finishedFourPlayerTournament(500, [350, 150]);
    await completeTournament(prisma, tournament.id, await actingAdmin(), "payout");
    const prizeRows = await prisma.ledgerEntry.findMany({ where: { reason: "tournament-prize", refId: { in: [championEntryId, runnerUpEntryId] } } });
    const totalPaid = prizeRows.reduce((sum, r) => sum + r.amount, 0);
    expect(totalPaid).toBe(500); // === prizePoolGold, real gold, never fabricated
  });
});

describe("top-N prize splits (money-critical) — generalized payout-by-placement", () => {
  /** An 8-player single-elim bracket reported to a champion, giving two
   * entries tied at placement 3 (both semifinal losers) — useful for
   * exercising a 3+ length split. */
  async function finishedEightPlayerTournament(prizePoolGold: number, prizeSplitGold: number[]) {
    const t = await seedTournament({ status: "OPEN", maxPlayers: 8, entryFeeGold: 0, prizePoolGold, prizeSplitGold });
    for (let i = 0; i < 8; i++) {
      const u = await seedUser({ gold: 0 });
      await joinTournament(prisma, t.id, u.id);
      await new Promise((r) => setTimeout(r, 2));
    }
    await startTournament(prisma, t.id, await actingAdmin());

    // Report round 1 (4 matches) → round 2 (2 matches, semis) → round 3 (final).
    let round = await prisma.tournamentMatch.findMany({ where: { tournamentId: t.id, round: 1 }, orderBy: { slot: "asc" } });
    for (const m of round) await reportResult(prisma, t.id, m.id, m.redEntryId!);

    round = await prisma.tournamentMatch.findMany({ where: { tournamentId: t.id, round: 2 }, orderBy: { slot: "asc" } });
    const semiLoserIds = round.map((m) => m.blueEntryId!); // red always wins above
    for (const m of round) await reportResult(prisma, t.id, m.id, m.redEntryId!);

    const final = await prisma.tournamentMatch.findFirstOrThrow({ where: { tournamentId: t.id, round: 3, slot: 0 } });
    const championEntryId = final.redEntryId!;
    const runnerUpEntryId = final.blueEntryId!;
    await reportResult(prisma, t.id, final.id, championEntryId);

    return { tournament: t, championEntryId, runnerUpEntryId, semiLoserIds };
  }

  it("split length 3: pays 1st, 2nd, and one of the (tied) 3rd-place entries; the other placement-3 entry gets nothing", async () => {
    const { tournament, championEntryId, runnerUpEntryId, semiLoserIds } = await finishedEightPlayerTournament(1000, [500, 300, 200]);
    await completeTournament(prisma, tournament.id, await actingAdmin(), "payout");

    const prizeRows = await prisma.ledgerEntry.findMany({ where: { reason: "tournament-prize" } });
    expect(prizeRows.length).toBe(3); // champion + runner-up + exactly one 3rd-place entry
    const totalPaid = prizeRows.reduce((sum, r) => sum + r.amount, 0);
    expect(totalPaid).toBe(1000);

    const champRow = prizeRows.find((r) => r.refId === championEntryId)!;
    const runnerRow = prizeRows.find((r) => r.refId === runnerUpEntryId)!;
    expect(champRow.amount).toBe(500);
    expect(runnerRow.amount).toBe(300);

    const thirdRow = prizeRows.find((r) => semiLoserIds.includes(r.refId));
    expect(thirdRow).toBeTruthy();
    expect(thirdRow!.amount).toBe(200);

    // both placement-3 entries are recorded (display), but only one paid.
    const thirdPlaceEntries = await prisma.tournamentEntry.findMany({ where: { id: { in: semiLoserIds } } });
    expect(thirdPlaceEntries.every((e) => e.placement === 3)).toBe(true);
  });

  it("split length 4 summing to prizePoolGold with a ZERO in the middle (skip 2nd, pay 1st + 3rd): no ledger row for the zero slot", async () => {
    const { tournament, championEntryId, runnerUpEntryId, semiLoserIds } = await finishedEightPlayerTournament(1000, [700, 0, 300, 0]);
    await completeTournament(prisma, tournament.id, await actingAdmin(), "payout");

    const prizeRows = await prisma.ledgerEntry.findMany({ where: { reason: "tournament-prize" } });
    expect(prizeRows.length).toBe(2); // 1st + one of the 3rd-place entries; 2nd and 4th are zero/nonexistent
    expect(prizeRows.some((r) => r.refId === runnerUpEntryId)).toBe(false);

    const champRow = prizeRows.find((r) => r.refId === championEntryId)!;
    expect(champRow.amount).toBe(700);
    const thirdRow = prizeRows.find((r) => semiLoserIds.includes(r.refId));
    expect(thirdRow!.amount).toBe(300);

    const totalPaid = prizeRows.reduce((sum, r) => sum + r.amount, 0);
    expect(totalPaid).toBe(1000);
  });

  it("split length > entrants (e.g. length 4 on a 4-player bracket where only placements 1/2/3/3 exist): placement 4 slot amount is simply unpaid, no crash, sum still validated against prizePoolGold", async () => {
    // 4-player bracket only ever produces placements {1,2,3,3} — no placement 4 exists.
    const { tournament, championEntryId, runnerUpEntryId } = await finishedFourPlayerTournament(1000, [400, 300, 200, 100]);
    await completeTournament(prisma, tournament.id, await actingAdmin(), "payout");

    const after = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(after.status).toBe("COMPLETED");

    const prizeRows = await prisma.ledgerEntry.findMany({ where: { reason: "tournament-prize" } });
    // 1st(400) + 2nd(300) + exactly one 3rd(200) paid; the 4th-place slot (100)
    // has no entry at placement 4 in a 4-player bracket, so it's unpaid —
    // NOT redistributed, NOT paid to someone else. Total paid < prizePoolGold
    // in this edge case (declared pool is a ceiling, not a guarantee every
    // gold moves).
    const totalPaid = prizeRows.reduce((sum, r) => sum + r.amount, 0);
    expect(totalPaid).toBe(900); // 400+300+200, the 100 (placement 4) goes unpaid
    expect(prizeRows.some((r) => r.refId === championEntryId)).toBe(true);
    expect(prizeRows.some((r) => r.refId === runnerUpEntryId)).toBe(true);
  });

  it("split length 0 → 400 PRIZE_SPLIT_MISMATCH (must be at least length 1)", async () => {
    const { tournament } = await finishedFourPlayerTournament(1000, []);
    await expect(completeTournament(prisma, tournament.id, await actingAdmin(), "payout")).rejects.toMatchObject({ status: 400, code: "PRIZE_SPLIT_MISMATCH" });
  });

  it("split with a negative entry → 400 PRIZE_SPLIT_MISMATCH", async () => {
    const { tournament } = await finishedFourPlayerTournament(1000, [1100, -100]);
    await expect(completeTournament(prisma, tournament.id, await actingAdmin(), "payout")).rejects.toMatchObject({ status: 400, code: "PRIZE_SPLIT_MISMATCH" });
  });

  it("split summing correctly but length > maxPlayers → 400 PRIZE_SPLIT_MISMATCH", async () => {
    // maxPlayers=4 but a 5-length split is provided.
    const { tournament } = await finishedFourPlayerTournament(1000, [200, 200, 200, 200, 200]);
    await expect(completeTournament(prisma, tournament.id, await actingAdmin(), "payout")).rejects.toMatchObject({ status: 400, code: "PRIZE_SPLIT_MISMATCH" });
  });

  /** Re-declare the 4-player helper locally (mirrors the one inside the
   * completeTournament describe above — kept local to avoid cross-describe
   * coupling on a closure-scoped helper). */
  async function finishedFourPlayerTournament(prizePoolGold: number, prizeSplitGold: number[]) {
    const t = await seedTournament({ status: "OPEN", maxPlayers: 4, entryFeeGold: 0, prizePoolGold, prizeSplitGold });
    const players = [];
    for (let i = 0; i < 4; i++) {
      const u = await seedUser({ gold: 0 });
      const entry = await joinTournament(prisma, t.id, u.id);
      players.push({ user: u, entry });
      await new Promise((r) => setTimeout(r, 2));
    }
    await startTournament(prisma, t.id, await actingAdmin());
    const round1 = await prisma.tournamentMatch.findMany({ where: { tournamentId: t.id, round: 1 }, orderBy: { slot: "asc" } });
    const w0 = round1[0]!.redEntryId!;
    const w1 = round1[1]!.redEntryId!;
    await reportResult(prisma, t.id, round1[0]!.id, w0);
    await reportResult(prisma, t.id, round1[1]!.id, w1);
    const final = await prisma.tournamentMatch.findFirstOrThrow({ where: { tournamentId: t.id, round: 2, slot: 0 } });
    const championEntryId = final.redEntryId!;
    const runnerUpEntryId = final.blueEntryId!;
    await reportResult(prisma, t.id, final.id, championEntryId);
    return { tournament: t, championEntryId, runnerUpEntryId, players };
  }
});

describe("cancelTournament — refund all entrants exactly once", () => {
  it("refunds every paid, un-refunded entry exactly once, sets CANCELLED", async () => {
    const t = await seedTournament({ status: "OPEN", entryFeeGold: 100, maxPlayers: 8 });
    const players = [];
    for (let i = 0; i < 3; i++) {
      const u = await seedUser({ gold: 500 });
      const entry = await joinTournament(prisma, t.id, u.id);
      players.push({ user: u, entry });
    }

    const cancellingAdmin = await actingAdmin();
    await cancelTournament(prisma, t.id, cancellingAdmin, "cancelled by admin");

    const after = await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } });
    expect(after.status).toBe("CANCELLED");
    expect(after.cancelledAt).toBeTruthy();

    for (const p of players) {
      expect(await goldOf(p.user.id)).toBe(500);
      const entry = await prisma.tournamentEntry.findUniqueOrThrow({ where: { id: p.entry.id } });
      expect(entry.refunded).toBe(true);
    }
    const refundRows = await prisma.ledgerEntry.findMany({ where: { reason: "tournament-refund" } });
    expect(refundRows.length).toBe(3);
    expect(new Set(refundRows.map((r) => r.refId)).size).toBe(3); // each refId distinct (entry.id)

    // audit actor attribution (Minor fix regression guard): the audit row for
    // tournament.cancel must attribute to the ACTING admin, never t.createdById.
    expect(cancellingAdmin).not.toBe(t.createdById);
    const cancelAudit = await prisma.auditLog.findFirstOrThrow({ where: { action: "tournament.cancel", targetId: t.id } });
    expect(cancelAudit.actorId).toBe(cancellingAdmin);
    expect(cancelAudit.actorId).not.toBe(t.createdById);
  });

  it("re-run cancel → 409 ALREADY_TERMINAL, no second refund", async () => {
    const t = await seedTournament({ status: "OPEN", entryFeeGold: 100 });
    const u = await seedUser({ gold: 500 });
    await joinTournament(prisma, t.id, u.id);
    await cancelTournament(prisma, t.id, await actingAdmin(), "first");

    await expect(cancelTournament(prisma, t.id, await actingAdmin(), "second")).rejects.toMatchObject({ status: 409, code: "ALREADY_TERMINAL" });
    expect(await prisma.ledgerEntry.count({ where: { reason: "tournament-refund" } })).toBe(1);
    expect(await goldOf(u.id)).toBe(500);
  });

  it("free tournament (entryFeeGold=0) cancel → no ledger rows written", async () => {
    const t = await seedTournament({ status: "OPEN", entryFeeGold: 0 });
    const u = await seedUser({ gold: 500 });
    await joinTournament(prisma, t.id, u.id);
    await cancelTournament(prisma, t.id, await actingAdmin(), "free cancel");
    expect(await prisma.ledgerEntry.count({ where: { userId: u.id } })).toBe(0);
    expect(await goldOf(u.id)).toBe(500);
  });

  it("cancel from DRAFT (no entries) → succeeds, no refunds needed", async () => {
    const t = await seedTournament({ status: "DRAFT" });
    await cancelTournament(prisma, t.id, await actingAdmin(), "scrapped before opening");
    const after = await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } });
    expect(after.status).toBe("CANCELLED");
  });

  it("cancel from RUNNING with entries → refunds all un-refunded entries", async () => {
    const t = await seedTournament({ status: "OPEN", entryFeeGold: 50, maxPlayers: 4 });
    const players = [];
    for (let i = 0; i < 4; i++) {
      const u = await seedUser({ gold: 200 });
      const entry = await joinTournament(prisma, t.id, u.id);
      players.push({ user: u, entry });
      await new Promise((r) => setTimeout(r, 2));
    }
    await startTournament(prisma, t.id, await actingAdmin());
    await cancelTournament(prisma, t.id, await actingAdmin(), "called off mid-run");
    for (const p of players) {
      expect(await goldOf(p.user.id)).toBe(200);
    }
  });

  it("cancel on COMPLETED tournament → 409 ALREADY_TERMINAL", async () => {
    const t = await seedTournament({ status: "COMPLETED" });
    await expect(cancelTournament(prisma, t.id, await actingAdmin(), "too late")).rejects.toMatchObject({ status: 409, code: "ALREADY_TERMINAL" });
  });
});

describe("audit — every mutation writes an AuditLog row", () => {
  it("join, leave, start, report, complete, cancel each write their action's audit row", async () => {
    const t = await seedTournament({ status: "OPEN", entryFeeGold: 0, maxPlayers: 4, prizePoolGold: 100, prizeSplitGold: [70, 30] });
    const admin = await prisma.user.findUniqueOrThrow({ where: { id: t.createdById } });
    const actor = await actingAdmin(); // deliberately distinct from t.createdById

    const players = [];
    for (let i = 0; i < 4; i++) {
      const u = await seedUser({ gold: 0 });
      const entry = await joinTournament(prisma, t.id, u.id);
      players.push({ user: u, entry });
      await new Promise((r) => setTimeout(r, 2));
    }
    expect(await prisma.auditLog.count({ where: { action: "tournament.join", targetId: t.id } })).toBe(4);

    // leave + rejoin one player to exercise the leave audit row
    await leaveTournament(prisma, t.id, players[0]!.user.id);
    expect(await prisma.auditLog.count({ where: { action: "tournament.leave", targetId: t.id } })).toBe(1);
    const rejoinEntry = await joinTournament(prisma, t.id, players[0]!.user.id);
    players[0]!.entry = rejoinEntry;

    await startTournament(prisma, t.id, actor);
    expect(await prisma.auditLog.count({ where: { action: "tournament.start", targetId: t.id } })).toBe(1);
    const startAudit = await prisma.auditLog.findFirstOrThrow({ where: { action: "tournament.start", targetId: t.id } });
    expect(startAudit.actorId).toBe(actor);
    expect(startAudit.actorId).not.toBe(t.createdById);

    const round1 = await prisma.tournamentMatch.findMany({ where: { tournamentId: t.id, round: 1 }, orderBy: { slot: "asc" } });
    const w0 = round1[0]!.redEntryId!;
    const w1 = round1[1]!.redEntryId!;
    await reportResult(prisma, t.id, round1[0]!.id, w0, { actorId: admin.id, reason: "r1" });
    await reportResult(prisma, t.id, round1[1]!.id, w1, { actorId: admin.id, reason: "r2" });
    expect(await prisma.auditLog.count({ where: { action: "tournament.match.report" } })).toBe(2);

    const final = await prisma.tournamentMatch.findFirstOrThrow({ where: { tournamentId: t.id, round: 2, slot: 0 } });
    const championEntryId = final.redEntryId!;
    await reportResult(prisma, t.id, final.id, championEntryId, { actorId: admin.id, reason: "final" });
    expect(await prisma.auditLog.count({ where: { action: "tournament.match.report" } })).toBe(3);

    await completeTournament(prisma, t.id, actor, "payout");
    expect(await prisma.auditLog.count({ where: { action: "tournament.complete", targetId: t.id } })).toBe(1);
    const completeAudit = await prisma.auditLog.findFirstOrThrow({ where: { action: "tournament.complete", targetId: t.id } });
    expect(completeAudit.actorId).toBe(actor);
    expect(completeAudit.actorId).not.toBe(t.createdById);

    // separate cancellable tournament to exercise the cancel audit row
    const t2 = await seedTournament({ status: "DRAFT" });
    const cancelActor = await actingAdmin();
    await cancelTournament(prisma, t2.id, cancelActor, "scrapped");
    expect(await prisma.auditLog.count({ where: { action: "tournament.cancel", targetId: t2.id } })).toBe(1);
    const cancelAudit = await prisma.auditLog.findFirstOrThrow({ where: { action: "tournament.cancel", targetId: t2.id } });
    expect(cancelAudit.actorId).toBe(cancelActor);
    expect(cancelAudit.actorId).not.toBe(t2.createdById);
  });
});
