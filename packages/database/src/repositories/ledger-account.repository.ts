import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — LEDGER ACCOUNT REPOSITORY (Sprint 20: DOM-003 §35-40)
// Production-grade Multi-Tenant Chart of Accounts & Balances
// ============================================================================

import type {
  LedgerAccount,
  LedgerAccountClassification,
  LedgerAccountSubType,
  LedgerNormalBalance,
  ListLedgerAccountsFilter,
} from "@carhire/types";
import {
  LedgerAccountNotFoundError,
  LedgerAccountCodeAlreadyExistsError,
  CrossTenantViolationError,
  LedgerSystemAccountImmutableError,
} from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface ILedgerAccountRepository {
  findById(id: string, tenantId?: string, tx?: TransactionContext): Promise<LedgerAccount | null>;
  findByCode(accountCode: string, tenantId: string, tx?: TransactionContext): Promise<LedgerAccount | null>;
  listByTenant(tenantId: string, filter?: ListLedgerAccountsFilter, tx?: TransactionContext): Promise<LedgerAccount[]>;
  create(
    data: Omit<LedgerAccount, "id" | "currentBalance" | "debitBalance" | "creditBalance" | "version" | "createdAt" | "updatedAt"> & {
      id?: string;
      currentBalance?: string;
      debitBalance?: string;
      creditBalance?: string;
    },
    tx?: TransactionContext
  ): Promise<LedgerAccount>;
  update(
    id: string,
    tenantId: string,
    updates: Partial<LedgerAccount>,
    tx?: TransactionContext
  ): Promise<LedgerAccount>;
  applyBalanceDelta(
    id: string,
    tenantId: string,
    debitDelta: string,
    creditDelta: string,
    tx?: TransactionContext
  ): Promise<LedgerAccount>;
  seedCanonicalChartOfAccounts(
    tenantId: string,
    currency?: string,
    tx?: TransactionContext
  ): Promise<LedgerAccount[]>;
  delete(id: string, tenantId: string, tx?: TransactionContext): Promise<void>;
}

