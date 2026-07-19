import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useAppStore } from "../../stores/appStore";
import { useAuthStore } from "../../stores/authStore";
import { SiteHead, faqJsonLd, howToJsonLd } from "../../lib/seo";
import { RulesGuide, RULES_FAQ, HOWTO_STEPS } from "./RulesGuide";

/**
 * LearnPage (/learn) — ported faithfully from the approved prototype
 * (handoff lines 888-978). Three-column Learn overview: a left rail with the
 * learning-journey progress card, a "Continue Learning" resume card, and the
 * "All Lessons" list; a center column with the hero heading, a "How to Move &
 * Capture" primer, a search bar, and the four topic cards; a right rail with
 * "What You'll Learn" and "Video Lessons".
 *
 * LIVE DATA: on mount (when logged in) we GET /api/learn/lessons →
 * { lessons: [{ id, title, summary, completed }], completedCount, total }.
 * The lesson list, the "N of M lessons done" count, the progress bar, the % /
 * XP / rank tiles, and each lesson's done-badge all reflect the REAL per-user
 * completion state returned by the server — nothing is hardcoded. XP is a
 * derived display value (50 per completed lesson) and the learning rank is a
 * label derived from the real completed count.
 *
 * ACTIONS (match the prototype's openLesson()): every interactive control opens
 * the real interactive lesson player at /learn/:id (LessonPage). "Continue
 * Learning" navigates to the first not-yet-completed lesson (a real resume
 * point; when everything is done it opens the first lesson to review). Each "All
 * Lessons" row opens that lesson. The four topic cards and the video-lesson rows
 * jump to the specific lesson the prototype maps them to. Completion itself
 * happens inside LessonPage (POST /api/learn/lessons/:id/complete), so progress
 * advances honestly after the user actually works through a lesson.
 *
 * LOGGED OUT (me === null): no fetch fires, the header prompts sign-in, and the
 * journey card renders an honest zero state — no crash. (LessonPage itself shows
 * a sign-in prompt if a logged-out visitor deep-links into a lesson.)
 *
 * STATIC (non-user) content only: the "How to Move & Capture" primer, the four
 * topic cards, the "What You'll Learn" bullets, and the "Video Lessons" list are
 * ambient educational copy from the prototype, not per-user data.
 */

// ── server lesson shape (GET /api/learn/lessons) ──
type LessonStep = { heading: string; body: string };
type Lesson = { id: string; title: string; tag: string; summary: string; steps: LessonStep[]; completed: boolean };
type LessonsResponse = { lessons: Lesson[]; completedCount: number; total: number };

const XP_PER_LESSON = 50;

/** Learning rank label derived from the REAL completed-lesson count.
 *  Tiers match the prototype exactly (Beginner → Apprentice → Strategist →
 *  Dama Master); there is no "Novice" tier. */
function learnRankFor(done: number, total: number): string {
  if (total > 0 && done >= total) return "Dama Master";
  if (done >= 6) return "Strategist";
  if (done >= 3) return "Apprentice";
  return "Beginner";
}

// ── topic cards (ambient educational copy from the prototype learnTopics) ──
type Topic = {
  title: string;
  desc: string;
  cta: string;
  icon: string;
  tint: string;
  border: string;
  btn: string;
  /** the lesson this card opens — matches the prototype's openLesson() target */
  lessonId: string;
};
const TOPICS: Topic[] = [
  {
    title: "Basic Rules",
    desc: "Learn the board, pieces, movement, and how the game works.",
    cta: "Start Learning",
    icon: "/assets/mc-classic.png",
    tint: "rgba(30,50,95,.45)",
    border: "rgba(60,110,200,.5)",
    btn: "btn-blue",
    lessonId: "basics-board",
  },
  {
    title: "Mandatory Capture",
    desc: "Understand capture rules, multiple jumps, and what is required.",
    cta: "Learn More",
    icon: "/assets/mc-ranked.png",
    tint: "rgba(90,28,38,.45)",
    border: "rgba(180,60,70,.5)",
    btn: "btn-red",
    lessonId: "basics-capture",
  },
  {
    title: "King (Dama) Movement",
    desc: "Unlock the power of the King. Move farther and control the board.",
    cta: "Learn More",
    icon: "/assets/me-crown.png",
    tint: "rgba(50,32,90,.45)",
    border: "rgba(140,90,210,.5)",
    btn: "btn-purple",
    lessonId: "rules-dama",
  },
  {
    title: "Strategy & Tactics",
    desc: "Discover openings, formations, and tactical ideas to win more games.",
    cta: "Explore Strategies",
    icon: "/assets/mc-training.png",
    tint: "rgba(24,64,44,.45)",
    border: "rgba(50,150,100,.5)",
    btn: "btn-green",
    lessonId: "strategy-tactics",
  },
];

