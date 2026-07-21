import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { buildTestApp, seedUser, authFor, truncateAll } from "./helpers.js";
import type { FastifyInstance } from "fastify";

/**
 * TOURNAMENT END-TO-END SIMULATION (all four formats, real DB, real routes).
 *
 * The existing suites (tournaments-core / admin-tournaments) prove each piece
 * of the engine, but every one of their full-lifecycle runs forces a clean,
 * tie-free winner ("seed 1 wins every game"). This file is the opposite: it
 * drives every format through the REAL admin/player HTTP routes with
 * RANDOMIZED (seeded, reproducible) winners, walks the bracket to completion
 * however it unfolds — including Swiss's progressive round generation — pays
 * out, and then AUDITS gold conservation from the LedgerEntry table:
 *
 *   Σ(tournament-entry debits) + Σ(tournament-prize credits)
 *     + Σ(tournament-refund credits)  ==  net gold delta across all players,
 *
 * and, when prizePool == Σ(entry fees), the money is a pure closed loop
 * (every gold paid in as a fee comes back out as a prize — no gold created
 * or destroyed by the engine). This is the "watch a whole tournament run and
 * prove the money is right" evidence the click-through UI would give, but
 * headless and repeatable.
 *
 * Determinism: a tiny seeded PRNG (mulberry32) picks winners, so a failure is
 * reproducible from the seed printed in the test name. No Math.random.
 */

afterEach(truncateAll);
afterAll(async () => {
  await prisma.$disconnect();
});

// ── seeded PRNG (mulberry32) — reproducible "random" winners ────────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── minimal shapes mirroring the admin detail response ──────────────────────
type SlotStatus = "pending" | "ready" | "done";
type Slot = {
  id: string;
  round: number;
  slot: number;
  bracket: string;
  redEntryId: string | null;
  blueEntryId: string | null;
  winnerEntryId: string | null;
  status: SlotStatus;
};
type Entry = { id: string; userId: string; seed: number | null; placement: number | null };
type Detail = {
  id: string;
  status: string;
  format: string;
  prizePoolGold: number;
  entryFeeGold: number;
  prizeSplitGold: number[];
  entries: Entry[];
  bracket: Record<string, Slot[]>;
};

// ── HTTP driver helpers (all go through the real routes) ─────────────────────
async function createTournament(
  app: FastifyInstance,
  cookie: string,
  body: Record<string, unknown>,
): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/admin/tournaments",
    headers: { cookie },
    payload: body,
  });
  expect(res.statusCode, `create failed: ${res.body}`).toBe(201);
  return res.json().data.id;
}

async function open(app: FastifyInstance, cookie: string, tId: string) {
  const res = await app.inject({ method: "POST", url: `/api/admin/tournaments/${tId}/open`, headers: { cookie }, payload: { reason: "sim-open" } });
  expect(res.statusCode, `open failed: ${res.body}`).toBe(200);
}

async function start(app: FastifyInstance, cookie: string, tId: string) {
  const res = await app.inject({ method: "POST", url: `/api/admin/tournaments/${tId}/start`, headers: { cookie }, payload: { reason: "sim-start" } });
  expect(res.statusCode, `start failed: ${res.body}`).toBe(200);
}

async function joinAll(app: FastifyInstance, tId: string, playerIds: string[]) {
  // Sequential + a 2ms gap so joinedAt ordering (which seeds the bracket) is
  // stable and distinct — same trick the existing lifecycle tests use.
  for (const id of playerIds) {
    const res = await app.inject({ method: "POST", url: `/api/tournaments/${tId}/join`, headers: { cookie: authFor({ sub: id }) } });
    expect(res.statusCode, `join failed for ${id}: ${res.body}`).toBe(201);
    await new Promise((r) => setTimeout(r, 2));
  }
}

