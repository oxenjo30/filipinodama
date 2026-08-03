import { describe, it, expect, afterEach, afterAll } from "vitest";
import type { Server as IOServer } from "socket.io";
import { prisma } from "../src/db/client.js";
import { seedUser, truncateAll } from "./helpers.js";
import { joinTournament, startTournament } from "../src/modules/tournaments-core.js";
import {
  markReady,
  advanceForSettledMatch,
  resolveNoShow,
  sweepTournamentReadyChecks,
  myTournamentMatch,
} from "../src/realtime/tournament-live.js";
import { ApiError } from "../src/lib/errors.js";

/**
 * Tournament ready-check + auto-start + auto-advance.
 *
 * These cover the transitions that used to require an admin: two players readying
 * up produces exactly one live match, a settled match moves the bracket by itself,
 * a draw sends the pair back to replay, and a no-show forfeits.
 *
 * Settlement is simulated the way the real hook sees it — the Match row carries a
 * winner and an endedAt — rather than by playing a full game through the socket
 * layer. `advanceForSettledMatch` IS the hook body, so driving it directly tests
 * the same code path settleMatch triggers, without a board.
 */

afterEach(async () => {
  await truncateAll();
});
afterAll(async () => {
  await prisma.$disconnect();
});

/** Minimal IOServer stub: records emissions, has empty socket registries. */
function fakeIO() {
  const emitted: Array<{ room: string; event: string; payload: unknown }> = [];
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => {
        emitted.push({ room, event, payload });
      },
    }),
    sockets: { adapter: { rooms: new Map<string, Set<string>>() }, sockets: new Map<string, unknown>() },
  };
  return { io: io as unknown as IOServer, emitted };
}

/** A RUNNING single-elim Cup with `n` seeded players. Returns players in seed order. */
async function runningCup(n: number, overrides: Partial<{ readyWindowSec: number; maxPlayers: number }> = {}) {
  const admin = await seedUser({ adminRole: "ECONOMY" });
  const tournament = await prisma.tournament.create({
    data: {
      name: "Ready Cup",
      status: "OPEN",
      format: "SINGLE_ELIM",
      maxPlayers: overrides.maxPlayers ?? 8,
      readyWindowSec: overrides.readyWindowSec ?? 600,
      createdById: admin.id,
    },
  });
  const players = [];
  for (let i = 0; i < n; i++) {
    const u = await seedUser();
    await joinTournament(prisma, tournament.id, u.id);
    players.push(u);
  }
  await startTournament(prisma, tournament.id, admin.id);
  return { tournament, players, adminId: admin.id };
}

/** The first slot that is actually playable (both sides filled). */
async function firstReadySlot(tournamentId: string) {
  const slot = await prisma.tournamentMatch.findFirst({
    where: { tournamentId, status: "ready" },
    orderBy: [{ round: "asc" }, { slot: "asc" }],
  });
  if (!slot) throw new Error("no ready slot seeded");
  return slot;
}

/** The two seated users of a slot, red first. */
async function usersOf(slotId: string) {
  const slot = await prisma.tournamentMatch.findUniqueOrThrow({ where: { id: slotId } });
  const red = await prisma.tournamentEntry.findUniqueOrThrow({ where: { id: slot.redEntryId! } });
  const blue = await prisma.tournamentEntry.findUniqueOrThrow({ where: { id: slot.blueEntryId! } });
  return { redUserId: red.userId, blueUserId: blue.userId, redEntryId: red.id, blueEntryId: blue.id };
}

/** Mark a slot's match settled, exactly as settleMatch leaves it. */
async function settle(matchId: string, winner: "red" | "blue" | "draw") {
  await prisma.match.update({ where: { id: matchId }, data: { winner, endedAt: new Date() } });
}

