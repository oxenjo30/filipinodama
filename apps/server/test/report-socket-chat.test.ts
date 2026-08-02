import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "../src/db/client.js";
import { buildTestApp, seedUser, authFor, truncateAll } from "./helpers.js";
import { recordChatMessage } from "../src/realtime/chat-log.js";

/**
 * Reporting an individual MATCH / PRIVATE-ROOM chat message.
 *
 * These two surfaces are ephemeral — relayed, never persisted, no `Message` row
 * — so until now they were the only chat surfaces with no per-message report
 * path at all. They are also the two STRANGER-facing ones (a matchmade opponent;
 * anyone holding a room code), which is exactly backwards.
 *
 * THE DESIGN POINT THESE TESTS PIN: the excerpt is snapshotted by the SERVER
 * from its own record of what it broadcast, never taken from the reporter. If
 * the accuser supplied the quote, a moderator would be acting on an unverifiable
 * claim and anyone could fabricate text to get someone banned.
 */

let app: Awaited<ReturnType<typeof buildTestApp>>;

beforeEach(async () => {
  await truncateAll();
  app = await buildTestApp();
});
afterEach(async () => {
  await app.close();
  await truncateAll();
});

async function fileReport(actorId: string, body: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: "/api/reports",
    headers: { cookie: authFor({ sub: actorId }) },
    payload: body,
  });
}

describe("match chat reports", () => {
  it("snapshots the excerpt from the SERVER's record, not from the reporter", async () => {
    const abuser = await seedUser();
    const victim = await seedUser();
    const id = await recordChatMessage({
      scope: "match",
      scopeId: "match-1",
      from: abuser.id,
      body: "what the server actually broadcast",
      participants: [abuser.id, victim.id],
    });

    const res = await fileReport(victim.id, {
      accusedId: abuser.id,
      reason: "HARASSMENT",
      context: "match",
      messageId: id,
      // The client cannot influence the stored evidence — there is no field for
      // it, and this note is kept separate from the excerpt.
      note: "he said something vile",
    });

    expect(res.statusCode).toBe(200);
    const row = await prisma.report.findFirst({ where: { accusedId: abuser.id } });
    expect(row?.excerpt).toBe("what the server actually broadcast");
    expect(row?.context).toBe("match");
  });

  it("refuses a report from someone who was not in that match", async () => {
    const abuser = await seedUser();
    const victim = await seedUser();
    const stranger = await seedUser();
    const id = await recordChatMessage({
      scope: "match",
      scopeId: "match-2",
      from: abuser.id,
      body: "private to that match",
      participants: [abuser.id, victim.id],
    });

    const res = await fileReport(stranger.id, {
      accusedId: abuser.id, reason: "HARASSMENT", context: "match", messageId: id,
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("NOT_PARTICIPANT");
  });

  it("refuses to attribute a message to someone who did not send it", async () => {
    // Otherwise you could quote your OPPONENT's id against your own message.
    const abuser = await seedUser();
    const victim = await seedUser();
    const id = await recordChatMessage({
      scope: "match",
      scopeId: "match-3",
      from: victim.id, // the VICTIM wrote this one
      body: "hello",
      participants: [abuser.id, victim.id],
    });

    const res = await fileReport(victim.id, {
      accusedId: abuser.id, reason: "HARASSMENT", context: "match", messageId: id,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("NOT_ACCUSED_MESSAGE");
  });

  it("rejects an unknown or expired message id rather than filing an evidence-free report", async () => {
    const abuser = await seedUser();
    const victim = await seedUser();

    const res = await fileReport(victim.id, {
      accusedId: abuser.id, reason: "HARASSMENT", context: "match", messageId: "cm_does-not-exist",
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("MESSAGE_EXPIRED");
  });

  it("rejects a room message cited as a match message", async () => {
    const abuser = await seedUser();
    const victim = await seedUser();
    const id = await recordChatMessage({
      scope: "room",
      scopeId: "ABC123",
      from: abuser.id,
      body: "in a room",
      participants: [abuser.id, victim.id],
    });

    const res = await fileReport(victim.id, {
      accusedId: abuser.id, reason: "HARASSMENT", context: "match", messageId: id,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("WRONG_CONTEXT");
  });
});

describe("private-room chat reports", () => {
  it("lets a spectator report — they could see the message, so they may report it", async () => {
    const abuser = await seedUser();
    const host = await seedUser();
    const spectator = await seedUser();
    const id = await recordChatMessage({
      scope: "room",
      scopeId: "ROOM42",
      from: abuser.id,
      body: "room abuse",
      participants: [abuser.id, host.id, spectator.id],
    });

    const res = await fileReport(spectator.id, {
      accusedId: abuser.id, reason: "HATE_SPEECH", context: "room", messageId: id,
    });

    expect(res.statusCode).toBe(200);
    const row = await prisma.report.findFirst({ where: { accusedId: abuser.id } });
    expect(row?.excerpt).toBe("room abuse");
    expect(row?.context).toBe("room");
  });
});

describe("schema", () => {
  it("still requires a messageId for a message report", async () => {
    const abuser = await seedUser();
    const victim = await seedUser();

    const res = await fileReport(victim.id, {
      accusedId: abuser.id, reason: "SPAM", context: "match",
    });

    expect(res.statusCode).toBe(400);
  });
});
