// ============================================================================
// CAR HIRE OS — SETTLEMENT POSTING CONTRACT FACTORY (Sprint 21: DOM-003 §41-45)
// Generates Strictly Balanced Double-Entry Financial Posting Contracts for Ledger
// ============================================================================

import type {
  OwnerSettlement,
  FinancialPostingSource,
  FinancialPostingLine,
} from "@carhire/types";
import { createMoney, toScaledBigInt, fromScaledBigInt, addMoney } from "@carhire/utils";

export class SettlementPostingContractFactory {
  /**
   * Generates the Balanced Double-Entry Posting Contract when a Settlement is APPROVED
   * Debits Owner Revenue Share Expense (5100)
   * Credits Owner Settlement Clearing / Payable (2150)
   * Credits Contra Maintenance & Expense Recovery (5110) for deductions
   */
  static createApprovalPosting(settlement: OwnerSettlement): FinancialPostingSource {
    const currency = settlement.currency || "KES";
    const lines: FinancialPostingLine[] = [];

    const ownerGrossMoney = createMoney(settlement.ownerGrossRevenueShare || (settlement.totalOwnerShare != null ? String(settlement.totalOwnerShare) : "0.0000"), currency);
    const netPayoutMoney = createMoney(settlement.netPayoutAmount != null ? String(settlement.netPayoutAmount) : "0.0000", currency);
    const deductionsMoney = createMoney(settlement.totalDeductions != null ? String(settlement.totalDeductions) : "0.0000", currency);

    // 1. DEBIT: Owner Revenue Share Expense (5100)
    lines.push({
      classification: "OWNER_REVENUE_SHARE_EXPENSE",
      amount: ownerGrossMoney.amount,
      direction: "DEBIT",
      memo: `Owner revenue share allocation for ${settlement.settlementNumber}`,
      customerId: undefined,
    });

    // 2. CREDIT: Owner Settlement Clearing / Payable (2150)
    lines.push({
      classification: "OWNER_SETTLEMENT_CLEARING",
      amount: netPayoutMoney.amount,
      direction: "CREDIT",
      memo: `Accrued net owner payable for ${settlement.settlementNumber}`,
    });

    // 3. CREDIT: Expense Recovery (5110) if deductions exist
    const deductionsScaled = toScaledBigInt(deductionsMoney);
    if (deductionsScaled > 0n) {
      lines.push({
        classification: "EXPENSE_RECOVERY",
        amount: deductionsMoney.amount,
        direction: "CREDIT",
        memo: `Maintenance and operational deductions recovered on ${settlement.settlementNumber}`,
      });
    }

    // Verify balance: Debits must exactly equal Credits
    const totalDebitScaled = toScaledBigInt(ownerGrossMoney);
    const totalCreditScaled = toScaledBigInt(netPayoutMoney) + deductionsScaled;

    // Handle small adjustment rounding/balancing if adjustments exist
    if (totalDebitScaled !== totalCreditScaled) {
      const diff = totalDebitScaled - totalCreditScaled;
      if (diff > 0n) {
        // More debits than credits: credit clearing
        lines.push({
          classification: "OWNER_SETTLEMENT_CLEARING",
          amount: fromScaledBigInt(diff, currency).amount,
          direction: "CREDIT",
          memo: `Balancing adjustment for ${settlement.settlementNumber}`,
        });
      } else {
        // More credits than debits: debit expense
        lines.push({
          classification: "OWNER_REVENUE_SHARE_EXPENSE",
          amount: fromScaledBigInt(-diff, currency).amount,
          direction: "DEBIT",
          memo: `Balancing adjustment for ${settlement.settlementNumber}`,
        });
      }
    }

    return {
      sourceType: "OWNER_SETTLEMENT",
      sourceId: settlement.id,
      tenantId: settlement.tenantId,
      eventType: "settlement.approved",
      eventNumber: settlement.settlementNumber,
      effectiveDate: settlement.approvedAt?.split("T")[0] || new Date().toISOString().split("T")[0],
      currency,
      lines,
      metadata: {
        ownerId: settlement.ownerId,
        periodId: settlement.periodId,
        periodStart: settlement.periodStart,
        periodEnd: settlement.periodEnd,
        grossRevenue: settlement.grossRevenue,
        netPayoutAmount: settlement.netPayoutAmount,
        totalDeductions: settlement.totalDeductions,
      },
      postedToLedger: false,
    };
  }

  /**
   * Generates the Balanced Double-Entry Posting Contract when a Settlement is PAID
   * Debits Owner Settlement Clearing (2150)
   * Credits Operating Cash & Bank (1010)
   */
  static createPayoutPosting(settlement: OwnerSettlement, payoutReference: string): FinancialPostingSource {
    const currency = settlement.currency || "KES";
    const netPayoutMoney = createMoney(settlement.netPayoutAmount, currency);

    const lines: FinancialPostingLine[] = [
      {
        classification: "OWNER_SETTLEMENT_CLEARING",
        amount: netPayoutMoney.amount,
        direction: "DEBIT",
        memo: `Clearance of owner liability for ${settlement.settlementNumber}`,
      },
      {
        classification: "CASH_OR_BANK",
        amount: netPayoutMoney.amount,
        direction: "CREDIT",
        memo: `Bank disbursement ref ${payoutReference} for ${settlement.settlementNumber}`,
      },
    ];

    return {
      sourceType: "OWNER_PAYOUT",
      sourceId: settlement.id,
      tenantId: settlement.tenantId,
      eventType: "settlement.paid",
      eventNumber: settlement.settlementNumber,
      effectiveDate: settlement.paidAt?.split("T")[0] || new Date().toISOString().split("T")[0],
      currency,
      lines,
      metadata: {
        ownerId: settlement.ownerId,
        payoutReference,
        payoutMethod: settlement.payoutMethod,
        netPayoutAmount: settlement.netPayoutAmount,
      },
      postedToLedger: false,
    };
  }
}
