// ============================================================================
// CAR HIRE OS — CUSTOMERS MODULE (DEV-004, DOM-001, DOM-003)
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import {
  CustomerRepository,
  PartyDocumentRepository,
  AuditRepository,
  OutboxRepository,
} from "@carhire/database";
import { CustomersService } from "./application/customers.service";
import { createCustomersController } from "./presentation/customers.controller";

export class CustomersModule {
  public readonly customersService: CustomersService;
  public readonly router: Router;

  constructor(
    permissionGuard: (perm: string) => (req: Request, res: Response, next: NextFunction) => void
  ) {
    const customerRepo = new CustomerRepository();
    const docRepo = new PartyDocumentRepository();
    const auditRepo = new AuditRepository();
    const outboxRepo = new OutboxRepository();

    this.customersService = new CustomersService(
      customerRepo,
      docRepo,
      auditRepo,
      outboxRepo
    );

    this.router = createCustomersController(this.customersService, permissionGuard);
  }
}