describe("ready-check guards", () => {
  it("rejects a user who isn't a competitor in the slot", async () => {
    const { io } = fakeIO();
    const { tournament } = await runningCup(4);
    const slot = await firstReadySlot(tournament.id);
    const outsider = await seedUser();

    await expect(markReady(io, slot.id, outsider.id)).rejects.toMatchObject({ code: "NOT_A_PARTICIPANT" });
  });

  it("rejects a slot whose competitors aren't both known yet", async () => {
    const { io } = fakeIO();
    const { tournament } = await runningCup(4);
    const pending = await prisma.tournamentMatch.findFirstOrThrow({ where: { tournamentId: tournament.id, status: "pending" } });
    const someone = await prisma.tournamentEntry.findFirstOrThrow({ where: { tournamentId: tournament.id } });

    await expect(markReady(io, pending.id, someone.userId)).rejects.toMatchObject({ code: "SLOT_NOT_READY" });
  });

  it("rejects readying while the tournament isn't RUNNING", async () => {
    const { io } = fakeIO();
    const { tournament } = await runningCup(4);
    const slot = await firstReadySlot(tournament.id);
    const { redUserId } = await usersOf(slot.id);
    await prisma.tournament.update({ where: { id: tournament.id }, data: { status: "COMPLETED" } });

    await expect(markReady(io, slot.id, redUserId)).rejects.toMatchObject({ code: "BAD_STATE" });
  });

  it("rejects readying a slot that is already live", async () => {
    const { io } = fakeIO();
    const { tournament } = await runningCup(4);
    const slot = await firstReadySlot(tournament.id);
    const { redUserId, blueUserId } = await usersOf(slot.id);

    await markReady(io, slot.id, redUserId);
    await markReady(io, slot.id, blueUserId); // starts the match

    await expect(markReady(io, slot.id, redUserId)).rejects.toMatchObject({ code: "ALREADY_STARTED" });
  });
});

describe("ready-check arming", () => {
  it("the first ready arms the opponent's deadline from readyWindowSec", async () => {
    const { io } = fakeIO();
    const { tournament } = await runningCup(4, { readyWindowSec: 300 });
    const slot = await firstReadySlot(tournament.id);
    const { redUserId } = await usersOf(slot.id);

    const before = Date.now();
    await markReady(io, slot.id, redUserId);
    const after = await prisma.tournamentMatch.findUniqueOrThrow({ where: { id: slot.id } });

    expect(after.redReadyAt).not.toBeNull();
    expect(after.blueReadyAt).toBeNull();
    expect(after.readyDeadlineAt).not.toBeNull();
    const delta = after.readyDeadlineAt!.getTime() - before;
    expect(delta).toBeGreaterThan(290_000);
    expect(delta).toBeLessThan(310_000);
  });

  it("pressing ready twice is a no-op that doesn't push the deadline out", async () => {
    const { io } = fakeIO();
    const { tournament } = await runningCup(4);
    const slot = await firstReadySlot(tournament.id);
    const { redUserId } = await usersOf(slot.id);

    await markReady(io, slot.id, redUserId);
    const first = await prisma.tournamentMatch.findUniqueOrThrow({ where: { id: slot.id } });
    await markReady(io, slot.id, redUserId);
    const second = await prisma.tournamentMatch.findUniqueOrThrow({ where: { id: slot.id } });

    expect(second.redReadyAt!.getTime()).toBe(first.redReadyAt!.getTime());
    expect(second.readyDeadlineAt!.getTime()).toBe(first.readyDeadlineAt!.getTime());
    expect(second.matchId).toBeNull();
  });
});

describe("auto-start", () => {
  it("both ready creates the match, claims it, clears the deadline and tells both players", async () => {
    const { io, emitted } = fakeIO();
    const { tournament } = await runningCup(4);
    const slot = await firstReadySlot(tournament.id);
    const { redUserId, blueUserId } = await usersOf(slot.id);

    await markReady(io, slot.id, redUserId);
    await markReady(io, slot.id, blueUserId);

    const after = await prisma.tournamentMatch.findUniqueOrThrow({ where: { id: slot.id } });
    expect(after.matchId).not.toBeNull();
    expect(after.readyDeadlineAt).toBeNull();

    const match = await prisma.match.findUniqueOrThrow({ where: { id: after.matchId! } });
    expect(match.redId).toBe(redUserId);
    expect(match.blueId).toBe(blueUserId);
    expect(match.endedAt).toBeNull();

    const starts = emitted.filter((e) => e.event === "tournament:start");
    expect(starts).toHaveLength(2);
    expect(starts.map((s) => s.room).sort()).toEqual([`presence:${blueUserId}`, `presence:${redUserId}`].sort());
    const colors = starts.map((s) => (s.payload as { yourColor: string }).yourColor).sort();
    expect(colors).toEqual(["blue", "red"]);
  });

  it("uses the tournament's configured matchMode", async () => {
    const { io } = fakeIO();
    const { tournament } = await runningCup(4);
    await prisma.tournament.update({ where: { id: tournament.id }, data: { matchMode: "RANKED" } });
    const slot = await firstReadySlot(tournament.id);
    const { redUserId, blueUserId } = await usersOf(slot.id);

    await markReady(io, slot.id, redUserId);
    await markReady(io, slot.id, blueUserId);

    const after = await prisma.tournamentMatch.findUniqueOrThrow({ where: { id: slot.id } });
    const match = await prisma.match.findUniqueOrThrow({ where: { id: after.matchId! } });
    expect(match.mode).toBe("RANKED");
  });

  it("two simultaneous second-readies still produce exactly ONE live match", async () => {
    const { io } = fakeIO();
    const { tournament } = await runningCup(4);
    const slot = await firstReadySlot(tournament.id);
    const { redUserId, blueUserId } = await usersOf(slot.id);

    // Both sides already ready in the DB — now race two calls that will each
    // observe "both ready, not started" and try to start.
    const now = new Date();
    await prisma.tournamentMatch.update({
      where: { id: slot.id },
      data: { redReadyAt: now, blueReadyAt: now, readyDeadlineAt: new Date(now.getTime() + 600_000) },
    });

    await Promise.all([
      markReady(io, slot.id, redUserId).catch(() => {}),
      markReady(io, slot.id, blueUserId).catch(() => {}),
    ]);

    const after = await prisma.tournamentMatch.findUniqueOrThrow({ where: { id: slot.id } });
    expect(after.matchId).not.toBeNull();

    // The loser of the claim race must have deleted the row it created, so
    // exactly one Match exists for this tournament.
    const matches = await prisma.match.findMany();
    expect(matches).toHaveLength(1);
    expect(matches[0]!.id).toBe(after.matchId);
  });
});