export const CANONICAL_CHART_OF_ACCOUNTS_TEMPLATE: Array<{
  accountCode: string;
  name: string;
  classification: LedgerAccountClassification;
  subType: LedgerAccountSubType;
  normalBalance: LedgerNormalBalance;
  description: string;
}> = [
  // ASSETS (1000 - 1999) - Normal: DEBIT
  {
    accountCode: "1010",
    name: "Operating Cash & Bank",
    classification: "ASSET",
    subType: "CURRENT_ASSET",
    normalBalance: "DEBIT",
    description: "Primary commercial bank account and operating cash reserves",
  },
  {
    accountCode: "1020",
    name: "Merchant Clearing / Stripe In-Transit",
    classification: "ASSET",
    subType: "CURRENT_ASSET",
    normalBalance: "DEBIT",
    description: "Payment gateway unsettled customer disbursements and card clearings",
  },
  {
    accountCode: "1100",
    name: "Accounts Receivable",
    classification: "ASSET",
    subType: "CURRENT_ASSET",
    normalBalance: "DEBIT",
    description: "Invoiced trade receivables from individual and corporate clients",
  },
  {
    accountCode: "1150",
    name: "Security Deposit Escrow Cash",
    classification: "ASSET",
    subType: "RESTRICTED_CASH",
    normalBalance: "DEBIT",
    description: "Segregated bank holdings backing customer security deposits held",
  },
  {
    accountCode: "1200",
    name: "Prepaid Operational Expenses",
    classification: "ASSET",
    subType: "CURRENT_ASSET",
    normalBalance: "DEBIT",
    description: "Prepaid fleet insurance policies, annual road taxes and licenses",
  },

  // LIABILITIES (2000 - 2999) - Normal: CREDIT
  {
    accountCode: "2010",
    name: "Accounts Payable",
    classification: "LIABILITY",
    subType: "CURRENT_LIABILITY",
    normalBalance: "CREDIT",
    description: "Vendor liabilities for vehicle servicing, parts, fuel, and facilities",
  },
  {
    accountCode: "2050",
    name: "Customer Security Deposits Held",
    classification: "LIABILITY",
    subType: "CURRENT_LIABILITY",
    normalBalance: "CREDIT",
    description: "Escrow liabilities for refundable customer security deposits",
  },
  {
    accountCode: "2060",
    name: "Customer Refunds Payable",
    classification: "LIABILITY",
    subType: "CURRENT_LIABILITY",
    normalBalance: "CREDIT",
    description: "Approved customer refund obligations awaiting bank/gateway execution",
  },
  {
    accountCode: "2100",
    name: "Output VAT / Sales Tax Payable",
    classification: "LIABILITY",
    subType: "CURRENT_LIABILITY",
    normalBalance: "CREDIT",
    description: "Statutory tax accrued on invoiced rental time, services, and incidentals",
  },
  {
    accountCode: "2150",
    name: "Vehicle Owner Settlement Clearing",
    classification: "LIABILITY",
    subType: "CURRENT_LIABILITY",
    normalBalance: "CREDIT",
    description: "Accrued investor revenue-share payouts payable for vehicle usage",
  },

  // EQUITY (3000 - 3999) - Normal: CREDIT
  {
    accountCode: "3010",
    name: "Owner / Shareholder Capital",
    classification: "EQUITY",
    subType: "EQUITY",
    normalBalance: "CREDIT",
    description: "Contributed equity capital and owner investments",
  },
  {
    accountCode: "3020",
    name: "Retained Earnings",
    classification: "EQUITY",
    subType: "EQUITY",
    normalBalance: "CREDIT",
    description: "Accumulated net operational profits and retained surplus",
  },

  // REVENUE (4000 - 4999) - Normal: CREDIT
  {
    accountCode: "4010",
    name: "Rental Base Time Revenue",
    classification: "REVENUE",
    subType: "OPERATING_REVENUE",
    normalBalance: "CREDIT",
    description: "Gross billings for daily, weekly, and monthly vehicle hire time",
  },
  {
    accountCode: "4020",
    name: "Rental Distance / Excess Mileage Revenue",
    classification: "REVENUE",
    subType: "OPERATING_REVENUE",
    normalBalance: "CREDIT",
    description: "Revenue charged for odometer readings exceeding plan allowances",
  },
  {
    accountCode: "4030",
    name: "Delivery & Collection Revenue",
    classification: "REVENUE",
    subType: "OPERATING_REVENUE",
    normalBalance: "CREDIT",
    description: "Charges for customer dispatch, airport delivery, and vehicle recovery",
  },
  {
    accountCode: "4040",
    name: "Damage & Loss Recovery Revenue",
    classification: "REVENUE",
    subType: "OTHER_REVENUE",
    normalBalance: "CREDIT",
    description: "Customer billings and insurance recoveries for vehicle damage",
  },
  {
    accountCode: "4050",
    name: "Fuel Deficit & Refueling Surcharge Revenue",
    classification: "REVENUE",
    subType: "OTHER_REVENUE",
    normalBalance: "CREDIT",
    description: "Fuel variance recovery charges billed to customers upon vehicle return",
  },
  {
    accountCode: "4090",
    name: "Incidental & Fee Revenue",
    classification: "REVENUE",
    subType: "OTHER_REVENUE",
    normalBalance: "CREDIT",
    description: "Cleaning surcharges, late return fees, and traffic fine administration",
  },

  // EXPENSES (5000 - 5999) - Normal: DEBIT
  {
    accountCode: "5010",
    name: "Fleet Fuel Expense",
    classification: "EXPENSE",
    subType: "OPERATING_EXPENSE",
    normalBalance: "DEBIT",
    description: "Direct company-funded refueling and tank maintenance for vehicles",
  },
  {
    accountCode: "5020",
    name: "Fleet Routine Maintenance & Servicing",
    classification: "EXPENSE",
    subType: "OPERATING_EXPENSE",
    normalBalance: "DEBIT",
    description: "Periodic oil changes, filters, brake pads, and tire rotations",
  },
  {
    accountCode: "5030",
    name: "Fleet Unscheduled Repair & Bodywork",
    classification: "EXPENSE",
    subType: "OPERATING_EXPENSE",
    normalBalance: "DEBIT",
    description: "Mechanical breakdowns, collision body repair, and glass replacement",
  },
  {
    accountCode: "5040",
    name: "Fleet Insurance Premium Expense",
    classification: "EXPENSE",
    subType: "OPERATING_EXPENSE",
    normalBalance: "DEBIT",
    description: "Commercial comprehensive motor insurance and passenger liability cover",
  },
  {
    accountCode: "5050",
    name: "Fleet Licensing, Inspection & Regulatory Fees",
    classification: "EXPENSE",
    subType: "OPERATING_EXPENSE",
    normalBalance: "DEBIT",
    description: "PSV badges, commercial transport licenses, and roadworthiness inspections",
  },
  {
    accountCode: "5060",
    name: "Fleet Cleaning & Valeting Expense",
    classification: "EXPENSE",
    subType: "OPERATING_EXPENSE",
    normalBalance: "DEBIT",
    description: "Pre-dispatch sanitation, interior detailing, and exterior car washing",
  },
  {
    accountCode: "5070",
    name: "Parking, Impound & Road Toll Charges",
    classification: "EXPENSE",
    subType: "OPERATING_EXPENSE",
    normalBalance: "DEBIT",
    description: "Municipal highway tolls, airport staging fees, and parking permits",
  },
  {
    accountCode: "5090",
    name: "General Administrative & Merchant Fees",
    classification: "EXPENSE",
    subType: "OPERATING_EXPENSE",
    normalBalance: "DEBIT",
    description: "Gateway interchange commissions, bank fees, and administrative expenses",
  },
  {
    accountCode: "5100",
    name: "Vehicle Owner Revenue Share Expense",
    classification: "EXPENSE",
    subType: "OPERATING_EXPENSE",
    normalBalance: "DEBIT",
    description: "Monthly vehicle revenue-share allocations distributed to third-party owners",
  },
  {
    accountCode: "5110",
    name: "Vehicle Owner Maintenance & Expense Recovery",
    classification: "EXPENSE",
    subType: "OPERATING_EXPENSE",
    normalBalance: "CREDIT",
    description: "Contra-expense for maintenance and operational deductions recovered from owner payouts",
  },
];

