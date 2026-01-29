
"use client";

// Utility functions for Social Security Office (SSO) calculations.

/**
 * Rounds a number to a specified number of decimal places.
 * @param value The number to round.
 * @param decimals The number of decimal places to round to.
 * @returns The rounded number.
 */
export function round2(value: number, decimals: number = 2): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
}

/**
 * Clamps the base salary between a minimum and a maximum for SSO calculation.
 * @param salaryMonthly The employee's monthly salary.
 * @param minBase The minimum salary base for SSO calculation.
 * @param cap The maximum salary base (cap) for SSO calculation.
 * @returns The clamped base salary.
 */
export function clampSsoBase(salaryMonthly: number, minBase: number, cap: number): number {
    return Math.max(minBase, Math.min(salaryMonthly, cap));
}

/**
 * Calculates the total monthly SSO deduction amount.
 * @param salaryMonthly The employee's monthly salary.
 * @param percent The SSO deduction percentage for the employee.
 * @param minBase The minimum salary base for SSO calculation.
 * @param cap The maximum salary base (cap) for SSO calculation.
 * @returns The total monthly SSO deduction amount.
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
  return round2(base * (percent / 100));
}

/**
 * Splits the total monthly SSO deduction into two halves for bi-monthly payroll.
 * Handles rounding to ensure the sum of both halves equals the total.
 * @param ssoMonthly The total monthly SSO deduction.
 * @returns An object with the deduction amount for period 1 (p1) and period 2 (p2).
 */
export function splitSsoHalf(ssoMonthly: number): { p1: number; p2: number } {
  const p1 = round2(ssoMonthly / 2);
  const p2 = round2(ssoMonthly - p1);
  return { p1, p2 };
}

    