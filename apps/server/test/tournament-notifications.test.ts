import { describe, it, expect, afterEach, afterAll } from "vitest";
import type { Server as IOServer } from "socket.io";
import { prisma } from "../src/db/client.js";
import { seedUser, truncateAll } from "./helpers.js";
import { joinTournament, startTournament, reportResult, completeTournament } from "../src/modules/tournaments-core.js";
import { markReady, resolveNoShow, sweepTournamentReadyChecks } from "../src/realtime/tournament-live.js";

/**
 * Tournament notifications.
 *
 * Tournaments were the one major feature that told a player nothing — a forfeit
 * clock could start, expire and eliminate someone with no signal at all. These
 * assert the signals now exist AND go to the right person, which is the part
 * that would silently rot: sending "your opponent is waiting" to the player who
 * already readied is worse than sending nothing.
 */

afterEach(async () => {
  await truncateAll();
});
afterAll(async () => {
  await prisma.$disconnect();
});

function fakeIO() {
  const io = {
    to: () => ({ emit: () => {} }),
    sockets: { adapter: { rooms: new Map<string, Set<string>>() }, sockets: new Map<string, unknown>() },
  };
  return io as unknown as IOServer;
}

async function runningCup(n: number, overrides: Partial<{ readyWindowSec: number; startWindowSec: number | null }> = {}) {
  const admin = await seedUser({ adminRole: "ECONOMY" });
  const tournament = await prisma.tournament.create({
    data: {
      name: "Notify Cup",
      status: "OPEN",
      format: "SINGLE_ELIM",
      maxPlayers: n,
      readyWindowSec: overrides.readyWindowSec ?? 600,
      startWindowSec: overrides.startWindowSec ?? null,
      prizePoolGold: 300,
      prizeSplitGold: [200, 100],
      createdById: admin.id,
    },
  });
  for (let i = 0; i < n; i++) {
    const u = await seedUser();
    await joinTournament(prisma, tournament.id, u.id);
  }
  await startTournament(prisma, tournament.id, admin.id);
  return { tournament, adminId: admin.id };
}

async function firstReadySlot(tournamentId: string) {
  return prisma.tournamentMatch.findFirstOrThrow({
    where: { tournamentId, status: "ready" },
    orderBy: [{ round: "asc" }, { slot: "asc" }],
  });
}

async function notifsFor(userId: string, type?: string) {
  return prisma.notification.findMany({
    where: { userId, ...(type ? { type } : {}) },
    orderBy: { createdAt: "asc" },
  });
}

async function userOfEntry(entryId: string) {
  const e = await prisma.tournamentEntry.findUniqueOrThrow({ where: { id: entryId } });
  return e.userId;
}

