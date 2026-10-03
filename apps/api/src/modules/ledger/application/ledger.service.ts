// ============================================================================
// CAR HIRE OS — GENERAL LEDGER APPLICATION SERVICE (Sprint 20: DOM-003 §35-40)
// Complete Double-Entry Accounting, Balanced Posting, Reversals & Audit Read Models
// ============================================================================

import type {
  LedgerAccount,
  LedgerNormalBalance,
  JournalTransaction,
  JournalEntry,
  TrialBalanceReport,
  TrialBalanceAccountRow,
  GeneralLedgerAccountStatement,
  GeneralLedgerLine,
  CreateLedgerAccountDto,
  UpdateLedgerAccountDto,
  PostManualJournalDto,
  PostJournalEntryInput,
  FinancialPostingSource,
  ListLedgerAccountsFilter,
  ListJournalsFilter,
  GeneralLedgerQueryDto,
} from "@carhire/types";
import {
  ILedgerAccountRepository,
  IJournalTransactionRepository,
  IJournalEntryRepository,
  IAuditRepository,
  LedgerAccountNotFoundError,
  JournalTransactionNotFoundError,
  JournalAlreadyReversedError,
  JournalAlreadyPostedError,
  LedgerDuplicateTransactionError,
} from "@carhire/database";
import { BalancedPostingValidator, PostingLineValidationInput } from "../domain/balanced-posting-validator";
import { PostingContractMapper } from "../domain/posting-contract-mapper";

export interface LedgerActor {
  userId: string;
  email?: string;
}

export class LedgerService {
  constructor(
    private readonly accountRepo: ILedgerAccountRepository,
    private readonly journalTxRepo: IJournalTransactionRepository,
    private readonly journalEntryRepo: IJournalEntryRepository,
    private readonly auditRepo?: IAuditRepository
  ) {}

  // --------------------------------------------------------------------------
  // 1. CHART OF ACCOUNTS MANAGEMENT
  // --------------------------------------------------------------------------

  async ensureChartOfAccounts(tenantId: string, currency = "KES"): Promise<LedgerAccount[]> {
    return this.accountRepo.seedCanonicalChartOfAccounts(tenantId, currency);
  }

  async createAccount(
    tenantId: string,
    dto: CreateLedgerAccountDto,
    actor: LedgerActor
  ): Promise<LedgerAccount> {
    const normalBalance: LedgerNormalBalance =
      dto.normalBalance ||
      (dto.classification === "ASSET" || dto.classification === "EXPENSE" ? "DEBIT" : "CREDIT");

    const account = await this.accountRepo.create({
      tenantId,
      accountCode: dto.accountCode,
      name: dto.name,
      classification: dto.classification,
      subType: dto.subType,
      normalBalance,
      currency: dto.currency || "KES",
      isSystemAccount: false,
      status: "ACTIVE",
      description: dto.description,
    });

    await this.auditRepo?.record({
      tenantId,
      actorUserId: actor.userId,
      actorType: "USER",
      action: "LEDGER_ACCOUNT_CREATED",
      resourceType: "LEDGER_ACCOUNT",
      resourceId: account.id,
      description: `Created custom ledger account ${account.accountCode} - ${account.name}`,
      payload: { accountCode: account.accountCode, classification: account.classification },
    });

    return account;
  }

  async updateAccount(
    tenantId: string,
    accountId: string,
    dto: UpdateLedgerAccountDto,
    actor: LedgerActor
  ): Promise<LedgerAccount> {
    const updated = await this.accountRepo.update(accountId, tenantId, dto);

    await this.auditRepo?.record({
      tenantId,
      actorUserId: actor.userId,
      actorType: "USER",
      action: "LEDGER_ACCOUNT_UPDATED",
      resourceType: "LEDGER_ACCOUNT",
      resourceId: updated.id,
      description: `Updated ledger account ${updated.accountCode}`,
      payload: { ...dto },
    });

    return updated;
  }

  async getAccount(tenantId: string, accountId: string): Promise<LedgerAccount> {
    const account = await this.accountRepo.findById(accountId, tenantId);
    if (!account) {
      throw new LedgerAccountNotFoundError(accountId);
    }
    return account;
  }

