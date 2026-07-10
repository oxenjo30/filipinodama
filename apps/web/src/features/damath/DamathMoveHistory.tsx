import type { DamathGameState, DamathMoveRecord, DamathPlayerId } from "@dama/shared";

const SEAT_DOT: Record<DamathPlayerId, string> = {
  red: "var(--red)",
  blue: "var(--blue)",
};

/**
 * DamathMoveHistory — the jump-by-jump formula log. Every capture shows the exact
 * operation the landing operator produced (e.g. "Red: 7 × 3 = 21"), so the score
 * is never a mystery. This is the mode's teaching surface; nothing here computes
 * scores — it only renders the engine's own score events.
 */
export function DamathMoveHistory({ state }: { state: DamathGameState }) {
  // flatten every capture score-event across the game, newest last.
  const lines: { player: DamathPlayerId; formula: string; note?: string }[] = [];
  for (const rec of state.history as DamathMoveRecord[]) {
    for (const ev of rec.scoreEvents) {
      if (ev.kind !== "capture") continue;
      lines.push(ev.note ? { player: ev.player, formula: ev.formula, note: ev.note } : { player: ev.player, formula: ev.formula });
    }
  }

  return (
    <div className="frame" style={{ padding: 16 }}>
      <div className="ptitle">Scoring Log</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflowY: "auto" }}>
        {lines.length === 0 ? (
          <div style={{ font: "500 12px Inter", color: "var(--ink2)", textAlign: "center", padding: "18px 0" }}>
            No captures yet. Points are scored when you capture — the landing
            square's operator decides the sum.
          </div>
        ) : (
          lines.map((l, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 9px",
                borderRadius: 6,
                background: i % 2 === 0 ? "rgba(232,184,75,.06)" : "rgba(0,0,0,.25)",
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: SEAT_DOT[l.player], flex: "none" }} />
              <span style={{ font: "600 12px 'JetBrains Mono',monospace", color: "var(--ink)" }}>
                {l.formula}
              </span>
              {l.note && (
                <span
                  title="Division by zero scored 0 (safe rule)"
                  style={{ marginLeft: "auto", fontSize: 11, color: "#f0c26b", flex: "none" }}
                >
                  ÷0
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default DamathMoveHistory;
