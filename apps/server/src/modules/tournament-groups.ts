/**
 * GROUP_DOUBLE_ELIM — the "Dota 2 The International" tournament format.
 *
 * Round-robin groups, cut the bottom of each group, survivors into a double
 * elimination with the top half of each group seeded into the UPPER bracket and
 * the bottom half straight into the LOWER one.
 *
 * THE STRUCTURAL IDEA. The playoff is an ORDINARY double-elimination bracket of
 * size S (= survivors) whose winners round 1 has already been decided: the group
 * stage IS winners round 1. So W round 1 is never materialised, the upper
 * qualifiers are seeded directly into W round 2 and the lower qualifiers into L
 * round 1, and every existing helper — losersDropSlot, lWinnerAdvance,
 * computeDoubleElimPlacements — then applies unchanged, because the geometry is
 * genuinely standard rather than merely similar. A standard W round 1 of size S
 * yields exactly S/2 winners and S/2 losers, which is why the upper/lower split
 * is forced to half and half instead of being configurable.
 *
 * TWO CONSEQUENCES that are easy to miss and expensive to get wrong:
 *
 *  1. B cannot be recovered by counting W-round-1 rows the way the plain
 *     DOUBLE_ELIM path does — there are none, so that count is 0 and
 *     losersBracketStructure(0) throws inside the report transaction. It is
 *     persisted as Tournament.bracketSize at seed time instead.
 *
 *  2. L round 1 is PRE-SEEDED rather than filled by drops, so it must be created
 *     "ready". The rest of the L skeleton is "pending", and the only paths that
 *     ever flip an L slot to "ready" are the W-drop and the L-advance — neither
 *     of which visits a round that was filled by seeding.
 *
 * Design notes: docs/superpowers/specs/2026-08-03-ti-group-stage-format-design.md
 */
import type { PrismaClient, Prisma } from "@prisma/client";
import { err } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { notifyGroupCut, notifyFixtureReady } from "../lib/tournament-notify.js";
import {
  computeRoundRobinStandings,
  computeDoubleElimPlacements,
  losersBracketStructure,
  groupStageShape,
  groupStageSchedule,
  groupRoundCount,
  snakeDraftGroups,
  seedPlayoffFromGroups,
  L_ROUND_OFFSET,
  G_ROUND_OFFSET,
  GF_ROUND,
  type GroupShape,
  type GroupQualifier,
  type DoubleElimMatchLike,
} from "../lib/tournament-bracket.js";

type Tx = Prisma.TransactionClient;
type Db = PrismaClient;

export type PlacementRow = { entryId: string; placement: number };
/** A fixture that just became playable, in the shape the notifier needs. */
export type CreatedFixture = { id: string; tournamentId: string; redEntryId: string | null; blueEntryId: string | null };

