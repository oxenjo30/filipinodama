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

/** A single teaching step: a short heading + explanatory body (prototype h/b). */
type LessonStep = { heading: string; body: string };
type Lesson = { id: string; title: string; tag: string; summary: string; steps: LessonStep[] };

// Static catalog — the prototype's 8-lesson tutorial (handoff _lessonData()).
// Every lesson has a category tag and exactly 3 steps.
const LESSONS: Lesson[] = [
  {
    id: "basics-board",
    title: "The Board & Setup",
    tag: "Basics",
    summary: "How the 8×8 Dama board is set up and where your pieces start.",
    steps: [
      {
        heading: "An 8×8 Battlefield",
        body: "Filipino Dama is played on a standard 64-square board. The game happens entirely on the dark squares — the light squares are never used. Orient the board so a dark square sits at your bottom-left.",
      },
      {
        heading: "Your Army of 12",
        body: "Each side starts with 12 pieces on the dark squares of their three nearest rows. Your pieces are blue at the bottom; your opponent commands red at the top.",
      },
      {
        heading: "The Objective",
        body: "Win by capturing every enemy piece — or by trapping them so they have no legal move left. Trade wisely, defend your back row, and hunt for captures.",
      },
    ],
  },
  {
    id: "basics-move",
    title: "How Pieces Move",
    tag: "Movement",
    summary: "Men move one square diagonally forward onto empty dark squares.",
    steps: [
      {
        heading: "One Diagonal Step Forward",
        body: "An ordinary piece (a “man”) moves one square diagonally forward onto an empty dark square. Blue moves upward, red moves downward. The green dots show where this piece may go.",
      },
      {
        heading: "Never Sideways, Never Back",
        body: "A man may only step diagonally forward — it can never move straight, sideways, or backward on a normal move. (Backward motion is allowed only during a capture, which you’ll learn next.)",
      },
      {
        heading: "When You’re Blocked",
        body: "If both forward squares are occupied by friendly pieces, this piece cannot move — you must move a different one. Planning so your pieces don’t jam each other is a real skill.",
      },
    ],
  },
  {
    id: "basics-capture",
    title: "Making a Capture",
    tag: "Capturing",
    summary: "Jump an adjacent enemy piece into the empty square beyond it.",
    steps: [
      {
        heading: "The Jump",
        body: "To capture, jump diagonally over an adjacent enemy piece into the empty square directly beyond it. The jumped piece is removed from the board. Here blue leaps over the red man and lands on the green square.",
      },
      {
        heading: "Capture In Any Direction",
        body: "Unlike a normal move, even an ordinary man may capture forward OR backward. This piece can jump the enemy ahead of it and the one behind it — both are legal captures.",
      },
      {
        heading: "Capture Is Mandatory",
        body: "If a capture is available, you MUST take it — you cannot make a quiet move instead. Blue is not allowed to slide to an empty square here; the jump over the red man is forced.",
      },
    ],
  },
  {
    id: "rules-forced-capture",
    title: "Multiple Jumps",
    tag: "Capturing",
    summary: "Chain your jumps and always take the longest capturing line.",
    steps: [
      {
        heading: "Chain Your Jumps",
        body: "After a capture, if the same piece can immediately jump again, it must keep going. Follow the numbered landings: blue captures the first red, lands, then captures the second in one turn.",
      },
      {
        heading: "Take the Longest Line",
        body: "When several capture routes exist, you must choose the one that captures the MOST pieces. Here the chain that takes two enemies is required over any single capture.",
      },
      {
        heading: "One Piece, Many Kills",
        body: "A single well-placed piece can wipe out a whole diagonal. This blue man zig-zags through three red pieces in one glorious turn — capturing is where games are won.",
      },
    ],
  },
  {
    id: "rules-promotion",
    title: "Becoming a Dama",
    tag: "Promotion",
    summary: "Reach the far row to crown a piece into a flying king (Dama).",
    steps: [
      {
        heading: "Reach the Final Row",
        body: "Push a man all the way to the far edge — your opponent’s back row. This blue man is one step away from the top row and promotion.",
      },
      {
        heading: "Crowned as a Dama",
        body: "The moment it lands on the final row, the man is crowned a Dama (King), marked with a crown. It becomes far more powerful — the game’s decisive piece.",
      },
      {
        heading: "A Whole New Power",
        body: "A Dama is no longer limited to one square. It commands the long diagonals in every direction — as you’ll see in the next lesson.",
      },
    ],
  },
  {
    id: "rules-dama",
    title: "King (Dama) Movement",
    tag: "Promotion",
    summary: "How the crowned Dama slides and captures across long diagonals.",
    steps: [
      {
        heading: "The Flying King",
        body: "A Dama glides any number of empty squares along a diagonal in a single move — forward or backward. It only stops when it reaches the edge or a piece blocks the path.",
      },
      {
        heading: "Strike From Afar",
        body: "A Dama can capture from a distance: sail down an open diagonal, jump the enemy, and land on ANY empty square beyond it. Here the king takes the red man and may stop on any green square.",
      },
      {
        heading: "Rule the Board",
        body: "One Dama can dominate an entire game — controlling multiple diagonals, threatening captures from afar, and shepherding your remaining pieces to promotion. Protect it and use it aggressively.",
      },
    ],
  },
  {
    id: "endgame-winning",
    title: "Winning the Game",
    tag: "Endgame",
    summary: "The ways a game of Dama is won — and when it ends in a draw.",
    steps: [
      {
        heading: "Capture Everything",
        body: "The cleanest win: remove every enemy piece from the board. When your opponent has nothing left to move, the game is yours. Red is down to its last man — blue jumps in for the finish.",
      },
      {
        heading: "Leave Them Stuck",
        body: "You also win if the opponent has pieces but no legal move. This red man is boxed into the corner with every escape blocked — checkmate, Dama-style.",
      },
      {
        heading: "When It’s a Draw",
        body: "If neither side can force a win — for example lone king versus lone king, or the same position repeats — the game is declared a draw. Aim to convert small advantages before it comes to this.",
      },
    ],
  },
  {
    id: "strategy-tactics",
    title: "Strategy & Tactics",
    tag: "Mastery",
    summary: "Openings, formations, and tactical ideas to win more games.",
    steps: [
      {
        heading: "Command the Center",
        body: "Central pieces attack more squares and have more options than pieces stuck on the rim. Contest the middle dark squares early to squeeze your opponent’s mobility.",
      },
      {
        heading: "Hold Your Back Row",
        body: "Keeping pieces on your own last row denies the enemy easy promotion squares. Don’t rush every piece forward — a solid back rank is a fortress.",
      },
      {
        heading: "Trade When Ahead",
        body: "When you have more pieces, simplify — trade evenly to reach a winning endgame. When behind, avoid trades and play for complications. Now go put it into practice!",
      },
    ],
  },
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
