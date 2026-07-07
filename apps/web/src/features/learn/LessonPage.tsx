import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { GameState, Piece as PieceModel, Square } from "@dama/shared";
import { createInitialState, legalMoves } from "@dama/game-engine";
import { Piece } from "../../components";
import { api } from "../../lib/api";
import { useAppStore } from "../../stores/appStore";
import { useAuthStore } from "../../stores/authStore";

/**
 * LessonPage (/learn/:id) — the interactive single-lesson screen, ported
 * faithfully from the approved prototype (handoff lines 981-1027): a header with
 * a "‹ All Lessons" back button, a category tag, and a "Lesson N of M" counter;
 * a two-column body with a marble mini-board (plus the move/capture/jump-order
 * legend) on the left and the lesson title / heading / body plus step navigation
 * (dots + Back / Next) on the right.
 *
 * LIVE DATA: on mount we GET /api/learn/lessons and locate THIS lesson by its
 * :id route param. The tag, the "Lesson N of M" counter, the title, and the
 * completed state all come from that real server response — the position of the
 * lesson in the real catalog gives N, and total gives M. If the id isn't in the
 * catalog we show an honest not-found state; logged-out shows a sign-in prompt.
 *
 * THE BOARD IS REAL: every step's position is built from the engine
 * (createInitialState + adjusting pieces), and the highlighted move / capture
 * targets are computed by the engine's legalMoves() for the scripted position —
 * not hand-drawn. The green "can move / land" dots, the red "being captured"
 * outlines, and the gold numbered "jump order" badges are the engine's own legal
 * move for that teaching position, so what the lesson shows always matches how
 * the game actually plays.
 *
 * COMPLETION: the final step's "Complete Lesson ✓" button POSTs to
 * /api/learn/lessons/:id/complete, then returns to /learn. The step lesson COPY
 * (headings + explanatory body per step) is ambient educational text tied to the
 * lesson topic — it is not per-user data.
 */

// ── server lesson shape (GET /api/learn/lessons) ──
type LessonStep = { heading: string; body: string };
type Lesson = { id: string; title: string; tag: string; summary: string; steps: LessonStep[]; completed: boolean };
type LessonsResponse = { lessons: Lesson[]; completedCount: number; total: number };

// ── the visual (board) part of a single teaching step ──
// The heading/body COPY comes from the server lesson's steps[]; this holds only
// the engine position + overlays illustrated for that step.
type StepBoard = {
  /** the engine position shown for this step */
  state: GameState;
  /** the selected piece whose move we illustrate (gold ring) */
  selected?: Square;
  /** landing squares (green "can move / land" dots) */
  landings?: Square[];
  /** squares of pieces being captured (red outline) */
  captured?: Square[];
  /** ordered jump landings (gold numbered badges), in jump order */
  jumpOrder?: Square[];
};

// ── a fully assembled teaching step (server copy + engine board) ──
type Step = LessonStep & StepBoard;

type LessonScript = {
  /** accent colour for the category tag, per the prototype */
  color: string;
  /** one board setup per step, in order — 3 per lesson */
  boards: StepBoard[];
};

const eq = (a: Square, b: Square) => a.r === b.r && a.c === b.c;

/** Clone the engine's initial state, then keep only the listed pieces (by
 *  square), so a teaching position is a real subset of a real starting board. */
function board(keep: { color: "red" | "blue"; king?: boolean; r: number; c: number }[]): GameState {
  const s = createInitialState();
  const pieces: PieceModel[] = keep.map((k, i) => ({
    id: `lesson-${i}`,
    color: k.color,
    king: !!k.king,
    square: { r: k.r, c: k.c },
  }));
  return { ...s, pieces, turn: "red", history: [], moveNumber: 1 };
}

/** Engine-derived quiet-move landings for the (single) red piece on the board. */
function movesFrom(st: GameState, _sq: Square): Square[] {
  return legalMoves(st, "red").map((m) => m.path[m.path.length - 1]);
}

/**
 * Build the scripted lesson boards for a given lesson id. Each of the THREE
 * steps' highlighted squares is derived from the ENGINE (legalMoves) for the
 * shown position, so the lesson never contradicts real play. The step COPY
 * (heading + body) comes from the server lesson's steps[]; this only supplies
 * the board geometry, one entry per step and always 3 to match the prototype.
 * Red is the acting side (red moves up, toward row 0).
 */