  async listAccounts(
    tenantId: string,
    filter?: ListLedgerAccountsFilter
  ): Promise<LedgerAccount[]> {
    // Auto-seed canonical accounts if empty for this tenant
    const existing = await this.accountRepo.listByTenant(tenantId, filter);
    if (existing.length === 0 && !filter?.search && !filter?.classification) {
      return this.ensureChartOfAccounts(tenantId);
    }
    return existing;
  }

  // --------------------------------------------------------------------------
  // 2. BALANCED JOURNAL POSTING ENGINE
  // --------------------------------------------------------------------------

  async postJournal(
    tenantId: string,
    dto: PostManualJournalDto,
    actor: LedgerActor
  ): Promise<JournalTransaction> {
    // 1. Idempotency safeguard
    if (dto.idempotencyKey) {
      const existing = await this.journalTxRepo.findByIdempotencyKey(dto.idempotencyKey, tenantId);
      if (existing) {
        return existing;
      }
    }

    // Ensure Chart of Accounts is initialized
    await this.ensureChartOfAccounts(tenantId, dto.currency || "KES");

    const currency = dto.currency || "KES";
    const transactionDate = dto.transactionDate || new Date().toISOString().split("T")[0];

    // 2. Resolve accounts for all lines
    const lineValidationInputs: PostingLineValidationInput[] = [];
    const resolvedLines: Array<{
      account: LedgerAccount;
      direction: "DEBIT" | "CREDIT";
      amount: string;
      memo?: string;
      vehicleId?: string;
      customerId?: string;
      corporateAccountId?: string;
      rentalId?: string;
      bookingId?: string;
      vehicleOwnerId?: string;
    }> = [];

    for (const line of dto.entries) {
      let account: LedgerAccount | null = null;
      if (line.accountId) {
        account = await this.accountRepo.findById(line.accountId, tenantId);
      } else if (line.accountCode) {
        account = await this.accountRepo.findByCode(line.accountCode, tenantId);
      }

      if (!account) {
        throw new LedgerAccountNotFoundError(line.accountId || line.accountCode || "UNKNOWN");
      }

      const formattedAmount =
        typeof line.amount === "number" ? line.amount.toFixed(4) : parseFloat(line.amount).toFixed(4);

      lineValidationInputs.push({
        account,
        direction: line.direction,
        amount: formattedAmount,
      });

      resolvedLines.push({
        account,
        direction: line.direction,
        amount: formattedAmount,
        memo: line.memo,
        vehicleId: line.vehicleId,
        customerId: line.customerId,
        corporateAccountId: line.corporateAccountId,
        rentalId: line.rentalId,
        bookingId: line.bookingId,
        vehicleOwnerId: line.vehicleOwnerId,
      });
    }

    // 3. Domain invariant validation
    const { totalDebitStr, totalCreditStr } = BalancedPostingValidator.validate(
      lineValidationInputs,
      currency
    );

    // 4. Create Journal Transaction header
    const journalTx = await this.journalTxRepo.create({
      tenantId,
      status: "POSTED",
      transactionDate,
      sourceType: "MANUAL_ADJUSTMENT",
      currency,
      totalDebit: totalDebitStr,
      totalCredit: totalCreditStr,
      description: dto.description,
      idempotencyKey: dto.idempotencyKey,
      postedByUserId: actor.userId,
      metadata: dto.metadata,
      entries: [],
    });

    // 5. Create immutable journal entry lines
    const entryInputs = resolvedLines.map((l, idx) => ({
      transactionId: journalTx.id,
      tenantId,
      accountId: l.account.id,
      accountCode: l.account.accountCode,
      accountName: l.account.name,
      direction: l.direction,
      amount: l.amount,
      memo: l.memo || dto.description,
      vehicleId: l.vehicleId,
      customerId: l.customerId,
      corporateAccountId: l.corporateAccountId,
      rentalId: l.rentalId,
      bookingId: l.bookingId,
      vehicleOwnerId: l.vehicleOwnerId,
      sortOrder: idx + 1,
    }));

    const entries = await this.journalEntryRepo.createMany(entryInputs);
    journalTx.entries = entries;

    // 6. Update cached account balances atomically
    for (const l of resolvedLines) {
      const debitDelta = l.direction === "DEBIT" ? l.amount : "0.0000";
      const creditDelta = l.direction === "CREDIT" ? l.amount : "0.0000";
      await this.accountRepo.applyBalanceDelta(l.account.id, tenantId, debitDelta, creditDelta);
    }

    // 7. Audit log
    await this.auditRepo?.record({
      tenantId,
      actorUserId: actor.userId,
      actorType: "USER",
      action: "LEDGER_JOURNAL_POSTED",
      resourceType: "JOURNAL_TRANSACTION",
      resourceId: journalTx.id,
      description: `Posted journal ${journalTx.transactionNumber} for ${journalTx.totalDebit} ${currency}`,
      payload: {
        transactionNumber: journalTx.transactionNumber,
        totalDebit: journalTx.totalDebit,
        lineCount: entries.length,
      },
    });

    return journalTx;
  }

