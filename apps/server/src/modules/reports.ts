import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { requireAuth } from "../auth/guards.js";
import { dmRefId } from "./chat-service.js";
import { getChatMessage } from "../realtime/chat-log.js";

const bodySchema = z.object({
  accusedId: z.string().min(1),
  reason: z.enum(["HARASSMENT", "HATE_SPEECH", "CHEATING", "INAPPROPRIATE", "SPAM", "OTHER"]),
  note: z.string().trim().max(500).optional(),
  // "match" and "room" are the two EPHEMERAL surfaces — see the branch below.
  context: z.enum(["dm", "profile", "guild", "match", "room"]),
  messageId: z.string().optional(),
}).refine((b) => b.context === "profile" || !!b.messageId, { message: "messageId required for a message report", path: ["messageId"] })
  .refine((b) => b.context !== "profile" || (b.note && b.note.length > 0), { message: "note required for a profile report", path: ["note"] });

const RATE = 5;

function cuid() { return `rep_${randomUUID()}`; }

export async function reportRoutes(app: FastifyInstance) {
  app.post("/reports", { preHandler: requireAuth }, async (req) => {
    if (req.isGuest) throw err.forbidden("GUEST_CANNOT_REPORT", "Guests can't file reports");
    const b = bodySchema.parse(req.body);
    const reporterId = req.userId!;
    if (b.accusedId === reporterId) throw err.badRequest("SELF_REPORT", "You can't report yourself");

    const accused = await prisma.user.findUnique({ where: { id: b.accusedId }, select: { id: true, isBot: true, deletedAt: true, username: true, tag: true, displayName: true, avatarUrl: true, bio: true } });
    if (!accused || accused.deletedAt || accused.isBot) throw err.badRequest("BAD_ACCUSED", "That player can't be reported");

    let excerpt: string | null = null, channelId: string | null = null, profileSnapshot: any = null;
    if (b.context === "dm") {
      const msg = await prisma.message.findUnique({ where: { id: b.messageId! }, include: { channel: true } });
      if (!msg) throw err.badRequest("NO_MESSAGE", "Message not found");
      if (msg.channel.type !== "DM") throw err.badRequest("NOT_DM", "That message isn't from a DM");
      if (msg.authorId !== b.accusedId) throw err.badRequest("NOT_ACCUSED_MESSAGE", "You can only cite the reported player's own message");
      if (msg.channel.refId !== dmRefId(reporterId, b.accusedId)) throw err.badRequest("NOT_DM_PAIR", "That DM isn't between you and this player");
      excerpt = msg.body; channelId = msg.channelId;
    } else if (b.context === "guild") {
      const msg = await prisma.message.findUnique({ where: { id: b.messageId! }, include: { channel: true } });
      if (!msg) throw err.badRequest("NO_MESSAGE", "Message not found");
      if (msg.channel.type !== "GUILD") throw err.badRequest("NOT_GUILD", "That message isn't from a guild");
      if (msg.authorId !== b.accusedId) throw err.badRequest("NOT_ACCUSED_MESSAGE", "You can only cite the reported player's own message");
      // reporter must be a member of that guild (channel.refId = guildId for GUILD channels)
      const membership = await prisma.guildMember.findFirst({ where: { guildId: msg.channel.refId ?? "", userId: reporterId }, select: { userId: true } });
      if (!membership) throw err.forbidden("NOT_GUILD_MEMBER", "You must be in this guild to report a message here");
      excerpt = msg.body; channelId = msg.channelId;
    } else if (b.context === "match" || b.context === "room") {
      // In-match and private-room chat are EPHEMERAL — relayed, never persisted,
      // so there is no Message row to read. The excerpt therefore comes from the
      // server's own short-lived record of what it actually broadcast
      // (realtime/chat-log.ts), NOT from the reporter: otherwise the "evidence"
      // would be a string the accuser typed, and anyone could fabricate a quote
      // to get someone banned.
      const rec = await getChatMessage(b.messageId!);
      if (!rec) {
        throw err.badRequest(
          "MESSAGE_EXPIRED",
          "That message is too old to report. Match and room chat can be reported for 48 hours.",
        );
      }
      if (rec.scope !== b.context) throw err.badRequest("WRONG_CONTEXT", "That message isn't from this kind of chat");
      if (rec.from !== b.accusedId)
        throw err.badRequest("NOT_ACCUSED_MESSAGE", "You can only cite the reported player's own message");
      // Captured at SEND time: the match may have settled and the room may be
      // gone by now, but only someone who could SEE the message may report it.
      if (!rec.participants.includes(reporterId))
        throw err.forbidden("NOT_PARTICIPANT", "You can only report messages from a chat you were in");
      excerpt = rec.body;
    } else {
      profileSnapshot = { displayName: accused.displayName, username: accused.username, tag: accused.tag, avatarUrl: accused.avatarUrl, bio: accused.bio };
    }

    const reporter = await prisma.user.findUnique({ where: { id: reporterId }, select: { username: true, tag: true } });
    const reporterName = `${reporter!.username}${reporter!.tag}`;
    const accusedName = `${accused.username}${accused.tag}`;

    // Atomic rate-limited insert: create the row only if the reporter is under quota this hour.
    //
    // A bare `INSERT ... SELECT ... WHERE (SELECT count(*) ...) < RATE` is NOT atomic under
    // concurrency at Postgres's default READ COMMITTED isolation: the count subquery takes no
    // lock on the counted rows, so N concurrent requests from the same reporter all read the
    // same pre-insert count, all pass the guard, and all insert — blowing past the cap (verified
    // empirically: 8 concurrent requests inserted 8 rows, not "≤ RATE - existing"). To make the
    // check-then-insert atomic across concurrent requests from the SAME reporter, take a
    // transaction-scoped Postgres advisory lock keyed by hashing the reporterId before counting.
    // pg_advisory_xact_lock blocks other transactions requesting the same key until this
    // transaction commits/rolls back, and is auto-released then (no manual unlock needed), which
    // serializes same-reporter requests so each one's count reflects all prior commits.
    const id = cuid();
    const inserted: number = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${reporterId}))`;
      return tx.$executeRaw`
        INSERT INTO "Report" ("id","reporterId","reporterName","accusedId","accusedName","reason","note","context","channelId","messageId","excerpt","profileSnapshot","status","createdAt")
        SELECT ${id}, ${reporterId}, ${reporterName}, ${b.accusedId}, ${accusedName}, ${b.reason}::"ReportReason", ${b.note ?? null}, ${b.context}, ${channelId}, ${b.messageId ?? null}, ${excerpt}, ${profileSnapshot ? JSON.stringify(profileSnapshot) : null}::jsonb, 'OPEN'::"ReportStatus", now()
        WHERE (SELECT count(*) FROM "Report" WHERE "reporterId" = ${reporterId} AND "createdAt" >= now() - interval '1 hour') < ${RATE}
      `;
    }).catch((e: any) => {
      // The partial-unique-index violation on (reporterId, accusedId) WHERE status='OPEN'
      // can surface as a Prisma P2002 (structured constraint violation) OR — as observed via
      // $executeRaw, which routes raw SQL failures through P2010 "Raw query failed" — with the
      // underlying Postgres code (23505, unique_violation) nested in e.meta.code. Check both.
      if (e?.code === "P2002" || e?.code === "23505" || e?.meta?.code === "23505")
        throw err.conflict("ALREADY_REPORTED", "You've already reported this player");
      throw e;
    });
    if (inserted === 0) throw err.tooMany("RATE_LIMITED", "You're reporting too fast — try again later");
    req.log.info({ evt: "report.create", reporterId, accusedId: b.accusedId, context: b.context, reason: b.reason });
    return ok({ id });
  });
}