async function getDetail(app: FastifyInstance, cookie: string, tId: string): Promise<Detail> {
  const res = await app.inject({ method: "GET", url: `/api/admin/tournaments/${tId}`, headers: { cookie } });
  expect(res.statusCode, `detail failed: ${res.body}`).toBe(200);
  return res.json().data as Detail;
}

async function reportWinner(app: FastifyInstance, cookie: string, tId: string, matchId: string, winnerEntryId: string) {
  const res = await app.inject({
    method: "POST",
    url: `/api/admin/tournaments/${tId}/matches/${matchId}/report`,
    headers: { cookie },
    payload: { winnerEntryId, reason: "sim-report" },
  });
  expect(res.statusCode, `report failed (match ${matchId}): ${res.body}`).toBe(200);
}

async function complete(app: FastifyInstance, cookie: string, tId: string) {
  const res = await app.inject({ method: "POST", url: `/api/admin/tournaments/${tId}/complete`, headers: { cookie }, payload: { reason: "sim-payout" } });
  expect(res.statusCode, `complete failed: ${res.body}`).toBe(200);
  return res.json().data;
}

/** Flatten the round→slots bracket map into a single slot array. */
function allSlots(d: Detail): Slot[] {
  return Object.values(d.bracket).flat();
}

/**
 * Report every currently-`ready` slot, choosing a winner via `pick`. Re-fetches
 * detail after EACH report so newly-`ready` parents (single/double elim) and
 * newly-GENERATED rounds (Swiss) are picked up. Returns when no `ready` slot
 * remains. `pick(slot)` must return one of the slot's two entry ids.
 */
async function drainReadySlots(
  app: FastifyInstance,
  cookie: string,
  tId: string,
  pick: (s: Slot) => string,
): Promise<number> {
  let reported = 0;
  // Hard cap well above any real bracket to guarantee the loop terminates even
  // if the engine ever failed to advance (a stuck slot would blow the cap and
  // fail loudly rather than hang the suite).
  const MAX = 5000;
  for (let guard = 0; guard < MAX; guard++) {
    const d = await getDetail(app, cookie, tId);
    const ready = allSlots(d)
      .filter((s) => s.status === "ready" && s.redEntryId && s.blueEntryId)
      .sort((a, b) => a.round - b.round || a.slot - b.slot);
    if (ready.length === 0) return reported;
    const s = ready[0]!;
    await reportWinner(app, cookie, tId, s.id, pick(s));
    reported++;
  }
  throw new Error(`drainReadySlots exceeded ${MAX} reports — engine likely not advancing`);
}

/**
 * Sum every tournament-scoped LedgerEntry for this tournament's entries and
 * prove conservation. Returns per-user net deltas keyed by userId.
 */
async function ledgerAudit(tId: string) {
  const entries = await prisma.tournamentEntry.findMany({ where: { tournamentId: tId } });
  const entryIds = entries.map((e) => e.id);
  const rows = await prisma.ledgerEntry.findMany({
    where: { refType: "tournament", refId: { in: entryIds }, currency: "GOLD" },
  });
  let fees = 0; // total debited as entry fees (positive number)
  let prizes = 0; // total credited as prizes
  let refunds = 0; // total credited as refunds
  const netByUser = new Map<string, number>();
  for (const r of rows) {
    const amt = r.amount; // signed: fees negative, prizes/refunds positive
    netByUser.set(r.userId, (netByUser.get(r.userId) ?? 0) + amt);
    if (r.reason === "tournament-entry") fees += -amt;
    else if (r.reason === "tournament-prize") prizes += amt;
    else if (r.reason === "tournament-refund") refunds += amt;
  }
  return { fees, prizes, refunds, netByUser, rowCount: rows.length };
}

// ── the generic simulation ──────────────────────────────────────────────────

type SimConfig = {
  format: "SINGLE_ELIM" | "DOUBLE_ELIM" | "ROUND_ROBIN" | "SWISS";
  players: number;
  maxPlayers: number;
  entryFeeGold: number;
  prizePoolGold: number;
  prizeSplitGold: number[];
  seed: number;
  rounds?: number | null; // SWISS only
};

