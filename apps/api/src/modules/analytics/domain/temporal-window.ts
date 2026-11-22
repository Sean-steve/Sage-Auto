// ============================================================================
// SAGE AUTO — REPORTING WINDOWS
// Calendar presets are defined in the tenant's timezone; all returned bounds
// are UTC instants and use the half-open convention [from, to).
// ============================================================================

import type { PeriodPreset } from "@carhire/types";

export interface ResolvedTemporalWindow {
  from: string;
  to: string;
  preset: PeriodPreset;
  timezone: string;
  previousPeriod: { from: string; to: string };
}

type Ymd = { year: number; month: number; day: number };

function localParts(date: Date, timezone: string): Ymd {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const get = (key: string) => Number(parts.find(p => p.type === key)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function localClock(date: Date, timezone: string): {hour: number; minute: number; second: number} {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date);
  const get = (key: string) => Number(parts.find(p => p.type === key)?.value);
  return { hour: get("hour"), minute: get("minute"), second: get("second") };
}

function addDays(date: Ymd, days: number): Ymd {
  const utc = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() };
}

function dayStartInTimezone(date: Ymd, timezone: string): Date {
  // Iterate the timezone correction so day boundaries work for both positive
  // and negative UTC offsets and seasonal DST transitions.
  const desired = Date.UTC(date.year, date.month - 1, date.day);
  let instant = desired;
  for (let n = 0; n < 4; n++) {
    const observed = new Date(instant);
    const d = localParts(observed, timezone);
    const t = localClock(observed, timezone);
    const asIfUtc = Date.UTC(d.year, d.month - 1, d.day, t.hour, t.minute, t.second);
    const delta = desired - asIfUtc;
    if (delta === 0) break;
    instant += delta;
  }
  const midnight = new Date(instant);
  const actual = localParts(midnight, timezone);
  if (actual.year !== date.year || actual.month !== date.month || actual.day !== date.day) {
    throw new Error("Unable to resolve a local reporting day in timezone " + timezone);
  }
  return midnight;
}

function parseCustom(value: string | undefined, timezone: string, inclusiveDayEnd: boolean): Date | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    const localDate = { year, month, day };
    return dayStartInTimezone(inclusiveDayEnd ? addDays(localDate, 1) : localDate, timezone);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw Object.assign(new Error("Invalid reporting date"), { statusCode: 422 });
  return parsed;
}

export class TemporalWindowResolver {
  public static resolve(
    params: { from?: string; to?: string; preset?: PeriodPreset; timezone?: string },
    now: Date = new Date()
  ): ResolvedTemporalWindow {
    const timezone = params.timezone || "Africa/Nairobi";
    // Throw if unknown: invalid zone names must not silently revert to UTC.
    try { new Intl.DateTimeFormat("en-GB", { timeZone: timezone }).format(now); }
    catch { throw Object.assign(new Error("Invalid reporting timezone"), { statusCode: 422 }); }

    const preset: PeriodPreset = params.preset || (params.from && params.to ? "CUSTOM" : "THIS_MONTH");
    const localToday = localParts(now, timezone);
    const todayStart = dayStartInTimezone(localToday, timezone);
    const tomorrow = dayStartInTimezone(addDays(localToday, 1), timezone);
    const utcDay = new Date(Date.UTC(localToday.year, localToday.month - 1, localToday.day)).getUTCDay();
    const monday = addDays(localToday, -((utcDay + 6) % 7));
    let from: Date;
    let to: Date;

    switch (preset) {
      case "TODAY":
        from = todayStart; to = tomorrow; break;
      case "YESTERDAY":
        from = dayStartInTimezone(addDays(localToday, -1), timezone); to = todayStart; break;
      case "THIS_WEEK":
        from = dayStartInTimezone(monday, timezone); to = now; break;
      case "LAST_WEEK":
        from = dayStartInTimezone(addDays(monday, -7), timezone);
        to = dayStartInTimezone(monday, timezone); break;
      case "THIS_MONTH":
        from = dayStartInTimezone({ year: localToday.year, month: localToday.month, day: 1 }, timezone);
        to = now; break;
      case "LAST_MONTH": {
        const previousMonth = addDays({ year: localToday.year, month: localToday.month, day: 1 }, -1);
        from = dayStartInTimezone({ year: previousMonth.year, month: previousMonth.month, day: 1 }, timezone);
        to = dayStartInTimezone({ year: localToday.year, month: localToday.month, day: 1 }, timezone);
        break;
      }
      case "THIS_QUARTER":
        from = dayStartInTimezone({
          year: localToday.year, month: Math.floor((localToday.month - 1) / 3) * 3 + 1, day: 1,
        }, timezone); to = now; break;
      case "THIS_YEAR":
        from = dayStartInTimezone({ year: localToday.year, month: 1, day: 1 }, timezone);
        to = now; break;
      case "CUSTOM":
        from = parseCustom(params.from, timezone, false) || todayStart;
        to = parseCustom(params.to, timezone, true) || now;
        break;
      default:
        throw Object.assign(new Error("Unsupported reporting preset"), { statusCode: 422 });
    }

    if (from.getTime() >= to.getTime()) {
      throw Object.assign(new Error("Reporting start must be before the end"), { statusCode: 422 });
    }
    const duration = to.getTime() - from.getTime();
    return {
      from: from.toISOString(), to: to.toISOString(), preset, timezone,
      previousPeriod: {
        from: new Date(from.getTime() - duration).toISOString(),
        to: from.toISOString(),
      },
    };
  }

  public static calculateChangePercentage(current: number, prior?: number): number | null {
    if (prior === undefined || prior === null) return null;
    if (prior === 0) return current === 0 ? 0 : null;
    return Math.round(((current - prior) / Math.abs(prior)) * 1000) / 10;
  }
}

export function isDateInWindow(value: string | undefined | null, from: string, to: string): boolean {
  if (!value) return false;
  const at = new Date(value.length === 10 ? value + "T00:00:00.000Z" : value).getTime();
  return Number.isFinite(at) && at >= new Date(from).getTime() && at < new Date(to).getTime();
}