export class LedgerAccountRepository implements ILedgerAccountRepository {
  private static store = createRecordStore<string, LedgerAccount>("ledger-account.repository:store");

  static clear(): void {
    LedgerAccountRepository.store.clear();
  }

  async findById(id: string, tenantId?: string): Promise<LedgerAccount | null> {
    const account = LedgerAccountRepository.store.get(id);
    if (!account) return null;
    if (tenantId && account.tenantId !== tenantId) {
      throw new CrossTenantViolationError(account.tenantId, tenantId);
    }
    return { ...account };
  }

  async findByCode(accountCode: string, tenantId: string): Promise<LedgerAccount | null> {
    for (const account of LedgerAccountRepository.store.values()) {
      if (account.tenantId === tenantId && account.accountCode === accountCode) {
        return { ...account };
      }
    }
    return null;
  }

  async listByTenant(tenantId: string, filter?: ListLedgerAccountsFilter): Promise<LedgerAccount[]> {
    let accounts = Array.from(LedgerAccountRepository.store.values()).filter(
      (a) => a.tenantId === tenantId
    );

    if (filter?.classification) {
      accounts = accounts.filter((a) => a.classification === filter.classification);
    }
    if (filter?.status) {
      accounts = accounts.filter((a) => a.status === filter.status);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      accounts = accounts.filter(
        (a) => a.accountCode.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
      );
    }

    // Sort by account code ascending
    return accounts
      .sort((a, b) => a.accountCode.localeCompare(b.accountCode))
      .map((a) => ({ ...a }));
  }

