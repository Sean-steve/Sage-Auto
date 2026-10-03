// ============================================================================
// CAR HIRE OS — MAINTENANCE STATE MACHINE & DOMAIN RULES (SPRINT 17)
// Bounded Context: Maintenance Management (DOM-003 §21-24)
// ============================================================================

import type { MaintenanceStatus, MaintenanceWorkOrder } from "@carhire/types";
import {
  MaintenanceInvalidStateTransitionError,
  MaintenanceAlreadyCompletedError,
  MaintenanceRequiredTaskIncompleteError,
  MaintenanceOdometerInvalidError,
  MaintenanceNotReadyForVerificationError,
} from "@carhire/database";

export class MaintenanceStateMachine {
  private static readonly VALID_TRANSITIONS: Record<MaintenanceStatus, MaintenanceStatus[]> = {
    REQUESTED: ["SCHEDULED", "CANCELLED"],
    SCHEDULED: ["IN_PROGRESS", "CANCELLED"],
    IN_PROGRESS: ["COMPLETED"],
    COMPLETED: ["VERIFIED"],
    VERIFIED: [], // Terminal
    CANCELLED: [], // Terminal
  };

  /**
   * Validates if a state transition from currentStatus to targetStatus is allowed.
   */
  public static validateTransition(
    currentStatus: MaintenanceStatus,
    targetStatus: MaintenanceStatus
  ): void {
    if (currentStatus === targetStatus) {
      return;
    }

    if (currentStatus === "VERIFIED" || currentStatus === "CANCELLED") {
      throw new MaintenanceAlreadyCompletedError(
        "Current Work Order",
        currentStatus
      );
    }

    const allowed = this.VALID_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(targetStatus)) {
      throw new MaintenanceInvalidStateTransitionError(
        currentStatus,
        targetStatus,
        `Allowed transitions from '${currentStatus}' are: ${allowed.join(", ") || "none (terminal state)"}`
      );
    }
  }

  /**
   * Validates prerequisites for scheduling a work order.
   */
  public static validateScheduling(
    scheduledStartAt: string,
    scheduledEndAt?: string
  ): void {
    const start = new Date(scheduledStartAt).getTime();
    if (isNaN(start)) {
      throw new MaintenanceInvalidStateTransitionError(
        "REQUESTED",
        "SCHEDULED",
        "Scheduled start date must be a valid ISO-8601 timestamp."
      );
    }

    if (scheduledEndAt) {
      const end = new Date(scheduledEndAt).getTime();
      if (isNaN(end)) {
        throw new MaintenanceInvalidStateTransitionError(
          "REQUESTED",
          "SCHEDULED",
          "Scheduled end date must be a valid ISO-8601 timestamp."
        );
      }

      if (end <= start) {
        throw new MaintenanceInvalidStateTransitionError(
          "REQUESTED",
          "SCHEDULED",
          "Scheduled end date must be strictly after scheduled start date."
        );
      }
    }
  }

  /**
   * Validates prerequisites for starting a work order.
   */
  public static validateStart(
    vehicleCurrentOdometer: number | undefined,
    startOdometer?: number
  ): void {
    if (startOdometer === undefined) {
      return;
    }

    if (startOdometer < 0) {
      throw new MaintenanceOdometerInvalidError(
        "Start odometer must be a non-negative number.",
        vehicleCurrentOdometer,
        startOdometer
      );
    }

    if (vehicleCurrentOdometer !== undefined && startOdometer < vehicleCurrentOdometer) {
      throw new MaintenanceOdometerInvalidError(
        `Start odometer (${startOdometer} km) cannot be less than the vehicle's current recorded odometer (${vehicleCurrentOdometer} km).`,
        vehicleCurrentOdometer,
        startOdometer
      );
    }
  }

  /**
   * Validates prerequisites for completing a work order.
   */
  public static validateCompletion(
    workOrder: MaintenanceWorkOrder,
    completionOdometer?: number
  ): void {
    if (completionOdometer !== undefined) {
      if (completionOdometer < 0) {
        throw new MaintenanceOdometerInvalidError(
          "Completion odometer must be a non-negative number.",
          workOrder.startOdometer,
          completionOdometer
        );
      }

      const baselineOdo = workOrder.startOdometer ?? workOrder.odometerAtRequest ?? 0;
      if (completionOdometer < baselineOdo) {
        throw new MaintenanceOdometerInvalidError(
          `Completion odometer (${completionOdometer} km) cannot be lower than start odometer (${baselineOdo} km).`,
          baselineOdo,
          completionOdometer
        );
      }
    }

    // Check mandatory tasks
    if (workOrder.tasks && workOrder.tasks.length > 0) {
      const incompleteRequiredTasks = workOrder.tasks
        .filter((t) => t.isRequired && t.status !== "COMPLETED" && t.status !== "SKIPPED")
        .map((t) => `${t.taskType}: ${t.description}`);

      if (incompleteRequiredTasks.length > 0) {
        throw new MaintenanceRequiredTaskIncompleteError(incompleteRequiredTasks);
      }
    }
  }

  /**
   * Validates prerequisites for QA verification of a work order.
   */
  public static validateVerification(workOrder: MaintenanceWorkOrder): void {
    if (workOrder.status !== "COMPLETED") {
      throw new MaintenanceNotReadyForVerificationError(
        `Work order must be in 'COMPLETED' status prior to QA verification. Current status: '${workOrder.status}'.`
      );
    }
  }
}
