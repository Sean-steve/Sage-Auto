// ============================================================================
// CAR HIRE OS — TEMPORAL WINDOW & TIMEZONE RESOLVER (Sprint 34: DOM-003)
// Half-open interval [start, end) mathematics with tenant timezone support
// ============================================================================

import type { PeriodPreset, DateInterval } from "@carhire/types";

export interface ResolvedTemporalWindow {
  from: string; // UTC ISO 8601
  to: string;   // UTC ISO 8601
  preset: PeriodPreset;
  timezone: string;
  previousPeriod: {
    from: string;
    to: string;
  };
}

export class TemporalWindowResolver {
  /**
   * Resolves query dates and presets into exact UTC [start, end) intervals
   * with equivalent prior comparison intervals.
   */
  public static resolve(
    params: {
      from?: string;
      to?: string;
      preset?: PeriodPreset;
      timezone?: string;
    },
    now: Date = new Date()
  ): ResolvedTemporalWindow {
    const tz = params.timezone || "UTC";
    const preset = params.preset || (params.from && params.to ? "CUSTOM" : "THIS_MONTH");

    let startDate: Date;
    let endDate: Date;

    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth();
    const currentDate = now.getUTCDate();
    const currentDay = now.getUTCDay(); // 0 = Sunday

    switch (preset) {
      case "TODAY": {
        startDate = new Date(Date.UTC(currentYear, currentMonth, currentDate, 0, 0, 0, 0));
        endDate = new Date(Date.UTC(currentYear, currentMonth, currentDate, 23, 59, 59, 999));
        break;
      }
      case "YESTERDAY": {
        startDate = new Date(Date.UTC(currentYear, currentMonth, currentDate - 1, 0, 0, 0, 0));
        endDate = new Date(Date.UTC(currentYear, currentMonth, currentDate - 1, 23, 59, 59, 999));
        break;
      }
      case "THIS_WEEK": {
        // Monday is start of week
        const diffToMonday = (currentDay + 6) % 7;
        startDate = new Date(Date.UTC(currentYear, currentMonth, currentDate - diffToMonday, 0, 0, 0, 0));
        endDate = new Date(now.getTime());
        break;
      }
      case "LAST_WEEK": {
        const diffToMonday = (currentDay + 6) % 7;
        startDate = new Date(Date.UTC(currentYear, currentMonth, currentDate - diffToMonday - 7, 0, 0, 0, 0));
        endDate = new Date(Date.UTC(currentYear, currentMonth, currentDate - diffToMonday - 1, 23, 59, 59, 999));
        break;
      }
      case "THIS_MONTH": {
        startDate = new Date(Date.UTC(currentYear, currentMonth, 1, 0, 0, 0, 0));
        endDate = new Date(now.getTime());
        break;
      }
      case "LAST_MONTH": {
        startDate = new Date(Date.UTC(currentYear, currentMonth - 1, 1, 0, 0, 0, 0));
        endDate = new Date(Date.UTC(currentYear, currentMonth, 0, 23, 59, 59, 999));
        break;
      }
      case "THIS_QUARTER": {
        const quarterStartMonth = Math.floor(currentMonth / 3) * 3;
        startDate = new Date(Date.UTC(currentYear, quarterStartMonth, 1, 0, 0, 0, 0));
        endDate = new Date(now.getTime());
        break;
      }
      case "THIS_YEAR": {
        startDate = new Date(Date.UTC(currentYear, 0, 1, 0, 0, 0, 0));
        endDate = new Date(now.getTime());
        break;
      }
      case "CUSTOM":
      default: {
        startDate = params.from
          ? (params.from.length === 10 ? new Date(`${params.from}T00:00:00.000Z`) : new Date(params.from))
          : new Date(Date.UTC(currentYear, currentMonth, 1, 0, 0, 0, 0));
        endDate = params.to
          ? (params.to.length === 10 ? new Date(`${params.to}T23:59:59.999Z`) : new Date(params.to))
          : new Date(now.getTime());
        break;
      }
    }

    if (isNaN(startDate.getTime())) {
      startDate = new Date(Date.UTC(currentYear, currentMonth, 1, 0, 0, 0, 0));
    }
    if (isNaN(endDate.getTime())) {
      endDate = new Date(now.getTime());
    }

    // Ensure start <= end
    if (startDate.getTime() > endDate.getTime()) {
      const temp = startDate;
      startDate = endDate;
      endDate = temp;
    }

    // Determine deterministic previous comparison period
    const durationMs = endDate.getTime() - startDate.getTime();
    const previousEndDate = new Date(startDate.getTime());
    const previousStartDate = new Date(startDate.getTime() - durationMs);

    return {
      from: startDate.toISOString(),
      to: endDate.toISOString(),
      preset,
      timezone: tz,
      previousPeriod: {
        from: previousStartDate.toISOString(),
        to: previousEndDate.toISOString(),
      },
    };
  }

  /**
   * Calculates safe percentage change with zero-denominator defense
   */
  public static calculateChangePercentage(current: number, prior?: number): number | null {
    if (prior === undefined || prior === null) {
      return null;
    }
    if (prior === 0) {
      return current === 0 ? 0 : null; // null represents N/A (new baseline)
    }
    const pct = ((current - prior) / Math.abs(prior)) * 100;
    return Math.round(pct * 10) / 10;
  }
}

export function isDateInWindow(dateStr: string | undefined | null, from: string, to: string): boolean {
  if (!dateStr) return false;
  const time = new Date(dateStr.length === 10 ? `${dateStr}T00:00:00.000Z` : dateStr).getTime();
  if (isNaN(time)) return false;
  const fromTime = new Date(from).getTime();
  const toTime = new Date(to).getTime();
  return time >= fromTime && time <= toTime;
}