  // --------------------------------------------------------------------------
  // 3. SOURCE CONTRACT INGESTION ENGINE
  // --------------------------------------------------------------------------

  async postFromSourceContract(
    tenantId: string,
    source: FinancialPostingSource,
    actor: LedgerActor
  ): Promise<JournalTransaction> {
    // 1. Check idempotency: deduplicate existing posted journal
    const existing = await this.journalTxRepo.findBySource(
      source.sourceType as any,
      source.sourceId,
      tenantId,
      source.eventType
    );
    if (existing) {
      return existing;
    }

    // Ensure Chart of Accounts exists
    await this.ensureChartOfAccounts(tenantId, source.currency || "KES");

    // Map source contract into standard journal entry inputs
    const mapped = PostingContractMapper.mapSourceToJournalInputs(source);

    // Resolve accounts and validate lines
    const lineValidationInputs: PostingLineValidationInput[] = [];
    const resolvedLines: Array<{
      account: LedgerAccount;
      direction: "DEBIT" | "CREDIT";
      amount: string;
      memo?: string;
      vehicleId?: string;
      customerId?: string;
    }> = [];

    for (const entry of mapped.entries) {
      const account = await this.accountRepo.findByCode(entry.accountCode!, tenantId);
      if (!account) {
        throw new LedgerAccountNotFoundError(entry.accountCode!);
      }

      const formattedAmount =
        typeof entry.amount === "number" ? entry.amount.toFixed(4) : parseFloat(entry.amount).toFixed(4);

      lineValidationInputs.push({
        account,
        direction: entry.direction,
        amount: formattedAmount,
      });

      resolvedLines.push({
        account,
        direction: entry.direction,
        amount: formattedAmount,
        memo: entry.memo,
        vehicleId: entry.vehicleId,
        customerId: entry.customerId,
      });
    }

    // Validate double-entry invariant
    const { totalDebitStr, totalCreditStr } = BalancedPostingValidator.validate(
      lineValidationInputs,
      mapped.currency
    );

    // Create journal transaction
    const journalTx = await this.journalTxRepo.create({
      tenantId,
      status: "POSTED",
      transactionDate: mapped.transactionDate,
      sourceType: mapped.sourceType,
      sourceId: mapped.sourceId,
      sourceNumber: mapped.sourceNumber,
      eventType: mapped.eventType,
      currency: mapped.currency,
      totalDebit: totalDebitStr,
      totalCredit: totalCreditStr,
      description: mapped.description,
      idempotencyKey: mapped.idempotencyKey,
      postedByUserId: actor.userId,
      metadata: source.metadata,
      entries: [],
    });

    // Create entry lines
    const entryInputs = resolvedLines.map((l, idx) => ({
      transactionId: journalTx.id,
      tenantId,
      accountId: l.account.id,
      accountCode: l.account.accountCode,
      accountName: l.account.name,
      direction: l.direction,
      amount: l.amount,
      memo: l.memo || mapped.description,
      vehicleId: l.vehicleId,
      customerId: l.customerId,
      sortOrder: idx + 1,
    }));

    const entries = await this.journalEntryRepo.createMany(entryInputs);
    journalTx.entries = entries;

    // Update account balances
    for (const l of resolvedLines) {
      const debitDelta = l.direction === "DEBIT" ? l.amount : "0.0000";
      const creditDelta = l.direction === "CREDIT" ? l.amount : "0.0000";
      await this.accountRepo.applyBalanceDelta(l.account.id, tenantId, debitDelta, creditDelta);
    }

    await this.auditRepo?.record({
      tenantId,
      actorUserId: actor.userId,
      actorType: "USER",
      action: "LEDGER_SOURCE_POSTED",
      resourceType: "JOURNAL_TRANSACTION",
      resourceId: journalTx.id,
      description: `Posted source document ${source.sourceType} ${source.eventNumber} to ledger (${journalTx.transactionNumber})`,
      payload: {
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        transactionNumber: journalTx.transactionNumber,
      },
    });

    return journalTx;
  }

