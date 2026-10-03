// ============================================================================
// CAR HIRE OS — HANDOVER STATE MACHINE (DOM-003 §18, DEV-006, BRS-001)
// Strict sequential checkpoint transitions for physical vehicle handover
// ============================================================================

import type { HandoverStatus } from "@carhire/types";
import { HandoverInvalidStateTransitionError, HandoverCheckpointsIncompleteError } from "@carhire/database";

export class HandoverStateMachine {
  private static readonly ALLOWED_TRANSITIONS: Record<HandoverStatus, HandoverStatus[]> = {
    SCHEDULED: ["CUSTOMER_ARRIVED"],
    CUSTOMER_ARRIVED: ["DOCUMENT_VERIFIED"],
    DOCUMENT_VERIFIED: ["PRE_RENTAL_INSPECTION"],
    PRE_RENTAL_INSPECTION: ["SIGNATURE"],
    SIGNATURE: ["KEY_HANDOVER"],
    KEY_HANDOVER: ["HANDOVER_COMPLETED"],
    HANDOVER_COMPLETED: [],
  };

  public static readonly TERMINAL_STATES: ReadonlySet<HandoverStatus> = new Set([
    "HANDOVER_COMPLETED",
  ]);

  public static canTransition(currentStatus: HandoverStatus, targetStatus: HandoverStatus): boolean {
    if (currentStatus === targetStatus) return false;
    const allowed = this.ALLOWED_TRANSITIONS[currentStatus] || [];
    return allowed.includes(targetStatus);
  }

  public static validateTransition(
    currentStatus: HandoverStatus,
    targetStatus: HandoverStatus,
    reason?: string
  ): void {
    if (!this.canTransition(currentStatus, targetStatus)) {
      throw new HandoverInvalidStateTransitionError(currentStatus, targetStatus, reason);
    }
  }

  public static validatePrerequisites(
    targetStatus: HandoverStatus,
    checkpoints: {
      customerArrived: boolean;
      documentsVerified: boolean;
      inspectionCompleted: boolean;
      contractSigned: boolean;
      keysHandedOver: boolean;
    }
  ): void {
    const missing: string[] = [];

    if (targetStatus === "DOCUMENT_VERIFIED" && !checkpoints.customerArrived) {
      missing.push("Customer arrival confirmation");
    }
    if (targetStatus === "PRE_RENTAL_INSPECTION" && !checkpoints.documentsVerified) {
      missing.push("Document verification (driving license & ID)");
    }
    if (targetStatus === "SIGNATURE" && !checkpoints.inspectionCompleted) {
      missing.push("Pre-rental vehicle inspection");
    }
    if (targetStatus === "KEY_HANDOVER" && !checkpoints.contractSigned) {
      missing.push("Signed rental contract");
    }
    if (targetStatus === "HANDOVER_COMPLETED" && !checkpoints.keysHandedOver) {
      missing.push("Key handover confirmation & odometer/fuel recording");
    }

    if (missing.length > 0) {
      throw new HandoverCheckpointsIncompleteError(missing);
    }
  }
}