const WHAT_YOULL_LEARN = [
  "Understand the rules of Filipino Dama",
  "Master captures and king movement",
  "Learn winning strategies and tactics",
  "Improve through practice and play",
  "Compete and climb the leaderboards",
];

type Video = { title: string; time: string; level: string; lc: string; lessonId: string };
const VIDEO_LESSONS: Video[] = [
  { title: "Filipino Dama: Rules for Beginners", time: "6:45", level: "Beginner", lc: "#3fbf6f", lessonId: "basics-board" },
  { title: "How to Capture Like a Pro", time: "8:12", level: "Intermediate", lc: "#E8B84B", lessonId: "basics-capture" },
  { title: "King Moves & Advanced Tactics", time: "10:21", level: "Advanced", lc: "#d63b52", lessonId: "rules-dama" },
];

// ── Marble board theme (default) from boardTheme() ──
const CELL_DARK = "radial-gradient(120% 120% at 25% 20%,#454b59 0%,#2a2f3b 45%,#181b23 100%)";
const CELL_LIGHT = "radial-gradient(120% 120% at 25% 20%,#faf6ec 0%,#ece5d5 45%,#d4cbb6 100%)";

/**
 * MiniBoard — the prototype's miniBoard(): an 8×8 marble checkerboard with the
 * standard 12-a-side starting position on the dark squares.
 */
function MiniBoard() {
  const cells = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const playable = (r + c) % 2 === 1;
      let col: "red" | "blue" | null = null;
      if (playable && r < 3) col = "red";
      if (playable && r > 4) col = "blue";
      const red = col === "red";
      const face = red
        ? "radial-gradient(circle at 38% 27%,#ff8790 0%,#e5434f 38%,#a81f2b 70%,#67101a 100%)"
        : "radial-gradient(circle at 38% 27%,#8fbcff 0%,#3f79d6 38%,#1f4a92 70%,#122f63 100%)";
      const rim = red ? "#7a1420" : "#122f5c";
      cells.push(
        <div
          key={`${r}-${c}`}
          style={{
            position: "relative",
            background: playable ? CELL_DARK : CELL_LIGHT,
            boxShadow:
              (playable
                ? "inset 0 0 10px rgba(0,0,0,.4), "
                : "inset 0 0 8px rgba(180,165,130,.3), ") +
              "inset 0 0 0 1px rgba(232,184,75,.26)",
          }}
        >
          {col && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                margin: "auto",
                width: "78%",
                height: "78%",
                borderRadius: "50%",
                filter: "drop-shadow(0 3px 4px rgba(0,0,0,.55))",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  background: face,
                  boxShadow:
                    "inset 0 -4px 7px rgba(0,0,0,.55), inset 0 3px 5px rgba(255,255,255,.4), 0 0 0 1.5px " +
                    rim,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: "20%",
                    borderRadius: "50%",
                    border: "1.5px solid rgba(255,255,255,.18)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    top: "12%",
                    left: "20%",
                    width: "44%",
                    height: "30%",
                    borderRadius: "50%",
                    background: "radial-gradient(circle,rgba(255,255,255,.6),transparent 70%)",
                  }}
                />
              </div>
            </div>
          )}
        </div>,
      );
    }
  }
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(8,1fr)",
        aspectRatio: "1 / 1",
        width: "100%",
        borderRadius: 4,
        overflow: "hidden",
        boxShadow: "inset 0 0 0 2px rgba(232,184,75,.4), inset 0 0 30px rgba(0,0,0,.5)",
      }}
    >
      {cells}
    </div>
  );
}

