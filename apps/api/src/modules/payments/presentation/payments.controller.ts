// ============================================================================
// CAR HIRE OS — PAYMENT CONTROLLER (Sprint 22: DEV-009, DATA-002)
// REST API Presentation Endpoints for Payments, Attempts, Webhooks & Allocations
// ============================================================================

import type { Request, Response } from "express";
import { PaymentService } from "../application/payment.service";
import type { PaymentActor } from "@carhire/types";

function getActor(req: Request): PaymentActor {
  const userId = (req as any).auth?.userId || (req as any).user?.id;
  const tenantId = (req as any).tenantContext?.tenantId;
  if (!userId || !tenantId) {
    const err: any = new Error("Unauthorized: Valid authentication and tenant context required.");
    err.statusCode = 401;
    throw err;
  }
  return {
    userId,
    tenantId,
    role: (req as any).tenantContext?.role || (req as any).user?.role || "STAFF",
  };
}

export class PaymentsController {
  constructor(private readonly paymentService: PaymentService) {}

  // --------------------------------------------------------------------------
  // ATTEMPTS
  // --------------------------------------------------------------------------

  initiateAttempt = async (req: Request, res: Response): Promise<void> => {
    try {
      const actor = getActor(req);
      const attempt = await this.paymentService.initiatePaymentAttempt(
        actor.tenantId,
        req.body,
        actor
      );
      res.status(201).json({ success: true, data: attempt });
    } catch (err: any) {
      res.status(400).json({ success: false, error: { message: err.message, code: err.code } });
    }
  };

