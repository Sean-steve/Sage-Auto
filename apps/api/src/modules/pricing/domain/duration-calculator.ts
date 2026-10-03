// ============================================================================
// CAR HIRE OS — BILLABLE DURATION & CALENDAR ENGINE (DEV-007, BRS-001)
// Precision Calculation of Rental Days, Hours, Grace Periods, and Day Types
// ============================================================================

export interface BillableDurationResult {
  totalHours: number;
  totalMinutes: number;
  billableDays: number;
  partialDayGraceApplied: boolean;
  excessMinutesOverDays: number;
  dayList: Array<{
    date: string; // YYYY-MM-DD
    dayOfWeek: number; // 0 = Sunday, 6 = Saturday
    isWeekend: boolean;
  }>;
}

export class BillableDurationCalculator {
  static readonly DEFAULT_GRACE_PERIOD_MINUTES = 59;

  static calculate(
    pickupDateTime: string,
    returnDateTime: string,
    gracePeriodMinutes: number = BillableDurationCalculator.DEFAULT_GRACE_PERIOD_MINUTES
  ): BillableDurationResult {
    const pickup = new Date(pickupDateTime);
    const dropoff = new Date(returnDateTime);

    if (isNaN(pickup.getTime())) {
      throw new Error(`Invalid pickup date time: ${pickupDateTime}`);
    }
    if (isNaN(dropoff.getTime())) {
      throw new Error(`Invalid return date time: ${returnDateTime}`);
    }
    if (dropoff.getTime() <= pickup.getTime()) {
      throw new Error("Return date time must be strictly after pickup date time");
    }

    const diffMs = dropoff.getTime() - pickup.getTime();
    const totalMinutes = Math.floor(diffMs / (1000 * 60));
    const totalHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;

    const fullDays = Math.floor(totalMinutes / (24 * 60));
    const remainingMinutes = totalMinutes % (24 * 60);

    let billableDays = fullDays;
    let partialDayGraceApplied = false;

    if (fullDays === 0) {
      // Minimum charge is 1 full day
      billableDays = 1;
    } else if (remainingMinutes > 0) {
      if (remainingMinutes <= gracePeriodMinutes) {
        // Within grace period -> does not trigger additional billable day
        partialDayGraceApplied = true;
      } else {
        // Exceeded grace period -> rolls over to next billable day
        billableDays += 1;
      }
    }

    // Generate date sequence for daily breakdown
    const dayList: Array<{ date: string; dayOfWeek: number; isWeekend: boolean }> = [];
    const current = new Date(pickup);

    for (let i = 0; i < billableDays; i++) {
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, "0");
      const day = String(current.getDate()).padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;
      const dayOfWeek = current.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday

      dayList.push({
        date: dateStr,
        dayOfWeek,
        isWeekend,
      });

      current.setDate(current.getDate() + 1);
    }

    return {
      totalHours,
      totalMinutes,
      billableDays,
      partialDayGraceApplied,
      excessMinutesOverDays: remainingMinutes,
      dayList,
    };
  }
}
