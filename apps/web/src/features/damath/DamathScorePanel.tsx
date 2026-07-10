import type { DamathGameState, DamathPlayerId } from "@dama/shared";

/** Round for display only — the engine keeps exact floats (spec §5.3). */
const show = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
};

const SEAT = {
  red: { name: "Red", dot: "radial-gradient(circle at 35% 30%,#e0555f,#8f1b28)", ink: "#f8b6bd" },
  blue: { name: "Blue", dot: "radial-gradient(circle at 35% 30%,#5f97e6,#1f4a92)", ink: "#a9c7f5" },
} as const;

export type DamathScorePanelProps = {
  state: DamathGameState;
  /** names for each seat (Player 1 / Player 2, or human / AI) */
  redName: string;
  blueName: string;
  /** which seat is "you" — gets a "You" tag + emphasis (null in pass-and-play) */
  youAre?: DamathPlayerId | null;
};

/**
 * DamathScorePanel — the live scoreboard. Both totals always visible; the active
 * seat is emphasised; at game end the capture total and the remaining-chip bonus
 * are broken out (Captures + Chips on board = Final) so the win is legible and
 * teaches the end-of-game rule.
 */
export function DamathScorePanel({ state, redName, blueName, youAre = null }: DamathScorePanelProps) {
  const over = !!state.result;
  const names: Record<DamathPlayerId, string> = { red: redName, blue: blueName };

  // Pull the end-of-game bonus per side from the last history record, if present.
  const lastRec = state.history[state.history.length - 1];
  const bonusEvents = lastRec?.scoreEvents.filter((e) => e.kind === "end-of-game-chip-bonus") ?? [];
  const bonusFor = (p: DamathPlayerId) => bonusEvents.find((e) => e.player === p)?.points ?? 0;

  const rows: DamathPlayerId[] = ["red", "blue"];

  return (
    <div className="frame" style={{ padding: 16 }}>
      <div className="ptitle">Scoreboard</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((seat) => {
          const seatInfo = SEAT[seat];
          const active = !over && state.turn === seat;
          const finalScore = seat === "red" ? state.redScore : state.blueScore;
          const bonus = bonusFor(seat);
          const captures = finalScore - bonus;
          const isWinner = over && state.result?.winner === seat;
          return (
            <div
              key={seat}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: `1px solid ${active ? "rgba(245,215,131,.55)" : "rgba(232,184,75,.16)"}`,
                background: active ? "rgba(245,215,131,.08)" : "rgba(0,0,0,.25)",
                boxShadow: active ? "0 0 16px rgba(245,215,131,.14)" : "none",
                transition: "border-color .2s, background .2s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    background: seatInfo.dot,
                    boxShadow: "0 0 6px rgba(0,0,0,.4)",
                    flex: "none",
                  }}
                />
                <span style={{ font: "700 14px Cinzel,serif", color: seatInfo.ink, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {names[seat]}
                </span>
                {youAre === seat && (
                  <span
                    style={{
                      font: "700 9px Inter",
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      color: "var(--gold-lt)",
                      background: "rgba(232,184,75,.15)",
                      padding: "2px 7px",
                      borderRadius: 100,
                    }}
                  >
                    You
                  </span>
                )}
                {isWinner && <span style={{ marginLeft: 2 }}>👑</span>}
                <span
                  style={{
                    marginLeft: "auto",
                    font: "800 22px 'JetBrains Mono',monospace",
                    color: active || isWinner ? "var(--gold-lt)" : "var(--ink)",
                  }}
                >
                  {show(finalScore)}
                </span>
              </div>
              {/* end-of-game breakdown: Captures + Chips = Final */}
              {over && (
                <div
                  style={{
                    marginTop: 6,
                    font: "600 11px 'JetBrains Mono',monospace",
                    color: "var(--ink2)",
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 4,
                  }}
                >
                  <span>{show(captures)} captures</span>
                  <span>+</span>
                  <span style={{ color: "#8ce0ad" }}>{show(bonus)} chips</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!over && (
        <div style={{ marginTop: 10, textAlign: "center", font: "500 11px Inter", color: "var(--ink2)" }}>
          Highest total wins. Captures score by the landing operator.
        </div>
      )}
    </div>
  );
}

export default DamathScorePanel;
