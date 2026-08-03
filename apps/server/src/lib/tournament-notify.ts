/**
 * Tournament notifications.
 *
 * Tournaments were the one major feature that never told a player anything.
 * Friends, guilds, tickets, reports and lessons all write Notification rows;
 * tournaments wrote none — so a player's forfeit clock could start, run out and
 * eliminate them with no signal of any kind. That is survivable in a 15-match
 * knockout you sit and watch; it is not in a 40-match group stage played over
 * hours, where a player is not expected to be staring at the bracket.
 *
 * Everything here goes through `notifyUser`, which persists the row AND pushes
 * the recipient's unread count to their sockets — so an online player's bell
 * lights up immediately, and an offline player finds it waiting. That is the
 * limit of what this layer can do: it CANNOT wake a player who has the app
 * closed. Real push (FCM on Android, Web Push in the browser) is separate
 * infrastructure that needs the owner's Firebase project — see
 * data/push/PushNotifications.kt, which is scaffolded for exactly that.
 *
 * BEST EFFORT, ALWAYS. Every function here swallows its own errors. A
 * notification failing must never roll back a match result, a bracket
 * advancement or a prize payout — the tournament is the source of truth and the
 * bell is a courtesy. That is also why none of these run inside the caller's
 * transaction.
 */
import { prisma } from "../db/client.js";
import { notifyUser } from "./notify.js";

/** Map entry ids to the user ids behind them, skipping anything already gone. */
async function usersOfEntries(entryIds: Array<string | null>): Promise<Map<string, string>> {
  const ids = entryIds.filter((v): v is string => v != null);
  if (ids.length === 0) return new Map();
  const rows = await prisma.tournamentEntry.findMany({ where: { id: { in: ids } }, select: { id: true, userId: true } });
  return new Map(rows.map((r) => [r.id, r.userId]));
}

/** "Weekend Cup" — falls back to a generic noun so a title is never blank. */
async function tournamentName(tournamentId: string): Promise<string> {
  const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { name: true } });
  return t?.name ?? "your tournament";
}

/** Whole minutes remaining, floored at 1 so a deadline never reads "0 minutes". */
function minutesUntil(deadline: Date): number {
  return Math.max(1, Math.round((deadline.getTime() - Date.now()) / 60_000));
}

/**
 * Your opponent has readied and YOUR clock is now running.
 *
 * The single most important notification in this file: this is the only warning
 * a player gets before losing a match they never saw. Sent to the side that has
 * NOT readied.
 */
export async function notifyOpponentReadied(slot: {
  id: string;
  tournamentId: string;
  redEntryId: string | null;
  blueEntryId: string | null;
  redReadyAt: Date | null;
  blueReadyAt: Date | null;
  readyDeadlineAt: Date | null;
}): Promise<void> {
  try {
    if (!slot.readyDeadlineAt) return;
    const waitingEntryId = slot.redReadyAt != null ? slot.blueEntryId : slot.redEntryId;
    if (!waitingEntryId) return;

    const users = await usersOfEntries([waitingEntryId]);
    const userId = users.get(waitingEntryId);
    if (!userId) return;

    const name = await tournamentName(slot.tournamentId);
    const mins = minutesUntil(slot.readyDeadlineAt);
    await notifyUser({
      userId,
      type: "tournament_ready_clock",
      title: "Your opponent is waiting",
      body: `Ready up for your ${name} match within ${mins} minute${mins === 1 ? "" : "s"} or you'll forfeit it.`,
      data: { tournamentId: slot.tournamentId, tmId: slot.id, deadlineAt: slot.readyDeadlineAt.toISOString() },
    });
  } catch {
    // Best effort — never let the bell break a ready-check.
  }
}

/**
 * A fixture is playable and its clock has started on its own (organiser start
 * timer). Both players are told, because neither has acted yet — that is the
 * whole point of the start timer.
 */
export async function notifyFixtureClockStarted(slot: {
  id: string;
  tournamentId: string;
  redEntryId: string | null;
  blueEntryId: string | null;
}, deadline: Date): Promise<void> {
  try {
    const users = await usersOfEntries([slot.redEntryId, slot.blueEntryId]);
    if (users.size === 0) return;
    const name = await tournamentName(slot.tournamentId);
    const mins = minutesUntil(deadline);

    for (const userId of users.values()) {
      await notifyUser({
        userId,
        type: "tournament_match_ready",
        title: "Your match is ready",
        body: `Your ${name} match is waiting. Ready up within ${mins} minute${mins === 1 ? "" : "s"}.`,
        data: { tournamentId: slot.tournamentId, tmId: slot.id, deadlineAt: deadline.toISOString() },
      });
    }
  } catch {
    // Best effort.
  }
}

/** A new fixture has been seeded and is playable now (no clock implied). */
export async function notifyFixtureReady(slots: Array<{ id: string; tournamentId: string; redEntryId: string | null; blueEntryId: string | null }>): Promise<void> {
  try {
    if (slots.length === 0) return;
    const name = await tournamentName(slots[0]!.tournamentId);
    const users = await usersOfEntries(slots.flatMap((s) => [s.redEntryId, s.blueEntryId]));

    for (const slot of slots) {
      for (const entryId of [slot.redEntryId, slot.blueEntryId]) {
        const userId = entryId ? users.get(entryId) : undefined;
        if (!userId) continue;
        await notifyUser({
          userId,
          type: "tournament_match_ready",
          title: "Your next match is ready",
          body: `Your next ${name} match is up. Head to the tournament to ready up.`,
          data: { tournamentId: slot.tournamentId, tmId: slot.id },
        });
      }
    }
  } catch {
    // Best effort.
  }
}

