// ============================================================================
// CAR HIRE OS — PLATFORM BILLING CONTROLLER (Control Plane Admin)
// ============================================================================

import { Request, Response } from "express";
import { ERROR_CODES } from "@carhire/constants";
import { BillingService } from "../application/billing.service";
import { BillingJobsService } from "../application/billing-jobs.service";

export class PlatformBillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly jobsService: BillingJobsService
  ) {}

  listInvoices = async (req: Request, res: Response): Promise<void> => {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const invoices = await this.billingService.listAllInvoices();
      res.status(200).json({ data: invoices, meta: { total: invoices.length, requestId } });
    } catch (err: any) {
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: err.message, requestId },
      });
    }
  };

  getInvoiceById = async (req: Request, res: Response): Promise<void> => {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const invoice = await this.billingService.getInvoiceById(req.params.id);
      if (!invoice) {
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

  createInvoice = async (req: Request, res: Response): Promise<void> => {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const invoice = await this.billingService.createSubscriptionInvoice(req.body);
      res.status(201).json({ data: invoice, meta: { requestId } });
    } catch (err: any) {
      res.status(400).json({
        error: { code: err.code || "INVOICE_CREATION_FAILED", message: err.message, requestId },
      });
    }
  };

  recordPayment = async (req: Request, res: Response): Promise<void> => {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    const { amount, currency, provider, providerReference, notes } = req.body;
    const actorId = req.auth?.userId || "platform-staff";

    if (!amount || !providerReference) {
      res.status(400).json({
        error: { code: "INVALID_REQUEST", message: "amount and providerReference are required", requestId },
      });
      return;
    }

    try {
      const result = await this.billingService.recordPayment(
        {
          invoiceId: req.params.id,
          amount,
          currency,
          provider: provider || "MANUAL_BANK",
          providerReference,
          notes,
        },
        { id: actorId, type: "PLATFORM_STAFF" }
      );

      res.status(200).json({ data: result, meta: { requestId } });
    } catch (err: any) {
      res.status(400).json({
        error: { code: err.code || "PAYMENT_RECORDING_FAILED", message: err.message, requestId },
      });
    }
  };

  listPayments = async (req: Request, res: Response): Promise<void> => {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const payments = await this.billingService.listAllPayments();
      res.status(200).json({ data: payments, meta: { total: payments.length, requestId } });
    } catch (err: any) {
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: err.message, requestId },
      });
    }
  };

  runRenewalJob = async (req: Request, res: Response): Promise<void> => {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const renewalCount = await this.jobsService.processRenewalDueSubscriptions();
      const pastDueCount = await this.jobsService.processPastDueSubscriptions();
      const graceCount = await this.jobsService.processGracePeriodExpirations();

      res.status(200).json({
        data: {
          renewalDueEvaluated: renewalCount,
          pastDueEvaluated: pastDueCount,
          graceExpirationsEvaluated: graceCount,
        },
        meta: { requestId },
      });
    } catch (err: any) {
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: err.message, requestId },
      });
    }
  };
}
