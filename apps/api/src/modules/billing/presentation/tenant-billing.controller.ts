// ============================================================================
// CAR HIRE OS — TENANT SAAS BILLING CONTROLLER (Tenant Scope)
// ============================================================================

import { Request, Response } from "express";
import { ERROR_CODES } from "@carhire/constants";
import { BillingService } from "../application/billing.service";

export class TenantBillingController {
  constructor(private readonly billingService: BillingService) {}

  listTenantInvoices = async (req: Request, res: Response): Promise<void> => {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    const tenantId = req.tenantContext?.tenantId;

    if (!tenantId) {
      res.status(400).json({
        error: { code: ERROR_CODES.TENANT_REQUIRED, message: "Tenant context required", requestId },
      });
      return;
    }

    try {
      const invoices = await this.billingService.listInvoicesByTenant(tenantId);
      res.status(200).json({ data: invoices, meta: { total: invoices.length, requestId } });
    } catch (err: any) {
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: err.message, requestId },
      });
    }
  };

  getInvoiceById = async (req: Request, res: Response): Promise<void> => {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    const tenantId = req.tenantContext?.tenantId;

    if (!tenantId) {
      res.status(400).json({
        error: { code: ERROR_CODES.TENANT_REQUIRED, message: "Tenant context required", requestId },
      });
      return;
    }

    try {
      const invoice = await this.billingService.getInvoiceById(req.params.id);
      if (!invoice || invoice.tenantId !== tenantId) {
        res.status(404).json({
          error: { code: ERROR_CODES.BILLING_INVOICE_NOT_FOUND, message: "Invoice not found", requestId },
        });
        return;
      }
      res.status(200).json({ data: invoice, meta: { requestId } });
    } catch (err: any) {
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: err.message, requestId },
      });
    }
  };

  payInvoiceMock = async (req: Request, res: Response): Promise<void> => {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    const tenantId = req.tenantContext?.tenantId;
    const userId = req.auth?.userId;

    if (!tenantId) {
      res.status(400).json({
        error: { code: ERROR_CODES.TENANT_REQUIRED, message: "Tenant context required", requestId },
      });
      return;
    }

    try {
      const invoice = await this.billingService.getInvoiceById(req.params.id);
      if (!invoice || invoice.tenantId !== tenantId) {
        res.status(404).json({
          error: { code: ERROR_CODES.BILLING_INVOICE_NOT_FOUND, message: "Invoice not found", requestId },
        });
        return;
      }

      if (invoice.status === "PAID") {
        res.status(400).json({
          error: { code: ERROR_CODES.BILLING_INVOICE_ALREADY_PAID, message: "Invoice already paid", requestId },
        });
        return;
      }

      const due = (invoice.amountDue !== undefined ? invoice.amountDue : invoice.total) ?? 0;
      const totalAmt = invoice.total ?? due;
      const paymentAmount = due > 0 ? due : totalAmt;

      const result = await this.billingService.recordPayment(
        {
          invoiceId: invoice.id,
          amount: paymentAmount,
          currency: invoice.currency,
          provider: "DEVELOPMENT_MOCK",
          providerReference: `MOCK-PAY-${Date.now()}`,
          notes: "Settled via tenant development mock payment gateway",
        },
        { id: userId || "tenant-user", type: "USER" }
      );

      res.status(200).json({ data: result, meta: { requestId } });
    } catch (err: any) {
      res.status(400).json({
        error: { code: err.code || "PAYMENT_FAILED", message: err.message, requestId },
      });
    }
  };

  listTenantPayments = async (req: Request, res: Response): Promise<void> => {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    const tenantId = req.tenantContext?.tenantId;

    if (!tenantId) {
      res.status(400).json({
        error: { code: ERROR_CODES.TENANT_REQUIRED, message: "Tenant context required", requestId },
      });
      return;
    }

    try {
      const payments = await this.billingService.listPaymentsByTenant(tenantId);
      res.status(200).json({ data: payments, meta: { total: payments.length, requestId } });
    } catch (err: any) {
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: err.message, requestId },
      });
    }
  };
}
