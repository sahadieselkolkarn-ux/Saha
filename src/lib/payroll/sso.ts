
"use client";

// Utility functions for Social Security Office (SSO) calculations.

/**
 * Rounds a number to a specified number of decimal places.
 * Default adjusted to 0 for Sahadiesel integer policy.
 */
export function round2(value: number, decimals: number = 0): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
}

/**
 * Clamps the base salary between a minimum and a maximum for SSO calculation.
 */
export function clampSsoBase(salaryMonthly: number, minBase: number, cap: number): number {
    return Math.max(minBase, Math.min(salaryMonthly, cap));
}

/**
 * Calculates the total monthly SSO deduction amount as an integer.
 */
export function calcSsoMonthly(
  salaryMonthly: number,
  percent: number,
  minBase: number,
  cap: number
): number {
  if (salaryMonthly <= 0 || percent <= 0) {
    return 0;
  }
  const base = clampSsoBase(salaryMonthly, minBase, cap);
  // Force integer rounding
  return Math.round(base * (percent / 100));
}

/**
 * Splits the total monthly SSO deduction into two halves for bi-monthly payroll.
 * Ensures result is integer.
 */
export function splitSsoHalf(ssoMonthly: number): { p1: number; p2: number } {
  const p1 = Math.round(ssoMonthly / 2);
  const p2 = Math.round(ssoMonthly - p1);
  return { p1, p2 };
}
