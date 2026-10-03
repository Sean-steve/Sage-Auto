// ============================================================================
// CAR HIRE OS — FINANCIAL POSTING CONTRACT FACTORY (Sprint 19 -> Sprint 20)
// Exposes Stable Invariant-Backed Posting Sources for General Ledger Ingestion
// ============================================================================

import type {
  OperationalInvoice,
  CreditNote,
  OperationalExpense,
  DepositPosition,
  RefundObligation,
  FinancialPostingSource,
  FinancialPostingLine,
} from "@carhire/types";

export class FinancialPostingContractFactory {
  /**
   * Constructs the Posting Contract for an Issued Operational Invoice
   */
  static createInvoiceIssuedPostingContract(invoice: OperationalInvoice): FinancialPostingSource {
    const lines: FinancialPostingLine[] = [];

    // 1. Debit Accounts Receivable (Total Gross)
    lines.push({
      classification: "ACCOUNTS_RECEIVABLE",
      amount: invoice.total,
      direction: "DEBIT",
      memo: `Invoice ${invoice.invoiceNumber} receivable`,
      customerId: invoice.customerId,
    });

    // 2. Credit Revenue lines (Rental / Incidental / Damage)
    for (const item of invoice.lineItems) {
      let classification: FinancialPostingLine["classification"] = "INCIDENTAL_REVENUE";
      if (item.lineType === "RENTAL_BASE" || item.lineType === "RENTAL_EXTENSION") {
        classification = "RENTAL_REVENUE";
      } else if (item.lineType === "DAMAGE_CHARGE") {
        classification = "DAMAGE_RECOVERY_REVENUE";
      }

      lines.push({
        classification,
        amount: item.netAmount,
        direction: "CREDIT",
        memo: `${item.lineType}: ${item.description}`,
      });
    }

    // 3. Credit Output Tax
    if (parseFloat(invoice.taxTotal) > 0) {
      lines.push({
        classification: "OUTPUT_VAT",
        amount: invoice.taxTotal,
        direction: "CREDIT",
        memo: `Output VAT on Invoice ${invoice.invoiceNumber}`,
      });
    }

    return {
      sourceType: "OPERATIONAL_INVOICE",
      sourceId: invoice.id,
      tenantId: invoice.tenantId,
      eventType: "finance.invoice.issued",
      eventNumber: invoice.invoiceNumber,
      effectiveDate: invoice.issueDate,
      currency: invoice.currency,
      lines,
      metadata: {
        rentalId: invoice.rentalId,
        bookingId: invoice.bookingId,
        customerId: invoice.customerId,
        corporateAccountId: invoice.corporateAccountId,
      },
      postedToLedger: false,
    };
  }

  /**
   * Constructs the Posting Contract for an Issued Credit Note
   */
  static createCreditNoteIssuedPostingContract(creditNote: CreditNote): FinancialPostingSource {
    const lines: FinancialPostingLine[] = [];

    // 1. Debit Revenue
    lines.push({
      classification: "RENTAL_REVENUE",
      amount: creditNote.subtotal,
      direction: "DEBIT",
      memo: `Credit Note ${creditNote.creditNoteNumber} revenue reversal: ${creditNote.reason}`,
    });

    // 2. Debit Tax if any
    if (parseFloat(creditNote.taxTotal) > 0) {
      lines.push({
        classification: "OUTPUT_VAT",
        amount: creditNote.taxTotal,
        direction: "DEBIT",
        memo: `Tax adjustment for Credit Note ${creditNote.creditNoteNumber}`,
      });
    }

    // 3. Credit Accounts Receivable (reducing balance)
    lines.push({
      classification: "ACCOUNTS_RECEIVABLE",
      amount: creditNote.total,
      direction: "CREDIT",
      memo: `Credit Note ${creditNote.creditNoteNumber} against invoice`,
      customerId: creditNote.customerId,
    });

    return {
      sourceType: "CREDIT_NOTE",
      sourceId: creditNote.id,
      tenantId: creditNote.tenantId,
      eventType: "finance.credit_note.issued",
      eventNumber: creditNote.creditNoteNumber,
      effectiveDate: creditNote.issueDate,
      currency: creditNote.currency,
      lines,
      metadata: {
        invoiceId: creditNote.invoiceId,
        customerId: creditNote.customerId,
        rentalId: creditNote.rentalId,
      },
      postedToLedger: false,
    };
  }