function isP2002(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

/** The group shape of a GROUP_DOUBLE_ELIM tournament, recomputed from its stored config. */
export function groupShapeOf(t: {
  maxPlayers: number;
  groupCount: number | null;
  qualifiersPerGroup: number | null;
}): GroupShape {
  if (t.groupCount == null || t.qualifiersPerGroup == null) {
    throw err.badRequest("INVALID_GROUP_SHAPE", "This tournament is missing its group configuration");
  }
  return groupStageShape(t.maxPlayers, t.groupCount, t.qualifiersPerGroup);
}

/**
 * `${groupIndex}:${localSeat}` -> entryId, where local seats run 1..groupSize in
 * global-seed order within each group.
 *
 * roundRobinSchedule works in LOCAL seat numbers. Feeding it global tournament
 * seeds pairs the wrong players the moment there is more than one group — or
 * throws on a seed that group does not contain.
 */
function localSeatMap(entries: Array<{ id: string; groupIndex: number }>): Map<string, string> {
  const nextSeat = new Map<number, number>();
  const out = new Map<string, string>();
  for (const e of entries) {
    const seat = (nextSeat.get(e.groupIndex) ?? 0) + 1;
    nextSeat.set(e.groupIndex, seat);
    out.set(`${e.groupIndex}:${seat}`, e.id);
  }
  return out;
}

/**
 * GROUP_DOUBLE_ELIM start branch.
 *
 * FULL FIELD REQUIRED. Every other format tolerates a short field — single-elim
 * pads with byes, RR and Swiss just use n. This one cannot: the group shape was
 * validated against maxPlayers, and a short field changes the group size, can
 * push qualifiersPerGroup past it, and stops the survivor count being a power of
 * two — at which point there is no playoff bracket to seed at all. Rather than
 * silently reshaping a cup people have already paid to enter, Start refuses.
 * This is the same call DOUBLE_ELIM already makes with DE_NEEDS_POWER_OF_TWO and
 * for the same money reason: better to make an admin wait or cancel-and-refund
 * than to strand entry-fee gold in a bracket that can never complete.
 *
 * SEEDED BY TROPHIES, unlike every other format. The others seed by joinedAt,
 * which is registration order and carries no skill signal. That is harmless when
 * seeding only decides who meets whom, but not here: the snake draft exists to
 * balance group STRENGTH, and computeRoundRobinStandings uses seed as its final
 * tie-break — so with join-order seeds, a tie for the last qualifying place
 * would be settled by who clicked Join first. Scoped to this format on purpose;
 * re-seeding the other formats is a separate and visible change.
 *
 * Only group round 1 is created here — see maybeAdvanceGroupStage.
 */
export async function startGroupDoubleElim(
  db: Db,
  tournamentId: string,
  tournament: { maxPlayers: number; groupCount: number | null; qualifiersPerGroup: number | null },
  clamped: Array<{ id: string }>,
  actorId: string,
) {
  const n = clamped.length;
  if (n !== tournament.maxPlayers) {
    throw err.badRequest(
      "GROUP_NEEDS_FULL_FIELD",
      `This format needs the full field of ${tournament.maxPlayers} players before it can start — currently ${n}. Wait for it to fill, or cancel and refund.`,
    );
  }

  const shape = groupShapeOf(tournament);

  // Trophies desc, ties broken by join order so the draw stays deterministic
  // for a field of equal trophies (a brand-new cup of 0-trophy players).
  const withTrophies = await db.tournamentEntry.findMany({
    where: { id: { in: clamped.map((e) => e.id) } },
    select: { id: true, user: { select: { trophies: true } } },
  });
  const joinOrder = new Map(clamped.map((e, i) => [e.id, i]));
  const seeded = [...withTrophies].sort(
    (a, b) => b.user.trophies - a.user.trophies || (joinOrder.get(a.id) ?? 0) - (joinOrder.get(b.id) ?? 0),
  );

  const groupOfSeed = snakeDraftGroups(n, shape.groupCount);
  const firstRound = G_ROUND_OFFSET + 1;

  return db.$transaction(async (tx) => {
    const flip = await tx.tournament.updateMany({
      where: { id: tournamentId, status: "OPEN" },
      data: { status: "RUNNING", startedAt: new Date() },
    });
    if (flip.count === 0) throw new Error("ALREADY_STARTED");

    for (let i = 0; i < seeded.length; i++) {
      await tx.tournamentEntry.update({
        where: { id: seeded[i]!.id },
        data: { seed: i + 1, groupIndex: groupOfSeed[i]! },
      });
    }
    // Structural and already known, so written now; the playoff rows that
    // depend on it appear later, at the transition.
    await tx.tournament.update({ where: { id: tournamentId }, data: { bracketSize: shape.survivors } });

    const localSeats = localSeatMap(seeded.map((e, i) => ({ id: e.id, groupIndex: groupOfSeed[i]! })));

    for (const f of groupStageSchedule(shape.groupSize, shape.groupCount)) {
      if (f.round !== firstRound) continue; // later rounds are generated progressively
      await tx.tournamentMatch.create({
        data: {
          tournamentId,
          bracket: "G",
          round: f.round,
          slot: f.slot,
          redEntryId: localSeats.get(`${f.groupIndex}:${f.seedA}`)!,
          blueEntryId: localSeats.get(`${f.groupIndex}:${f.seedB}`)!,
          status: "ready",
        },
      });
    }

    await audit(tx, {
      actorId,
      action: "tournament.start",
      targetType: "tournament",
      targetId: tournamentId,
      before: { status: "OPEN" },
      after: { status: "RUNNING", n, format: "GROUP_DOUBLE_ELIM", shape },
      reason: "admin start",
    });

    return { bracketSize: shape.survivors, rounds: groupRoundCount(shape.groupSize), seededCount: n };
  });
}

/**
 * Generate the next group round once `justResolvedRound` is fully done.
 *
 * Mirrors maybeGenerateNextSwissRound exactly, including its P2002 guard and its
 * documented inability to prevent ZERO-generation by itself — two reports
 * settling a round's last two fixtures in different transactions can each miss
 * the other under READ COMMITTED and both skip. recoverGroupDoubleElim is the
 * actual fix for that.
 *
 * Progressive generation is a CORRECTNESS requirement here, not an optimisation.
 * Creating every fixture up front is what allowed a player to ready a match
 * their opponent's client was not showing them and take it by no-show forfeit,
 * and it is why myTournamentMatch's "one live slot per player" invariant has to
 * hold. One round at a time restores it.
 */
export async function maybeAdvanceGroupStage(
  tx: Tx,
  tournamentId: string,
  shape: GroupShape,
  justResolvedRound: number,
): Promise<CreatedFixture[]> {
  const localRound = justResolvedRound - G_ROUND_OFFSET;
  if (localRound < 1 || localRound >= groupRoundCount(shape.groupSize)) return []; // not a group round, or the group stage is over

  const roundMatches = await tx.tournamentMatch.findMany({ where: { tournamentId, round: justResolvedRound } });
  if (roundMatches.length === 0 || roundMatches.some((m) => m.status !== "done")) return [];

  const nextRound = justResolvedRound + 1;
  const existingNext = await tx.tournamentMatch.count({ where: { tournamentId, round: nextRound } });
  if (existingNext > 0) return [];

  const entries = await tx.tournamentEntry.findMany({
    where: { tournamentId },
    select: { id: true, groupIndex: true },
    orderBy: { seed: "asc" },
  });
  const localSeats = localSeatMap(
    entries.filter((e) => e.groupIndex != null).map((e) => ({ id: e.id, groupIndex: e.groupIndex! })),
  );

  const created: CreatedFixture[] = [];
  try {
    for (const f of groupStageSchedule(shape.groupSize, shape.groupCount)) {
      if (f.round !== nextRound) continue;
      const row = await tx.tournamentMatch.create({
        data: {
          tournamentId,
          bracket: "G",
          round: f.round,
          slot: f.slot,
          redEntryId: localSeats.get(`${f.groupIndex}:${f.seedA}`)!,
          blueEntryId: localSeats.get(`${f.groupIndex}:${f.seedB}`)!,
          status: "ready",
        },
      });
      created.push({ id: row.id, tournamentId, redEntryId: row.redEntryId, blueEntryId: row.blueEntryId });
    }
  } catch (e) {
    if (isP2002(e)) return []; // lost the race — the other transaction created this round
    throw e;
  }
  return created;
}

/**
 * The qualification cut, and the seeding of the playoff bracket.
 *
 * Runs once every group fixture is done. The "do any playoff matches exist?"
 * check makes it idempotent against a DUPLICATE bracket; it does nothing about a
 * LOST one, exactly as documented on maybeGenerateNextSwissRound.
 * recoverGroupDoubleElim is what makes a lost transition self-healing.
 */
export async function maybeStartPlayoffs(
  tx: Tx,
  tournamentId: string,
  shape: GroupShape,
): Promise<Array<{ entryId: string; groupPlacement: number; bracket: "upper" | "lower" | "out" }>> {
  const groupMatches = await tx.tournamentMatch.findMany({ where: { tournamentId, bracket: "G" } });
  if (groupMatches.length !== shape.groupMatches) return []; // not every round generated yet
  if (groupMatches.some((m) => m.status !== "done")) return [];

  const already = await tx.tournamentMatch.count({ where: { tournamentId, bracket: { in: ["W", "L", "GF"] } } });
  if (already > 0) return [];

  const entries = await tx.tournamentEntry.findMany({
    where: { tournamentId },
    select: { id: true, seed: true, groupIndex: true },
  });

  // Standings are computed PER GROUP. A round robin only ever happened within a
  // group, so head-to-head is always defined for a two-way tie there — precisely
  // the case computeRoundRobinStandings was written for.
  const qualifiers: GroupQualifier[] = [];
  // Collected as we go and sent AFTER the transaction commits — a notification
  // must never be able to roll back a bracket.
  const cutOutcomes: Array<{ entryId: string; groupPlacement: number; bracket: "upper" | "lower" | "out" }> = [];

  for (let g = 0; g < shape.groupCount; g++) {
    const members = entries.filter((e) => e.groupIndex === g);
    const memberIds = new Set(members.map((m) => m.id));
    const fixtures = groupMatches.filter((m) => m.redEntryId != null && memberIds.has(m.redEntryId));

    const standings = computeRoundRobinStandings(
      members.map((m) => ({ id: m.id, seed: m.seed })),
      fixtures.map((m) => ({
        redEntryId: m.redEntryId!,
        blueEntryId: m.blueEntryId!,
        winnerEntryId: m.winnerEntryId,
        status: m.status,
      })),
    );

    for (const s of standings) {
      await tx.tournamentEntry.update({ where: { id: s.entryId }, data: { groupPlacement: s.placement } });
      if (s.placement <= shape.qualifiersPerGroup) {
        qualifiers.push({ entryId: s.entryId, groupIndex: g, groupPlacement: s.placement });
        cutOutcomes.push({
          entryId: s.entryId,
          groupPlacement: s.placement,
          bracket: s.placement <= shape.qualifiersPerGroup / 2 ? "upper" : "lower",
        });
      } else {
        cutOutcomes.push({ entryId: s.entryId, groupPlacement: s.placement, bracket: "out" });
        // Cut. Marked eliminated at the cut rather than at Complete so a player's
        // own view stops showing them as still alive for the whole playoff.
        await tx.tournamentEntry.update({ where: { id: s.entryId }, data: { eliminated: true } });
      }
    }
  }

  const B = shape.survivors;
  const rounds = Math.log2(B);
  const { upper, lower } = seedPlayoffFromGroups(qualifiers, shape);

  // ── W bracket: round 2 seeded from the upper qualifiers, 3..k empty. ──
  // Round 1 is deliberately absent — the group stage was that round.
  for (const m of upper) {
    await tx.tournamentMatch.create({
      data: {
        tournamentId,
        bracket: "W",
        round: 2,
        slot: m.slot,
        redEntryId: m.redEntryId,
        blueEntryId: m.blueEntryId,
        status: "ready",
      },
    });
  }
  for (let r = 3; r <= rounds; r++) {
    const count = B / Math.pow(2, r);
    for (let s = 0; s < count; s++) {
      await tx.tournamentMatch.create({ data: { tournamentId, bracket: "W", round: r, slot: s, status: "pending" } });
    }
  }

  // ── L bracket: round 1 seeded from the lower qualifiers, the rest empty. ──
  const lowerBySlot = new Map(lower.map((m) => [m.slot, m]));
  for (const lr of losersBracketStructure(B)) {
    for (let s = 0; s < lr.matches; s++) {
      const seat = lr.localRound === 1 ? lowerBySlot.get(s) : undefined;
      await tx.tournamentMatch.create({
        data: {
          tournamentId,
          bracket: "L",
          round: L_ROUND_OFFSET + lr.localRound,
          slot: s,
          redEntryId: seat?.redEntryId ?? null,
          blueEntryId: seat?.blueEntryId ?? null,
          // "ready", not "pending" — see this module's header. Nothing else
          // would ever promote a pre-seeded round.
          status: seat ? "ready" : "pending",
        },
      });
    }
  }

  await tx.tournamentMatch.create({ data: { tournamentId, bracket: "GF", round: GF_ROUND, slot: 0, status: "pending" } });

  return cutOutcomes;
}

/**
 * Lazy recovery for a cup stranded by a concurrent-report race — the analogue of
 * recoverMissingSwissRounds, needed for the same READ COMMITTED reason: two
 * reports settling a round's last two fixtures in different transactions can
 * each see the other as still unfinished, so both skip generation and the cup
 * stops with no player action able to restart it.
 *
 * Called from completeTournament AND from the ready-check sweeper. The sweeper
 * matters more here than it did for Swiss: Complete is only reachable once the
 * PLAYOFFS are over, so a cup stranded at the group→playoff transition could
 * never reach a recovery that ran only from Complete — the group stage would be
 * finished, no bracket would exist, and entry-fee gold would sit there with no
 * route to a payout. Runs in fresh transactions so its reads see every prior
 * report fully committed.
 *
 * Idempotent and cheap when nothing is stranded: each step is a no-op if the
 * next round already exists or the current one genuinely is not finished.
 */
export async function recoverGroupDoubleElim(db: Db, tournamentId: string, shape: GroupShape) {
  const totalRounds = groupRoundCount(shape.groupSize);

  // Bounded by the round count so a malformed state can never loop unboundedly.
  for (let i = 0; i < totalRounds; i++) {
    const maxGroupRound = await db.tournamentMatch.findFirst({
      where: { tournamentId, bracket: "G" },
      orderBy: { round: "desc" },
      select: { round: true },
    });
    if (!maxGroupRound) return; // nothing seeded yet
    if (maxGroupRound.round - G_ROUND_OFFSET >= totalRounds) break; // all rounds exist — try the transition

    const before = await db.tournamentMatch.count({ where: { tournamentId, round: maxGroupRound.round + 1 } });
    if (before === 0) {
      const made = await db.$transaction((tx) => maybeAdvanceGroupStage(tx, tournamentId, shape, maxGroupRound.round));
      await notifyFixtureReady(made);
      const after = await db.tournamentMatch.count({ where: { tournamentId, round: maxGroupRound.round + 1 } });
      if (after === 0) return; // that round genuinely isn't finished — real NOT_FINISHED
    }
  }

  const cut = await db.$transaction((tx) => maybeStartPlayoffs(tx, tournamentId, shape));
  await notifyGroupCut(tournamentId, cut);
}

/**
 * Final placements: the playoff field takes 1..S from the ordinary double-elim
 * placement logic, and the players cut in the group stage rank below all of them.
 *
 * Group-stage eliminations are ordered by group placement, then seed —
 * deliberately NOT by group index, which is an arbitrary artefact of the draw and
 * must never decide a player's final standing or prize. Everyone cut at the same
 * group position therefore TIES, which is the honest answer: nothing on the pitch
 * separated them. Ties use standard competition ranking (17, 17, then 19), the
 * same convention computeDoubleElimPlacements already uses for the playoff field.
 */
export async function computeGroupDoubleElimPlacements(tx: Tx, tournamentId: string): Promise<PlacementRow[]> {
  const playoff = await tx.tournamentMatch.findMany({
    where: { tournamentId, bracket: { in: ["W", "L", "GF"] } },
    select: {
      bracket: true,
      round: true,
      slot: true,
      redEntryId: true,
      blueEntryId: true,
      winnerEntryId: true,
      status: true,
    },
  });
  const out: PlacementRow[] = computeDoubleElimPlacements(playoff as DoubleElimMatchLike[]);

  const placed = out.map((p) => p.entryId);
  const survivors = out.length;
  const cut = await tx.tournamentEntry.findMany({
    where: { tournamentId, ...(placed.length > 0 ? { id: { notIn: placed } } : {}) },
    select: { id: true, seed: true, groupPlacement: true },
  });

  const ordered = [...cut].sort(
    (a, b) => (a.groupPlacement ?? Number.MAX_SAFE_INTEGER) - (b.groupPlacement ?? Number.MAX_SAFE_INTEGER) || (a.seed ?? Number.MAX_SAFE_INTEGER) - (b.seed ?? Number.MAX_SAFE_INTEGER),
  );

  let rank = survivors;
  let seen = 0;
  let lastGroupPlacement: number | null = null;
  for (const e of ordered) {
    seen += 1;
    if (e.groupPlacement !== lastGroupPlacement) {
      rank = survivors + seen;
      lastGroupPlacement = e.groupPlacement;
    }
    out.push({ entryId: e.id, placement: rank });
  }
  return out;
}