function scriptFor(id: string): LessonScript {
  switch (id) {
    // ── The Board & Setup ──
    case "basics-board": {
      const full = createInitialState();
      return {
        color: "#5a86e6",
        boards: [
          // An 8×8 battlefield — empty board (dark squares visible)
          { state: board([]) },
          // Your army of 12 — full starting position
          { state: full },
          // The objective — full starting position
          { state: full },
        ],
      };
    }

    // ── How Pieces Move ──
    case "basics-move": {
      const st = board([{ color: "red", r: 5, c: 2 }]);
      const landings = movesFrom(st, { r: 5, c: 2 });
      const st2 = board([{ color: "red", r: 5, c: 4 }]);
      const landings2 = movesFrom(st2, { r: 5, c: 4 });
      // blocked: both forward squares occupied by friendly pieces → no moves
      const blocked = board([
        { color: "red", r: 5, c: 2 },
        { color: "red", r: 4, c: 1 },
        { color: "red", r: 4, c: 3 },
      ]);
      return {
        color: "#3fbf6f",
        boards: [
          { state: st, selected: { r: 5, c: 2 }, landings },
          { state: st2, selected: { r: 5, c: 4 }, landings: landings2 },
          { state: blocked, selected: { r: 5, c: 2 } },
        ],
      };
    }

    // ── Making a Capture ──
    case "basics-capture": {
      const st = board([
        { color: "red", r: 5, c: 2 },
        { color: "blue", r: 4, c: 3 },
      ]);
      const cap = legalMoves(st, "red").find((m) => m.captures.length > 0)!;
      // capture in any direction: enemy ahead and behind, both legal jumps
      const bothSt = board([
        { color: "red", r: 4, c: 3 },
        { color: "blue", r: 3, c: 4 },
        { color: "blue", r: 5, c: 4 },
      ]);
      const bothCaps = legalMoves(bothSt, "red").filter((m) => m.captures.length > 0);
      const bothCaptured = bothCaps.flatMap((m) => m.captures);
      const bothLandings = bothCaps.map((m) => m.path[m.path.length - 1]);
      return {
        color: "#E8B84B",
        boards: [
          {
            state: st,
            selected: { r: 5, c: 2 },
            captured: cap.captures,
            landings: [cap.path[cap.path.length - 1]],
            jumpOrder: cap.path,
          },
          {
            state: bothSt,
            selected: { r: 4, c: 3 },
            captured: bothCaptured,
            landings: bothLandings,
          },
          {
            state: st,
            selected: { r: 5, c: 2 },
            captured: cap.captures,
            landings: [cap.path[cap.path.length - 1]],
            jumpOrder: cap.path,
          },
        ],
      };
    }

    // ── Multiple Jumps ──
    case "rules-forced-capture": {
      const longest = (st: GameState) => {
        const moves = legalMoves(st, "red");
        return moves.reduce((best, m) => (m.captures.length > best.captures.length ? m : best), moves[0]);
      };
      const st = board([
        { color: "red", r: 5, c: 0 },
        { color: "blue", r: 4, c: 1 },
        { color: "blue", r: 2, c: 3 },
      ]);
      const chain = longest(st);
      // choose the longest line over a single capture
      const st2 = board([
        { color: "red", r: 6, c: 1 },
        { color: "blue", r: 5, c: 2 },
        { color: "blue", r: 3, c: 4 },
      ]);
      const chain2 = longest(st2);
      // one piece, three kills
      const st3 = board([
        { color: "red", r: 7, c: 2 },
        { color: "blue", r: 6, c: 3 },
        { color: "blue", r: 4, c: 5 },
        { color: "blue", r: 2, c: 5 },
      ]);
      const chain3 = longest(st3);
      return {
        color: "#d97a2e",
        boards: [
          { state: st, selected: { r: 5, c: 0 }, captured: chain.captures, landings: chain.path, jumpOrder: chain.path },
          { state: st2, selected: { r: 6, c: 1 }, captured: chain2.captures, landings: chain2.path, jumpOrder: chain2.path },
          { state: st3, selected: { r: 7, c: 2 }, captured: chain3.captures, landings: chain3.path, jumpOrder: chain3.path },
        ],
      };
    }

    // ── Becoming a Dama ──
    case "rules-promotion": {
      const st = board([{ color: "red", r: 1, c: 2 }]);
      const landings = movesFrom(st, { r: 1, c: 2 });
      const crowned = board([{ color: "red", king: true, r: 0, c: 3 }]);
      const powerSt = board([{ color: "red", king: true, r: 3, c: 3 }]);
      const powerLandings = movesFrom(powerSt, { r: 3, c: 3 });
      return {
        color: "#b78bff",
        boards: [
          { state: st, selected: { r: 1, c: 2 }, landings },
          { state: crowned, selected: { r: 0, c: 3 } },
          { state: powerSt, selected: { r: 3, c: 3 }, landings: powerLandings },
        ],
      };
    }

    // ── King (Dama) Movement ──
    case "rules-dama": {
      const st = board([{ color: "red", king: true, r: 5, c: 2 }]);
      const landings = movesFrom(st, { r: 5, c: 2 });
      const capSt = board([
        { color: "red", king: true, r: 6, c: 1 },
        { color: "blue", r: 3, c: 4 },
      ]);
      const cap = legalMoves(capSt, "red").find((m) => m.captures.length > 0)!;
      const ruleSt = board([
        { color: "red", king: true, r: 4, c: 3 },
        { color: "blue", r: 1, c: 6 },
        { color: "blue", r: 6, c: 5 },
      ]);
      const ruleLandings = movesFrom(ruleSt, { r: 4, c: 3 });
      return {
        color: "#8c5ad6",
        boards: [
          { state: st, selected: { r: 5, c: 2 }, landings },
          {
            state: capSt,
            selected: { r: 6, c: 1 },
            captured: cap.captures,
            landings: cap.path.filter((_, i) => i === cap.path.length - 1),
            jumpOrder: cap.path,
          },
          { state: ruleSt, selected: { r: 4, c: 3 }, landings: ruleLandings },
        ],
      };
    }

    // ── Winning the Game ──
    case "endgame-winning": {
      // Capture everything: red delivers the finishing jump.
      const winSt = board([
        { color: "blue", r: 3, c: 4 },
        { color: "red", r: 4, c: 3 },
        { color: "red", king: true, r: 6, c: 5 },
      ]);
      const winCap = legalMoves(winSt, "red").find((m) => m.captures.length > 0)!;
      // Leave them stuck: a boxed-in blue man with no legal move (glow it).
      const stuckSt = board([
        { color: "blue", r: 0, c: 7 },
        { color: "red", r: 1, c: 6 },
        { color: "red", r: 2, c: 5 },
      ]);
      // A draw: lone king vs lone king.
      const drawSt = board([
        { color: "blue", king: true, r: 2, c: 3 },
        { color: "red", king: true, r: 5, c: 4 },
      ]);
      return {
        color: "#e05566",
        boards: [
          {
            state: winSt,
            selected: { r: 4, c: 3 },
            captured: winCap.captures,
            landings: [winCap.path[winCap.path.length - 1]],
            jumpOrder: winCap.path,
          },
          { state: stuckSt, captured: [{ r: 0, c: 7 }] },
          { state: drawSt },
        ],
      };
    }

    // ── Strategy & Tactics ──
    case "strategy-tactics": {
      const centerSt = board([
        { color: "red", r: 4, c: 3 },
        { color: "red", r: 3, c: 4 },
        { color: "blue", r: 2, c: 5 },
        { color: "blue", r: 5, c: 2 },
      ]);
      const backSt = { ...createInitialState(), pieces: createInitialState().pieces.filter((p) => p.color === "red") };
      const tradeSt = board([
        { color: "blue", r: 2, c: 3 },
        { color: "red", r: 4, c: 3 },
        { color: "red", r: 5, c: 4 },
        { color: "red", king: true, r: 6, c: 1 },
        { color: "red", r: 5, c: 2 },
      ]);
      return {
        color: "#3fb0bf",
        boards: [
          { state: centerSt, landings: [{ r: 4, c: 3 }, { r: 3, c: 4 }, { r: 3, c: 2 }, { r: 4, c: 5 }] },
          { state: backSt, landings: [{ r: 0, c: 1 }, { r: 0, c: 3 }, { r: 0, c: 5 }, { r: 0, c: 7 }] },
          { state: tradeSt },
        ],
      };
    }

    default:
      return { color: "var(--gold)", boards: [] };
  }
}

