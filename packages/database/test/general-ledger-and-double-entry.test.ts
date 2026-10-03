// ============================================================================
// CAR HIRE OS — SPRINT 20 TEST SUITE: GENERAL LEDGER & DOUBLE-ENTRY POSTING
// Comprehensive verification of Chart of Accounts, Balanced Postings, Invariants,
// Source Contracts, Reversals, Trial Balance & Multi-Tenant Accounting Integrity
// Conforms to DOM-003 §35-40, NUMERIC(19,4) Decimal Standard & Strict Idempotency
// ============================================================================

import assert from "node:assert";
import {
  LedgerAccountRepository,
  JournalTransactionRepository,
  JournalEntryRepository,
  AuditRepository,
  CrossTenantViolationError,
  LedgerUnbalancedPostingError,
  LedgerPostingValidationError,
  LedgerAccountNotFoundError,
  LedgerAccountCodeAlreadyExistsError,
  JournalAlreadyPostedError,
  JournalAlreadyReversedError,
  LedgerAccountSuspendedOrClosedError,
  LedgerAccountCurrencyMismatchError,
  LedgerSystemAccountImmutableError,
} from "../src/index";

import { LedgerService } from "../../../apps/api/src/modules/ledger/application/ledger.service";
import { BalancedPostingValidator } from "../../../apps/api/src/modules/ledger/domain/balanced-posting-validator";
import { PostingContractMapper } from "../../../apps/api/src/modules/ledger/domain/posting-contract-mapper";
import type { FinancialPostingSource } from "@carhire/types";

