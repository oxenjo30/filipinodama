import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";
import { ok, err } from "../lib/errors.js";
import { requireAuth } from "../auth/guards.js";

/**
 * Learn: the Dama tutorial lessons.
 * GET  /api/learn/lessons              → static lesson list + per-user completion
 * POST /api/learn/lessons/:id/complete → mark a lesson complete (idempotent)
 *
 * There is no Lesson model in the schema, so the lesson catalog is static here
 * and completion is stored the simple, durable way: one Notification row per
 * completed lesson (type "lesson_complete", data.lessonId). No schema change
 * needed, and it survives restarts. Marking complete is idempotent.
 */

const LESSON_TYPE = "lesson_complete";

type Lesson = { id: string; title: string; summary: string };

// Static catalog. Ordered as presented to the player.
const LESSONS: Lesson[] = [
  { id: "basics-board", title: "The Board & Pieces", summary: "How the 8×8 Dama board is set up and where your pieces start." },
  { id: "basics-move", title: "Moving Pieces", summary: "Men move diagonally forward one square onto empty dark squares." },
  { id: "basics-capture", title: "Capturing", summary: "Jump an adjacent enemy piece into the empty square beyond it." },
  { id: "rules-forced-capture", title: "Forced Captures", summary: "If a capture is available you must take it — and take the longest chain." },
  { id: "rules-promotion", title: "Promotion to Dama", summary: "Reach the far row to crown a piece into a flying king (Dama)." },
  { id: "rules-dama", title: "Playing the Dama", summary: "How the crowned Dama slides and captures across long diagonals." },
  { id: "strategy-tempo", title: "Tempo & Trades", summary: "When to trade pieces and how to keep the initiative." },
  { id: "strategy-endgame", title: "Endgame Basics", summary: "Converting a material edge into a win in the endgame." },
];

const LESSON_IDS = new Set(LESSONS.map((l) => l.id));

/** Set of lessonIds this user has completed, read from their notifications. */
async function completedIds(userId: string): Promise<Set<string>> {
  const rows = await prisma.notification.findMany({
    where: { userId, type: LESSON_TYPE },
    select: { data: true },
  });
  const done = new Set<string>();
  for (const r of rows) {
    const lessonId = (r.data as { lessonId?: string } | null)?.lessonId;
    if (lessonId) done.add(lessonId);
  }
  return done;
}

export async function learnRoutes(app: FastifyInstance) {
  // GET /api/learn/lessons — catalog + completion state
  app.get("/learn/lessons", { preHandler: requireAuth }, async (req) => {
    const done = await completedIds(req.userId!);
    const lessons = LESSONS.map((l) => ({ ...l, completed: done.has(l.id) }));
    return ok({ lessons, completedCount: done.size, total: LESSONS.length });
  });

  // POST /api/learn/lessons/:id/complete — idempotent mark-complete
  app.post<{ Params: { id: string } }>("/learn/lessons/:id/complete", { preHandler: requireAuth }, async (req) => {
    const userId = req.userId!;
    const lessonId = req.params.id;
    if (!LESSON_IDS.has(lessonId)) throw err.notFound("LESSON_NOT_FOUND", "Lesson not found");

    const already = await prisma.notification.findFirst({
      where: { userId, type: LESSON_TYPE, data: { path: ["lessonId"], equals: lessonId } as Prisma.JsonFilter },
    });
    if (!already) {
      const lesson = LESSONS.find((l) => l.id === lessonId)!;
      await prisma.notification.create({
        data: {
          userId,
          type: LESSON_TYPE,
          title: `Lesson complete: ${lesson.title}`,
          data: { lessonId } as Prisma.InputJsonValue,
          readAt: new Date(), // silent progress marker — not a bell notification
        },
      });
    }
    return ok({ lessonId, completed: true });
  });
}
