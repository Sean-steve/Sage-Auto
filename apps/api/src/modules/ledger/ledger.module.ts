// ============================================================================
// CAR HIRE OS — GENERAL LEDGER MODULE (Sprint 20: DOM-003 §35-40)
// Bounded Context: Double-Entry General Ledger, Posting & Trial Balance
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import {
  LedgerAccountRepository,
  JournalTransactionRepository,
  JournalEntryRepository,
  AuditRepository,
} from "@carhire/database";
import { LedgerService } from "./application/ledger.service";
import { createLedgerController } from "./presentation/ledger.controller";

export class LedgerModule {
  public readonly ledgerService: LedgerService;
  public readonly router: Router;

  constructor(
    permissionGuard?: (perm: string) => (req: Request, res: Response, next: NextFunction) => void,
    overrides?: {
      accountRepo?: LedgerAccountRepository;
      journalTxRepo?: JournalTransactionRepository;
      journalEntryRepo?: JournalEntryRepository;
      auditRepo?: AuditRepository;
    }
  ) {
    const accountRepo = overrides?.accountRepo || new LedgerAccountRepository();
    const journalTxRepo = overrides?.journalTxRepo || new JournalTransactionRepository();
    const journalEntryRepo = overrides?.journalEntryRepo || new JournalEntryRepository();
    const auditRepo = overrides?.auditRepo || new AuditRepository();

    this.ledgerService = new LedgerService(
      accountRepo,
      journalTxRepo,
      journalEntryRepo,
      auditRepo
    );

    this.router = createLedgerController(this.ledgerService, permissionGuard);
  }
}