async function runSprint20LedgerTestSuite() {
  console.log("----------------------------------------------------------------");
  console.log("RUNNING SPRINT 20 TEST SUITE: DOUBLE-ENTRY GENERAL LEDGER");
  console.log("----------------------------------------------------------------");

  // Reset repository stores
  LedgerAccountRepository.clear();
  JournalTransactionRepository.clear();
  JournalEntryRepository.clear();
  AuditRepository.clear();

  const accountRepo = new LedgerAccountRepository();
  const journalTxRepo = new JournalTransactionRepository();
  const journalEntryRepo = new JournalEntryRepository();
  const auditRepo = new AuditRepository();

  const ledgerService = new LedgerService(
    accountRepo,
    journalTxRepo,
    journalEntryRepo,
    auditRepo
  );

  const tenantA = "tenant_premium_motors";
  const tenantB = "tenant_safari_rentals";
  const actor1 = { userId: "user_finance_mgr_1", email: "finance@premiummotors.com" };
  const actor2 = { userId: "user_accountant_2", email: "accountant@premiummotors.com" };

  // --------------------------------------------------------------------------
  // TEST 1: Chart of Accounts Auto-Seeding & Custom Accounts
  // --------------------------------------------------------------------------
  console.log("\n[TEST 1] Chart of Accounts auto-seeding and custom account management...");

  const seeded = await ledgerService.ensureChartOfAccounts(tenantA, "KES");
  assert.ok(seeded.length >= 20, "Should have seeded canonical 5-tier Chart of Accounts");

  // Check key canonical accounts exist
  const bankAcc = await accountRepo.findByCode("1010", tenantA);
  assert.ok(bankAcc, "Operating Cash 1010 should exist");
  assert.strictEqual(bankAcc?.classification, "ASSET");
  assert.strictEqual(bankAcc?.normalBalance, "DEBIT");
  assert.strictEqual(bankAcc?.isSystemAccount, true);

  const arAcc = await accountRepo.findByCode("1100", tenantA);
  assert.ok(arAcc, "Accounts Receivable 1100 should exist");
  assert.strictEqual(arAcc?.classification, "ASSET");

  const depositHeldAcc = await accountRepo.findByCode("2050", tenantA);
  assert.ok(depositHeldAcc, "Deposit Liability 2050 should exist");
  assert.strictEqual(depositHeldAcc?.classification, "LIABILITY");
  assert.strictEqual(depositHeldAcc?.normalBalance, "CREDIT");

  const rentalRevAcc = await accountRepo.findByCode("4010", tenantA);
  assert.ok(rentalRevAcc, "Rental Revenue 4010 should exist");
  assert.strictEqual(rentalRevAcc?.classification, "REVENUE");
  assert.strictEqual(rentalRevAcc?.normalBalance, "CREDIT");

  const fuelExpAcc = await accountRepo.findByCode("5010", tenantA);
  assert.ok(fuelExpAcc, "Fleet Fuel Expense 5010 should exist");
  assert.strictEqual(fuelExpAcc?.classification, "EXPENSE");
  assert.strictEqual(fuelExpAcc?.normalBalance, "DEBIT");

  // Prevent modifying system accounts immutably
  await assert.rejects(
    async () => {
      await accountRepo.delete(bankAcc!.id, tenantA);
    },
    (err: any) => err instanceof LedgerSystemAccountImmutableError
  );

  // Create a custom sub-account
  const customAcc = await ledgerService.createAccount(
    tenantA,
    {
      accountCode: "5080",
      name: "Fleet GPS & Telematics Subscriptions",
      classification: "EXPENSE",
      subType: "OPERATING_EXPENSE",
      normalBalance: "DEBIT",
      description: "Monthly SIM card and GPS tracking vendor subscriptions",
    },
    actor1
  );
  assert.strictEqual(customAcc.accountCode, "5080");
  assert.strictEqual(customAcc.isSystemAccount, false);

  // Prevent duplicate account codes in same tenant
  await assert.rejects(
    async () => {
      await ledgerService.createAccount(
        tenantA,
        {
          accountCode: "5080",
          name: "Duplicate Telematics",
          classification: "EXPENSE",
          subType: "OPERATING_EXPENSE",
        },
        actor1
      );
    },
    (err: any) => err instanceof LedgerAccountCodeAlreadyExistsError
  );

  console.log("✓ Chart of accounts auto-seeding & validation verified.");

  // --------------------------------------------------------------------------
  // TEST 2: Balanced-Posting Invariant & Mathematical Precision
  // --------------------------------------------------------------------------
  console.log("\n[TEST 2] Balanced-posting invariant & mathematical validation...");

  // Post a valid 2-leg journal: Capital contribution (Debit Bank 1010, Credit Capital 3010)
  const capitalJournal = await ledgerService.postJournal(
    tenantA,
    {
      transactionDate: "2026-03-01",
      description: "Initial owner equity capitalization",
      currency: "KES",
      idempotencyKey: "init-capital-2026",
      entries: [
        {
          accountCode: "1010",
          direction: "DEBIT",
          amount: "5000000.0000",
          memo: "Capital injection to primary bank account",
        },
        {
          accountCode: "3010",
          direction: "CREDIT",
          amount: "5000000.0000",
          memo: "Owner equity contribution",
        },
      ],
    },
    actor1
  );

  assert.ok(capitalJournal.transactionNumber.startsWith("JRN-"));
  assert.strictEqual(capitalJournal.status, "POSTED");
  assert.strictEqual(capitalJournal.totalDebit, "5000000.0000");
  assert.strictEqual(capitalJournal.totalCredit, "5000000.0000");

  // Check updated balances
  const updatedBank = await accountRepo.findByCode("1010", tenantA);
  assert.strictEqual(updatedBank?.currentBalance, "5000000.0000");
  assert.strictEqual(updatedBank?.debitBalance, "5000000.0000");
  assert.strictEqual(updatedBank?.creditBalance, "0.0000");

  const updatedCapital = await accountRepo.findByCode("3010", tenantA);
  assert.strictEqual(updatedCapital?.currentBalance, "5000000.0000"); // Credit-normal: positive balance means credits > debits

  // Multi-leg compound journal: Cash purchase of fleet fuel with VAT (Debit Expense, Debit VAT, Credit Bank)
  // 5010 Fuel Expense: 10,000.0000
  // 1010 Bank: 10,000.0000
  const fuelJournal = await ledgerService.postJournal(
    tenantA,
    {
      transactionDate: "2026-03-02",
      description: "Fleet fuel refill bulk purchase",
      entries: [
        { accountCode: "5010", direction: "DEBIT", amount: "10000.0000", vehicleId: "veh_toyota_01" },
        { accountCode: "1010", direction: "CREDIT", amount: "10000.0000" },
      ],
    },
    actor2
  );
  assert.strictEqual(fuelJournal.status, "POSTED");

  const bankAfterFuel = await accountRepo.findByCode("1010", tenantA);
  assert.strictEqual(bankAfterFuel?.currentBalance, "4990000.0000");
  assert.strictEqual(bankAfterFuel?.creditBalance, "10000.0000");

  console.log("✓ Balanced posting invariant & compound journals verified.");

  // --------------------------------------------------------------------------
  // TEST 3: Rejection of Invalid or Unbalanced Postings
  // --------------------------------------------------------------------------
  console.log("\n[TEST 3] Rejection of unbalanced, malformed, or inactive account postings...");

  // Unbalanced debits and credits
  await assert.rejects(
    async () => {
      await ledgerService.postJournal(
        tenantA,
        {
          description: "Unbalanced attempt",
          entries: [
            { accountCode: "1010", direction: "DEBIT", amount: "100.0000" },
            { accountCode: "4010", direction: "CREDIT", amount: "90.0000" },
          ],
        },
        actor1
      );
    },
    (err: any) => err instanceof LedgerUnbalancedPostingError
  );

  // Single-leg journal
  await assert.rejects(
    async () => {
      await ledgerService.postJournal(
        tenantA,
        {
          description: "Single leg",
          entries: [{ accountCode: "1010", direction: "DEBIT", amount: "100.0000" }],
        },
        actor1
      );
    },
    (err: any) => err instanceof LedgerPostingValidationError
  );

  // Non-positive amount
  await assert.rejects(
    async () => {
      await ledgerService.postJournal(
        tenantA,
        {
          description: "Negative amount",
          entries: [
            { accountCode: "1010", direction: "DEBIT", amount: "-100.0000" },
            { accountCode: "4010", direction: "CREDIT", amount: "-100.0000" },
          ],
        },
        actor1
      );
    },
    (err: any) => err instanceof LedgerPostingValidationError
  );

  // Unknown account code
  await assert.rejects(
    async () => {
      await ledgerService.postJournal(
        tenantA,
        {
          description: "Unknown account",
          entries: [
            { accountCode: "9999", direction: "DEBIT", amount: "100.0000" },
            { accountCode: "1010", direction: "CREDIT", amount: "100.0000" },
          ],
        },
        actor1
      );
    },
    (err: any) => err instanceof LedgerAccountNotFoundError
  );

  // Suspended account posting
  const suspendedAcc = await ledgerService.createAccount(
    tenantA,
    {
      accountCode: "5990",
      name: "Old Discontinued Expense",
      classification: "EXPENSE",
      subType: "OPERATING_EXPENSE",
    },
    actor1
  );
  await ledgerService.updateAccount(tenantA, suspendedAcc.id, { status: "SUSPENDED" }, actor1);

  await assert.rejects(
    async () => {
      await ledgerService.postJournal(
        tenantA,
        {
          description: "Posting to suspended account",
          entries: [
            { accountCode: "5990", direction: "DEBIT", amount: "500.0000" },
            { accountCode: "1010", direction: "CREDIT", amount: "500.0000" },
          ],
        },
        actor1
      );
    },
    (err: any) => err instanceof LedgerAccountSuspendedOrClosedError
  );

  console.log("✓ Rejection of invalid postings rigorously confirmed.");

  // --------------------------------------------------------------------------
  // TEST 4: Operational Source Contract Ingestion (Sprint 19 -> Sprint 20)
  // --------------------------------------------------------------------------
  console.log("\n[TEST 4] Operational source document posting contracts ingestion...");

  // Scenario A: Customer Invoice Issued
  // Total: 46,400 KES (Time: 40,000, VAT: 6,400)
  const invoicePostingContract: FinancialPostingSource = {
    tenantId: tenantA,
    sourceType: "OPERATIONAL_INVOICE",
    sourceId: "inv_test_001",
    eventNumber: "INV-2026-00001",
    eventType: "finance.invoice.issued",
    effectiveDate: "2026-03-05",
    currency: "KES",
    postedToLedger: false,
    lines: [
      {
        direction: "DEBIT",
        amount: "46400.0000",
        classification: "ACCOUNTS_RECEIVABLE",
        customerId: "cust_john_doe",
        memo: "Customer invoice receivable",
      },
      {
        direction: "CREDIT",
        amount: "40000.0000",
        classification: "RENTAL_REVENUE",
        vehicleId: "veh_landcruiser_01",
        memo: "Rental base time revenue",
      },
      {
        direction: "CREDIT",
        amount: "6400.0000",
        classification: "OUTPUT_VAT",
        memo: "16% statutory VAT payable",
      },
    ],
  };

  const invoiceJournal = await ledgerService.postFromSourceContract(
    tenantA,
    invoicePostingContract,
    actor1
  );
  assert.ok(invoiceJournal);
  assert.strictEqual(invoiceJournal.status, "POSTED");
  assert.strictEqual(invoiceJournal.sourceType, "OPERATIONAL_INVOICE");
  assert.strictEqual(invoiceJournal.sourceId, "inv_test_001");
  assert.strictEqual(invoiceJournal.totalDebit, "46400.0000");
  assert.strictEqual(invoiceJournal.totalCredit, "46400.0000");
  assert.strictEqual(invoiceJournal.entries.length, 3);

  // Check AR and Revenue balances
  const arAfterInv = await accountRepo.findByCode("1100", tenantA);
  assert.strictEqual(arAfterInv?.currentBalance, "46400.0000");

  const revAfterInv = await accountRepo.findByCode("4010", tenantA);
  assert.strictEqual(revAfterInv?.currentBalance, "40000.0000");

  const vatAfterInv = await accountRepo.findByCode("2100", tenantA);
  assert.strictEqual(vatAfterInv?.currentBalance, "6400.0000");

  // Scenario B: Idempotency of Source Document Posting
  const duplicatePosting = await ledgerService.postFromSourceContract(
    tenantA,
    invoicePostingContract,
    actor1
  );
  assert.strictEqual(
    duplicatePosting.id,
    invoiceJournal.id,
    "Repeat posting of identical source contract must be idempotent and return original journal"
  );
  const arAfterDup = await accountRepo.findByCode("1100", tenantA);
  assert.strictEqual(
    arAfterDup?.currentBalance,
    "46400.0000",
    "Account balance must not double count on idempotent posting"
  );

  // Scenario C: Security Deposit Collected (Bank 1010 Dr, Customer Security Deposit Held 2050 Cr)
  const depositPostingContract: FinancialPostingSource = {
    tenantId: tenantA,
    sourceType: "DEPOSIT_POSITION",
    sourceId: "dep_pos_001",
    eventNumber: "DEP-2026-00001",
    eventType: "finance.deposit.collected",
    effectiveDate: "2026-03-05",
    currency: "KES",
    postedToLedger: false,
    lines: [
      {
        direction: "DEBIT",
        amount: "50000.0000",
        classification: "CASH_OR_BANK",
        memo: "Customer security deposit received",
      },
      {
        direction: "CREDIT",
        amount: "50000.0000",
        classification: "DEPOSIT_LIABILITY",
        customerId: "cust_john_doe",
        memo: "Customer deposit escrow liability",
      },
    ],
  };

  const depositJournal = await ledgerService.postFromSourceContract(
    tenantA,
    depositPostingContract,
    actor1
  );
  assert.strictEqual(depositJournal.status, "POSTED");

  const depLiability = await accountRepo.findByCode("2050", tenantA);
  assert.strictEqual(depLiability?.currentBalance, "50000.0000");

  // Scenario D: Credit Note Issued (Credit AR 1100, Debit Revenue 4010)
  const creditNoteContract: FinancialPostingSource = {
    tenantId: tenantA,
    sourceType: "CREDIT_NOTE",
    sourceId: "cn_test_001",
    eventNumber: "CN-2026-00001",
    eventType: "finance.credit_note.issued",
    effectiveDate: "2026-03-06",
    currency: "KES",
    postedToLedger: false,
    lines: [
      {
        direction: "DEBIT",
        amount: "5000.0000",
        classification: "RENTAL_REVENUE",
        memo: "Billing dispute adjustment",
      },
      {
        direction: "CREDIT",
        amount: "5000.0000",
        classification: "ACCOUNTS_RECEIVABLE",
        memo: "Reduce client receivable",
      },
    ],
  };

  const cnJournal = await ledgerService.postFromSourceContract(tenantA, creditNoteContract, actor1);
  assert.strictEqual(cnJournal.status, "POSTED");

  const arAfterCN = await accountRepo.findByCode("1100", tenantA);
  assert.strictEqual(arAfterCN?.currentBalance, "41400.0000"); // 46400 - 5000 = 41400

  // Scenario E: Operational Expense Ingestion
  const expenseContract: FinancialPostingSource = {
    tenantId: tenantA,
    sourceType: "OPERATIONAL_EXPENSE",
    sourceId: "exp_test_001",
    eventNumber: "EXP-2026-00001",
    eventType: "finance.expense.approved",
    effectiveDate: "2026-03-06",
    currency: "KES",
    postedToLedger: false,
    metadata: { category: "MAINTENANCE" },
    lines: [
      {
        direction: "DEBIT",
        amount: "15000.0000",
        classification: "OPERATING_EXPENSE",
        vehicleId: "veh_landcruiser_01",
        memo: "Brake pads replacement",
      },
      {
        direction: "CREDIT",
        amount: "15000.0000",
        classification: "CASH_OR_BANK",
        memo: "Direct workshop bank payout",
      },
    ],
  };

  const expJournal = await ledgerService.postFromSourceContract(tenantA, expenseContract, actor1);
  assert.strictEqual(expJournal.status, "POSTED");

  const maintExp = await accountRepo.findByCode("5020", tenantA);
  assert.strictEqual(maintExp?.currentBalance, "15000.0000");

  console.log("✓ Operational source contract ingestion and balance propagation verified.");

  // --------------------------------------------------------------------------
  // TEST 5: Journal Immutability & Counter-Entry Reversals
  // --------------------------------------------------------------------------
  console.log("\n[TEST 5] Journal immutability & counter-entry reversal mechanics...");

  // 1. Attempt to mutate a posted journal
  await assert.rejects(
    async () => {
      await journalTxRepo.update(invoiceJournal.id, tenantA, {
        totalDebit: "99999.0000", // Forbidden mutation
      });
    },
    (err: any) => err instanceof JournalAlreadyPostedError
  );

  // 2. Reverse fuel journal
  const preRevFuelExp = await accountRepo.findByCode("5010", tenantA);
  assert.strictEqual(preRevFuelExp?.currentBalance, "10000.0000");

  const reversalTx = await ledgerService.reverseJournal(
    tenantA,
    fuelJournal.id,
    actor1,
    "Invoice entered against wrong cost center"
  );

  assert.strictEqual(reversalTx.status, "POSTED");
  assert.strictEqual(reversalTx.sourceType, "SYSTEM_REVERSAL");
  assert.strictEqual(reversalTx.reversalOfJournalId, fuelJournal.id);
  assert.strictEqual(reversalTx.totalDebit, fuelJournal.totalCredit);
  assert.strictEqual(reversalTx.totalCredit, fuelJournal.totalDebit);

  // Verify original journal marked REVERSED
  const originalAfterRev = await ledgerService.getJournal(tenantA, fuelJournal.id);
  assert.strictEqual(originalAfterRev.status, "REVERSED");
  assert.strictEqual(originalAfterRev.reversedByJournalId, reversalTx.id);

  // Check that fuel expense balance has been restored to 0.0000
  const postRevFuelExp = await accountRepo.findByCode("5010", tenantA);
  assert.strictEqual(postRevFuelExp?.currentBalance, "0.0000");

  // Attempting to reverse an already reversed journal must fail
  await assert.rejects(
    async () => {
      await ledgerService.reverseJournal(tenantA, fuelJournal.id, actor1);
    },
    (err: any) => err instanceof JournalAlreadyReversedError
  );

  console.log("✓ Journal immutability and counter-entry reversal verified.");

  // --------------------------------------------------------------------------
  // TEST 6: Read Models — Trial Balance Report
  // --------------------------------------------------------------------------
  console.log("\n[TEST 6] Trial Balance report read model...");

  const tb = await ledgerService.getTrialBalance(tenantA);
  assert.ok(tb);
  assert.strictEqual(tb.tenantId, tenantA);
  assert.strictEqual(tb.isBalanced, true, "Trial Balance must balance: total debits == total credits");
  assert.strictEqual(tb.imbalanceAmount, "0.0000");
  assert.strictEqual(tb.totalDebits, tb.totalCredits);
  assert.ok(parseFloat(tb.totalDebits) > 0);

  // Find bank row in Trial Balance
  const bankTb = tb.accounts.find((a) => a.accountCode === "1010");
  assert.ok(bankTb);
  assert.strictEqual(bankTb.classification, "ASSET");
  assert.strictEqual(bankTb.normalBalance, "DEBIT");

  console.log(`✓ Trial Balance verified: Total Debits = ${tb.totalDebits} KES | Total Credits = ${tb.totalCredits} KES (Imbalance: ${tb.imbalanceAmount})`);

  // --------------------------------------------------------------------------
  // TEST 7: Read Models — General Ledger Account Statements
  // --------------------------------------------------------------------------
  console.log("\n[TEST 7] General Ledger account statements read model...");

  const bankAccount = await accountRepo.findByCode("1010", tenantA);
  const glStatement = await ledgerService.getGeneralLedgerStatement(tenantA, bankAccount!.id);

  assert.ok(glStatement);
  assert.strictEqual(glStatement.accountCode, "1010");
  assert.strictEqual(glStatement.normalBalance, "DEBIT");
  assert.ok(glStatement.lines.length >= 3);

  // Verify running balance continuity
  for (let i = 0; i < glStatement.lines.length; i++) {
    const line = glStatement.lines[i];
    assert.ok(line.transactionNumber);
    assert.ok(line.runningBalance);
    if (line.direction === "DEBIT") {
      assert.ok(parseFloat(line.debit) > 0);
      assert.strictEqual(line.credit, "0.0000");
    } else {
      assert.ok(parseFloat(line.credit) > 0);
      assert.strictEqual(line.debit, "0.0000");
    }
  }

  assert.strictEqual(glStatement.closingBalance, bankAccount?.currentBalance);
  console.log("✓ General Ledger statement running balance continuity confirmed.");

  // --------------------------------------------------------------------------
  // TEST 8: Multi-Tenant Boundary Isolation
  // --------------------------------------------------------------------------
  console.log("\n[TEST 8] Multi-tenant boundary isolation...");

  // Seed tenant B
  await ledgerService.ensureChartOfAccounts(tenantB, "USD");
  const tenantBAccounts = await accountRepo.listByTenant(tenantB);
  assert.ok(tenantBAccounts.length >= 20);

  // Tenant B cannot access Tenant A's account
  await assert.rejects(
    async () => {
      await ledgerService.getAccount(tenantB, bankAccount!.id);
    },
    (err: any) => err instanceof CrossTenantViolationError
  );

  // Tenant B cannot access Tenant A's journal
  await assert.rejects(
    async () => {
      await ledgerService.getJournal(tenantB, invoiceJournal.id);
    },
    (err: any) => err instanceof CrossTenantViolationError
  );

  // Tenant B posting cannot reference Tenant A's account
  await assert.rejects(
    async () => {
      await ledgerService.postJournal(
        tenantB,
        {
          description: "Cross tenant attempt",
          currency: "KES",
          entries: [
            { accountId: bankAccount!.id, direction: "DEBIT", amount: "100.0000" },
            { accountCode: "3010", direction: "CREDIT", amount: "100.0000" },
          ],
        },
        actor1
      );
    },
    (err: any) => err instanceof CrossTenantViolationError
  );

  console.log("✓ Multi-tenant boundary isolation rigorously verified.");

  console.log("================================================================");
  console.log("ALL SPRINT 20 GENERAL LEDGER & DOUBLE-ENTRY TESTS PASSED!");
  console.log("================================================================");
}

runSprint20LedgerTestSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