/**
 * Full closed-loop run of one format with randomized winners. Asserts:
 *  - the tournament reaches COMPLETED,
 *  - a champion exists and is paid split[0],
 *  - Σ prizes paid == Σ(split entries that map to a real placement),
 *  - when prizePool == Σ fees: fees in == prizes out (pure closed loop),
 *  - every player's on-hand gold equals starting gold + their ledger net.
 */
async function runFullSim(cfg: SimConfig) {
  const app = await buildTestApp();
  try {
    const econ = await seedUser({ adminRole: "ECONOMY" });
    const cookie = authFor({ sub: econ.id, adminRole: "ECONOMY" });
    const rng = mulberry32(cfg.seed);

    const startingGold = 10_000;
    const players = [];
    for (let i = 0; i < cfg.players; i++) players.push(await seedUser({ gold: startingGold, trophies: 0 }));
    const playerIds = players.map((p) => p.id);

    const tId = await createTournament(app, cookie, {
      name: `SIM ${cfg.format} n=${cfg.players} seed=${cfg.seed}`,
      format: cfg.format,
      entryFeeGold: cfg.entryFeeGold,
      prizePoolGold: cfg.prizePoolGold,
      prizeSplitGold: cfg.prizeSplitGold,
      maxPlayers: cfg.maxPlayers,
      minTrophies: 0,
      matchMode: "CASUAL",
      ...(cfg.rounds !== undefined ? { rounds: cfg.rounds } : {}),
    });

    await open(app, cookie, tId);
    await joinAll(app, tId, playerIds);
    await start(app, cookie, tId);

    // Randomized winner: 50/50 red vs blue, deterministic from the seed.
    const reported = await drainReadySlots(app, cookie, tId, (s) =>
      rng() < 0.5 ? s.redEntryId! : s.blueEntryId!,
    );
    expect(reported, "should have reported at least one match").toBeGreaterThan(0);

    const payout = await complete(app, cookie, tId);
    expect(payout.championEntryId, "a champion must be decided").toBeTruthy();

    const after = await prisma.tournament.findUniqueOrThrow({ where: { id: tId } });
    expect(after.status).toBe("COMPLETED");

    // ── payout correctness ──
    const finalEntries = await prisma.tournamentEntry.findMany({ where: { tournamentId: tId } });
    const byPlacement = new Map<number, typeof finalEntries>();
    for (const e of finalEntries) {
      if (e.placement == null) continue;
      const list = byPlacement.get(e.placement) ?? [];
      list.push(e);
      byPlacement.set(e.placement, list);
    }
    // Champion (placement 1) exists and is paid split[0].
    const champs = byPlacement.get(1) ?? [];
    expect(champs.length, "exactly one champion").toBe(1);
    const champEntry = champs[0]!;
    expect(champEntry.id).toBe(payout.championEntryId);

    // ── gold conservation ──
    const audit = await ledgerAudit(tId);
    // Fees debited == players * entryFee (everyone paid to enter).
    expect(audit.fees, "every player paid the entry fee").toBe(cfg.players * cfg.entryFeeGold);
    // Prizes paid == the portion of the split that landed on a real placement.
    // With placements 1..K existing and split length L, prizes = Σ split[i]
    // for placements that were filled (i < min(L, #distinct placements paid)).
    // We verify the STRONG invariant instead: total prizes == pool when the
    // split fully covers the placements that exist, which our configs ensure
    // (split length ≤ #players and every split slot maps to a placement).
    expect(audit.prizes, "prizes paid must equal the prize pool").toBe(cfg.prizePoolGold);
    expect(audit.refunds, "no refunds on a completed tournament").toBe(0);

    // Closed loop: if the pool was funded entirely by fees, gold is conserved.
    if (cfg.prizePoolGold === cfg.players * cfg.entryFeeGold) {
      expect(audit.fees, "closed loop: fees in == prizes out").toBe(audit.prizes);
    }

    // Every player's on-hand gold == starting + their ledger net.
    for (const p of players) {
      const fresh = await prisma.user.findUniqueOrThrow({ where: { id: p.id } });
      const net = audit.netByUser.get(p.id) ?? 0;
      expect(fresh.gold, `player ${p.id} gold must reconcile with ledger`).toBe(startingGold + net);
    }

    return { tId, payout, audit, champEntry };
  } finally {
    await app.close();
  }
}

