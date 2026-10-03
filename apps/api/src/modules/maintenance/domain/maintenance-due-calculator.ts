// ============================================================================
// CAR HIRE OS — MAINTENANCE DUE CALCULATOR (SPRINT 17)
// Bounded Context: Preventive Maintenance & Service Intervals (DOM-003 §21)
// ============================================================================

import type {
  MaintenanceSchedule,
  MaintenanceDueEvaluation,
  MaintenanceDueStatus,
} from "@carhire/types";

export interface VehicleOdometerSnapshot {
  vehicleId: string;
  registrationPlate?: string;
  currentOdometer: number;
}

export class MaintenanceDueCalculator {
  /**
   * Evaluates if a maintenance schedule is NOT_DUE, DUE_SOON, DUE, or OVERDUE
   * based on odometer reading and elapsed calendar time.
   */
  public static evaluateSchedule(
    schedule: MaintenanceSchedule,
    vehicle: VehicleOdometerSnapshot,
    now: Date = new Date()
  ): MaintenanceDueEvaluation {
    const currentOdometer = vehicle.currentOdometer;
    let distanceToDueKm: number | undefined = undefined;
    let daysToDue: number | undefined = undefined;

    let odoDueStatus: MaintenanceDueStatus = "NOT_DUE";
    let timeDueStatus: MaintenanceDueStatus = "NOT_DUE";
    const reasons: string[] = [];

    // 1. Odometer-based evaluation
    if (schedule.nextDueOdometer !== undefined) {
      distanceToDueKm = schedule.nextDueOdometer - currentOdometer;
      const thresholdKm = schedule.dueSoonDistanceThresholdKm ?? 500;

      if (distanceToDueKm <= 0) {
        odoDueStatus = "OVERDUE";
        reasons.push(
          `Odometer limit exceeded by ${Math.abs(distanceToDueKm)} km (Target: ${schedule.nextDueOdometer} km, Current: ${currentOdometer} km)`
        );
      } else if (distanceToDueKm <= thresholdKm / 2) {
        odoDueStatus = "DUE";
        reasons.push(
          `Service due within ${distanceToDueKm} km (Target: ${schedule.nextDueOdometer} km, Current: ${currentOdometer} km)`
        );
      } else if (distanceToDueKm <= thresholdKm) {
        odoDueStatus = "DUE_SOON";
        reasons.push(
          `Service due soon in ${distanceToDueKm} km (Target: ${schedule.nextDueOdometer} km)`
        );
      }
    }

    // 2. Calendar / Time-based evaluation
    if (schedule.nextDueAt) {
      const nextDueDate = new Date(schedule.nextDueAt);
      const diffMs = nextDueDate.getTime() - now.getTime();
      daysToDue = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      const thresholdDays = schedule.dueSoonDaysThreshold ?? 14;

      if (daysToDue <= 0) {
        timeDueStatus = "OVERDUE";
        reasons.push(
          `Service date overdue by ${Math.abs(daysToDue)} days (Due date: ${schedule.nextDueAt.substring(0, 10)})`
        );
      } else if (daysToDue <= 3) {
        timeDueStatus = "DUE";
        reasons.push(
          `Service due in ${daysToDue} days (Due date: ${schedule.nextDueAt.substring(0, 10)})`
        );
      } else if (daysToDue <= thresholdDays) {
        timeDueStatus = "DUE_SOON";
        reasons.push(
          `Service due soon in ${daysToDue} days (Due date: ${schedule.nextDueAt.substring(0, 10)})`
        );
      }
    }

    // 3. Aggregate highest severity status
    const statusPriority: Record<MaintenanceDueStatus, number> = {
      NOT_DUE: 0,
      DUE_SOON: 1,
      DUE: 2,
      OVERDUE: 3,
    };

    const finalStatus: MaintenanceDueStatus =
      statusPriority[odoDueStatus] >= statusPriority[timeDueStatus]
        ? odoDueStatus
        : timeDueStatus;

    const reason =
      reasons.length > 0
        ? reasons.join("; ")
        : `Service scheduled for ${schedule.nextDueOdometer ? `${schedule.nextDueOdometer} km` : "future"} or ${schedule.nextDueAt ? schedule.nextDueAt.substring(0, 10) : "TBD"}`;

    return {
      scheduleId: schedule.id,
      vehicleId: vehicle.vehicleId,
      vehicleRegistration: vehicle.registrationPlate,
      scheduleName: schedule.name,
      maintenanceType: schedule.maintenanceType,
      dueStatus: finalStatus,
      distanceToDueKm,
      daysToDue,
      nextDueAt: schedule.nextDueAt,
      nextDueOdometer: schedule.nextDueOdometer,
      currentOdometer,
      isSafetyCritical: schedule.isSafetyCritical ?? false,
      reason,
    };
  }
}
