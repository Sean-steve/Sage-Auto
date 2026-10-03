// ============================================================================
// CAR HIRE OS — OPERATIONAL INVOICE STATE MACHINE (Sprint 19: DOM-003 §28-34)
// Enforces Strict Financial Lifecycle Transitions & Document Immutability
// ============================================================================

import type { OperationalInvoiceStatus } from "@carhire/types";
import {
  OperationalInvoiceInvalidStateTransitionError,
  OperationalInvoiceImmutableError,
} from "@carhire/database";

export class InvoiceStateMachine {
  private static readonly ALLOWED_TRANSITIONS: Record<OperationalInvoiceStatus, OperationalInvoiceStatus[]> = {
    DRAFT: ["ISSUED", "VOIDED"],
    ISSUED: ["PARTIALLY_PAID", "PAID", "OVERDUE", "VOIDED"],
    PARTIALLY_PAID: ["PAID", "OVERDUE", "VOIDED"],
    OVERDUE: ["PARTIALLY_PAID", "PAID", "VOIDED"],
    PAID: ["VOIDED"],
    VOIDED: [], // Terminal state
  };

  /**
   * Validates if a transition from current status to target status is mathematically and legally sound
   */
  static validateTransition(from: OperationalInvoiceStatus, to: OperationalInvoiceStatus): void {
    if (from === to) return;

    const allowed = this.ALLOWED_TRANSITIONS[from] || [];
    if (!allowed.includes(to)) {
      throw new OperationalInvoiceInvalidStateTransitionError(
        from,
        to,
        `Invoice lifecycle does not permit transition from '${from}' to '${to}'.`
      );
    }
  }

  /**
   * Asserts that an invoice is still mutable (only in DRAFT state)
   */
  static assertMutable(invoiceId: string, status: OperationalInvoiceStatus): void {
    if (status !== "DRAFT") {
      throw new OperationalInvoiceImmutableError(invoiceId, status);
    }
  }
}
