// ============================================================================
// CAR HIRE OS — BALANCED POSTING VALIDATOR (Sprint 20: DOM-003 §35-40)
// Decimal-Safe Invariant Checking Engine for Double-Entry Accounting
// ============================================================================

import type { LedgerAccount } from "@carhire/types";
import {
  LedgerUnbalancedPostingError,
  LedgerPostingValidationError,
  LedgerAccountSuspendedOrClosedError,
  LedgerAccountCurrencyMismatchError,
} from "@carhire/database";

export interface PostingLineValidationInput {
  account: LedgerAccount;
  direction: "DEBIT" | "CREDIT";
  amount: string;
}

export class BalancedPostingValidator {
  /**
   * Converts a numeric string to minor units using 4 decimal precision
   * e.g. "125.5000" -> 1255000n
   */
  static toMinorUnits(value: string | number): bigint {
    const str = typeof value === "number" ? value.toFixed(4) : value.trim();
    if (!/^-?\d+(\.\d+)?$/.test(str)) {
      throw new LedgerPostingValidationError(`Invalid numerical amount: '${str}'`);
    }
    const isNegative = str.startsWith("-");
    const cleanStr = isNegative ? str.slice(1) : str;
    const [whole, dec = ""] = cleanStr.split(".");
    const paddedDec = dec.padEnd(4, "0").substring(0, 4);
    const units = BigInt(`${whole}${paddedDec}`);
    return isNegative ? -units : units;
  }

  /**
   * Converts 4-decimal minor units back to fixed 4-decimal string
   * e.g. 1255000n -> "125.5000"
   */
  static fromMinorUnits(units: bigint): string {
    const isNegative = units < 0n;
    const abs = isNegative ? -units : units;
    const str = abs.toString().padStart(5, "0");
    const whole = str.slice(0, -4) || "0";
    const dec = str.slice(-4);
    return `${isNegative ? "-" : ""}${whole}.${dec}`;
  }

  /**
   * Validates all canonical double-entry posting rules
   */
  static validate(
    lines: PostingLineValidationInput[],
    expectedCurrency: string
  ): { totalDebitUnits: bigint; totalCreditUnits: bigint; totalDebitStr: string; totalCreditStr: string } {
    if (!lines || lines.length < 2) {
      throw new LedgerPostingValidationError(
        "A balanced journal transaction must contain at least 2 entry lines (minimum 1 debit and 1 credit)."
      );
    }

    let hasDebit = false;
    let hasCredit = false;
    let totalDebitUnits = 0n;
    let totalCreditUnits = 0n;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const { account, direction, amount } = line;

      // 1. Account active check
      if (account.status !== "ACTIVE") {
        throw new LedgerAccountSuspendedOrClosedError(account.accountCode, account.status);
      }

      // 2. Currency match check
      if (account.currency && account.currency !== expectedCurrency) {
        throw new LedgerAccountCurrencyMismatchError(account.accountCode, account.currency, expectedCurrency);
      }

      // 3. Amount must be positive
      const units = this.toMinorUnits(amount);
      if (units <= 0n) {
        throw new LedgerPostingValidationError(
          `Line ${i + 1} for account '${account.accountCode}' has non-positive amount (${amount}). Line amounts must be strictly greater than zero.`
        );
      }

      if (direction === "DEBIT") {
        hasDebit = true;
        totalDebitUnits += units;
      } else if (direction === "CREDIT") {
        hasCredit = true;
        totalCreditUnits += units;
      } else {
        throw new LedgerPostingValidationError(`Invalid posting direction '${direction}'. Must be 'DEBIT' or 'CREDIT'.`);
      }
    }

    if (!hasDebit || !hasCredit) {
      throw new LedgerPostingValidationError(
        "A journal transaction must have at least one DEBIT entry and at least one CREDIT entry."
      );
    }

    // 4. Zero-sum balancing check
    if (totalDebitUnits !== totalCreditUnits) {
      const debitStr = this.fromMinorUnits(totalDebitUnits);
      const creditStr = this.fromMinorUnits(totalCreditUnits);
      throw new LedgerUnbalancedPostingError(debitStr, creditStr);
    }

    return {
      totalDebitUnits,
      totalCreditUnits,
      totalDebitStr: this.fromMinorUnits(totalDebitUnits),
      totalCreditStr: this.fromMinorUnits(totalCreditUnits),
    };
  }
}
