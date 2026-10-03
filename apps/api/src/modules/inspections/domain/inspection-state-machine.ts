// ============================================================================
// CAR HIRE OS — INSPECTION STATE MACHINE (DOM-003 §21, DEV-004)
// Bounded Context: Vehicle Condition Audits & Inspection Lifecycle
// ============================================================================

import type { InspectionStatus } from "@carhire/types";
import { InspectionInvalidStateTransitionError } from "@carhire/database";

export class InspectionStateMachine {
  private static readonly VALID_TRANSITIONS: Record<InspectionStatus, InspectionStatus[]> = {
    DRAFT: ["IN_PROGRESS", "COMPLETED", "VOIDED"],
    IN_PROGRESS: ["COMPLETED", "VOIDED"],
    COMPLETED: ["VOIDED"], // Once completed, sealed immutable. Can only be voided by authorized admin or corrected via explicit audit correction.
    VOIDED: [], // Terminal
  };

  public static canTransition(from: InspectionStatus, to: InspectionStatus): boolean {
    if (from === to) return true;
    const allowed = this.VALID_TRANSITIONS[from];
    return allowed ? allowed.includes(to) : false;
  }

  public static assertCanTransition(from: InspectionStatus, to: InspectionStatus): void {
    if (!this.canTransition(from, to)) {
      throw new InspectionInvalidStateTransitionError(from, to);
    }
  }

  public static isImmutable(status: InspectionStatus): boolean {
    return status === "COMPLETED" || status === "VOIDED";
  }
}
