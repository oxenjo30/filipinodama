import type { DamathVariant } from "@dama/shared";

export type DamathLevel = "elementary" | "secondary";

export type DamathVariantInfo = {
  key: DamathVariant;
  level: DamathLevel;
  /** display name, e.g. "Whole Damath" */
  label: string;
  /** grade band, e.g. "Grades 3–4" */
  grade: string;
  /** the number system it teaches */
  system: string;
  /** MVP: only `whole` is playable; the rest are Coming Soon. */
  enabled: boolean;
};

/**
 * Damath variant registry (spec §2). Elementary/Secondary is a purely
 * organisational grouping — piece count is identical across all levels (24/12);
 * only the number system printed on the chips differs. MVP enables Whole only.
 */
export const DAMATH_VARIANTS: DamathVariantInfo[] = [
  { key: "counting", level: "elementary", label: "Counting Damath", grade: "Grades 1–2", system: "Counting numbers", enabled: true },
  { key: "whole", level: "elementary", label: "Whole Damath", grade: "Grades 3–4", system: "Whole numbers", enabled: true },
  { key: "fraction", level: "elementary", label: "Fraction Damath", grade: "Grades 5–6", system: "Positive fractions", enabled: true },
  { key: "integer", level: "secondary", label: "Integer Damath", grade: "Grade 7", system: "Integers (signed)", enabled: true },
  { key: "rational", level: "secondary", label: "Rational Damath", grade: "Grade 8", system: "Signed fractions", enabled: true },
  { key: "radical", level: "secondary", label: "Radical Damath", grade: "Grade 9", system: "Radicals", enabled: true },
  { key: "polynomial", level: "secondary", label: "Polynomial Damath", grade: "Fourth Year", system: "Polynomials", enabled: true },
  { key: "binary", level: "secondary", label: "Binary Damath", grade: "Senior High", system: "Binary numbers", enabled: true },
];

export const variantsFor = (level: DamathLevel) =>
  DAMATH_VARIANTS.filter((v) => v.level === level);

export const variantInfo = (key: DamathVariant) =>
  DAMATH_VARIANTS.find((v) => v.key === key);
