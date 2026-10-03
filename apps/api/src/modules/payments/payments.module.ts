// ============================================================================
// CAR HIRE OS — PAYMENT BOUNDED CONTEXT MODULE (Sprint 22: DEV-009, DATA-002)
// Provider Abstraction, Attempts, Verification, Allocations, Refunds & Ledger Contracts
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import {
  PaymentAttemptRepository,
  PaymentRepository,
  PaymentAllocationRepository,
  RefundRepository,
  PaymentReconciliationRepository,
  WebhookRepository,
  OperationalInvoiceRepository,
  DepositPositionRepository,
  OwnerSettlementRepository,
  AuditRepository,
  OutboxRepository,
} from "@carhire/database";
import { TENANT_PERMISSIONS } from "@carhire/constants";
import { PaymentService } from "./application/payment.service";
import { PaymentsController } from "./presentation/payments.controller";
import { PaymentProviderRegistry } from "./infrastructure/providers/provider-registry";
import { FakePaymentProvider } from "./infrastructure/providers/fake-payment-provider";
import { MpesaPaymentProvider } from "./infrastructure/providers/mpesa/mpesa-payment-provider";

export class PaymentsModule {
  public readonly paymentService: PaymentService;
  public readonly controller: PaymentsController;
  public readonly providerRegistry: PaymentProviderRegistry;
  public readonly fakeProvider?: FakePaymentProvider;
  public readonly mpesaProvider: MpesaPaymentProvider;
  public readonly router: Router;

  constructor(
    permissionGuard?: (perm: string) => (req: Request, res: Response, next: NextFunction) => void,
    overrides?: {
      attemptRepo?: PaymentAttemptRepository;
      paymentRepo?: PaymentRepository;
      allocationRepo?: PaymentAllocationRepository;
      refundRepo?: RefundRepository;
      reconciliationRepo?: PaymentReconciliationRepository;
      webhookRepo?: WebhookRepository;
      invoiceRepo?: OperationalInvoiceRepository;
      depositPositionRepo?: DepositPositionRepository;
      settlementRepo?: OwnerSettlementRepository;
      auditRepo?: AuditRepository;
      outboxRepo?: OutboxRepository;
      providerRegistry?: PaymentProviderRegistry;
    }
  ) {
    const attemptRepo = overrides?.attemptRepo || new PaymentAttemptRepository();
    const paymentRepo = overrides?.paymentRepo || new PaymentRepository();
    const allocationRepo = overrides?.allocationRepo || new PaymentAllocationRepository();
    const refundRepo = overrides?.refundRepo || new RefundRepository();
    const reconciliationRepo = overrides?.reconciliationRepo || new PaymentReconciliationRepository();
    const webhookRepo = overrides?.webhookRepo || new WebhookRepository();
    const invoiceRepo = overrides?.invoiceRepo || new OperationalInvoiceRepository();
    const depositPositionRepo = overrides?.depositPositionRepo || new DepositPositionRepository();
    const settlementRepo = overrides?.settlementRepo || new OwnerSettlementRepository();
    const auditRepo = overrides?.auditRepo || new AuditRepository();
    const outboxRepo = overrides?.outboxRepo || new OutboxRepository();

    this.providerRegistry = overrides?.providerRegistry || new PaymentProviderRegistry();
    if (this.providerRegistry.has("FAKE_PROVIDER")) this.fakeProvider = this.providerRegistry.get("FAKE_PROVIDER") as FakePaymentProvider;
    this.mpesaProvider = this.providerRegistry.get("MPESA_DARAJA") as MpesaPaymentProvider;

    this.paymentService = new PaymentService(
      attemptRepo,
      paymentRepo,
      allocationRepo,
      refundRepo,
      reconciliationRepo,
      this.providerRegistry,
      webhookRepo,
      invoiceRepo,
      depositPositionRepo,
      settlementRepo,
      auditRepo,
      outboxRepo
    );

    this.controller = new PaymentsController(this.paymentService);
    this.router = Router();
    this.setupRoutes(permissionGuard);
  }

  private setupRoutes(
    permissionGuard?: (perm: string) => (req: Request, res: Response, next: NextFunction) => void
  ): void {
    const guard = (perm: string) =>
      permissionGuard ? permissionGuard(perm) : (_req: Request, _res: Response, next: NextFunction) => next();

    // 1. Payment Attempts
    this.router.post("/attempts", guard(TENANT_PERMISSIONS.PAYMENT_INITIATE), this.controller.initiateAttempt);
    this.router.get("/attempts", guard(TENANT_PERMISSIONS.PAYMENT_READ), this.controller.listAttempts);
    this.router.get("/attempts/:id", guard(TENANT_PERMISSIONS.PAYMENT_READ), this.controller.getAttempt);
    this.router.post("/attempts/:id/verify", guard(TENANT_PERMISSIONS.PAYMENT_VERIFY), this.controller.verifyAttempt);

    // 2. Governed Manual Payments
    this.router.post("/manual", guard(TENANT_PERMISSIONS.PAYMENT_RECORD), this.controller.recordManualPayment);

    // 3. Refunds — specific routes must be registered before /:id
    this.router.post("/refunds", guard(TENANT_PERMISSIONS.REFUND_CREATE), this.controller.requestRefund);
    this.router.post("/refunds/:id/approve-and-execute", guard(TENANT_PERMISSIONS.REFUND_APPROVE), this.controller.approveAndExecuteRefund);
    this.router.get("/refunds", guard(TENANT_PERMISSIONS.REFUND_READ), this.controller.listRefunds);

    // 4. Reconciliation — specific routes must be registered before /:id
    this.router.post("/reconciliation/scan", guard(TENANT_PERMISSIONS.PAYMENT_RECONCILIATION_RUN), this.controller.runReconciliationScan);
    this.router.get("/reconciliation/issues", guard(TENANT_PERMISSIONS.PAYMENT_RECONCILIATION_READ), this.controller.listReconciliationIssues);
    this.router.post("/reconciliation/issues/:id/resolve", guard(TENANT_PERMISSIONS.PAYMENT_RECONCILIATION_RESOLVE), this.controller.resolveReconciliationIssue);

    // 5. Owner Settlement Payout
    this.router.post("/payouts/owner-settlement", guard(TENANT_PERMISSIONS.SETTLEMENT_PAY), this.controller.executeOwnerPayout);

    // 6. Verified Payments & Allocations
    this.router.get("/", guard(TENANT_PERMISSIONS.PAYMENT_READ), this.controller.listPayments);
    this.router.get("/:id", guard(TENANT_PERMISSIONS.PAYMENT_READ), this.controller.getPayment);
    this.router.post("/:id/allocate", guard(TENANT_PERMISSIONS.PAYMENT_ALLOCATE), this.controller.allocatePayment);
    this.router.get("/:id/allocations", guard(TENANT_PERMISSIONS.PAYMENT_READ), this.controller.listAllocations);

    // 7. Unauthenticated Provider Webhooks (Signature verified by handler)
    this.router.post("/webhooks/:provider", this.controller.handleWebhook);
    this.router.post("/mpesa/callback", (req, res) => {
      (req.params as Record<string, string>).provider = "MPESA_DARAJA";
      this.controller.handleWebhook(req, res);
    });
    this.router.post("/mpesa/c2b/validation", this.controller.handleMpesaC2bValidation);
    this.router.post("/mpesa/c2b/confirmation", (req, res) => {
      (req.params as Record<string, string>).provider = "MPESA_DARAJA";
      this.controller.handleWebhook(req, res);
    });
  }
}