  /**
   * Constructs the Posting Contract for an Approved Operating Expense
   */
  static createExpenseApprovedPostingContract(expense: OperationalExpense): FinancialPostingSource {
    const lines: FinancialPostingLine[] = [];

    // 1. Debit Operating Expense
    lines.push({
      classification: "OPERATING_EXPENSE",
      amount: expense.netAmount,
      direction: "DEBIT",
      memo: `Expense ${expense.expenseNumber} (${expense.category}): ${expense.description}`,
      vehicleId: expense.vehicleId,
    });

    // 2. Debit Tax if applicable
    if (parseFloat(expense.taxAmount) > 0) {
      lines.push({
        classification: "OUTPUT_VAT",
        amount: expense.taxAmount,
        direction: "DEBIT",
        memo: `Input VAT on ${expense.expenseNumber}`,
      });
    }

    // 3. Credit Cash/Bank / Payables
    lines.push({
      classification: "CASH_OR_BANK",
      amount: expense.grossAmount,
      direction: "CREDIT",
      memo: `Disbursement/Obligation for ${expense.expenseNumber}`,
    });

    return {
      sourceType: "OPERATIONAL_EXPENSE",
      sourceId: expense.id,
      tenantId: expense.tenantId,
      eventType: "finance.expense.approved",
      eventNumber: expense.expenseNumber,
      effectiveDate: expense.expenseDate,
      currency: expense.currency,
      lines,
      metadata: {
        category: expense.category,
        vehicleId: expense.vehicleId,
        maintenanceId: expense.maintenanceId,
        vehicleOwnerId: expense.vehicleOwnerId,
        ownerDeductible: expense.ownerDeductible,
      },
      postedToLedger: false,
    };
  }

  /**
   * Constructs the Posting Contract for a Customer Deposit Receipt
   */
  static createDepositReceivedPostingContract(deposit: DepositPosition): FinancialPostingSource {
    return {
      sourceType: "DEPOSIT_POSITION",
      sourceId: deposit.id,
      tenantId: deposit.tenantId,
      eventType: "finance.deposit.received",
      eventNumber: `DEP-${deposit.rentalId}`,
      effectiveDate: new Date().toISOString().split("T")[0],
      currency: deposit.currency,
      lines: [
        {
          classification: "CASH_OR_BANK",
          amount: deposit.receivedAmount,
          direction: "DEBIT",
          memo: `Deposit received for rental ${deposit.rentalId}`,
        },
        {
          classification: "DEPOSIT_LIABILITY",
          amount: deposit.receivedAmount,
          direction: "CREDIT",
          memo: `Security deposit held liability for rental ${deposit.rentalId}`,
          customerId: deposit.customerId,
        },
      ],
      metadata: {
        rentalId: deposit.rentalId,
        customerId: deposit.customerId,
      },
      postedToLedger: false,
    };
  }

  /**
   * Constructs the Posting Contract for Applying a Held Deposit Against an Invoice
   */
  static createDepositAppliedPostingContract(
    deposit: DepositPosition,
    invoiceNumber: string,
    amountApplied: string
  ): FinancialPostingSource {
    return {
      sourceType: "DEPOSIT_POSITION",
      sourceId: deposit.id,
      tenantId: deposit.tenantId,
      eventType: "finance.deposit.applied",
      eventNumber: `DEP-APP-${deposit.rentalId}`,
      effectiveDate: new Date().toISOString().split("T")[0],
      currency: deposit.currency,
      lines: [
        {
          classification: "DEPOSIT_LIABILITY",
          amount: amountApplied,
          direction: "DEBIT",
          memo: `Deposit applied against invoice ${invoiceNumber}`,
          customerId: deposit.customerId,
        },
        {
          classification: "ACCOUNTS_RECEIVABLE",
          amount: amountApplied,
          direction: "CREDIT",
          memo: `Settlement via deposit for invoice ${invoiceNumber}`,
          customerId: deposit.customerId,
        },
      ],
      metadata: {
        rentalId: deposit.rentalId,
        invoiceNumber,
      },
      postedToLedger: false,
    };
  }

  /**
   * Constructs the Posting Contract for an Approved Refund Obligation
   */
  static createRefundApprovedPostingContract(refund: RefundObligation): FinancialPostingSource {
    return {
      sourceType: "REFUND_OBLIGATION",
      sourceId: refund.id,
      tenantId: refund.tenantId,
      eventType: "finance.refund.approved",
      eventNumber: `REF-${refund.id}`,
      effectiveDate: new Date().toISOString().split("T")[0],
      currency: refund.currency,
      lines: [
        {
          classification: "DEPOSIT_LIABILITY",
          amount: refund.amount,
          direction: "DEBIT",
          memo: `Deposit release for refund: ${refund.reason}`,
          customerId: refund.customerId,
        },
        {
          classification: "REFUND_PAYABLE",
          amount: refund.amount,
          direction: "CREDIT",
          memo: `Refund payable to customer: ${refund.reason}`,
          customerId: refund.customerId,
        },
      ],
      metadata: {
        rentalId: refund.rentalId,
        invoiceId: refund.invoiceId,
        depositPositionId: refund.depositPositionId,
      },
      postedToLedger: false,
    };
  }
}