describe("auto-advance on settlement", () => {
  it("a win resolves the slot and advances the winner into the parent slot", async () => {
    const { io } = fakeIO();
    const { tournament } = await runningCup(4);
    const slot = await firstReadySlot(tournament.id);
    const { redUserId, blueUserId, redEntryId } = await usersOf(slot.id);

    await markReady(io, slot.id, redUserId);
    await markReady(io, slot.id, blueUserId);
    const started = await prisma.tournamentMatch.findUniqueOrThrow({ where: { id: slot.id } });

    await settle(started.matchId!, "red");
    await advanceForSettledMatch(io, started.matchId!);

    const resolved = await prisma.tournamentMatch.findUniqueOrThrow({ where: { id: slot.id } });
    expect(resolved.status).toBe("done");
    expect(resolved.winnerEntryId).toBe(redEntryId);

    // The winner is now seated in the next round.
    const parent = await prisma.tournamentMatch.findFirstOrThrow({
      where: { tournamentId: tournament.id, round: slot.round + 1, slot: slot.slot >> 1 },
    });
    expect([parent.redEntryId, parent.blueEntryId]).toContain(redEntryId);
  });

  it("is a no-op for an ordinary match that has no bracket slot", async () => {
    const { io } = fakeIO();
    const a = await seedUser();
    const b = await seedUser();
    const match = await prisma.match.create({
      data: { mode: "CASUAL", redId: a.id, blueId: b.id, settings: {}, moves: [], winner: "red", endedAt: new Date() },
    });

    await expect(advanceForSettledMatch(io, match.id)).resolves.toBeUndefined();
  });

  it("a draw releases the slot for a replay instead of advancing anyone", async () => {
    const { io } = fakeIO();
    const { tournament } = await runningCup(4);
    const slot = await firstReadySlot(tournament.id);
    const { redUserId, blueUserId } = await usersOf(slot.id);

    await markReady(io, slot.id, redUserId);
    await markReady(io, slot.id, blueUserId);
    const started = await prisma.tournamentMatch.findUniqueOrThrow({ where: { id: slot.id } });
    const drawnMatchId = started.matchId!;

    await settle(drawnMatchId, "draw");
    await advanceForSettledMatch(io, drawnMatchId);

    const reset = await prisma.tournamentMatch.findUniqueOrThrow({ where: { id: slot.id } });
    expect(reset.status).toBe("ready");
    expect(reset.winnerEntryId).toBeNull();
    expect(reset.matchId).toBeNull(); // released — @unique would block the replay otherwise
    expect(reset.redReadyAt).toBeNull();
    expect(reset.blueReadyAt).toBeNull();
    expect(reset.readyDeadlineAt).toBeNull();

    // The drawn game itself is still in history.
    await expect(prisma.match.findUnique({ where: { id: drawnMatchId } })).resolves.not.toBeNull();

    // And the pair can ready up again for a fresh match.
    await markReady(io, slot.id, redUserId);
    await markReady(io, slot.id, blueUserId);
    const replay = await prisma.tournamentMatch.findUniqueOrThrow({ where: { id: slot.id } });
    expect(replay.matchId).not.toBeNull();
    expect(replay.matchId).not.toBe(drawnMatchId);
  });

  it("does not double-resolve a slot an admin already reported", async () => {
    const { io } = fakeIO();
    const { tournament } = await runningCup(4);
    const slot = await firstReadySlot(tournament.id);
    const { redUserId, blueUserId, blueEntryId } = await usersOf(slot.id);

    await markReady(io, slot.id, redUserId);
    await markReady(io, slot.id, blueUserId);
    const started = await prisma.tournamentMatch.findUniqueOrThrow({ where: { id: slot.id } });

    // Admin calls it for blue while the game is still live, then red "wins" it.
    const { reportResult } = await import("../src/modules/tournaments-core.js");
    await reportResult(prisma, tournament.id, slot.id, blueEntryId, { actorId: "admin-test" });

    await settle(started.matchId!, "red");
    await advanceForSettledMatch(io, started.matchId!); // must not overwrite

    const resolved = await prisma.tournamentMatch.findUniqueOrThrow({ where: { id: slot.id } });
    expect(resolved.winnerEntryId).toBe(blueEntryId);
  });
});

