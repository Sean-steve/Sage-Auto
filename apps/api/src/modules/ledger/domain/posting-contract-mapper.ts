// ============================================================================
// CAR HIRE OS — POSTING CONTRACT MAPPER (Sprint 20: DOM-003 §35-40)
// Translates Domain Posting Contracts to Double-Entry General Ledger Postings
// ============================================================================

import type {
  FinancialPostingSource,
  FinancialPostingLine,
  PostJournalEntryInput,
  JournalSourceType,
} from "@carhire/types";

export class PostingContractMapper {
  /**
   * Default canonical Chart of Accounts code resolution for posting line classifications
   */
  static resolveAccountCode(line: FinancialPostingLine, metadata?: Record<string, unknown>): string {
    switch (line.classification) {
      case "ACCOUNTS_RECEIVABLE":
        return "1100"; // Trade Debtors

      case "RENTAL_REVENUE":
        return "4010"; // Rental Base Time Revenue

      case "DAMAGE_RECOVERY_REVENUE":
        return "4040"; // Damage & Loss Recovery Revenue

      case "INCIDENTAL_REVENUE":
        return "4090"; // Incidental & Fee Revenue

      case "OUTPUT_VAT":
        return "2100"; // Output VAT / Sales Tax Payable

      case "DEPOSIT_LIABILITY":
        return "2050"; // Customer Security Deposits Held

      case "REFUND_PAYABLE":
        return "2060"; // Customer Refunds Payable

      case "CASH_OR_BANK":
        return "1010"; // Operating Cash & Bank

      case "OWNER_REVENUE_SHARE_EXPENSE":
        return "5100"; // Vehicle Owner Revenue Share Expense

      case "OWNER_SETTLEMENT_CLEARING":
        return "2150"; // Vehicle Owner Settlement Clearing / Payable

      case "EXPENSE_RECOVERY":
        return "5110"; // Vehicle Owner Maintenance & Expense Recovery

      case "OPERATING_EXPENSE": {
        // Map specific operational expense categories if provided in metadata or memo
        const category = (metadata?.category as string) || (metadata?.expenseCategory as string);
        if (category) {
          switch (category) {
            case "FUEL":
              return "5010"; // Fleet Fuel Expense
            case "MAINTENANCE":
              return "5020"; // Routine Maintenance & Servicing
            case "REPAIR":
              return "5030"; // Unscheduled Repair & Bodywork
            case "INSURANCE":
              return "5040"; // Fleet Insurance Premium
            case "LICENSING":
              return "5050"; // Fleet Licensing & Permits
            case "CLEANING":
              return "5060"; // Fleet Cleaning & Valeting
            case "TOLLS":
              return "5070"; // Parking, Impounds & Road Tolls
            default:
              return "5090"; // General Administrative & Operational Expense
          }
        }
        return "5090";
      }

      default:
        return "5090";
    }
  }

  /**
   * Transforms a domain FinancialPostingSource into standardized journal entry inputs
   */
  static mapSourceToJournalInputs(source: FinancialPostingSource): {
    sourceType: JournalSourceType;
    sourceId: string;
    sourceNumber: string;
    eventType: string;
    transactionDate: string;
    currency: string;
    description: string;
    idempotencyKey: string;
    entries: PostJournalEntryInput[];
  } {
    const entries: PostJournalEntryInput[] = source.lines.map((l) => {
      const accountCode = this.resolveAccountCode(l, source.metadata);
      return {
        accountCode,
        direction: l.direction,
        amount: l.amount,
        memo: l.memo || `${source.eventType} [${source.eventNumber}]`,
        vehicleId: l.vehicleId,
        customerId: l.customerId,
      };
    });

    const description = `Posting for ${source.eventType}: ${source.eventNumber} (${source.sourceType})`;
    const idempotencyKey = `posting:${source.tenantId}:${source.sourceType}:${source.sourceId}:${source.eventType}`;

    return {
      sourceType: source.sourceType as JournalSourceType,
      sourceId: source.sourceId,
      sourceNumber: source.eventNumber,
      eventType: source.eventType,
      transactionDate: source.effectiveDate || new Date().toISOString().split("T")[0],
      currency: source.currency || "KES",
      description,
      idempotencyKey,
      entries,
    };
  }
}
