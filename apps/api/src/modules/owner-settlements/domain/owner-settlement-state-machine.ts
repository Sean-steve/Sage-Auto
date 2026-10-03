// ============================================================================
// CAR HIRE OS — OWNER SETTLEMENT STATE MACHINE (Sprint 21: DOM-003 §41-45)
// Enforces Settlement Lifecycle Invariants, Immutability & Transition Guards
// ============================================================================

import type { OwnerSettlementStatus } from "@carhire/types";
import { SettlementDisputedBlockedError } from "@carhire/database";

export class OwnerSettlementStateMachine {
  private static readonly ALLOWED_TRANSITIONS: Record<OwnerSettlementStatus, OwnerSettlementStatus[]> = {
    PENDING: ["CALCULATED"],
    CALCULATED: ["APPROVED", "DISPUTED", "CALCULATED"],
    APPROVED: ["PAYMENT_PENDING", "PAID", "DISPUTED"],
    PAYMENT_PENDING: ["PAID", "APPROVED"],
    PAID: [], // Terminal state
    DISPUTED: ["CALCULATED"], // Resolve/recalculate first; approval is a separate four-eyes command
  };

  /**
   * Checks if a transition between settlement statuses is valid
   */
  static canTransition(from: OwnerSettlementStatus, to: OwnerSettlementStatus): boolean {
    if (from === to) return true;
    const allowed = this.ALLOWED_TRANSITIONS[from] || [];
    return allowed.includes(to);
  }

  /**
   * Asserts that a transition is valid, throwing a domain error if not
   */
  static assertTransition(from: OwnerSettlementStatus, to: OwnerSettlementStatus, settlementNumber: string): void {
    if (from === "DISPUTED" && to !== "CALCULATED") {
      throw new SettlementDisputedBlockedError(settlementNumber, `transition to ${to}`);
    }

    if (!this.canTransition(from, to)) {
      throw new Error(
        `Invalid settlement lifecycle transition from '${from}' to '${to}' for settlement ${settlementNumber}.`
      );
    }
  }

  /**
   * Guard checking if financial numbers can be modified
   */
  static assertCanRecalculate(status: OwnerSettlementStatus, settlementNumber: string): void {
    if (status === "APPROVED") {
      throw new Error(`Cannot recalculate approved settlement ${settlementNumber}. It is financially immutable.`);
    }
    if (status === "PAID") {
      throw new Error(`Cannot recalculate settled payment for ${settlementNumber}.`);
    }
    if (status === "PAYMENT_PENDING") {
      throw new Error(`Cannot recalculate settlement ${settlementNumber} while payment execution is pending.`);
    }
  }
}