describe("no-show forfeit", () => {
  it("forfeits to the player who readied once the deadline passes", async () => {
    const { io } = fakeIO();
    const { tournament } = await runningCup(4);
    const slot = await firstReadySlot(tournament.id);
    const { redUserId, redEntryId } = await usersOf(slot.id);

    await markReady(io, slot.id, redUserId);
    // Wind the deadline back rather than waiting it out.
    await prisma.tournamentMatch.update({
      where: { id: slot.id },
      data: { readyDeadlineAt: new Date(Date.now() - 1000) },
    });

    const did = await resolveNoShow(io, slot.id);
    expect(did).toBe(true);

    const resolved = await prisma.tournamentMatch.findUniqueOrThrow({ where: { id: slot.id } });
    expect(resolved.status).toBe("done");
    expect(resolved.winnerEntryId).toBe(redEntryId);
  });

  it("does nothing while the deadline is still in the future", async () => {
    const { io } = fakeIO();
    const { tournament } = await runningCup(4);
    const slot = await firstReadySlot(tournament.id);
    const { redUserId } = await usersOf(slot.id);

    await markReady(io, slot.id, redUserId);
    expect(await resolveNoShow(io, slot.id)).toBe(false);

    const still = await prisma.tournamentMatch.findUniqueOrThrow({ where: { id: slot.id } });
    expect(still.status).toBe("ready");
  });

  it("does nothing once both players are ready (auto-start owns it)", async () => {
    const { io } = fakeIO();
    const { tournament } = await runningCup(4);
    const slot = await firstReadySlot(tournament.id);
    const { redUserId, blueUserId } = await usersOf(slot.id);

    await markReady(io, slot.id, redUserId);
    await markReady(io, slot.id, blueUserId);
    expect(await resolveNoShow(io, slot.id)).toBe(false);
  });
});

describe("backstop sweeper", () => {
  it("forfeits an expired slot whose no-show job was dropped", async () => {
    const { io } = fakeIO();
    const { tournament } = await runningCup(4);
    const slot = await firstReadySlot(tournament.id);
    const { blueUserId, blueEntryId } = await usersOf(slot.id);

    await markReady(io, slot.id, blueUserId);
    await prisma.tournamentMatch.update({
      where: { id: slot.id },
      data: { readyDeadlineAt: new Date(Date.now() - 1000) },
    });

    const res = await sweepTournamentReadyChecks(io);
    expect(res.forfeited).toBe(1);

    const resolved = await prisma.tournamentMatch.findUniqueOrThrow({ where: { id: slot.id } });
    expect(resolved.winnerEntryId).toBe(blueEntryId);
  });

  it("advances a slot whose match settled while the onMatchEnd hook was lost", async () => {
    const { io } = fakeIO();
    const { tournament } = await runningCup(4);
    const slot = await firstReadySlot(tournament.id);
    const { redUserId, blueUserId, blueEntryId } = await usersOf(slot.id);

    await markReady(io, slot.id, redUserId);
    await markReady(io, slot.id, blueUserId);
    const started = await prisma.tournamentMatch.findUniqueOrThrow({ where: { id: slot.id } });

    // Settle WITHOUT running the hook — the crash-between-settle-and-advance case.
    await settle(started.matchId!, "blue");
    const before = await prisma.tournamentMatch.findUniqueOrThrow({ where: { id: slot.id } });
    expect(before.status).toBe("ready");

    const res = await sweepTournamentReadyChecks(io);
    expect(res.advanced).toBeGreaterThanOrEqual(1);

    const resolved = await prisma.tournamentMatch.findUniqueOrThrow({ where: { id: slot.id } });
    expect(resolved.status).toBe("done");
    expect(resolved.winnerEntryId).toBe(blueEntryId);
  });

  it("is a cheap no-op when nothing is pending", async () => {
    const { io } = fakeIO();
    await runningCup(4);
    await expect(sweepTournamentReadyChecks(io)).resolves.toEqual({ forfeited: 0, advanced: 0 });
  });
});

