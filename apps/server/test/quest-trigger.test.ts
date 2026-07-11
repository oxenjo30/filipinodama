import { describe, it, expect } from "vitest";
import { questAdvanceFor, questTriggerSchema, type MatchQuestContext } from "../src/lib/quest-trigger.js";

/**
 * Pure unit tests for questAdvanceFor — no DB, no server. Every event is
 * tested applicable + not-applicable, plus the null/invalid-trigger and
 * captures=0 edge cases the engine relies on to never crash a settlement.
 */

const baseCtx: MatchQuestContext = { won: false, drew: false, captures: 0, isRanked: false, streak: 0 };

describe("questTriggerSchema", () => {
  it("accepts each of the 6 known events", () => {
    for (const event of ["match_played", "match_won", "ranked_played", "ranked_won", "captures", "win_streak"]) {
      expect(questTriggerSchema.safeParse({ event }).success).toBe(true);
    }
  });

  it("rejects an unknown event", () => {
    expect(questTriggerSchema.safeParse({ event: "bogus" }).success).toBe(false);
  });
});

describe("questAdvanceFor — invalid/null trigger never throws", () => {
  it("null trigger → null", () => {
    expect(questAdvanceFor(null, baseCtx)).toBeNull();
  });

  it("undefined trigger → null", () => {
    expect(questAdvanceFor(undefined, baseCtx)).toBeNull();
  });

  it("malformed trigger (missing event) → null", () => {
    expect(questAdvanceFor({}, baseCtx)).toBeNull();
  });

  it("trigger with unknown event → null", () => {
    expect(questAdvanceFor({ event: "not-a-real-event" }, baseCtx)).toBeNull();
  });

  it("non-object trigger (string) → null", () => {
    expect(questAdvanceFor("match_played", baseCtx)).toBeNull();
  });
});

describe("questAdvanceFor — match_played", () => {
  const trigger = { event: "match_played" };

  it("any settled match advances by 1, not a peak", () => {
    expect(questAdvanceFor(trigger, baseCtx)).toEqual({ by: 1, setTo: false });
  });

  it("a loss still advances (any match played)", () => {
    expect(questAdvanceFor(trigger, { ...baseCtx, won: false, drew: false })).toEqual({ by: 1, setTo: false });
  });

  it("a draw only matches match_played (does not match match_won)", () => {
    const drawCtx: MatchQuestContext = { ...baseCtx, drew: true };
    expect(questAdvanceFor(trigger, drawCtx)).toEqual({ by: 1, setTo: false });
    expect(questAdvanceFor({ event: "match_won" }, drawCtx)).toBeNull();
  });
});

describe("questAdvanceFor — match_won", () => {
  const trigger = { event: "match_won" };

  it("a win advances by 1", () => {
    expect(questAdvanceFor(trigger, { ...baseCtx, won: true })).toEqual({ by: 1, setTo: false });
  });

  it("a loss does not advance", () => {
    expect(questAdvanceFor(trigger, { ...baseCtx, won: false })).toBeNull();
  });
});

describe("questAdvanceFor — ranked_played", () => {
  const trigger = { event: "ranked_played" };

  it("a ranked match advances by 1 regardless of outcome", () => {
    expect(questAdvanceFor(trigger, { ...baseCtx, isRanked: true, won: false })).toEqual({ by: 1, setTo: false });
  });

  it("a casual (non-ranked) match does not advance", () => {
    expect(questAdvanceFor(trigger, { ...baseCtx, isRanked: false })).toBeNull();
  });
});

describe("questAdvanceFor — ranked_won", () => {
  const trigger = { event: "ranked_won" };

  it("a ranked win advances by 1", () => {
    expect(questAdvanceFor(trigger, { ...baseCtx, won: true, isRanked: true })).toEqual({ by: 1, setTo: false });
  });

  it("a ranked loss does not advance", () => {
    expect(questAdvanceFor(trigger, { ...baseCtx, won: false, isRanked: true })).toBeNull();
  });

  it("a casual win does not advance (must be ranked AND won)", () => {
    expect(questAdvanceFor(trigger, { ...baseCtx, won: true, isRanked: false })).toBeNull();
  });
});

describe("questAdvanceFor — captures", () => {
  const trigger = { event: "captures" };

  it("captures > 0 advances by the real capture count", () => {
    expect(questAdvanceFor(trigger, { ...baseCtx, captures: 7 })).toEqual({ by: 7, setTo: false });
  });

  it("captures === 0 does not advance", () => {
    expect(questAdvanceFor(trigger, { ...baseCtx, captures: 0 })).toBeNull();
  });

  it("advances even on a loss, as long as captures > 0", () => {
    expect(questAdvanceFor(trigger, { ...baseCtx, won: false, captures: 3 })).toEqual({ by: 3, setTo: false });
  });
});

describe("questAdvanceFor — win_streak", () => {
  const trigger = { event: "win_streak" };

  it("a win with a positive streak sets the peak (setTo:true)", () => {
    expect(questAdvanceFor(trigger, { ...baseCtx, won: true, streak: 5 })).toEqual({ by: 5, setTo: true });
  });

  it("a win with streak 0 does not advance", () => {
    expect(questAdvanceFor(trigger, { ...baseCtx, won: true, streak: 0 })).toBeNull();
  });

  it("a non-win does not advance even if streak is stale-positive", () => {
    expect(questAdvanceFor(trigger, { ...baseCtx, won: false, streak: 5 })).toBeNull();
  });
});
