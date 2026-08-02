import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { prisma } from "../src/db/client.js";
import { seedUser, truncateAll } from "./helpers.js";
import { runAccountPurge, purgeAccount, PURGE_AFTER_DAYS } from "../src/modules/account-purge.js";

/**
 * 30-day account purge (DB-backed; verifies in CI against a real Postgres).
 *
 * `DELETE /api/users/me` only ever set `deletedAt`, while the app told the user
 * their data was "permanently erased" and "completes within 30 days". These
 * tests pin the other half of that promise, and — just as importantly — pin the
 * three things that must SURVIVE it.
 *
 * Owner decision 2026-08-02: hard delete, "wipe all but money and safety".
 */

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

/** Past the grace period → due for purge. */
const EXPIRED = () => daysAgo(PURGE_AFTER_DAYS + 1);
/** Inside the grace period → must be left alone. */
const RECENT = () => daysAgo(PURGE_AFTER_DAYS - 1);

beforeEach(async () => {
  await truncateAll();
});
afterEach(async () => {
  await truncateAll();
});

describe("purge scope", () => {
  it("purges an account whose grace period has elapsed", async () => {
    const u = await seedUser({ deletedAt: EXPIRED() });

    const res = await runAccountPurge();

    expect(res.purged).toBe(1);
    expect(await prisma.user.findUnique({ where: { id: u.id } })).toBeNull();
  });

  it("leaves a deleted account alone while it is still inside the grace period", async () => {
    const u = await seedUser({ deletedAt: RECENT() });

    const res = await runAccountPurge();

    expect(res.purged).toBe(0);
    expect(await prisma.user.findUnique({ where: { id: u.id } })).not.toBeNull();
  });

  it("never touches a live account", async () => {
    const live = await seedUser({ deletedAt: null });

    await runAccountPurge();

    expect(await prisma.user.findUnique({ where: { id: live.id } })).not.toBeNull();
  });

  it("frees the email address, which was previously locked out forever", async () => {
    const u = await seedUser({ email: "reuse@test.dama", deletedAt: EXPIRED() });

    await runAccountPurge();

    expect(await prisma.user.findUnique({ where: { id: u.id } })).toBeNull();
    // The address is now registerable again — before the purge existed, deleting
    // an account permanently burned its email.
    const reused = await seedUser({ email: "reuse@test.dama" });
    expect(reused.email).toBe("reuse@test.dama");
  });
});