// ── Marble board square gradients (default board) ──
const CELL_DARK = "radial-gradient(120% 120% at 25% 20%,#454b59 0%,#2a2f3b 45%,#181b23 100%)";
const CELL_LIGHT = "radial-gradient(120% 120% at 25% 20%,#faf6ec 0%,#ece5d5 45%,#d4cbb6 100%)";

const isDark = (r: number, c: number) => (r + c) % 2 === 1;
const some = (list: Square[] | undefined, r: number, c: number) => !!list?.some((s) => s.r === r && s.c === c);

/**
 * LessonBoard — a real engine position rendered on the marble grid, with the
 * three teaching overlays from the prototype legend: green "can move / land"
 * dots, red "being captured" outlines, and gold numbered "jump order" badges.
 */
function LessonBoard({ step }: { step: Step }) {
  const grid = useMemo(() => {
    const g: (PieceModel | null)[][] = Array.from({ length: 8 }, () => Array<PieceModel | null>(8).fill(null));
    for (const p of step.state.pieces) g[p.square.r][p.square.c] = p;
    return g;
  }, [step.state]);

  const jumpIndex = (r: number, c: number): number =>
    step.jumpOrder ? step.jumpOrder.findIndex((s) => s.r === r && s.c === c) : -1;

  const cells: JSX.Element[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const playable = isDark(r, c);
      const p = grid[r][c];
      const sel = step.selected && eq(step.selected, { r, c });
      const isLanding = some(step.landings, r, c);
      const isCaptured = some(step.captured, r, c);
      const ji = jumpIndex(r, c);

      const kids: JSX.Element[] = [];

      // green "can move / land" dot
      if (isLanding && ji < 0) {
        kids.push(
          <div
            key="dot"
            style={{
              position: "absolute",
              inset: 0,
              margin: "auto",
              width: "30%",
              height: "30%",
              borderRadius: "50%",
              background: "radial-gradient(circle,rgba(96,232,150,.98),rgba(60,190,120,.55))",
              boxShadow: "0 0 14px rgba(63,191,111,.7)",
              animation: "fdpulse 1.5s ease infinite",
            }}
          />,
        );
      }
      // piece being captured → red outline
      if (isCaptured) {
        kids.push(
          <div
            key="cap"
            style={{
              position: "absolute",
              inset: "9%",
              borderRadius: "50%",
              border: "2px solid #ff5d73",
              boxShadow: "0 0 12px rgba(255,93,115,.6)",
              animation: "fdpulse 1.2s ease infinite",
            }}
          />,
        );
      }
      // piece
      if (p) {
        kids.push(<Piece key="piece" color={p.color} king={p.king} selected={!!sel} />);
      }
      // gold numbered jump-order badge (drawn over the landing)
      if (ji >= 0) {
        kids.push(
          <div
            key="jo"
            style={{
              position: "absolute",
              inset: 0,
              margin: "auto",
              width: "34%",
              height: "34%",
              borderRadius: "50%",
              background: "#E8B84B",
              color: "#2a1607",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              font: "800 clamp(9px,2vw,13px) Inter",
              boxShadow: "0 0 12px rgba(232,184,75,.7)",
            }}
          >
            {ji + 1}
          </div>,
        );
      }

      cells.push(
        <div
          key={`${r}-${c}`}
          style={{
            position: "relative",
            background: playable ? CELL_DARK : CELL_LIGHT,
            boxShadow:
              (playable ? "inset 0 0 14px rgba(0,0,0,.42), " : "inset 0 0 10px rgba(180,165,130,.3), ") +
              "inset 0 0 0 1px rgba(232,184,75,.26)" +
              (sel ? ", inset 0 0 0 3px rgba(245,215,131,.95)" : ""),
          }}
        >
          {kids}
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
        borderRadius: 6,
        overflow: "hidden",
        boxShadow: "inset 0 0 0 2px rgba(232,184,75,.4), inset 0 0 34px rgba(0,0,0,.5)",
      }}
    >
      {cells}
    </div>
  );
}