  async reverseSourcePosting(
    tenantId: string,
    sourceType: string,
    sourceId: string,
    eventType: string,
    actor: LedgerActor,
    reason = "Source posting reversal"
  ): Promise<JournalTransaction | null> {
    const original = await this.journalTxRepo.findBySource(
      sourceType as any,
      sourceId,
      tenantId,
      eventType
    );
    if (!original) return null;
    if (original.status === "REVERSED") return original;
    return this.reverseJournal(tenantId, original.id, actor, reason);
  }

  // --------------------------------------------------------------------------
  // 4. JOURNAL REVERSAL ENGINE
  // --------------------------------------------------------------------------

  async reverseJournal(
    tenantId: string,
    journalId: string,
    actor: LedgerActor,
    reason = "Transaction reversal"
  ): Promise<JournalTransaction> {
    const original = await this.journalTxRepo.findById(journalId, tenantId);
    if (!original) {
      throw new JournalTransactionNotFoundError(journalId);
    }

    if (original.status === "REVERSED") {
      throw new JournalAlreadyReversedError(journalId);
    }

    const entries = await this.journalEntryRepo.findByTransactionId(journalId, tenantId);
    if (entries.length === 0) {
      throw new JournalTransactionNotFoundError(`Entries for journal ${journalId}`);
    }

    const now = new Date().toISOString().split("T")[0];
    const reversalDescription = `Reversal of ${original.transactionNumber}: ${reason}`;

    // Create inverted entries (Debits become Credits, Credits become Debits)
    const invertedInputs: PostJournalEntryInput[] = entries.map((e) => ({
      accountId: e.accountId,
      accountCode: e.accountCode,
      direction: e.direction === "DEBIT" ? "CREDIT" : "DEBIT",
      amount: e.amount,
      memo: `Reversal of line ${e.sortOrder} from ${original.transactionNumber}`,
      vehicleId: e.vehicleId,
      customerId: e.customerId,
      corporateAccountId: e.corporateAccountId,
      rentalId: e.rentalId,
      bookingId: e.bookingId,
      vehicleOwnerId: e.vehicleOwnerId,
    }));

    // Create the reversal journal header
    const reversalTx = await this.journalTxRepo.create({
      tenantId,
      status: "POSTED",
      transactionDate: now,
      sourceType: "SYSTEM_REVERSAL",
      sourceId: original.id,
      sourceNumber: original.transactionNumber,
      eventType: "ledger.journal.reversed",
      currency: original.currency,
      totalDebit: original.totalCredit, // Balanced: inverted debits equal original credits
      totalCredit: original.totalDebit,
      description: reversalDescription,
      reversalOfJournalId: original.id,
      postedByUserId: actor.userId,
      entries: [],
    });

    // Create reversal lines
    const reversalEntries = await this.journalEntryRepo.createMany(
      invertedInputs.map((l, idx) => ({
        transactionId: reversalTx.id,
        tenantId,
        accountId: l.accountId!,
        accountCode: l.accountCode!,
        accountName: "",
        direction: l.direction,
        amount: String(l.amount),
        memo: l.memo,
        vehicleId: l.vehicleId,
        customerId: l.customerId,
        corporateAccountId: l.corporateAccountId,
        rentalId: l.rentalId,
        bookingId: l.bookingId,
        vehicleOwnerId: l.vehicleOwnerId,
        sortOrder: idx + 1,
      }))
    );
    reversalTx.entries = reversalEntries;

    // Apply inverse deltas to account balances
    for (const inv of invertedInputs) {
      const debitDelta = inv.direction === "DEBIT" ? String(inv.amount) : "0.0000";
      const creditDelta = inv.direction === "CREDIT" ? String(inv.amount) : "0.0000";
      await this.accountRepo.applyBalanceDelta(inv.accountId!, tenantId, debitDelta, creditDelta);
    }

    // Mark original journal as REVERSED
    await this.journalTxRepo.update(original.id, tenantId, {
      status: "REVERSED",
      reversedByJournalId: reversalTx.id,
    });

    // Audit log
    await this.auditRepo?.record({
      tenantId,
      actorUserId: actor.userId,
      actorType: "USER",
      action: "LEDGER_JOURNAL_REVERSED",
      resourceType: "JOURNAL_TRANSACTION",
      resourceId: original.id,
      description: `Reversed journal ${original.transactionNumber} with ${reversalTx.transactionNumber}`,
      payload: {
        originalJournalId: original.id,
        reversalJournalId: reversalTx.id,
        reason,
      },
    });

    return reversalTx;
  }

