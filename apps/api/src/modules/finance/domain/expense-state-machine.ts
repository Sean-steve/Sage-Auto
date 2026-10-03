// ============================================================================
// CAR HIRE OS — OPERATIONAL EXPENSE STATE MACHINE (Sprint 19: DOM-003 §28-34)
// Enforces Expense Approval Lifecycle, Invariant Rules & Four-Eyes Controls
// ============================================================================

import type { ExpenseStatus } from "@carhire/types";
import {
  OperationalExpenseInvalidStateTransitionError,
  OperationalExpenseFourEyesApprovalViolationError,
} from "@carhire/database";

export class ExpenseStateMachine {
  private static readonly ALLOWED_TRANSITIONS: Record<ExpenseStatus, ExpenseStatus[]> = {
    DRAFT: ["SUBMITTED", "VOIDED"],
    SUBMITTED: ["APPROVED", "REJECTED", "VOIDED"],
    REJECTED: ["SUBMITTED", "VOIDED"],
    APPROVED: ["VOIDED"],
    VOIDED: [], // Terminal state
  };

  static validateTransition(from: ExpenseStatus, to: ExpenseStatus): void {
    if (from === to) return;

    const allowed = this.ALLOWED_TRANSITIONS[from] || [];
    if (!allowed.includes(to)) {
      throw new OperationalExpenseInvalidStateTransitionError(
        from,
        to,
        `Expense lifecycle does not permit transition from '${from}' to '${to}'.`
      );
    }
  }

  /**
   * Enforces four-eyes approval rule (creator cannot approve their own expense)
   */
  static validateFourEyesApproval(
    expenseId: string,
    creatorUserId: string,
    approverUserId: string,
    enforceFourEyes: boolean = true
  ): void {
    if (enforceFourEyes && creatorUserId === approverUserId) {
      throw new OperationalExpenseFourEyesApprovalViolationError(expenseId, approverUserId);
    }
  }
}