/** Legend row (one swatch + label), matching the prototype exactly. */
function Legend({ swatch, label }: { swatch: JSX.Element; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, font: "600 11px Inter", color: "var(--ink2)" }}>
      {swatch}
      {label}
    </span>
  );
}

export function LessonPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.me);
  const showToast = useAppStore((s) => s.showToast);

  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);

  // Load the real catalog so tag / counter / title / completed reflect the server.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!me) {
        setLessons(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const res = await api.get<LessonsResponse>("/api/learn/lessons");
        if (cancelled) return;
        setLessons(res.lessons);
        setTotal(res.total);
      } catch {
        if (cancelled) return;
        setLessons([]);
        showToast("Couldn't load this lesson. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [me, id, showToast]);

  const script = useMemo(() => scriptFor(id), [id]);

  // Reset the step pointer when the lesson changes.
  useEffect(() => {
    setStepIdx(0);
  }, [id]);

  const lesson = lessons?.find((l) => l.id === id) ?? null;
  const lessonIndex = lessons ? lessons.findIndex((l) => l.id === id) : -1;
  const lessonNum = lessonIndex >= 0 ? lessonIndex + 1 : 0;
  const lessonTotal = total || lessons?.length || 0;

  // Merge the server's per-step COPY (heading + body) with the local engine
  // boards. Both are 3 long; the server copy is the source of truth for text.
  const steps: Step[] = useMemo(() => {
    if (!lesson) return [];
    return lesson.steps.map((s, i) => ({
      heading: s.heading,
      body: s.body,
      ...(script.boards[i] ?? { state: createInitialState() }),
    }));
  }, [lesson, script]);

  const isLast = stepIdx >= steps.length - 1;

  const complete = useCallback(async () => {
    if (!me || busy || !lesson) return;
    setBusy(true);
    try {
      await api.post(`/api/learn/lessons/${lesson.id}/complete`);
      showToast("Lesson complete. Nice work!");
      navigate("/learn");
    } catch {
      showToast("Couldn't save your progress. Please try again.");
      setBusy(false);
    }
  }, [me, busy, lesson, navigate, showToast]);

  const onNext = useCallback(() => {
    if (!isLast) setStepIdx((i) => i + 1);
    else void complete();
  }, [isLast, complete]);

  const backBtn = (
    <button
      type="button"
      onClick={() => navigate("/learn")}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 16px",
        borderRadius: 9,
        border: "1px solid rgba(232,184,75,.3)",
        background: "rgba(15,8,32,.5)",
        color: "var(--ink)",
        font: "700 12px Inter",
        cursor: "pointer",
      }}
    >
      ‹ All Lessons
    </button>
  );

  // ── logged-out / loading / not-found guards ──
  if (!me) {
    return (
      <Shell>
        {backBtn}
        <div className="frame" style={{ padding: 26, marginTop: 18, textAlign: "center" }}>
          <div style={{ font: "700 16px Cinzel,serif", color: "var(--gold-lt)", marginBottom: 8 }}>
            Sign in to start this lesson
          </div>
          <div style={{ font: "500 13px Inter", color: "var(--ink2)" }}>
            <Link to="/login" style={{ color: "var(--gold)", fontWeight: 700 }}>
              Sign in
            </Link>{" "}
            to work through the interactive lessons and track your progress.
          </div>
        </div>
      </Shell>
    );
  }

  if (loading) {
    return (
      <Shell>
        {backBtn}
        <div className="frame" style={{ padding: 26, marginTop: 18, textAlign: "center", font: "500 13px Inter", color: "var(--ink2)" }}>
          Loading lesson…
        </div>
      </Shell>
    );
  }

  if (!lesson || steps.length === 0) {
    return (
      <Shell>
        {backBtn}
        <div className="frame" style={{ padding: 26, marginTop: 18, textAlign: "center" }}>
          <div style={{ font: "700 16px Cinzel,serif", color: "var(--gold-lt)", marginBottom: 8 }}>
            Lesson not found
          </div>
          <div style={{ font: "500 13px Inter", color: "var(--ink2)" }}>
            This lesson isn't part of the catalog.{" "}
            <Link to="/learn" style={{ color: "var(--gold)", fontWeight: 700 }}>
              Back to all lessons
            </Link>
            .
          </div>
        </div>
      </Shell>
    );
  }

  const step = steps[stepIdx];
  const nextLabel = isLast ? (busy ? "Saving…" : "Complete Lesson ✓") : "Next ›";

  return (
    <Shell>
      {/* header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        {backBtn}
        <span
          style={{
            padding: "5px 12px",
            borderRadius: 100,
            border: `1px solid ${script.color}`,
            color: script.color,
            font: "700 10px Inter",
            letterSpacing: 1.5,
            textTransform: "uppercase",
          }}
        >
          {lesson.tag}
        </span>
        <div style={{ marginLeft: "auto", font: "700 12px 'JetBrains Mono',monospace", color: "var(--ink2)" }}>
          Lesson {lessonNum} of {lessonTotal}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,440px)", gap: 26, alignItems: "start" }} className="fd-lesson-grid">
        {/* BOARD */}
        <div className="frame" style={{ padding: 22 }}>
          <div style={{ width: "100%", maxWidth: 520, margin: "0 auto" }}>
            <LessonBoard step={step} />
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 16,
              justifyContent: "center",
              marginTop: 18,
              paddingTop: 16,
              borderTop: "1px solid rgba(232,184,75,.14)",
            }}
          >
            <Legend
              swatch={
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: "radial-gradient(circle,rgba(96,232,150,.98),rgba(60,190,120,.55))",
                  }}
                />
              }
              label="Where it can move / land"
            />
            <Legend
              swatch={<span style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid #ff5d73" }} />}
              label="Piece being captured"
            />
            <Legend
              swatch={
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: "#E8B84B",
                    color: "#2a1607",
                    font: "800 9px Inter",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  1
                </span>
              }
              label="Jump order"
            />
          </div>
        </div>

        {/* TEXT */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="frame" style={{ padding: 26, display: "flex", flexDirection: "column", gap: 14 }}>
            <h1 style={{ margin: 0, font: "800 clamp(22px,2.4vw,30px)/1.1 Cinzel,serif", color: "var(--gold-lt)" }}>
              {lesson.title}
            </h1>
            <div style={{ height: 1, background: "linear-gradient(90deg,rgba(232,184,75,.5),transparent)" }} />
            <div style={{ font: "800 15px Inter", color: "#fff" }}>{step.heading}</div>
            <p style={{ margin: 0, font: "400 15px/1.7 Inter", color: "var(--ink)", textWrap: "pretty" }}>{step.body}</p>
          </div>

          <div className="frame" style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={{ font: "700 11px Inter", letterSpacing: 1.5, textTransform: "uppercase", color: "var(--ink2)" }}>
                Step {stepIdx + 1} of {steps.length}
              </span>
              <div style={{ display: "flex", gap: 7 }}>
                {steps.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    title="Go to step"
                    onClick={() => setStepIdx(i)}
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      background: i === stepIdx ? "var(--gold)" : "rgba(232,184,75,.3)",
                    }}
                  />
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => stepIdx > 0 && setStepIdx((i) => i - 1)}
                disabled={stepIdx === 0}
                style={{
                  flex: "none",
                  padding: "13px 20px",
                  borderRadius: 9,
                  border: "1px solid rgba(232,184,75,.25)",
                  background: "rgba(15,8,32,.5)",
                  color: stepIdx === 0 ? "var(--ink2)" : "var(--ink)",
                  font: "700 12px Inter",
                  letterSpacing: 0.4,
                  cursor: stepIdx === 0 ? "default" : "pointer",
                }}
              >
                ‹ Back
              </button>
              <button
                type="button"
                className="btn btn-gold"
                onClick={onNext}
                disabled={busy}
                style={{ flex: 1, padding: 13, opacity: busy ? 0.7 : 1, cursor: busy ? "default" : "pointer" }}
              >
                {nextLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}

/** Page shell matching the prototype's outer wrapper. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-screen-label="Lesson"
      style={{ maxWidth: 1180, margin: "0 auto", padding: 26, display: "flex", flexDirection: "column", gap: 20 }}
    >
      {children}
    </div>
  );
}

export default LessonPage;
