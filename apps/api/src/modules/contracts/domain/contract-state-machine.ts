// ============================================================================
// CAR HIRE OS — CONTRACT STATE MACHINE (DOM-003 §17, DEV-006, BRS-001)
// Canonical state transitions, signature verification, and immutability invariants
// ============================================================================

import type { ContractStatus } from "@carhire/types";
import { ContractInvalidStateTransitionError } from "@carhire/database";

export class ContractStateMachine {
  private static readonly ALLOWED_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
    DRAFT: ["GENERATED", "ARCHIVED"],
    GENERATED: ["SENT", "SIGNED", "ARCHIVED"],
    SENT: ["SIGNED", "ARCHIVED"],
    SIGNED: ["ACTIVE", "ARCHIVED"],
    ACTIVE: ["COMPLETED", "ARCHIVED"],
    COMPLETED: ["ARCHIVED"],
    ARCHIVED: [],
  };

  public static readonly TERMINAL_STATES: ReadonlySet<ContractStatus> = new Set([
    "COMPLETED",
    "ARCHIVED",
  ]);

  public static readonly IMMUTABLE_STATES: ReadonlySet<ContractStatus> = new Set([
    "SIGNED",
    "ACTIVE",
    "COMPLETED",
    "ARCHIVED",
  ]);

  public static canTransition(currentStatus: ContractStatus, targetStatus: ContractStatus): boolean {
    if (currentStatus === targetStatus) return false;
    const allowed = this.ALLOWED_TRANSITIONS[currentStatus] || [];
    return allowed.includes(targetStatus);
  }

  public static validateTransition(
    currentStatus: ContractStatus,
    targetStatus: ContractStatus,
    reason?: string
  ): void {
    if (!this.canTransition(currentStatus, targetStatus)) {
      throw new ContractInvalidStateTransitionError(currentStatus, targetStatus, reason);
    }
  }

  public static isImmutable(status: ContractStatus): boolean {
    return this.IMMUTABLE_STATES.has(status);
  }
}