/**
 * A fixture was decided by the no-show clock rather than by playing. Both sides
 * are told, and the loser is told WHY — "you lost a match you never played" is
 * exactly the kind of thing that reads as a bug when it arrives unexplained.
 */
export async function notifyForfeit(
  slot: { id: string; tournamentId: string; redEntryId: string | null; blueEntryId: string | null },
  winnerEntryId: string,
  doubleNoShow: boolean,
): Promise<void> {
  try {
    const loserEntryId = slot.redEntryId === winnerEntryId ? slot.blueEntryId : slot.redEntryId;
    const users = await usersOfEntries([winnerEntryId, loserEntryId]);
    const name = await tournamentName(slot.tournamentId);

    const winnerUserId = users.get(winnerEntryId);
    if (winnerUserId) {
      await notifyUser({
        userId: winnerUserId,
        type: "tournament_forfeit",
        title: doubleNoShow ? "You advanced on seed" : "You won by forfeit",
        body: doubleNoShow
          ? `Neither player readied up in time for your ${name} match, so the better seed advanced.`
          : `Your opponent didn't ready up in time, so your ${name} match went to you.`,
        data: { tournamentId: slot.tournamentId, tmId: slot.id, result: "win", doubleNoShow },
      });
    }

    const loserUserId = loserEntryId ? users.get(loserEntryId) : undefined;
    if (loserUserId) {
      await notifyUser({
        userId: loserUserId,
        type: "tournament_forfeit",
        title: doubleNoShow ? "Your match was decided on seed" : "You forfeited a match",
        body: doubleNoShow
          ? `Neither player readied up in time for your ${name} match, so it went to the better seed.`
          : `You didn't ready up before the deadline, so your ${name} match went to your opponent.`,
        data: { tournamentId: slot.tournamentId, tmId: slot.id, result: "loss", doubleNoShow },
      });
    }
  } catch {
    // Best effort.
  }
}

/**
 * The group stage is over: who is through, on which side of the bracket, and
 * who is out. Sent to everyone, because "am I still in?" is the question the
 * whole group stage exists to answer.
 */
export async function notifyGroupCut(
  tournamentId: string,
  outcomes: Array<{ entryId: string; groupPlacement: number; bracket: "upper" | "lower" | "out" }>,
): Promise<void> {
  try {
    if (outcomes.length === 0) return;
    const users = await usersOfEntries(outcomes.map((o) => o.entryId));
    const name = await tournamentName(tournamentId);

    for (const o of outcomes) {
      const userId = users.get(o.entryId);
      if (!userId) continue;

      const copy =
        o.bracket === "upper"
          ? { title: "You're through to the Upper Bracket", body: `You finished ${ordinal(o.groupPlacement)} in your ${name} group and start in the upper bracket.` }
          : o.bracket === "lower"
            ? { title: "You're through to the Lower Bracket", body: `You finished ${ordinal(o.groupPlacement)} in your ${name} group and start in the lower bracket — one more loss and you're out.` }
            : { title: "Knocked out in the group stage", body: `You finished ${ordinal(o.groupPlacement)} in your ${name} group and didn't make the cut.` };

      await notifyUser({
        userId,
        type: "tournament_group_cut",
        title: copy.title,
        body: copy.body,
        data: { tournamentId, groupPlacement: o.groupPlacement, bracket: o.bracket },
      });
    }
  } catch {
    // Best effort.
  }
}

/**
 * The cup is over. Everyone gets their final placement; anyone who was paid is
 * told what they won, since a gold balance moving with no explanation is
 * indistinguishable from a bug.
 */
export async function notifyFinalPlacements(
  tournamentId: string,
  placements: Array<{ entryId: string; placement: number }>,
  paidOut: Array<{ entryId: string; amount: number }>,
): Promise<void> {
  try {
    if (placements.length === 0) return;
    const users = await usersOfEntries(placements.map((p) => p.entryId));
    const name = await tournamentName(tournamentId);
    const prizeByEntry = new Map<string, number>();
    for (const p of paidOut) prizeByEntry.set(p.entryId, (prizeByEntry.get(p.entryId) ?? 0) + p.amount);

    for (const p of placements) {
      const userId = users.get(p.entryId);
      if (!userId) continue;
      const prize = prizeByEntry.get(p.entryId) ?? 0;

      const title = p.placement === 1 ? `You won ${name}!` : `${name} has finished`;
      const placed = p.placement === 1 ? "You finished 1st" : `You finished ${ordinal(p.placement)}`;
      const body = prize > 0 ? `${placed} and won ${prize.toLocaleString()} gold.` : `${placed}.`;

      await notifyUser({
        userId,
        type: "tournament_result",
        title,
        body,
        data: { tournamentId, placement: p.placement, prizeGold: prize },
      });
    }
  } catch {
    // Best effort.
  }
}

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th", 23 -> "23rd". */
function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
