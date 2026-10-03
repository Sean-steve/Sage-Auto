// ============================================================================
// CAR HIRE OS — PAYMENT POSTING CONTRACT FACTORY (Sprint 22 -> Sprint 20)
// Generates Authoritative Posting Contracts for Double-Entry General Ledger Postings
// ============================================================================

import type {
  Payment,
  PaymentAllocation,
  Refund,
  FinancialPostingSource,
  FinancialPostingLine,
} from "@carhire/types";

export class PaymentPostingContractFactory {
  /**
   * Constructs Posting Contract for an Inbound Payment Allocated to an Invoice
   * Dr Cash & Bank (1010)
   *   Cr Accounts Receivable (1100)
   */
  static createInvoicePaymentPostingContract(
    payment: Payment,
    allocation: PaymentAllocation,
    invoiceNumber: string
  ): FinancialPostingSource {
    const lines: FinancialPostingLine[] = [
      {
        classification: "CASH_OR_BANK",
        amount: allocation.amount,
        direction: "DEBIT",
        memo: `Receipt ${payment.paymentNumber} (${payment.provider}) for Invoice ${invoiceNumber}`,
        customerId: payment.sourceContext?.customerId,
      },
      {
        classification: "ACCOUNTS_RECEIVABLE",
        amount: allocation.amount,
        direction: "CREDIT",
        memo: `Settlement of Invoice ${invoiceNumber} via ${payment.paymentNumber}`,
        customerId: payment.sourceContext?.customerId,
      },
    ];

    return {
      sourceType: "PAYMENT_RECORD",
      sourceId: payment.id,
      tenantId: payment.tenantId,
      eventType: "payment.allocated.invoice",
      eventNumber: payment.paymentNumber,
      effectiveDate: payment.paidAt.split("T")[0],
      currency: payment.currency,
      lines,
      metadata: {
        paymentId: payment.id,
        allocationId: allocation.id,
        invoiceId: allocation.sourceId,
        invoiceNumber,
        provider: payment.provider,
        providerTransactionId: payment.providerTransactionId,
      },
      postedToLedger: false,
    };
  }

  /**
   * Constructs Posting Contract for an Inbound Payment Allocated to a Security Deposit
   * Dr Cash & Bank (1010)
   *   Cr Customer Deposit Liability (2050)
   */
  static createDepositPaymentPostingContract(
    payment: Payment,
    allocation: PaymentAllocation,
    rentalId?: string
  ): FinancialPostingSource {
    const lines: FinancialPostingLine[] = [
      {
        classification: "CASH_OR_BANK",
        amount: allocation.amount,
        direction: "DEBIT",
        memo: `Deposit collection ${payment.paymentNumber} (${payment.provider}) for rental ${rentalId || allocation.sourceId}`,
        customerId: payment.sourceContext?.customerId,
      },
      {
        classification: "DEPOSIT_LIABILITY",
        amount: allocation.amount,
        direction: "CREDIT",
        memo: `Deposit liability recognized from ${payment.paymentNumber}`,
        customerId: payment.sourceContext?.customerId,
      },
    ];

    return {
      sourceType: "PAYMENT_RECORD",
      sourceId: payment.id,
      tenantId: payment.tenantId,
      eventType: "payment.allocated.deposit",
      eventNumber: payment.paymentNumber,
      effectiveDate: payment.paidAt.split("T")[0],
      currency: payment.currency,
      lines,
      metadata: {
        paymentId: payment.id,
        allocationId: allocation.id,
        depositPositionId: allocation.sourceId,
        rentalId,
        provider: payment.provider,
        providerTransactionId: payment.providerTransactionId,
      },
      postedToLedger: false,
    };
  }

  /**
   * Constructs Posting Contract for an Outbound Owner Settlement Payout
   * Dr Vehicle Owner Settlement Clearing (2150)
   *   Cr Cash & Bank (1010)
   */
  static createOwnerPayoutPostingContract(
    payment: Payment,
    payableNumber: string,
    ownerId: string
  ): FinancialPostingSource {
    const lines: FinancialPostingLine[] = [
      {
        classification: "OWNER_SETTLEMENT_CLEARING",
        amount: payment.amount,
        direction: "DEBIT",
        memo: `Owner settlement payout for payable ${payableNumber}`,
      },
      {
        classification: "CASH_OR_BANK",
        amount: payment.amount,
        direction: "CREDIT",
        memo: `Disbursement ${payment.paymentNumber} to owner ${ownerId}`,
      },
    ];

    return {
      sourceType: "PAYMENT_RECORD",
      sourceId: payment.id,
      tenantId: payment.tenantId,
      eventType: "payment.payout.owner_settlement",
      eventNumber: payment.paymentNumber,
      effectiveDate: payment.paidAt.split("T")[0],
      currency: payment.currency,
      lines,
      metadata: {
        paymentId: payment.id,
        payableId: payment.sourceContext?.payableId,
        payableNumber,
        ownerId,
        provider: payment.provider,
        providerTransactionId: payment.providerTransactionId,
      },
      postedToLedger: false,
    };
  }

  /**
   * Constructs Posting Contract for an Outbound Refund Disbursed to Customer
   * Dr Customer Refund Payable (2060) or Deposit Liability (2050)
   *   Cr Cash & Bank (1010)
   */
  static createRefundDisbursedPostingContract(
    refund: Refund,
    originalPayment: Payment
  ): FinancialPostingSource {
    const liabilityAccount: FinancialPostingLine["classification"] =
      refund.sourceObligationType === "RENTAL_DEPOSIT"
        ? "DEPOSIT_LIABILITY"
        : "REFUND_PAYABLE";

    const lines: FinancialPostingLine[] = [
      {
        classification: liabilityAccount,
        amount: refund.amount,
        direction: "DEBIT",
        memo: `Refund ${refund.refundNumber}: ${refund.reason}`,
        customerId: refund.customerId,
      },
      {
        classification: "CASH_OR_BANK",
        amount: refund.amount,
        direction: "CREDIT",
        memo: `Refund disbursement ${refund.refundNumber} on ${originalPayment.paymentNumber}`,
        customerId: refund.customerId,
      },
    ];

    return {
      sourceType: "REFUND_OBLIGATION",
      sourceId: refund.id,
      tenantId: refund.tenantId,
      eventType: "payment.refund.disbursed",
      eventNumber: refund.refundNumber,
      effectiveDate: (refund.completedAt || new Date().toISOString()).split("T")[0],
      currency: refund.currency,
      lines,
      metadata: {
        refundId: refund.id,
        originalPaymentId: originalPayment.id,
        providerRefundReference: refund.providerRefundReference,
      },
      postedToLedger: false,
    };
  }
}