  async getJournal(tenantId: string, journalId: string): Promise<JournalTransaction> {
    const tx = await this.journalTxRepo.findById(journalId, tenantId);
    if (!tx) {
      throw new JournalTransactionNotFoundError(journalId);
    }
    tx.entries = await this.journalEntryRepo.findByTransactionId(tx.id, tenantId);
    return tx;
  }

  async listJournals(
    tenantId: string,
    filter?: ListJournalsFilter
  ): Promise<JournalTransaction[]> {
    const list = await this.journalTxRepo.listByTenant(tenantId, filter);
    for (const tx of list) {
      if (!tx.entries || tx.entries.length === 0) {
        tx.entries = await this.journalEntryRepo.findByTransactionId(tx.id, tenantId);
      }
    }
    return list;
  }

  // --------------------------------------------------------------------------
  // 5. READ MODELS: TRIAL BALANCE & GENERAL LEDGER STATEMENTS
  // --------------------------------------------------------------------------

  async getTrialBalance(tenantId: string, asOfDate?: string): Promise<TrialBalanceReport> {
    await this.ensureChartOfAccounts(tenantId);
    const accounts = await this.accountRepo.listByTenant(tenantId);

    const toMinor = (val: string): bigint => BalancedPostingValidator.toMinorUnits(val);
    const fromMinor = (units: bigint): string => BalancedPostingValidator.fromMinorUnits(units);

    let grandTotalDebitUnits = 0n;
    let grandTotalCreditUnits = 0n;

    const rows: TrialBalanceAccountRow[] = [];

    for (const acc of accounts) {
      // Fetch entries up to asOfDate if provided, or use cached cumulative balances
      let debitUnits = 0n;
      let creditUnits = 0n;

      if (asOfDate) {
        const lines = await this.journalEntryRepo.findByAccount(acc.id, tenantId);
        for (const line of lines) {
          if (line.createdAt <= asOfDate || !asOfDate) {
            const u = toMinor(line.amount);
            if (line.direction === "DEBIT") debitUnits += u;
            else creditUnits += u;
          }
        }
      } else {
        debitUnits = toMinor(acc.debitBalance);
        creditUnits = toMinor(acc.creditBalance);
      }

      // Net column logic:
      // If debit > credit -> Net Debit = debit - credit, Net Credit = 0
      // If credit > debit -> Net Credit = credit - debit, Net Debit = 0
      let netDebitUnits = 0n;
      let netCreditUnits = 0n;
      let netBalanceUnits = 0n;

      if (acc.normalBalance === "DEBIT") {
        netBalanceUnits = debitUnits - creditUnits;
      } else {
        netBalanceUnits = creditUnits - debitUnits;
      }

      if (debitUnits > creditUnits) {
        netDebitUnits = debitUnits - creditUnits;
      } else if (creditUnits > debitUnits) {
        netCreditUnits = creditUnits - debitUnits;
      }

      grandTotalDebitUnits += netDebitUnits;
      grandTotalCreditUnits += netCreditUnits;

      rows.push({
        accountId: acc.id,
        accountCode: acc.accountCode,
        accountName: acc.name,
        classification: acc.classification,
        normalBalance: acc.normalBalance,
        debitTotal: fromMinor(debitUnits),
        creditTotal: fromMinor(creditUnits),
        netDebit: fromMinor(netDebitUnits),
        netCredit: fromMinor(netCreditUnits),
        netBalance: fromMinor(netBalanceUnits),
      });
    }

    const isBalanced = grandTotalDebitUnits === grandTotalCreditUnits;
    const imbalanceUnits =
      grandTotalDebitUnits > grandTotalCreditUnits
        ? grandTotalDebitUnits - grandTotalCreditUnits
        : grandTotalCreditUnits - grandTotalDebitUnits;

    return {
      tenantId,
      asOfDate: asOfDate || new Date().toISOString(),
      currency: accounts[0]?.currency || "KES",
      accounts: rows,
      totalDebits: fromMinor(grandTotalDebitUnits),
      totalCredits: fromMinor(grandTotalCreditUnits),
      imbalanceAmount: fromMinor(imbalanceUnits),
      isBalanced,
    };
  }

