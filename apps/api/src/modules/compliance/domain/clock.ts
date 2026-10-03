// ============================================================================
// CAR HIRE OS — COMPLIANCE DOMAIN CLOCK & TIME BOUNDARY UTILITIES (DEV-009)
// Deterministic Time Engine & Legal Expiry Mathematics
// ============================================================================

import type { ComplianceRecordStatus } from "@carhire/types";

export interface IClock {
  now(): Date;
  nowIso(): string;
  todayDateString(): string;
}

export class SystemClock implements IClock {
  now(): Date {
    return new Date();
  }

  nowIso(): string {
    return new Date().toISOString();
  }

  todayDateString(): string {
    return new Date().toISOString().split("T")[0];
  }
}

export class TestClock implements IClock {
  private currentTime: Date;

  constructor(initialTime: Date | string = new Date()) {
    this.currentTime = typeof initialTime === "string" ? new Date(initialTime) : initialTime;
  }

  setNow(time: Date | string): void {
    this.currentTime = typeof time === "string" ? new Date(time) : time;
  }

  advanceByDays(days: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + days * 86400000);
  }

  advanceByHours(hours: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + hours * 3600000);
  }

  now(): Date {
    return new Date(this.currentTime.getTime());
  }

  nowIso(): string {
    return this.currentTime.toISOString();
  }

  todayDateString(): string {
    return this.currentTime.toISOString().split("T")[0];
  }
}

/**
 * Normalizes a date string to ensure legal date-only boundaries are properly evaluated.
 * A document expiring on "2026-12-31" is valid through 23:59:59.999 UTC of that calendar day.
 */
export function normalizeExpiryBoundary(dateStr: string): Date {
  if (!dateStr) {
    throw new Error("Date string is required for expiry normalization");
  }

  // If already contains a time component (e.g. 'T' or ' '), parse directly
  if (dateStr.includes("T")) {
    const parsed = new Date(dateStr);
    if (isNaN(parsed.getTime())) throw new Error(`Invalid date format: ${dateStr}`);
    return parsed;
  }

  // Pure date-only string (e.g. YYYY-MM-DD): End of day 23:59:59.999Z
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const eod = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
    if (isNaN(eod.getTime())) throw new Error(`Invalid date format: ${dateStr}`);
    return eod;
  }

  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) throw new Error(`Invalid date format: ${dateStr}`);
  return parsed;
}

/**
 * Normalizes a start / validFrom boundary.
 * If date-only string, defaults to start of that calendar day: 00:00:00.000Z.
 */
export function normalizeStartBoundary(dateStr: string): Date {
  if (!dateStr) {
    throw new Error("Date string is required for start date normalization");
  }

  if (dateStr.includes("T")) {
    const parsed = new Date(dateStr);
    if (isNaN(parsed.getTime())) throw new Error(`Invalid date format: ${dateStr}`);
    return parsed;
  }

  const parts = dateStr.split("-");
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const sod = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    if (isNaN(sod.getTime())) throw new Error(`Invalid date format: ${dateStr}`);
    return sod;
  }

  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) throw new Error(`Invalid date format: ${dateStr}`);
  return parsed;
}

/**
 * Calculates days remaining from reference time until normalized expiry boundary.
 */
export function calculateDaysRemaining(expiresAtStr: string, asOfTime: Date): number {
  const expiry = normalizeExpiryBoundary(expiresAtStr);
  const diffMs = expiry.getTime() - asOfTime.getTime();
  return Math.floor(diffMs / 86400000);
}

/**
 * Determines dynamic validity status based on expiration threshold.
 */
export function evaluateExpiryState(
  expiresAtStr: string,
  warningThresholdDays: number,
  asOfTime: Date
): ComplianceRecordStatus {
  const expiry = normalizeExpiryBoundary(expiresAtStr);
  const asOf = asOfTime.getTime();

  if (asOf > expiry.getTime()) {
    return "EXPIRED";
  }

  const warningTime = expiry.getTime() - warningThresholdDays * 86400000;
  if (asOf >= warningTime) {
    return "DUE_SOON";
  }

  return "VALID";
}