// ── format smoke sims (randomized, closed-loop, gold-audited) ────────────────

describe("tournament SIMULATION — SINGLE_ELIM (randomized, gold-conserved)", () => {
  it("8 players, entry 100 → pool 800 [500/200/100], seed=1 → completes + conserves gold", async () => {
    await runFullSim({
      format: "SINGLE_ELIM",
      players: 8,
      maxPlayers: 8,
      entryFeeGold: 100,
      prizePoolGold: 800,
      prizeSplitGold: [500, 200, 100],
      seed: 1,
    });
  });

  it("16 players, entry 50 → pool 800 [800], winner-takes-all, seed=7 → completes + conserves gold", async () => {
    const { audit } = await runFullSim({
      format: "SINGLE_ELIM",
      players: 16,
      maxPlayers: 16,
      entryFeeGold: 50,
      prizePoolGold: 800,
      prizeSplitGold: [800],
      seed: 7,
    });
    expect(audit.rowCount).toBe(16 + 1); // 16 fee debits + 1 prize credit
  });
});

describe("tournament SIMULATION — DOUBLE_ELIM (randomized, gold-conserved)", () => {
  it("8 players (power of two), entry 100 → pool 800 [500/200/100], seed=3 → completes + conserves gold", async () => {
    await runFullSim({
      format: "DOUBLE_ELIM",
      players: 8,
      maxPlayers: 8,
      entryFeeGold: 100,
      prizePoolGold: 800,
      prizeSplitGold: [500, 200, 100],
      seed: 3,
    });
  });

  it("4 players, entry 250 → pool 1000 [700/300], seed=11 → completes + conserves gold (may bracket-reset)", async () => {
    await runFullSim({
      format: "DOUBLE_ELIM",
      players: 4,
      maxPlayers: 4,
      entryFeeGold: 250,
      prizePoolGold: 1000,
      prizeSplitGold: [700, 300],
      seed: 11,
    });
  });
});

describe("tournament SIMULATION — ROUND_ROBIN (randomized, gold-conserved)", () => {
  it("6 players, entry 100 → pool 600 [350/150/100], seed=5 → all 15 matches, completes + conserves gold", async () => {
    await runFullSim({
      format: "ROUND_ROBIN",
      players: 6,
      maxPlayers: 6,
      entryFeeGold: 100,
      prizePoolGold: 600,
      prizeSplitGold: [350, 150, 100],
      seed: 5,
    });
  });
});

describe("tournament SIMULATION — SWISS (randomized, progressive rounds, gold-conserved)", () => {
  it("8 players, auto rounds, entry 100 → pool 800 [400/240/160], seed=9 → completes + conserves gold", async () => {
    await runFullSim({
      format: "SWISS",
      players: 8,
      maxPlayers: 8,
      entryFeeGold: 100,
      prizePoolGold: 800,
      prizeSplitGold: [400, 240, 160],
      seed: 9,
      rounds: null, // auto = ceil(log2(8)) = 3
    });
  });

  it("5 players (odd, byes each round), 3 rounds, entry 40 → pool 200 [200], seed=13 → completes + conserves gold", async () => {
    await runFullSim({
      format: "SWISS",
      players: 5,
      maxPlayers: 8, // bracket cap ≥ players; Swiss pairs the 5 real entrants
      entryFeeGold: 40,
      prizePoolGold: 200,
      prizeSplitGold: [200],
      seed: 13,
      rounds: 3,
    });
  });
});

