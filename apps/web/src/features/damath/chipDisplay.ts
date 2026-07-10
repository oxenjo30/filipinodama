import type { DamathExpr } from "@dama/shared";

const sup = (n: number) => (n === 1 ? "" : n === 2 ? "²" : n === 3 ? "³" : `^${n}`);

/** Render a chip's face text per variant: numbers, fractions, radicals,
 *  monomials, or binary. `value` is the canonical number; `expr` (when present)
 *  carries the symbolic form. */
export function formatChip(value: number, expr?: DamathExpr): string {
  if (!expr) return numStr(value);
  switch (expr.kind) {
    case "fraction":
      return expr.den === 1 ? `${expr.num}` : `${expr.num}/${expr.den}`;
    case "radical":
      return expr.radicand === 1 ? `${expr.coeff}` : expr.coeff === 0 ? "0" : `${expr.coeff}√${expr.radicand}`;
    case "polynomial": {
      const { coeff, ex, ey } = expr;
      if (ex === 0 && ey === 0) return `${coeff}`;
      const cx = ex ? `x${sup(ex)}` : "";
      const cy = ey ? `y${sup(ey)}` : "";
      const c = coeff === 1 ? "" : coeff === -1 ? "-" : `${coeff}`;
      return `${c}${cx}${cy}`;
    }
    case "binary":
      return toBinary(value);
  }
}

/** Round a numeric value for display (2dp, integers bare). */
function numStr(n: number): string {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
}

/** Signed binary string, e.g. 10 → "1010", -3 → "-11". */
function toBinary(n: number): string {
  if (n === 0) return "0";
  const neg = n < 0;
  const b = Math.abs(Math.trunc(n)).toString(2);
  return neg ? `-${b}` : b;
}