function CheckIcon() {
  return (
    <span style={{ color: "var(--gold)", flex: "none", marginTop: 1 }} aria-hidden>
      ✓
    </span>
  );
}

export function LearnPage() {
  const me = useAuthStore((s) => s.me);
  const showToast = useAppStore((s) => s.showToast);
  const navigate = useNavigate();

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [total, setTotal] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Open the real interactive lesson player (prototype's openLesson()).
  const openLesson = useCallback((id: string) => navigate(`/learn/${id}`), [navigate]);

  const load = useCallback(async () => {
    if (!me) {
      setLessons([]);
      setTotal(0);
      setDoneCount(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get<LessonsResponse>("/api/learn/lessons");
      setLessons(res.lessons);
      setTotal(res.total);
      setDoneCount(res.completedCount);
    } catch {
      showToast("Couldn't load lessons. Please try again.");
      setLessons([]);
      setTotal(0);
      setDoneCount(0);
    } finally {
      setLoading(false);
    }
  }, [me, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── derived, real progress ──
  const learnTotal = total || lessons.length;
  const learnPct = learnTotal > 0 ? Math.round((doneCount / learnTotal) * 100) : 0;
  const learnXp = doneCount * XP_PER_LESSON;
  const learnRank = learnRankFor(doneCount, learnTotal);

  // Real resume point: first not-yet-completed lesson (undefined = all done).
  const resumeLesson = lessons.find((l) => !l.completed);
  const resumeIndex = resumeLesson ? lessons.indexOf(resumeLesson) : -1;
  const allDone = learnTotal > 0 && doneCount >= learnTotal;

  // Client-side lesson search — filter the already-loaded list by title, summary
  // or tag as the user types. Empty query shows everything.
  const query = search.trim().toLowerCase();
  const filteredLessons = query
    ? lessons.filter(
        (l) =>
          l.title.toLowerCase().includes(query) ||
          l.summary.toLowerCase().includes(query) ||
          l.tag.toLowerCase().includes(query),
      )
    : lessons;

  return (
    <div
      data-screen-label="Learn"
      className="fd-stack fd-page-pad-tight"
      style={{
        maxWidth: 1560,
        margin: "0 auto",
        padding: 26,
        display: "grid",
        gridTemplateColumns: "290px minmax(0,1fr) 300px",
        gap: 20,
        alignItems: "start",
      }}
    >
      <SiteHead
        title="Dama Rules — How to Play Filipino Checkers (Complete Guide)"
        description="Learn the official rules of Filipino Dama (dama / Filipino checkers): board setup, mandatory captures, the maximum-capture rule, the flying dama (king), and how to win — with FAQ and interactive lessons."
        path="/learn"
        alternates={[
          { hrefLang: "en-PH", path: "/learn" },
          { hrefLang: "tl-PH", path: "/tl/learn" },
          { hrefLang: "x-default", path: "/learn" },
        ]}
        jsonLd={[
          faqJsonLd(RULES_FAQ),
          howToJsonLd(
            "How to Play Filipino Dama",
            "Set up the board and learn movement, mandatory captures, crowning, and winning in Filipino Dama (Filipino checkers).",
            HOWTO_STEPS,
          ),
        ]}
      />
      {/* ── LEFT RAIL ── */}
      <div className="fd-order-2" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Your Learning Journey */}
        <div className="frame" style={{ padding: 22 }}>
          <div className="ptitle">Your Learning Journey</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img
              src="/assets/sb-star.png"
              alt=""
              style={{ width: 44, height: 44, objectFit: "contain" }}
            />
            <div>
              <div style={{ font: "700 15px Cinzel,serif", color: "var(--gold-lt)" }}>{learnRank}</div>
              <div style={{ font: "500 12px Inter", color: "var(--ink)" }}>
                {me ? `${doneCount} of ${learnTotal} lessons done` : "Sign in to track your progress"}
              </div>
            </div>
          </div>
          <div
            style={{
              height: 12,
              borderRadius: 100,
              background: "rgba(0,0,0,.4)",
              border: "1px solid rgba(232,184,75,.25)",
              overflow: "hidden",
              margin: "14px 0 6px",
            }}
          >
            <div
              style={{
                width: `${learnPct}%`,
                height: "100%",
                background: "linear-gradient(90deg,#3f79d6,#6fa8ff)",
              }}
            />
          </div>
          <div
            style={{
              font: "700 11px 'JetBrains Mono',monospace",
              color: "var(--ink)",
              textAlign: "center",
            }}
          >
            {learnPct}% complete
          </div>
          <div
            className="fd-stat-3"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              gap: 8,
              marginTop: 14,
            }}
          >
            <div
              style={{
                textAlign: "center",
                padding: "10px 4px",
                borderRadius: 9,
                border: "1px solid rgba(232,184,75,.2)",
                background: "rgba(0,0,0,.2)",
              }}
            >
              <div style={{ font: "700 17px 'JetBrains Mono',monospace", color: "var(--gold-lt)" }}>
                {doneCount}
              </div>
              <div style={{ font: "500 10px Inter", color: "var(--ink2)" }}>Lessons</div>
            </div>
            <div
              style={{
                textAlign: "center",
                padding: "10px 4px",
                borderRadius: 9,
                border: "1px solid rgba(232,184,75,.2)",
                background: "rgba(0,0,0,.2)",
              }}
            >
              <div style={{ font: "700 17px 'JetBrains Mono',monospace", color: "#3fbf6f" }}>
                {learnPct}%
              </div>
              <div style={{ font: "500 10px Inter", color: "var(--ink2)" }}>Progress</div>
            </div>
            <div
              style={{
                textAlign: "center",
                padding: "10px 4px",
                borderRadius: 9,
                border: "1px solid rgba(232,184,75,.2)",
                background: "rgba(0,0,0,.2)",
              }}
            >
              <div style={{ font: "700 17px 'JetBrains Mono',monospace", color: "#ff9a5a" }}>
                {learnXp}
              </div>
              <div style={{ font: "500 10px Inter", color: "var(--ink2)" }}>XP</div>
            </div>
          </div>
        </div>

        {/* Continue Learning — real resume point (first unfinished lesson) */}
        <div className="frame" style={{ padding: 18 }}>
          <div className="ptitle" style={{ textAlign: "left", border: "none", marginBottom: 12 }}>
            Continue Learning
          </div>
          {!me ? (
            <div style={{ font: "500 12px/1.5 Inter", color: "var(--ink2)" }}>
              <Link to="/login" style={{ color: "var(--gold)", fontWeight: 700 }}>
                Sign in
              </Link>{" "}
              to start your learning journey and track completed lessons.
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ width: 60, height: 60, flex: "none" }}>
                  <MiniBoard />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ font: "700 14px Inter", color: "var(--gold-lt)" }}>
                    {allDone
                      ? "All lessons complete"
                      : resumeLesson
                        ? resumeLesson.title
                        : loading
                          ? "Loading…"
                          : "No lessons available"}
                  </div>
                  <div style={{ font: "500 11px Inter", color: "var(--ink2)", margin: "2px 0 6px" }}>
                    {allDone
                      ? "You've mastered every lesson"
                      : resumeLesson
                        ? `Lesson ${resumeIndex + 1} of ${learnTotal} · ${resumeLesson.tag}`
                        : ""}
                  </div>
                  <div
                    style={{
                      height: 6,
                      borderRadius: 100,
                      background: "rgba(0,0,0,.4)",
                      overflow: "hidden",
                    }}
                  >
                    <div style={{ width: `${learnPct}%`, height: "100%", background: "#3fbf6f" }} />
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-purple fd-cta-full"
                disabled={lessons.length === 0}
                onClick={() => {
                  const target = resumeLesson ?? lessons[0];
                  if (target) openLesson(target.id);
                }}
                style={{
                  width: "100%",
                  marginTop: 14,
                  padding: 11,
                  fontSize: 12,
                  opacity: lessons.length === 0 ? 0.6 : 1,
                  cursor: lessons.length === 0 ? "default" : "pointer",
                }}
              >
                {doneCount === 0 ? "Start Learning" : allDone ? "Review Lessons" : "Resume Lesson"}
              </button>
            </>
          )}
        </div>

        {/* All Lessons — real list + real completion state */}
        <div className="frame" style={{ padding: 18 }}>
          <div className="ptitle">All Lessons</div>
          {!me ? (
            <div style={{ font: "500 12px/1.5 Inter", color: "var(--ink2)", paddingTop: 8 }}>
              Sign in to see the full lesson catalog and your progress.
            </div>
          ) : loading ? (
            <div style={{ font: "500 12px Inter", color: "var(--ink2)", paddingTop: 8 }}>
              Loading lessons…
            </div>
          ) : lessons.length === 0 ? (
            <div style={{ font: "500 12px Inter", color: "var(--ink2)", paddingTop: 8 }}>
              No lessons available yet.
            </div>
          ) : filteredLessons.length === 0 ? (
            <div style={{ font: "500 12px Inter", color: "var(--ink2)", paddingTop: 8 }}>
              No lessons match “{search.trim()}”.
            </div>
          ) : (
            filteredLessons.map((l) => {
              const i = lessons.indexOf(l);
              const done = l.completed;
              const badgeBorder = done ? "rgba(63,191,111,.5)" : "rgba(232,184,75,.3)";
              const badgeBg = done ? "rgba(47,143,91,.2)" : "rgba(0,0,0,.25)";
              const badgeInk = done ? "#7ee6a4" : "var(--gold-lt)";
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => openLesson(l.id)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "12px 0",
                    border: "none",
                    borderTop: "1px solid rgba(232,184,75,.1)",
                    background: "none",
                    color: "var(--ink)",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
                    <span
                      style={{
                        flex: "none",
                        width: 26,
                        height: 26,
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        font: "800 11px 'JetBrains Mono',monospace",
                        border: `1px solid ${badgeBorder}`,
                        background: badgeBg,
                        color: badgeInk,
                      }}
                    >
                      {done ? "✓" : i + 1}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span
                        style={{
                          display: "block",
                          font: "600 13px Inter",
                          color: "#fff",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {l.title}
                      </span>
                      <span style={{ font: "500 10px Inter", color: "var(--ink2)" }}>
                        {done ? `Completed · ${l.tag}` : `Lesson ${i + 1} · ${l.tag}`}
                      </span>
                    </span>
                  </span>
                  <span style={{ color: "var(--ink2)", flex: "none" }}>›</span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── CENTER ── */}
      <div className="fd-order-1" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ textAlign: "center" }}>
          <h1
            style={{
              margin: 0,
              font: "800 clamp(26px,3vw,40px) Cinzel,serif",
              color: "var(--gold-lt)",
            }}
          >
            Learn the Rules and
            <br />
            Master the Strategy
          </h1>
          <div style={{ font: "500 13px Inter", color: "var(--ink)", marginTop: 10 }}>
            ✦ Your journey to becoming a Dama master starts here ✦
          </div>
        </div>

        {/* How to Move & Capture */}
        <div className="frame" style={{ padding: 24 }}>
          <div className="ptitle">How to Move &amp; Capture</div>
          <div className="fd-collapse-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{ width: 96, height: 96, flex: "none" }}>
                <MiniBoard />
              </div>
              <div>
                <div
                  style={{
                    font: "700 15px Cinzel,serif",
                    color: "var(--gold-lt)",
                    marginBottom: 5,
                  }}
                >
                  Move
                </div>
                <div style={{ font: "400 13px/1.5 Inter", color: "var(--ink)" }}>
                  Move one square forward diagonally to an empty space.
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{ width: 96, height: 96, flex: "none" }}>
                <MiniBoard />
              </div>
              <div>
                <div
                  style={{
                    font: "700 15px Cinzel,serif",
                    color: "var(--gold-lt)",
                    marginBottom: 5,
                  }}
                >
                  Capture
                </div>
                <div style={{ font: "400 13px/1.5 Inter", color: "var(--ink)" }}>
                  Jump over an opponent's piece and land on the next empty square. Captured pieces
                  are removed.
                </div>
              </div>
            </div>
          </div>
          <div
            style={{
              textAlign: "center",
              font: "600 12px Inter",
              color: "var(--gold)",
              marginTop: 18,
            }}
          >
            ✦ Capture is mandatory when available ✦
          </div>
        </div>

        {/* Search */}
        <div className="frame" style={{ padding: 18 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              placeholder="Search rules, tactics, topics..."
              className="fd-nozoom"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                flex: 1,
                padding: "11px 13px",
                borderRadius: 8,
                border: "1px solid rgba(232,184,75,.3)",
                background: "rgba(0,0,0,.3)",
                color: "#fff",
                font: "500 13px Inter",
              }}
            />
          </div>
          <div style={{ font: "500 11px Inter", color: "var(--ink2)", marginTop: 8 }}>
            Popular: capture rules, king moves, opening
          </div>
        </div>

        {/* Topic cards */}
        <div className="fd-grid-2up" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
          {TOPICS.map((t) => (
            <div
              key={t.title}
              className="frame"
              style={{
                padding: "18px 14px",
                textAlign: "center",
                borderColor: t.border,
                backgroundColor: t.tint,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  margin: "0 auto",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <img
                  src={t.icon}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
              </div>
              <div style={{ font: "700 14px Cinzel,serif", color: "var(--gold-lt)" }}>{t.title}</div>
              <div style={{ font: "400 11px/1.45 Inter", color: "var(--ink)", flex: 1 }}>
                {t.desc}
              </div>
              <button
                type="button"
                className={`btn ${t.btn} fd-cta-full`}
                onClick={() => openLesson(t.lessonId)}
                style={{ width: "100%", padding: 9, fontSize: 10 }}
              >
                {t.cta}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT RAIL ── */}
      <div className="fd-order-3" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* What You'll Learn */}
        <div className="frame" style={{ padding: 22 }}>
          <div className="ptitle">What You'll Learn</div>
          {WHAT_YOULL_LEARN.map((w) => (
            <div
              key={w}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 11,
                padding: "9px 0",
                borderTop: "1px solid rgba(232,184,75,.1)",
              }}
            >
              <CheckIcon />
              <span style={{ font: "500 13px/1.4 Inter", color: "var(--ink)" }}>{w}</span>
            </div>
          ))}
        </div>

        {/* Video Lessons */}
        <div className="frame" style={{ padding: 22 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <span
              className="ptitle"
              style={{ border: "none", padding: 0, margin: 0, textAlign: "left" }}
            >
              Video Lessons
            </span>
            <button
              type="button"
              className="fd-tap"
              onClick={() => openLesson(VIDEO_LESSONS[0].lessonId)}
              style={{
                font: "600 11px Inter",
                color: "var(--gold)",
                cursor: "pointer",
                background: "none",
                border: "none",
                padding: 0,
              }}
            >
              View All
            </button>
          </div>
          {VIDEO_LESSONS.map((v) => (
            <button
              key={v.title}
              type="button"
              onClick={() => openLesson(v.lessonId)}
              style={{
                width: "100%",
                display: "flex",
                gap: 12,
                alignItems: "center",
                padding: "10px 0",
                border: "none",
                borderTop: "1px solid rgba(232,184,75,.1)",
                background: "none",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 44,
                  flex: "none",
                  position: "relative",
                  borderRadius: 6,
                  overflow: "hidden",
                }}
              >
                <MiniBoard />
                <span
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(0,0,0,.35)",
                    color: "#fff",
                  }}
                >
                  ▶
                </span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ font: "600 13px Inter", color: "#fff" }}>{v.title}</div>
                <div
                  style={{
                    font: "500 11px 'JetBrains Mono',monospace",
                    color: "var(--ink2)",
                    marginTop: 3,
                  }}
                >
                  {v.time}
                </div>
              </div>
              <span
                style={{
                  font: "600 10px Inter",
                  padding: "3px 8px",
                  borderRadius: 5,
                  border: `1px solid ${v.lc}`,
                  color: v.lc,
                }}
              >
                {v.level}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── PUBLIC RULES GUIDE (SEO pillar; spans all 3 columns; additive only —
             the approved layout above is untouched) ── */}
      <RulesGuide />
    </div>
  );
}

export default LearnPage;