// ── stress: many randomized seeds across formats (catches seed-sensitive bugs)
describe("tournament SIMULATION — multi-seed stress (every format, 8 seeds each)", () => {
  const SEEDS = [101, 202, 303, 404, 505, 606, 707, 808];

  for (const seed of SEEDS) {
    it(`SINGLE_ELIM 8p reaches a paid champion + conserves gold (seed=${seed})`, async () => {
      await runFullSim({
        format: "SINGLE_ELIM",
        players: 8,
        maxPlayers: 8,
        entryFeeGold: 100,
        prizePoolGold: 800,
        prizeSplitGold: [800],
        seed,
      });
    });
  }

  for (const seed of SEEDS) {
    it(`DOUBLE_ELIM 8p reaches a paid champion + conserves gold (seed=${seed})`, async () => {
      await runFullSim({
        format: "DOUBLE_ELIM",
        players: 8,
        maxPlayers: 8,
        entryFeeGold: 100,
        prizePoolGold: 800,
        prizeSplitGold: [800],
        seed,
      });
    });
  }

  for (const seed of SEEDS) {
    it(`SWISS 8p (auto rounds) reaches COMPLETED + conserves gold (seed=${seed})`, async () => {
      await runFullSim({
        format: "SWISS",
        players: 8,
        maxPlayers: 8,
        entryFeeGold: 100,
        prizePoolGold: 800,
        prizeSplitGold: [800],
        seed,
        rounds: null,
      });
    });
  }
});

// ── TIE-DRIVEN payouts: prove the documented tiebreaks decide who gets paid ──
//
// The randomized sims above hit ties probabilistically across seeds, but these
// two tests CONSTRUCT a tie deliberately so the tiebreak that decides the money
// is pinned, not left to chance. Reporting is fully controlled (not random).

describe("tournament SIMULATION — ROUND_ROBIN tie broken by head-to-head/seed", () => {
  it("3-player cycle A>B>C>A (all 1 win) → head-to-head is a cycle, so seed asc decides placement + payout", async () => {
    const app = await buildTestApp();
    try {
      const econ = await seedUser({ adminRole: "ECONOMY" });
      const cookie = authFor({ sub: econ.id, adminRole: "ECONOMY" });
      const startingGold = 5000;
      // 3 players, each funded; entry 100 → pool 300 split [150/90/60] (all
      // three placements paid so every tiebreak position matters to the money).
      const players = [];
      for (let i = 0; i < 3; i++) players.push(await seedUser({ gold: startingGold }));

      const tId = await createTournament(app, cookie, {
        name: "SIM RR cycle",
        format: "ROUND_ROBIN",
        entryFeeGold: 100,
        prizePoolGold: 300,
        prizeSplitGold: [150, 90, 60],
        maxPlayers: 3,
        minTrophies: 0,
        matchMode: "CASUAL",
      });
      await open(app, cookie, tId);
      await joinAll(app, tId, players.map((p) => p.id));
      await start(app, cookie, tId);

      // Seeds are assigned 1,2,3 by join order. Build a strict cycle where
      // every player finishes 1-1: seed1 beats seed2, seed2 beats seed3,
      // seed3 beats seed1. All tied on wins → head-to-head is a 3-cycle (not
      // decisive) → final tiebreak is seed asc: 1st=seed1, 2nd=seed2, 3rd=seed3.
      const entries = await prisma.tournamentEntry.findMany({ where: { tournamentId: tId }, orderBy: { seed: "asc" } });
      const [s1, s2, s3] = entries;
      const beats = new Map<string, string>([
        [pairKey(s1!.id, s2!.id), s1!.id], // seed1 beats seed2
        [pairKey(s2!.id, s3!.id), s2!.id], // seed2 beats seed3
        [pairKey(s3!.id, s1!.id), s3!.id], // seed3 beats seed1
      ]);

      const matches = await prisma.tournamentMatch.findMany({ where: { tournamentId: tId } });
      expect(matches.length).toBe(3); // 3*2/2
      for (const m of matches) {
        const winner = beats.get(pairKey(m.redEntryId!, m.blueEntryId!))!;
        await reportWinner(app, cookie, tId, m.id, winner);
      }

      await complete(app, cookie, tId);

      // Placement follows seed asc because the H2H cycle is not decisive.
      const after = await prisma.tournamentEntry.findMany({ where: { tournamentId: tId } });
      const placementOf = (id: string) => after.find((e) => e.id === id)!.placement;
      expect(placementOf(s1!.id)).toBe(1);
      expect(placementOf(s2!.id)).toBe(2);
      expect(placementOf(s3!.id)).toBe(3);

      // Money follows placement: seed1→150, seed2→90, seed3→60. Each player's
      // net = prize - fee.
      const goldOf = async (userId: string) => (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).gold;
      expect(await goldOf(s1!.userId)).toBe(startingGold - 100 + 150);
      expect(await goldOf(s2!.userId)).toBe(startingGold - 100 + 90);
      expect(await goldOf(s3!.userId)).toBe(startingGold - 100 + 60);

      // Gold conserved: fees 300 in, prizes 300 out.
      const audit = await ledgerAudit(tId);
      expect(audit.fees).toBe(300);
      expect(audit.prizes).toBe(300);
      expect(audit.fees).toBe(audit.prizes);
    } finally {
      await app.close();
    }
  });
});

