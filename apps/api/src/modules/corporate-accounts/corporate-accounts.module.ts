// ============================================================================
// CAR HIRE OS — CORPORATE ACCOUNTS MODULE (DEV-004, DOM-001, DOM-003)
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import {
  CorporateAccountRepository,
  AuditRepository,
  OutboxRepository,
} from "@carhire/database";
import { CorporateAccountsService } from "./application/corporate-accounts.service";
import { createCorporateAccountsController } from "./presentation/corporate-accounts.controller";

export class CorporateAccountsModule {
  public readonly corporateService: CorporateAccountsService;
  public readonly router: Router;

  constructor(
    permissionGuard: (perm: string) => (req: Request, res: Response, next: NextFunction) => void
  ) {
    const corporateRepo = new CorporateAccountRepository();
    const auditRepo = new AuditRepository();
    const outboxRepo = new OutboxRepository();

    this.corporateService = new CorporateAccountsService(
      corporateRepo,
      auditRepo,
      outboxRepo
    );

    this.router = createCorporateAccountsController(this.corporateService, permissionGuard);
  }
}