  async create(
    data: Omit<LedgerAccount, "id" | "currentBalance" | "debitBalance" | "creditBalance" | "version" | "createdAt" | "updatedAt"> & {
      id?: string;
      currentBalance?: string;
      debitBalance?: string;
      creditBalance?: string;
    }
  ): Promise<LedgerAccount> {
    const existing = await this.findByCode(data.accountCode, data.tenantId);
    if (existing) {
      throw new LedgerAccountCodeAlreadyExistsError(data.accountCode);
    }

    const now = new Date().toISOString();
    const id = data.id || `acc_${Math.random().toString(36).substring(2, 11)}`;

    const newAccount: LedgerAccount = {
      id,
      tenantId: data.tenantId,
      accountCode: data.accountCode,
      name: data.name,
      classification: data.classification,
      subType: data.subType,
      normalBalance: data.normalBalance || (data.classification === "ASSET" || data.classification === "EXPENSE" ? "DEBIT" : "CREDIT"),
      currency: data.currency || "KES",
      isSystemAccount: data.isSystemAccount ?? false,
      status: data.status || "ACTIVE",
      currentBalance: data.currentBalance || "0.0000",
      debitBalance: data.debitBalance || "0.0000",
      creditBalance: data.creditBalance || "0.0000",
      description: data.description,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    LedgerAccountRepository.store.set(id, newAccount);
    return { ...newAccount };
  }

  async update(
    id: string,
    tenantId: string,
    updates: Partial<LedgerAccount>
  ): Promise<LedgerAccount> {
    const existing = await this.findById(id, tenantId);
    if (!existing) {
      throw new LedgerAccountNotFoundError(id);
    }

    if (existing.isSystemAccount && updates.isSystemAccount === false) {
      throw new LedgerSystemAccountImmutableError(existing.accountCode);
    }

    const updated: LedgerAccount = {
      ...existing,
      ...updates,
      id: existing.id,
      tenantId: existing.tenantId,
      accountCode: existing.accountCode, // Account code is immutable
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    };

    LedgerAccountRepository.store.set(id, updated);
    return { ...updated };
  }

  async applyBalanceDelta(
    id: string,
    tenantId: string,
    debitDelta: string,
    creditDelta: string
  ): Promise<LedgerAccount> {
    const existing = await this.findById(id, tenantId);
    if (!existing) {
      throw new LedgerAccountNotFoundError(id);
    }

    const toMinor = (val: string): bigint => {
      const [whole, dec = ""] = val.split(".");
      const padded = dec.padEnd(4, "0").substring(0, 4);
      return BigInt(`${whole}${padded}`);
    };

    const fromMinor = (units: bigint): string => {
      const isNeg = units < 0n;
      const abs = isNeg ? -units : units;
      const str = abs.toString().padStart(5, "0");
      const whole = str.slice(0, -4) || "0";
      const dec = str.slice(-4);
      return `${isNeg ? "-" : ""}${whole}.${dec}`;
    };

    const currentDebit = toMinor(existing.debitBalance);
    const currentCredit = toMinor(existing.creditBalance);

    const dDelta = toMinor(debitDelta);
    const cDelta = toMinor(creditDelta);

    const newDebitUnits = currentDebit + dDelta;
    const newCreditUnits = currentCredit + cDelta;

    // Normal balance calculation
    // Debit-normal (Assets, Expenses): balance = debits - credits
    // Credit-normal (Liabilities, Equity, Revenue): balance = credits - debits
    const balanceUnits =
      existing.normalBalance === "DEBIT"
        ? newDebitUnits - newCreditUnits
        : newCreditUnits - newDebitUnits;

    const updated: LedgerAccount = {
      ...existing,
      debitBalance: fromMinor(newDebitUnits),
      creditBalance: fromMinor(newCreditUnits),
      currentBalance: fromMinor(balanceUnits),
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    };

    LedgerAccountRepository.store.set(id, updated);
    return { ...updated };
  }

  async seedCanonicalChartOfAccounts(
    tenantId: string,
    currency = "KES"
  ): Promise<LedgerAccount[]> {
    const created: LedgerAccount[] = [];

    for (const item of CANONICAL_CHART_OF_ACCOUNTS_TEMPLATE) {
      const existing = await this.findByCode(item.accountCode, tenantId);
      if (!existing) {
        const acc = await this.create({
          tenantId,
          accountCode: item.accountCode,
          name: item.name,
          classification: item.classification,
          subType: item.subType,
          normalBalance: item.normalBalance,
          currency,
          isSystemAccount: true,
          status: "ACTIVE",
          description: item.description,
        });
        created.push(acc);
      } else {
        created.push(existing);
      }
    }

    return created;
  }

  async delete(id: string, tenantId: string): Promise<void> {
    const account = await this.findById(id, tenantId);
    if (!account) {
      throw new LedgerAccountNotFoundError(id);
    }
    if (account.isSystemAccount) {
      throw new LedgerSystemAccountImmutableError(account.accountCode);
    }
    LedgerAccountRepository.store.delete(id);
  }
}
