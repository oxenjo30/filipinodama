import { useAppStore } from "../../stores/appStore";

/**
 * LearnPage (/learn) — ported faithfully from the approved prototype
 * (handoff lines 888-978). Three-column Learn overview: a left rail with the
 * learning-journey progress card, a "Continue Learning" resume card, and the
 * "All Lessons" list; a center column with the hero heading, a "How to Move &
 * Capture" primer, a search bar, and the four topic cards; a right rail with
 * "What You'll Learn" and "Video Lessons".
 *
 * STALE-DATA RULE: we have no real per-user lesson progress yet, so ALL
 * progress is honest ZERO — 0 of 8 lessons done, 0% complete, 0 XP, rank
 * "Beginner", and every lesson badge in its "not started" state. The
 * "Continue Learning" card points at the FIRST lesson (an honest starting
 * point, not a fabricated resume). Lesson DEFINITIONS (titles, tags, topic
 * cards, video-lesson metadata) come straight from the prototype JS. The
 * interactive lesson player ships later, so every "start / open lesson"
 * control raises the standard coming-soon toast rather than deep-linking to a
 * screen that does not exist yet.
 */

// ── lesson definitions (from _lessonData() in the prototype JS) ──
type Lesson = { id: number; title: string; tag: string; color: string };
const LESSONS: Lesson[] = [
  { id: 0, title: "The Board & Setup", tag: "Basics", color: "#5a86e6" },
  { id: 1, title: "How Pieces Move", tag: "Movement", color: "#3fbf6f" },
  { id: 2, title: "Making a Capture", tag: "Capturing", color: "#E8B84B" },
  { id: 3, title: "Multiple Jumps", tag: "Capturing", color: "#d97a2e" },
  { id: 4, title: "Becoming a Dama", tag: "Promotion", color: "#b78bff" },
  { id: 5, title: "King (Dama) Movement", tag: "Promotion", color: "#8c5ad6" },
  { id: 6, title: "Winning the Game", tag: "Endgame", color: "#e05566" },
  { id: 7, title: "Strategy & Tactics", tag: "Mastery", color: "#3fb0bf" },
];

// ── honest zero progress (no real per-user data yet) ──
const DONE_COUNT = 0;
const LEARN_TOTAL = LESSONS.length;
const LEARN_PCT = Math.round((DONE_COUNT / LEARN_TOTAL) * 100); // 0
const LEARN_XP = DONE_COUNT * 50; // 0
const LEARN_RANK = "Beginner"; // doneCount < 3

// ── topic cards (from learnTopics) ──
type Topic = {
  title: string;
  desc: string;
  cta: string;
  icon: string;
  tint: string;
  border: string;
  btn: string;
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
  },
  {
    title: "Mandatory Capture",
    desc: "Understand capture rules, multiple jumps, and what is required.",
    cta: "Learn More",
    icon: "/assets/mc-ranked.png",
    tint: "rgba(90,28,38,.45)",
    border: "rgba(180,60,70,.5)",
    btn: "btn-red",
  },
  {
    title: "King (Dama) Movement",
    desc: "Unlock the power of the King. Move farther and control the board.",
    cta: "Learn More",
    icon: "/assets/me-crown.png",
    tint: "rgba(50,32,90,.45)",
    border: "rgba(140,90,210,.5)",
    btn: "btn-purple",
  },
  {
    title: "Strategy & Tactics",
    desc: "Discover openings, formations, and tactical ideas to win more games.",
    cta: "Explore Strategies",
    icon: "/assets/mc-training.png",
    tint: "rgba(24,64,44,.45)",
    border: "rgba(50,150,100,.5)",
    btn: "btn-green",
  },
];

const WHAT_YOULL_LEARN = [
  "Understand the rules of Filipino Dama",
  "Master captures and king movement",
  "Learn winning strategies and tactics",
  "Improve through practice and play",
  "Compete and climb the leaderboards",
];

type Video = { title: string; time: string; level: string; lc: string };
const VIDEO_LESSONS: Video[] = [
  { title: "Filipino Dama: Rules for Beginners", time: "6:45", level: "Beginner", lc: "#3fbf6f" },
  { title: "How to Capture Like a Pro", time: "8:12", level: "Intermediate", lc: "#E8B84B" },
  { title: "King Moves & Advanced Tactics", time: "10:21", level: "Advanced", lc: "#d63b52" },
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
  const showToast = useAppStore((s) => s.showToast);

  const startLearning = () => showToast("Interactive lessons arrive with online play.");

  return (
    <div
      data-screen-label="Learn"
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
      {/* ── LEFT RAIL ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
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
              <div style={{ font: "700 15px Cinzel,serif", color: "var(--gold-lt)" }}>{LEARN_RANK}</div>
              <div style={{ font: "500 12px Inter", color: "var(--ink)" }}>
                {DONE_COUNT} of {LEARN_TOTAL} lessons done
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
                width: `${LEARN_PCT}%`,
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
            {LEARN_PCT}% complete
          </div>
          <div
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
                {DONE_COUNT}
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
                {LEARN_PCT}%
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
                {LEARN_XP}
              </div>
              <div style={{ font: "500 10px Inter", color: "var(--ink2)" }}>XP</div>
            </div>
          </div>
        </div>

        {/* Continue Learning — honest first-lesson starting point */}
        <div className="frame" style={{ padding: 18 }}>
          <div className="ptitle" style={{ textAlign: "left", border: "none", marginBottom: 12 }}>
            Continue Learning
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ width: 60, height: 60, flex: "none" }}>
              <MiniBoard />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ font: "700 14px Inter", color: "var(--gold-lt)" }}>{LESSONS[0].title}</div>
              <div style={{ font: "500 11px Inter", color: "var(--ink2)", margin: "2px 0 6px" }}>
                Lesson 1 · {LESSONS[0].tag}
              </div>
              <div
                style={{
                  height: 6,
                  borderRadius: 100,
                  background: "rgba(0,0,0,.4)",
                  overflow: "hidden",
                }}
              >
                <div style={{ width: `${LEARN_PCT}%`, height: "100%", background: "#3fbf6f" }} />
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-purple"
            onClick={startLearning}
            style={{ width: "100%", marginTop: 14, padding: 11, fontSize: 12 }}
          >
            Start Learning
          </button>
        </div>

        {/* All Lessons */}
        <div className="frame" style={{ padding: 18 }}>
          <div className="ptitle">All Lessons</div>
          {LESSONS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={startLearning}
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
                    border: "1px solid rgba(232,184,75,.3)",
                    background: "rgba(0,0,0,.25)",
                    color: "var(--gold-lt)",
                  }}
                >
                  {l.id + 1}
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
                    Lesson {l.id + 1} · {l.tag}
                  </span>
                </span>
              </span>
              <span style={{ color: "var(--ink2)", flex: "none" }}>›</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── CENTER ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
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
              onFocus={() => showToast("Lesson search arrives with online play.")}
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
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
                className={`btn ${t.btn}`}
                onClick={startLearning}
                style={{ width: "100%", padding: 9, fontSize: 10 }}
              >
                {t.cta}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT RAIL ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
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
            <span
              onClick={() => showToast("Video lessons arrive with online play.")}
              style={{ font: "600 11px Inter", color: "var(--gold)", cursor: "pointer" }}
            >
              View All
            </span>
          </div>
          {VIDEO_LESSONS.map((v) => (
            <button
              key={v.title}
              type="button"
              onClick={() => showToast("Video lessons arrive with online play.")}
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
    </div>
  );
}

export default LearnPage;
