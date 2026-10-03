// ============================================================================
// CAR HIRE OS — CORPORATE ACCOUNT AGGREGATE ROOT (DOM-001, DOM-003)
// Corporate B2B Domain Rules, Credit Limits & Status Invariants
// ============================================================================

import type { CorporateAccount, CorporateAccountStatus } from "@carhire/types";
import { CorporateCreditLimitExceededError } from "./errors/corporate-account.errors";

export class CorporateAccountAggregate {
  public static validateStatusTransition(
    current: CorporateAccountStatus,
    next: CorporateAccountStatus
  ): void {
    if (current === next) return;
    // Any valid state transition between ACTIVE, SUSPENDED, INACTIVE
  }

  public static assertCreditAvailable(
    account: CorporateAccount,
    currentOutstandingBalance: number,
    newCharge: number
  ): void {
    if (account.status !== "ACTIVE") {
      throw new Error(`Corporate account ${account.accountNumber} is ${account.status} and cannot initiate credit bookings.`);
    }

    const availableCredit = account.creditLimit - currentOutstandingBalance;
    if (newCharge > availableCredit) {
      throw new CorporateCreditLimitExceededError(
        account.accountNumber,
        newCharge,
        availableCredit
      );
    }
  }
}