  async getGeneralLedgerStatement(
    tenantId: string,
    accountId: string,
    query?: GeneralLedgerQueryDto
  ): Promise<GeneralLedgerAccountStatement> {
    const account = await this.getAccount(tenantId, accountId);
    const toMinor = (val: string): bigint => BalancedPostingValidator.toMinorUnits(val);
    const fromMinor = (units: bigint): string => BalancedPostingValidator.fromMinorUnits(units);

    // Fetch entries
    const entries = await this.journalEntryRepo.findByAccount(accountId, tenantId, {
      startDate: query?.startDate,
      endDate: query?.endDate,
      vehicleId: query?.vehicleId,
      customerId: query?.customerId,
    });

    let runningUnits = 0n;
    let totalDebitUnits = 0n;
    let totalCreditUnits = 0n;

    const statementLines: GeneralLedgerLine[] = [];

    for (const e of entries) {
      const tx = await this.journalTxRepo.findById(e.transactionId, tenantId);
      const debitStr = e.direction === "DEBIT" ? e.amount : "0.0000";
      const creditStr = e.direction === "CREDIT" ? e.amount : "0.0000";

      const dUnits = toMinor(debitStr);
      const cUnits = toMinor(creditStr);

      totalDebitUnits += dUnits;
      totalCreditUnits += cUnits;

      if (account.normalBalance === "DEBIT") {
        runningUnits += dUnits - cUnits;
      } else {
        runningUnits += cUnits - dUnits;
      }

      statementLines.push({
        entryId: e.id,
        transactionId: e.transactionId,
        transactionNumber: tx?.transactionNumber || "UNKNOWN",
        transactionDate: tx?.transactionDate || e.createdAt.split("T")[0],
        sourceType: tx?.sourceType || "MANUAL_ADJUSTMENT",
        sourceNumber: tx?.sourceNumber,
        memo: e.memo,
        direction: e.direction,
        debit: debitStr,
        credit: creditStr,
        runningBalance: fromMinor(runningUnits),
        vehicleId: e.vehicleId,
        customerId: e.customerId,
        rentalId: e.rentalId,
      });
    }

    return {
      tenantId,
      accountId: account.id,
      accountCode: account.accountCode,
      accountName: account.name,
      classification: account.classification,
      normalBalance: account.normalBalance,
      currency: account.currency,
      periodFrom: query?.startDate,
      periodTo: query?.endDate,
      openingBalance: "0.0000",
      totalDebits: fromMinor(totalDebitUnits),
      totalCredits: fromMinor(totalCreditUnits),
      closingBalance: fromMinor(runningUnits),
      lines: statementLines,
    };
  }
}