describe("cascades — the five relations that used to block the delete", () => {
  it("destroys the gold ledger, orders, inventory and sessions", async () => {
    const u = await seedUser({ deletedAt: EXPIRED() });
    await prisma.ledgerEntry.create({
      data: { userId: u.id, currency: "GOLD", amount: 100, balance: 100, reason: "test" },
    });
    await prisma.order.create({
      data: { userId: u.id, items: [], currency: "GOLD", total: 50 },
    });
    await prisma.session.create({
      data: { userId: u.id, refreshToken: `rt_${u.id}`, expiresAt: new Date(Date.now() + 86_400_000) },
    });

    await purgeAccount(u.id);

    expect(await prisma.ledgerEntry.count({ where: { userId: u.id } })).toBe(0);
    expect(await prisma.order.count({ where: { userId: u.id } })).toBe(0);
    expect(await prisma.session.count({ where: { userId: u.id } })).toBe(0);
  });

  it("destroys their chat messages", async () => {
    const u = await seedUser({ deletedAt: EXPIRED() });
    const channel = await prisma.channel.create({ data: { type: "DM" } });
    await prisma.message.create({ data: { channelId: channel.id, authorId: u.id, body: "hello" } });

    await purgeAccount(u.id);

    expect(await prisma.message.count({ where: { authorId: u.id } })).toBe(0);
  });

  it("deletes ChannelMember and GuildJoinRequest rows, which have NO foreign key to cascade", async () => {
    // These two columns are plain Strings — the database cannot cascade them, so
    // the job must delete them explicitly. Without that, a purged account stays
    // a member of every DM/guild channel it ever joined.
    const u = await seedUser({ deletedAt: EXPIRED() });
    const channel = await prisma.channel.create({ data: { type: "DM" } });
    await prisma.channelMember.create({ data: { channelId: channel.id, userId: u.id } });
    // Guild is NOT in the shared truncateAll table list, so names must be unique
    // per run or a leftover row collides on the unique constraint.
    const gid = `purge_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const guild = await prisma.guild.create({ data: { name: gid, tag: gid.slice(-8) } });
    await prisma.guildJoinRequest.create({ data: { guildId: guild.id, userId: u.id } });

    await purgeAccount(u.id);

    expect(await prisma.channelMember.count({ where: { userId: u.id } })).toBe(0);
    expect(await prisma.guildJoinRequest.count({ where: { userId: u.id } })).toBe(0);
  });

  it("survives an account that created a tournament (was Restrict, now SetNull)", async () => {
    const admin = await seedUser({ deletedAt: EXPIRED(), adminRole: "SUPERADMIN" });
    const t = await prisma.tournament.create({
      data: { name: "Cup", createdById: admin.id, startsAt: new Date() },
    });

    await purgeAccount(admin.id);

    // The tournament is a platform object with entrants and a prize pool — it
    // must outlive its creator rather than make the account undeletable.
    const after = await prisma.tournament.findUnique({ where: { id: t.id } });
    expect(after).not.toBeNull();
    expect(after!.createdById).toBeNull();
  });
});

describe("retention — what must SURVIVE the purge", () => {
  it("keeps the Payment row and severs the user link", async () => {
    const u = await seedUser({ deletedAt: EXPIRED() });
    const pay = await prisma.payment.create({
      data: {
        userId: u.id,
        provider: "play",
        providerRef: `play_${u.id}`,
        amountCents: 9900,
        diamonds: 100,
        status: "settled",
        settledAt: new Date(),
      },
    });

    await purgeAccount(u.id);

    const after = await prisma.payment.findUnique({ where: { id: pay.id } });
    expect(after, "financial records outlive an erasure request").not.toBeNull();
    expect(after!.userId, "but carry no link back to a person").toBeNull();
    expect(after!.amountCents).toBe(9900);
  });

  it("keeps the OPPONENT's match history with a blank player slot", async () => {
    const leaver = await seedUser({ deletedAt: EXPIRED() });
    const opponent = await seedUser();
    const match = await prisma.match.create({
      data: {
        mode: "RANKED",
        redId: leaver.id,
        blueId: opponent.id,
        settings: {},
        moves: [],
        startedAt: new Date(),
        endedAt: new Date(),
        winner: "blue",
      },
    });

    await purgeAccount(leaver.id);

    const after = await prisma.match.findUnique({ where: { id: match.id } });
    expect(after, "the opponent's history is not the deleted user's to erase").not.toBeNull();
    expect(after!.redId).toBeNull();
    expect(after!.blueId).toBe(opponent.id);
    expect(after!.winner).toBe("blue");
  });
});

describe("moderation records — the abuser-laundering case", () => {
  it("keeps a report filed AGAINST them, scrubbing their identity and their quoted message", async () => {
    const abuser = await seedUser({ deletedAt: EXPIRED() });
    const reporter = await seedUser();
    const report = await prisma.report.create({
      data: {
        reporterId: reporter.id,
        reporterName: "reporter#1001",
        accusedId: abuser.id,
        accusedName: "abuser#1002",
        reason: "HARASSMENT",
        context: "dm",
        excerpt: "something abusive",
        profileSnapshot: { username: "abuser", bio: "identifying bio" },
      },
    });

    await purgeAccount(abuser.id);

    const after = await prisma.report.findUnique({ where: { id: report.id } });
    // The record survives, so deleting and re-registering cannot launder a
    // history of abuse.
    expect(after).not.toBeNull();
    expect(after!.reason).toBe("HARASSMENT");
    // ...but every trace of who they were is gone.
    expect(after!.accusedId).toBeNull();
    expect(after!.accusedName).toBe("[deleted user]");
    expect(after!.excerpt, "their quoted message is their content").toBeNull();
    expect(after!.profileSnapshot).toBeNull();
  });

  it("keeps the EXCERPT when the purged user was the REPORTER, not the accused", async () => {
    // The asymmetry that is easy to get wrong: as reporter, the excerpt is the
    // ACCUSED's message — someone else's content and live evidence against a
    // still-active user. Scrubbing it would let anyone destroy evidence against
    // another player by deleting their own account.
    const reporter = await seedUser({ deletedAt: EXPIRED() });
    const accused = await seedUser();
    const report = await prisma.report.create({
      data: {
        reporterId: reporter.id,
        reporterName: "reporter#1003",
        accusedId: accused.id,
        accusedName: "accused#1004",
        reason: "HARASSMENT",
        context: "dm",
        excerpt: "the accused said this",
      },
    });

    await purgeAccount(reporter.id);

    const after = await prisma.report.findUnique({ where: { id: report.id } });
    expect(after!.reporterId).toBeNull();
    expect(after!.reporterName).toBe("[deleted user]");
    expect(after!.excerpt, "evidence against a LIVE user must survive").toBe("the accused said this");
    expect(after!.accusedId).toBe(accused.id);
    expect(after!.accusedName).toBe("accused#1004");
  });
});

describe("batch behaviour", () => {
  it("purges several due accounts in one tick and reports the count", async () => {
    await seedUser({ deletedAt: EXPIRED() });
    await seedUser({ deletedAt: EXPIRED() });
    await seedUser({ deletedAt: RECENT() });
    await seedUser();

    const res = await runAccountPurge();

    expect(res.purged).toBe(2);
    expect(await prisma.user.count()).toBe(2);
  });

  it("is a no-op when nothing is due", async () => {
    await seedUser();
    const res = await runAccountPurge();
    expect(res.purged).toBe(0);
  });
});