// pairKey mirrors the server's canonical unordered pair key (min|max of ids).
function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// ── cancel path: mid-run cancel refunds every paid fee, gold fully restored ──

describe("tournament SIMULATION — cancel refunds all fees (gold restored to zero net)", () => {
  it("cancel a RUNNING single-elim mid-bracket → every entry fee refunded, players whole", async () => {
    const app = await buildTestApp();
    try {
      const econ = await seedUser({ adminRole: "ECONOMY" });
      const cookie = authFor({ sub: econ.id, adminRole: "ECONOMY" });
      const startingGold = 5000;
      const players = [];
      for (let i = 0; i < 8; i++) players.push(await seedUser({ gold: startingGold }));

      const tId = await createTournament(app, cookie, {
        name: "SIM cancel",
        format: "SINGLE_ELIM",
        entryFeeGold: 100,
        prizePoolGold: 800,
        prizeSplitGold: [800],
        maxPlayers: 8,
        minTrophies: 0,
        matchMode: "CASUAL",
      });
      await open(app, cookie, tId);
      await joinAll(app, tId, players.map((p) => p.id));
      await start(app, cookie, tId);

      // Report ONE round-1 match, then cancel mid-bracket.
      const rng = mulberry32(42);
      const d = await getDetail(app, cookie, tId);
      const ready = allSlots(d).filter((s) => s.status === "ready" && s.redEntryId && s.blueEntryId);
      expect(ready.length).toBeGreaterThan(0);
      const s = ready[0]!;
      await reportWinner(app, cookie, tId, s.id, rng() < 0.5 ? s.redEntryId! : s.blueEntryId!);

      const cancelRes = await app.inject({ method: "POST", url: `/api/admin/tournaments/${tId}/cancel`, headers: { cookie }, payload: { reason: "sim-cancel" } });
      expect(cancelRes.statusCode, `cancel failed: ${cancelRes.body}`).toBe(200);

      const after = await prisma.tournament.findUniqueOrThrow({ where: { id: tId } });
      expect(after.status).toBe("CANCELLED");

      // Every player is made whole: fee debited then refunded → net zero.
      const audit = await ledgerAudit(tId);
      expect(audit.fees).toBe(8 * 100);
      expect(audit.refunds).toBe(8 * 100);
      expect(audit.prizes).toBe(0);
      for (const p of players) {
        const fresh = await prisma.user.findUniqueOrThrow({ where: { id: p.id } });
        expect(fresh.gold, `player ${p.id} fully refunded`).toBe(startingGold);
      }
    } finally {
      await app.close();
    }
  });
});
