// ============================================================================
// CAR HIRE OS — OPERATIONAL FINANCE CONTROLLER (Sprint 19: DOM-003 §28-34)
// REST API presentation layer for Tenant Invoicing, Receivables & Expenses
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { FinanceService, FinanceActor } from "../application/finance.service";
import { TENANT_PERMISSIONS } from "@carhire/constants";

export function createFinanceController(
  financeService: FinanceService,
  permissionGuard?: (perm: string) => (req: Request, res: Response, next: NextFunction) => void,
  paymentService?: {
    recordGovernedManualPayment(tenantId: string, dto: any, actor: any): Promise<any>;
  }
): Router {
  const router = Router();
  const guard = (perm: string) =>
    permissionGuard
      ? permissionGuard(perm)
      : (_req: Request, _res: Response, next: NextFunction) => next();

  const getActor = (req: Request): FinanceActor => {
    const auth = (req as any).auth;
    const user = (req as any).user;
    const userId = auth?.userId || user?.id || user?.sub;
    if (!userId) {
      const err: any = new Error("Unauthorized: Valid authentication required.");
      err.statusCode = 401;
      throw err;
    }
    const tenantId = getTenantId(req);
    return {
      userId,
      tenantId,
      role: user?.role,
      isPlatformAdmin: Boolean(user?.isPlatformAdmin || auth?.isPlatformAdmin),
    };
  };

  const getTenantId = (req: Request): string => {
    const ctx = (req as any).tenantContext;
    const tenantId = ctx?.tenantId;
    if (!tenantId) {
      const err: any = new Error("Forbidden: Missing or unverified tenant context.");
      err.statusCode = 403;
      throw err;
    }
    return tenantId;
  };

  // --------------------------------------------------------------------------
  // INVOICES
  // --------------------------------------------------------------------------

  router.get(
    "/invoices",
    guard(TENANT_PERMISSIONS.INVOICE_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const invoices = await financeService.listInvoices(tenantId, {
          customerId: req.query.customerId as string,
          corporateAccountId: req.query.corporateAccountId as string,
          rentalId: req.query.rentalId as string,
          status: req.query.status as any,
          overdueOnly: req.query.overdueOnly === "true" ? true : undefined,
        });
        res.status(200).json({ success: true, data: invoices });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/invoices/:id",
    guard(TENANT_PERMISSIONS.INVOICE_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const invoice = await financeService.getInvoice(tenantId, req.params.id);
        res.status(200).json({ success: true, data: invoice });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/invoices/:id/history",
    guard(TENANT_PERMISSIONS.INVOICE_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const history = await financeService.getInvoiceStatusHistory(tenantId, req.params.id);
        res.status(200).json({ success: true, data: history });
      } catch (err) {
        next(err);
      }
    }
  );

  // Create manual invoice draft
  router.post(
    "/invoices",
    guard(TENANT_PERMISSIONS.INVOICE_CREATE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const invoice = await financeService.createInvoice(tenantId, req.body, actor);
        res.status(201).json({ success: true, data: invoice });
      } catch (err) {
        next(err);
      }
    }
  );

  // Generate authoritative invoice from completed rental
  router.post(
    "/invoices/generate-from-rental",
    guard(TENANT_PERMISSIONS.INVOICE_CREATE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const invoice = await financeService.generateRentalInvoice(tenantId, req.body, actor);
        res.status(200).json({ success: true, data: invoice });
      } catch (err) {
        next(err);
      }
    }
  );

  // Issue invoice
  router.post(
    "/invoices/:id/issue",
    guard(TENANT_PERMISSIONS.INVOICE_ISSUE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const invoice = await financeService.issueInvoice(tenantId, req.params.id, req.body, actor);
        res.status(200).json({ success: true, data: invoice });
      } catch (err) {
        next(err);
      }
    }
  );

  // Void invoice
  router.post(
    "/invoices/:id/void",
    guard(TENANT_PERMISSIONS.INVOICE_VOID),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const invoice = await financeService.voidInvoice(tenantId, req.params.id, req.body, actor);
        res.status(200).json({ success: true, data: invoice });
      } catch (err) {
        next(err);
      }
    }
  );

  // Legacy compatibility route. Payment truth remains owned by the Payments context.
  router.post(
    "/invoices/:id/payments",
    guard(TENANT_PERMISSIONS.PAYMENT_RECORD),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!paymentService) {
          const err: any = new Error("Canonical Payment service is unavailable.");
          err.statusCode = 503;
          throw err;
        }
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const invoice = await financeService.getInvoice(tenantId, req.params.id);
        const amount = String(req.body.amount ?? "");
        const transactionReference =
          req.body.transactionReference || req.body.providerTransactionId || req.body.reference;
        if (!transactionReference) {
          const err: any = new Error("Transaction reference is required for manual payment recording.");
          err.statusCode = 400;
          throw err;
        }

        const payment = await paymentService.recordGovernedManualPayment(
          tenantId,
          {
            purpose: "CUSTOMER_INVOICE",
            amount,
            currency: invoice.currency,
            targetId: invoice.id,
            customerId: invoice.customerId,
            payerReference: req.body.payerReference || invoice.billingSnapshot.customerName,
            providerTransactionId: transactionReference,
            paidAt: req.body.paidAt,
            notes: req.body.notes || `Legacy finance payment route for ${invoice.invoiceNumber}`,
          },
          actor
        );
        const updatedInvoice = await financeService.getInvoice(tenantId, invoice.id);
        res.status(200).json({ success: true, data: updatedInvoice, payment });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // CREDIT NOTES
  // --------------------------------------------------------------------------

  router.get(
    "/credit-notes",
    guard(TENANT_PERMISSIONS.CREDIT_NOTE_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const notes = await financeService.listCreditNotes(tenantId, {
          invoiceId: req.query.invoiceId as string,
          customerId: req.query.customerId as string,
          status: req.query.status as any,
        });
        res.status(200).json({ success: true, data: notes });
      } catch (err) {
        next(err);
      }
    }
  );

  // Create credit note draft
  router.post(
    "/credit-notes",
    guard(TENANT_PERMISSIONS.CREDIT_NOTE_CREATE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const creditNote = await financeService.createCreditNote(tenantId, req.body, actor);
        res.status(201).json({ success: true, data: creditNote });
      } catch (err) {
        next(err);
      }
    }
  );

  // Issue credit note
  router.post(
    "/credit-notes/:id/issue",
    guard(TENANT_PERMISSIONS.CREDIT_NOTE_ISSUE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const creditNote = await financeService.issueCreditNote(tenantId, req.params.id, actor);
        res.status(200).json({ success: true, data: creditNote });
      } catch (err) {
        next(err);
      }
    }
  );

  // Void credit note
  router.post(
    "/credit-notes/:id/void",
    guard(TENANT_PERMISSIONS.CREDIT_NOTE_VOID),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const creditNote = await financeService.voidCreditNote(
          tenantId,
          req.params.id,
          req.body.reason || "Voided by user",
          actor
        );
        res.status(200).json({ success: true, data: creditNote });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // OPERATIONAL EXPENSES
  // --------------------------------------------------------------------------

  router.get(
    "/expenses",
    guard(TENANT_PERMISSIONS.EXPENSE_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const expenses = await financeService.listExpenses(tenantId, {
          vehicleId: req.query.vehicleId as string,
          rentalId: req.query.rentalId as string,
          category: req.query.category as any,
          status: req.query.status as any,
          fromDate: req.query.fromDate as string,
          toDate: req.query.toDate as string,
        });
        res.status(200).json({ success: true, data: expenses });
      } catch (err) {
        next(err);
      }
    }
  );

  // Create operating expense draft
  router.post(
    "/expenses",
    guard(TENANT_PERMISSIONS.EXPENSE_CREATE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const expense = await financeService.createExpense(tenantId, req.body, actor);
        res.status(201).json({ success: true, data: expense });
      } catch (err) {
        next(err);
      }
    }
  );

  // Submit expense for approval
  router.post(
    "/expenses/:id/submit",
    guard(TENANT_PERMISSIONS.EXPENSE_SUBMIT),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const expense = await financeService.submitExpense(tenantId, req.params.id, actor);
        res.status(200).json({ success: true, data: expense });
      } catch (err) {
        next(err);
      }
    }
  );

  // Approve expense (enforces 4-eyes)
  router.post(
    "/expenses/:id/approve",
    guard(TENANT_PERMISSIONS.EXPENSE_APPROVE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const expense = await financeService.approveExpense(tenantId, req.params.id, req.body, actor);
        res.status(200).json({ success: true, data: expense });
      } catch (err) {
        next(err);
      }
    }
  );

  // Reject expense
  router.post(
    "/expenses/:id/reject",
    guard(TENANT_PERMISSIONS.EXPENSE_REJECT),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const expense = await financeService.rejectExpense(tenantId, req.params.id, req.body, actor);
        res.status(200).json({ success: true, data: expense });
      } catch (err) {
        next(err);
      }
    }
  );

  // Void expense
  router.post(
    "/expenses/:id/void",
    guard(TENANT_PERMISSIONS.EXPENSE_VOID),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const expense = await financeService.voidExpense(
          tenantId,
          req.params.id,
          req.body.reason || "Voided by user",
          actor
        );
        res.status(200).json({ success: true, data: expense });
      } catch (err) {
        next(err);
      }
    }
  );

  // Ingest completed maintenance work order cost
  router.post(
    "/expenses/ingest-maintenance",
    guard(TENANT_PERMISSIONS.EXPENSE_CREATE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const expense = await financeService.ingestMaintenanceExpense(tenantId, req.body, actor);
        res.status(200).json({ success: true, data: expense });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // DEPOSITS & REFUNDS
  // --------------------------------------------------------------------------

  router.get(
    "/deposits",
    guard(TENANT_PERMISSIONS.DEPOSIT_RECORD),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const deposits = await financeService.listDepositPositions(tenantId, {
          customerId: req.query.customerId as string,
          rentalId: req.query.rentalId as string,
          status: req.query.status as any,
        });
        res.status(200).json({ success: true, data: deposits });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/refunds",
    guard(TENANT_PERMISSIONS.REFUND_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const refunds = await financeService.listRefundObligations(tenantId, {
          customerId: req.query.customerId as string,
          rentalId: req.query.rentalId as string,
          invoiceId: req.query.invoiceId as string,
          depositPositionId: req.query.depositPositionId as string,
          status: req.query.status as any,
        });
        res.status(200).json({ success: true, data: refunds });
      } catch (err) {
        next(err);
      }
    }
  );

  // Record deposit position
  router.post(
    "/deposits",
    guard(TENANT_PERMISSIONS.DEPOSIT_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const deposit = await financeService.createDepositPosition(tenantId, req.body, actor);
        res.status(201).json({ success: true, data: deposit });
      } catch (err) {
        next(err);
      }
    }
  );

  // Apply deposit towards invoice
  router.post(
    "/deposits/:id/apply",
    guard(TENANT_PERMISSIONS.DEPOSIT_APPLY),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const result = await financeService.applyDepositToInvoice(
          tenantId,
          { ...req.body, depositPositionId: req.params.id },
          actor
        );
        res.status(200).json({ success: true, data: result });
      } catch (err) {
        next(err);
      }
    }
  );

  // Create customer refund obligation
  router.post(
    "/refunds",
    guard(TENANT_PERMISSIONS.REFUND_CREATE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const refund = await financeService.createRefundObligation(tenantId, req.body, actor);
        res.status(201).json({ success: true, data: refund });
      } catch (err) {
        next(err);
      }
    }
  );

  // Approve refund obligation
  router.post(
    "/refunds/:id/approve",
    guard(TENANT_PERMISSIONS.REFUND_APPROVE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const refund = await financeService.approveRefundObligation(tenantId, req.params.id, actor);
        res.status(200).json({ success: true, data: refund });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // RECEIVABLES & AGGREGATE READ MODELS
  // --------------------------------------------------------------------------

  // Customer Receivables Summary
  router.get(
    "/receivables/customers/:customerId",
    guard(TENANT_PERMISSIONS.RECEIVABLES_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const summary = await financeService.getCustomerReceivables(tenantId, req.params.customerId);
        res.status(200).json({ success: true, data: summary });
      } catch (err) {
        next(err);
      }
    }
  );

  // Corporate Account Receivables Summary
  router.get(
    "/receivables/corporate/:corporateAccountId",
    guard(TENANT_PERMISSIONS.RECEIVABLES_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const summary = await financeService.getCorporateReceivables(
          tenantId,
          req.params.corporateAccountId
        );
        res.status(200).json({ success: true, data: summary });
      } catch (err) {
        next(err);
      }
    }
  );

  // Tenant Operational Finance Summary
  router.get(
    "/summary",
    guard(TENANT_PERMISSIONS.FINANCE_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const summary = await financeService.getOperationalFinanceSummary(tenantId);
        res.status(200).json({ success: true, data: summary });
      } catch (err) {
        next(err);
      }
    }
  );

  // Sprint 21 Owner Settlement Component Reader for Rental
  router.get(
    "/settlement-components/rentals/:rentalId",
    guard(TENANT_PERMISSIONS.FINANCE_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const components = await financeService.getSettledRentalRevenueComponents(
          tenantId,
          req.params.rentalId
        );
        res.status(200).json({ success: true, data: components });
      } catch (err) {
        next(err);
      }
    }
  );

  // Sprint 21 Owner Settlement Component Reader for Vehicle Expenses
  router.get(
    "/settlement-components/vehicles/:vehicleId/expenses",
    guard(TENANT_PERMISSIONS.FINANCE_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const expenses = await financeService.getEligibleVehicleExpenses(
          tenantId,
          req.params.vehicleId
        );
        res.status(200).json({ success: true, data: expenses });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
