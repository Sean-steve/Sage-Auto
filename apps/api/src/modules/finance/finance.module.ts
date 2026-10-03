// ============================================================================
// CAR HIRE OS — OPERATIONAL FINANCE MODULE (Sprint 19: DOM-003 §28-34)
// Bounded Context: Operational Finance, Invoicing, Receivables & Expenses
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import {
  OperationalInvoiceRepository,
  CreditNoteRepository,
  ExpenseRepository,
  DepositPositionRepository,
  RefundObligationRepository,
  RentalRepository,
  CustomerRepository,
  CorporateAccountRepository,
  MaintenanceRepository,
  AuditRepository,
  OutboxRepository,
} from "@carhire/database";
import { FinanceService } from "./application/finance.service";
import { createFinanceController } from "./presentation/finance.controller";

export class FinanceModule {
  public readonly financeService: FinanceService;
  public readonly router: Router;

  constructor(
    permissionGuard?: (perm: string) => (req: Request, res: Response, next: NextFunction) => void,
    overrides?: {
      invoiceRepo?: OperationalInvoiceRepository;
      creditNoteRepo?: CreditNoteRepository;
      expenseRepo?: ExpenseRepository;
      depositPositionRepo?: DepositPositionRepository;
      refundObligationRepo?: RefundObligationRepository;
      rentalRepo?: RentalRepository;
      customerRepo?: CustomerRepository;
      corporateAccountRepo?: CorporateAccountRepository;
      maintenanceRepo?: MaintenanceRepository;
      auditRepo?: AuditRepository;
      outboxRepo?: OutboxRepository;
      ledgerService?: { postFromSourceContract(tenantId: string, contract: any, actor: any): Promise<any> };
    }
  ) {
    const invoiceRepo = overrides?.invoiceRepo || new OperationalInvoiceRepository();
    const creditNoteRepo = overrides?.creditNoteRepo || new CreditNoteRepository();
    const expenseRepo = overrides?.expenseRepo || new ExpenseRepository();
    const depositPositionRepo = overrides?.depositPositionRepo || new DepositPositionRepository();
    const refundObligationRepo = overrides?.refundObligationRepo || new RefundObligationRepository();
    const rentalRepo = overrides?.rentalRepo || new RentalRepository();
    const customerRepo = overrides?.customerRepo || new CustomerRepository();
    const corporateAccountRepo = overrides?.corporateAccountRepo || new CorporateAccountRepository();
    const maintenanceRepo = overrides?.maintenanceRepo || new MaintenanceRepository();
    const auditRepo = overrides?.auditRepo || new AuditRepository();
    const outboxRepo = overrides?.outboxRepo || new OutboxRepository();
    const ledgerService = overrides?.ledgerService;

    this.financeService = new FinanceService(
      invoiceRepo,
      creditNoteRepo,
      expenseRepo,
      depositPositionRepo,
      refundObligationRepo,
      rentalRepo,
      customerRepo,
      corporateAccountRepo,
      maintenanceRepo,
      auditRepo,
      outboxRepo,
      ledgerService
    );

    this.router = createFinanceController(this.financeService, permissionGuard);
  }
}