  listAttempts = async (req: Request, res: Response): Promise<void> => {
    try {
      const actor = getActor(req);
      const attempts = await this.paymentService.listPaymentAttempts(actor.tenantId, req.query as any);
      res.status(200).json({ success: true, data: attempts });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { message: err.message } });
    }
  };

  getAttempt = async (req: Request, res: Response): Promise<void> => {
    try {
      const actor = getActor(req);
      const attempt = await this.paymentService.getPaymentAttempt(actor.tenantId, req.params.id);
      if (!attempt) {
        res.status(404).json({ success: false, error: { message: "Payment attempt not found" } });
        return;
      }
      res.status(200).json({ success: true, data: attempt });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { message: err.message } });
    }
  };

  verifyAttempt = async (req: Request, res: Response): Promise<void> => {
    try {
      const actor = getActor(req);
      const clientEvidenceClaimed = req.body?.clientClaimedSuccess === true;
      const payment = await this.paymentService.verifyPaymentAttempt(
        actor.tenantId,
        req.params.id,
        actor,
        clientEvidenceClaimed
      );
      res.status(200).json({ success: true, data: payment });
    } catch (err: any) {
      const statusCode = err.name === "ClientPaymentEvidenceRejectedError" ? 403 : 400;
      res.status(statusCode).json({ success: false, error: { message: err.message, code: err.code } });
    }
  };

  // --------------------------------------------------------------------------
  // PAYMENTS
  // --------------------------------------------------------------------------

  recordManualPayment = async (req: Request, res: Response): Promise<void> => {
    try {
      const actor = getActor(req);
      const payment = await this.paymentService.recordGovernedManualPayment(
        actor.tenantId,
        req.body,
        actor
      );
      res.status(201).json({ success: true, data: payment });
    } catch (err: any) {
      res.status(400).json({ success: false, error: { message: err.message, code: err.code } });
    }
  };

  listPayments = async (req: Request, res: Response): Promise<void> => {
    try {
      const actor = getActor(req);
      const payments = await this.paymentService.listPayments(actor.tenantId, req.query as any);
      res.status(200).json({ success: true, data: payments });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { message: err.message } });
    }
  };

  getPayment = async (req: Request, res: Response): Promise<void> => {
    try {
      const actor = getActor(req);
      const payment = await this.paymentService.getPayment(actor.tenantId, req.params.id);
      if (!payment) {
        res.status(404).json({ success: false, error: { message: "Payment not found" } });
        return;
      }
      res.status(200).json({ success: true, data: payment });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { message: err.message } });
    }
  };

  // --------------------------------------------------------------------------
  // ALLOCATIONS
  // --------------------------------------------------------------------------

  allocatePayment = async (req: Request, res: Response): Promise<void> => {
    try {
      const actor = getActor(req);
      const allocation = await this.paymentService.allocatePayment(
        actor.tenantId,
        {
          paymentId: req.params.id,
          sourceType: req.body.sourceType,
          sourceId: req.body.sourceId,
          amount: req.body.amount,
          notes: req.body.notes,
        },
        actor
      );
      res.status(201).json({ success: true, data: allocation });
    } catch (err: any) {
      res.status(400).json({ success: false, error: { message: err.message, code: err.code } });
    }
  };

  listAllocations = async (req: Request, res: Response): Promise<void> => {
    try {
      const actor = getActor(req);
      const allocations = await this.paymentService.listAllocations(actor.tenantId, req.params.id);
      res.status(200).json({ success: true, data: allocations });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { message: err.message } });
    }
  };

  // --------------------------------------------------------------------------
  // REFUNDS
  // --------------------------------------------------------------------------

  requestRefund = async (req: Request, res: Response): Promise<void> => {
    try {
      const actor = getActor(req);
      const refund = await this.paymentService.requestRefund(actor.tenantId, req.body, actor);
      res.status(201).json({ success: true, data: refund });
    } catch (err: any) {
      res.status(400).json({ success: false, error: { message: err.message, code: err.code } });
    }
  };

  approveAndExecuteRefund = async (req: Request, res: Response): Promise<void> => {
    try {
      const actor = getActor(req);
      const refund = await this.paymentService.approveAndExecuteRefund(
        actor.tenantId,
        req.params.id,
        actor
      );
      res.status(200).json({ success: true, data: refund });
    } catch (err: any) {
      res.status(400).json({ success: false, error: { message: err.message, code: err.code } });
    }
  };

  listRefunds = async (req: Request, res: Response): Promise<void> => {
    try {
      const actor = getActor(req);
      const refunds = await this.paymentService.listRefunds(actor.tenantId, req.query as any);
      res.status(200).json({ success: true, data: refunds });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { message: err.message } });
    }
  };

  // --------------------------------------------------------------------------
  // OWNER SETTLEMENT PAYOUT
  // --------------------------------------------------------------------------

  executeOwnerPayout = async (req: Request, res: Response): Promise<void> => {
    try {
      const actor = getActor(req);
      const result = await this.paymentService.executeOwnerPayout(actor.tenantId, req.body, actor);
      res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      res.status(400).json({ success: false, error: { message: err.message, code: err.code } });
    }
  };

  // --------------------------------------------------------------------------
  // RECONCILIATION
  // --------------------------------------------------------------------------

  runReconciliationScan = async (req: Request, res: Response): Promise<void> => {
    try {
      const actor = getActor(req);
      const issues = await this.paymentService.runReconciliationScan(actor.tenantId);
      res.status(200).json({ success: true, data: issues, count: issues.length });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { message: err.message } });
    }
  };

  listReconciliationIssues = async (req: Request, res: Response): Promise<void> => {
    try {
      const actor = getActor(req);
      const resolved = req.query.resolved !== undefined ? req.query.resolved === "true" : undefined;
      const issues = await this.paymentService.listReconciliationIssues(actor.tenantId, resolved);
      res.status(200).json({ success: true, data: issues });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { message: err.message } });
    }
  };

  resolveReconciliationIssue = async (req: Request, res: Response): Promise<void> => {
    try {
      const actor = getActor(req);
      const issue = await this.paymentService.resolveReconciliationIssue(
        actor.tenantId,
        req.params.id
      );
      res.status(200).json({ success: true, data: issue });
    } catch (err: any) {
      res.status(400).json({ success: false, error: { message: err.message } });
    }
  };

  // --------------------------------------------------------------------------
  // WEBHOOK INGESTION (Unauthenticated public entry point; signature-validated)
  // --------------------------------------------------------------------------

  handleWebhook = async (req: Request, res: Response): Promise<void> => {
    try {
      const provider = req.params.provider || "MPESA_DARAJA";
      const result = await this.paymentService.handleWebhook(
        provider,
        req.headers,
        req.body,
        (req as any).rawBody
      );

      if (provider === "MPESA_DARAJA" || req.path.includes("/mpesa")) {
        res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted", data: result });
        return;
      }

      res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      const statusCode = err.name === "InvalidWebhookSignatureError" ? 401 : 400;
      res.status(statusCode).json({ success: false, error: { message: err.message, code: err.code } });
    }
  };

  handleMpesaC2bValidation = async (req: Request, res: Response): Promise<void> => {
    try {
      const billRefNumber = req.body?.BillRefNumber;
      if (!billRefNumber || String(billRefNumber).trim().length === 0) {
        res.status(200).json({ ResultCode: 1, ResultDesc: "Rejected: Bill reference number is required" });
        return;
      }
      res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
    } catch {
      res.status(200).json({ ResultCode: 1, ResultDesc: "Rejected: Validation error" });
    }
  };
}