describe("myMatch payload", () => {
  it("describes the player's current slot, opponent and readiness", async () => {
    const { io } = fakeIO();
    const { tournament } = await runningCup(4);
    const slot = await firstReadySlot(tournament.id);
    const { redUserId, blueUserId } = await usersOf(slot.id);

    const before = await myTournamentMatch(tournament.id, redUserId);
    expect(before).toMatchObject({
      tmId: slot.id,
      yourColor: "red",
      iAmReady: false,
      opponentReady: false,
      matchId: null,
    });
    expect(before!.opponent!.userId).toBe(blueUserId);
    expect(before!.roundLabel).toBe("Semifinals"); // 4 players → round 1 of 2

    await markReady(io, slot.id, blueUserId);
    const afterOpponentReady = await myTournamentMatch(tournament.id, redUserId);
    expect(afterOpponentReady).toMatchObject({ iAmReady: false, opponentReady: true });
    expect(afterOpponentReady!.deadlineAt).not.toBeNull();
  });

  it("is null for someone who never joined the tournament", async () => {
    const { tournament } = await runningCup(4);
    const outsider = await seedUser();
    await expect(myTournamentMatch(tournament.id, outsider.id)).resolves.toBeNull();
  });

  it("is null once the player is eliminated", async () => {
    const { io } = fakeIO();
    const { tournament } = await runningCup(4);
    const slot = await firstReadySlot(tournament.id);
    const { redUserId, blueUserId } = await usersOf(slot.id);

    await markReady(io, slot.id, redUserId);
    await markReady(io, slot.id, blueUserId);
    const started = await prisma.tournamentMatch.findUniqueOrThrow({ where: { id: slot.id } });
    await settle(started.matchId!, "red");
    await advanceForSettledMatch(io, started.matchId!);

    await expect(myTournamentMatch(tournament.id, blueUserId)).resolves.toBeNull();
    // ...while the winner now points at their next slot.
    const winnerNext = await myTournamentMatch(tournament.id, redUserId);
    expect(winnerNext).not.toBeNull();
    expect(winnerNext!.tmId).not.toBe(slot.id);
  });
});

describe("a full Cup runs with no admin reports", () => {
  it("4 players reach a champion through ready-checks and settlements alone", async () => {
    const { io } = fakeIO();
    const { tournament } = await runningCup(4);

    // Play every ready slot as it appears until the bracket is exhausted.
    for (let guard = 0; guard < 10; guard++) {
      const slot = await prisma.tournamentMatch.findFirst({
        where: { tournamentId: tournament.id, status: "ready" },
        orderBy: [{ round: "asc" }, { slot: "asc" }],
      });
      if (!slot) break;
      const { redUserId, blueUserId } = await usersOf(slot.id);
      await markReady(io, slot.id, redUserId);
      await markReady(io, slot.id, blueUserId);
      const started = await prisma.tournamentMatch.findUniqueOrThrow({ where: { id: slot.id } });
      await settle(started.matchId!, "red");
      await advanceForSettledMatch(io, started.matchId!);
    }

    const all = await prisma.tournamentMatch.findMany({ where: { tournamentId: tournament.id } });
    expect(all.every((m) => m.status === "done")).toBe(true);

    const finalRound = Math.max(...all.map((m) => m.round));
    const finalSlot = all.find((m) => m.round === finalRound)!;
    expect(finalSlot.winnerEntryId).not.toBeNull();

    // Zero admin involvement: every audit row for this bracket is the system actor.
    const reports = await prisma.auditLog.findMany({ where: { action: "tournament.match.report" } });
    expect(reports.length).toBeGreaterThan(0);
    expect(reports.every((r) => r.actorId === "system")).toBe(true);
  });
});

describe("ApiError contract", () => {
  it("throws ApiError instances the socket layer can map to codes", async () => {
    const { io } = fakeIO();
    const { tournament } = await runningCup(4);
    const slot = await firstReadySlot(tournament.id);
    const outsider = await seedUser();

    await expect(markReady(io, slot.id, outsider.id)).rejects.toBeInstanceOf(ApiError);
  });
});
