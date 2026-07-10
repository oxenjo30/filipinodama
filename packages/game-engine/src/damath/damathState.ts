import type {
  DamathGameState,
  DamathRuleOptions,
  DamathVariant,
} from "@dama/shared";
import { createDamathPieces } from "./damathPieces.js";
import { DAMATH_RULE_OPTIONS } from "./damathRules.js";

/**
 * Build the initial Damath state for a variant. Red moves first (matching
 * Classic's seat convention). Per-player game clocks are seeded from the rule
 * options' `gameClockSec` (stored in ms). (Spec §5.4, §5.5.)
 */
export function createInitialDamathState(
  variant: DamathVariant,
  id = "local",
  options: DamathRuleOptions = DAMATH_RULE_OPTIONS,
): DamathGameState {
  const clockMs = options.gameClockSec * 1000;
  return {
    id,
    variant,
    pieces: createDamathPieces(variant),
    turn: "red",
    moveNumber: 1,
    redScore: 0,
    blueScore: 0,
    history: [],
    options,
    clocks: { red: clockMs, blue: clockMs },
  };
}
