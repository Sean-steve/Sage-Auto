// ============================================================================
// CAR HIRE OS — PAYMENT DOMAIN STATE MACHINE (Sprint 22: DEV-009, DATA-002)
// Enforces Strict Lifecycle Transitions, Optimistic Locks & Invariant Guards
// ============================================================================

import type {
  PaymentAttemptStatus,
  PaymentStatus,
  RefundStatus,
} from "@carhire/types";
import {
  PaymentAttemptAlreadyCompletedError,
  PaymentAlreadyFullyAllocatedError,
  PaymentAllocationExceededError,
  RefundExceedsPaymentError,
} from "@carhire/database";

export class PaymentStateMachine {
  private static readonly ATTEMPT_VALID_TRANSITIONS: Record<
    PaymentAttemptStatus,
    PaymentAttemptStatus[]
  > = {
    INITIATED: ["PENDING_CALLBACK", "PENDING_REDIRECT", "SUCCEEDED", "FAILED", "EXPIRED", "CANCELLED"],
    PENDING_CALLBACK: ["SUCCEEDED", "FAILED", "EXPIRED", "CANCELLED"],
    PENDING_REDIRECT: ["PENDING_CALLBACK", "SUCCEEDED", "FAILED", "EXPIRED", "CANCELLED"],
    SUCCEEDED: [], // Terminal
    FAILED: [], // Terminal
    EXPIRED: [], // Terminal
    CANCELLED: [], // Terminal
  };

  private static readonly PAYMENT_VALID_TRANSITIONS: Record<
    PaymentStatus,
    PaymentStatus[]
  > = {
    PENDING_VERIFICATION: ["VERIFIED", "VOIDED"],
    VERIFIED: ["PARTIALLY_ALLOCATED", "ALLOCATED", "PARTIALLY_REFUNDED", "REFUNDED", "VOIDED", "DISPUTED"],
    PARTIALLY_ALLOCATED: ["ALLOCATED", "PARTIALLY_REFUNDED", "REFUNDED", "DISPUTED"],
    ALLOCATED: ["PARTIALLY_REFUNDED", "REFUNDED", "DISPUTED"],
    PARTIALLY_REFUNDED: ["REFUNDED", "DISPUTED"],
    REFUNDED: [], // Terminal
    VOIDED: [], // Terminal
    DISPUTED: ["VERIFIED", "ALLOCATED", "REFUNDED", "VOIDED"],
  };

  private static readonly REFUND_VALID_TRANSITIONS: Record<
    RefundStatus,
    RefundStatus[]
  > = {
    PENDING: ["APPROVED", "CANCELLED"],
    APPROVED: ["PROCESSING", "COMPLETED", "FAILED", "CANCELLED"],
    PROCESSING: ["COMPLETED", "FAILED"],
    COMPLETED: [], // Terminal
    FAILED: ["PENDING", "APPROVED"], // Retriable
    CANCELLED: [], // Terminal
  };

  static validateAttemptTransition(
    currentStatus: PaymentAttemptStatus,
    nextStatus: PaymentAttemptStatus,
    attemptId: string
  ): void {
    if (currentStatus === nextStatus) return;

    const allowed = this.ATTEMPT_VALID_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(nextStatus)) {
      throw new PaymentAttemptAlreadyCompletedError(attemptId, currentStatus);
    }
  }

  static validatePaymentTransition(
    currentStatus: PaymentStatus,
    nextStatus: PaymentStatus,
    paymentId: string
  ): void {
    if (currentStatus === nextStatus) return;

    const allowed = this.PAYMENT_VALID_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(nextStatus)) {
      throw new Error(
        `Invalid payment transition from '${currentStatus}' to '${nextStatus}' on Payment ${paymentId}`
      );
    }
  }

  static validateRefundTransition(
    currentStatus: RefundStatus,
    nextStatus: RefundStatus,
    refundId: string
  ): void {
    if (currentStatus === nextStatus) return;

    const allowed = this.REFUND_VALID_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(nextStatus)) {
      throw new Error(
        `Invalid refund transition from '${currentStatus}' to '${nextStatus}' on Refund ${refundId}`
      );
    }
  }

  /**
   * Evaluates new allocation math and computes resulting PaymentStatus
   */
  static computeAllocationOutcome(
    totalAmount: string,
    currentAllocated: string,
    amountToAllocate: string,
    paymentId: string
  ): {
    newAllocated: string;
    newUnallocated: string;
    newStatus: PaymentStatus;
  } {
    const total = parseFloat(totalAmount);
    const allocated = parseFloat(currentAllocated);
    const toAlloc = parseFloat(amountToAllocate);

    if (toAlloc <= 0) {
      throw new Error("Allocation amount must be greater than zero");
    }

    const available = Math.max(0, total - allocated);
    if (toAlloc > available + 0.0001) {
      if (available <= 0.0001) {
        throw new PaymentAlreadyFullyAllocatedError(paymentId);
      }
      throw new PaymentAllocationExceededError(toAlloc.toFixed(4), available.toFixed(4));
    }

    const newAllocatedNum = allocated + toAlloc;
    const newUnallocatedNum = Math.max(0, total - newAllocatedNum);

    const newStatus: PaymentStatus =
      newUnallocatedNum <= 0.0001 ? "ALLOCATED" : "PARTIALLY_ALLOCATED";

    return {
      newAllocated: newAllocatedNum.toFixed(4),
      newUnallocated: newUnallocatedNum.toFixed(4),
      newStatus,
    };
  }

  /**
   * Evaluates refund math against original payment amount and existing refunds
   */
  static computeRefundOutcome(
    totalAmount: string,
    currentRefunded: string,
    refundAmount: string,
    _paymentId: string
  ): {
    newRefunded: string;
    newStatus: PaymentStatus;
  } {
    const total = parseFloat(totalAmount);
    const refunded = parseFloat(currentRefunded);
    const toRefund = parseFloat(refundAmount);

    if (toRefund <= 0) {
      throw new Error("Refund amount must be greater than zero");
    }

    const available = Math.max(0, total - refunded);
    if (toRefund > available + 0.0001) {
      throw new RefundExceedsPaymentError(toRefund.toFixed(4), available.toFixed(4));
    }

    const newRefundedNum = refunded + toRefund;
    const remaining = total - newRefundedNum;

    const newStatus: PaymentStatus =
      remaining <= 0.0001 ? "REFUNDED" : "PARTIALLY_REFUNDED";

    return {
      newRefunded: newRefundedNum.toFixed(4),
      newStatus,
    };
  }
}