describe("tournament notifications", () => {
  it("warns ONLY the player who hasn't readied that their clock is running", async () => {
    const io = fakeIO();
    const { tournament } = await runningCup(4);
    const slot = await firstReadySlot(tournament.id);
    const redUser = await userOfEntry(slot.redEntryId!);
    const blueUser = await userOfEntry(slot.blueEntryId!);

    await markReady(io, slot.id, redUser);

    const warned = await notifsFor(blueUser, "tournament_ready_clock");
    expect(warned).toHaveLength(1);
    expect(warned[0]!.body).toMatch(/forfeit/i);
    expect((warned[0]!.data as { tmId?: string }).tmId).toBe(slot.id);

    // The player who readied must NOT be told to ready up.
    expect(await notifsFor(redUser, "tournament_ready_clock")).toHaveLength(0);
  });

  it("tells BOTH players when the organiser start timer arms a fixture nobody has touched", async () => {
    const io = fakeIO();
    const { tournament } = await runningCup(4, { startWindowSec: 1800 });
    const slot = await firstReadySlot(tournament.id);
    const redUser = await userOfEntry(slot.redEntryId!);
    const blueUser = await userOfEntry(slot.blueEntryId!);

    await sweepTournamentReadyChecks(io);

    // Neither has acted, so neither can be assumed to know.
    expect(await notifsFor(redUser, "tournament_match_ready")).toHaveLength(1);
    expect(await notifsFor(blueUser, "tournament_match_ready")).toHaveLength(1);
  });

  it("explains a forfeit to both sides, including the player who lost without playing", async () => {
    const io = fakeIO();
    const { tournament } = await runningCup(4);
    const slot = await firstReadySlot(tournament.id);
    const redUser = await userOfEntry(slot.redEntryId!);
    const blueUser = await userOfEntry(slot.blueEntryId!);

    await markReady(io, slot.id, redUser);
    await prisma.tournamentMatch.update({ where: { id: slot.id }, data: { readyDeadlineAt: new Date(Date.now() - 1000) } });
    expect(await resolveNoShow(io, slot.id)).toBe(true);

    const winner = await notifsFor(redUser, "tournament_forfeit");
    const loser = await notifsFor(blueUser, "tournament_forfeit");
    expect(winner).toHaveLength(1);
    expect(loser).toHaveLength(1);
    // "You lost a match you never played" reads as a bug unless it says why.
    expect(loser[0]!.body).toMatch(/didn't ready up/i);
    expect((loser[0]!.data as { result?: string }).result).toBe("loss");
    expect((winner[0]!.data as { result?: string }).result).toBe("win");
  });

  it("names the double no-show explicitly rather than calling it a normal forfeit", async () => {
    const io = fakeIO();
    const { tournament } = await runningCup(4);
    const slot = await firstReadySlot(tournament.id);
    const redUser = await userOfEntry(slot.redEntryId!);

    // Nobody readied; only the organiser start timer can produce this.
    await prisma.tournamentMatch.update({ where: { id: slot.id }, data: { readyDeadlineAt: new Date(Date.now() - 1000) } });
    await resolveNoShow(io, slot.id);

    const notes = await notifsFor(redUser, "tournament_forfeit");
    expect(notes).toHaveLength(1);
    expect((notes[0]!.data as { doubleNoShow?: boolean }).doubleNoShow).toBe(true);
    expect(notes[0]!.body).toMatch(/neither player/i);
  });

  it("tells every player their final placement, and the paid ones what they won", async () => {
    const io = fakeIO();
    const { tournament, adminId } = await runningCup(4);

    // Play the whole cup out: red always wins.
    for (let i = 0; i < 20; i++) {
      const ready = await prisma.tournamentMatch.findMany({ where: { tournamentId: tournament.id, status: "ready" } });
      if (ready.length === 0) break;
      for (const m of ready) await reportResult(prisma, tournament.id, m.id, m.redEntryId!);
    }
    await completeTournament(prisma, tournament.id, adminId, "test");

    const entries = await prisma.tournamentEntry.findMany({ where: { tournamentId: tournament.id } });
    for (const e of entries) {
      const notes = await notifsFor(e.userId, "tournament_result");
      expect(notes, `entry ${e.id} placement ${e.placement}`).toHaveLength(1);
    }

    const champion = entries.find((e) => e.placement === 1)!;
    const champNote = (await notifsFor(champion.userId, "tournament_result"))[0]!;
    expect(champNote.title).toMatch(/you won/i);
    // A gold balance moving with no explanation is indistinguishable from a bug.
    expect(champNote.body).toMatch(/gold/i);
    expect((champNote.data as { prizeGold?: number }).prizeGold).toBeGreaterThan(0);
  });

  it("does not notify anyone when nothing has happened", async () => {
    const io = fakeIO();
    const { tournament } = await runningCup(4);
    await sweepTournamentReadyChecks(io); // start timer is OFF by default

    const entries = await prisma.tournamentEntry.findMany({ where: { tournamentId: tournament.id } });
    for (const e of entries) {
      expect(await notifsFor(e.userId)).toHaveLength(0);
    }
  });
});

describe("group-stage notifications", () => {
  it("tells each player whether they made the cut and which bracket they start in", async () => {
    const admin = await seedUser({ adminRole: "ECONOMY" });
    const tournament = await prisma.tournament.create({
      data: {
        name: "TI Cup",
        status: "OPEN",
        format: "GROUP_DOUBLE_ELIM",
        maxPlayers: 12,
        groupCount: 2,
        qualifiersPerGroup: 4,
        prizePoolGold: 0,
        prizeSplitGold: [],
        createdById: admin.id,
      },
    });
    for (let i = 0; i < 12; i++) {
      const u = await seedUser({ trophies: 1000 - i * 10 });
      await joinTournament(prisma, tournament.id, u.id);
    }
    await startTournament(prisma, tournament.id, admin.id);

    // Play the group stage only; better seed always wins.
    const seeds = new Map(
      (await prisma.tournamentEntry.findMany({ where: { tournamentId: tournament.id } })).map((e) => [e.id, e.seed ?? 1e9]),
    );
    for (let i = 0; i < 40; i++) {
      const ready = await prisma.tournamentMatch.findMany({ where: { tournamentId: tournament.id, status: "ready", bracket: "G" } });
      if (ready.length === 0) break;
      for (const m of ready) {
        const winner = (seeds.get(m.redEntryId!) ?? 0) <= (seeds.get(m.blueEntryId!) ?? 0) ? m.redEntryId! : m.blueEntryId!;
        await reportResult(prisma, tournament.id, m.id, winner);
      }
    }

    const entries = await prisma.tournamentEntry.findMany({ where: { tournamentId: tournament.id } });
    expect(entries.every((e) => e.groupPlacement != null)).toBe(true);

    for (const e of entries) {
      const notes = await notifsFor(e.userId, "tournament_group_cut");
      expect(notes, `entry placement ${e.groupPlacement}`).toHaveLength(1);
      const bracket = (notes[0]!.data as { bracket?: string }).bracket;
      const expected = e.groupPlacement! <= 2 ? "upper" : e.groupPlacement! <= 4 ? "lower" : "out";
      expect(bracket).toBe(expected);
    }

    // And the four who were cut are told they are out, not left guessing.
    const out = entries.filter((e) => e.eliminated);
    expect(out).toHaveLength(4);
    for (const e of out) {
      const note = (await notifsFor(e.userId, "tournament_group_cut"))[0]!;
      expect(note.title).toMatch(/knocked out/i);
    }
  });
});
