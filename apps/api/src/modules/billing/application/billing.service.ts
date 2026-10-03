// ============================================================================
// CAR HIRE OS — SAAS BILLING SERVICE (Application Service)
// ============================================================================

import type {
  SaaSBillingInvoice,
  SaaSPaymentRecord,
  BillingAccount,
  RecordSaaSPaymentDto,
} from "@carhire/types";
import {
  ISaaSBillingInvoiceRepository,
  SaaSBillingInvoiceRepository,
  ISaaSPaymentRecordRepository,
  SaaSPaymentRecordRepository,
  IBillingAccountRepository,
  BillingAccountRepository,
  ISubscriptionRepository,
  SubscriptionRepository,
  IPlanRepository,
  PlanRepository,
  IAuditRepository,
  AuditRepository,
  IOutboxRepository,
  OutboxRepository,
  RecordNotFoundError,
} from "@carhire/database";
import { BillingMoney } from "../domain/billing-money";

export interface CreateInvoiceCommand {
  tenantId: string;
  subscriptionId?: string;
  billingAccountId?: string;
  description: string;
  amount: number;
  currency?: string;
  tax?: number;
  discount?: number;
  billingPeriodStart?: string;
  billingPeriodEnd?: string;
  dueInDays?: number;
}

export class BillingService {
  private isProductionLike(): boolean {
    const envName = (process.env.APP_ENV || process.env.NODE_ENV || "development").toLowerCase();
    return envName === "production" || envName === "staging";
  }

  constructor(
    private invoiceRepo: ISaaSBillingInvoiceRepository = new SaaSBillingInvoiceRepository(),
    private paymentRepo: ISaaSPaymentRecordRepository = new SaaSPaymentRecordRepository(),
    private billingAccountRepo: IBillingAccountRepository = new BillingAccountRepository(),
    private subscriptionRepo: ISubscriptionRepository = new SubscriptionRepository(),
    private planRepo: IPlanRepository = new PlanRepository(),
    private auditRepo: IAuditRepository = new AuditRepository(),
    private outboxRepo: IOutboxRepository = new OutboxRepository()
  ) {}

  async getInvoiceById(id: string): Promise<SaaSBillingInvoice | null> {
    return this.invoiceRepo.findById(id);
  }

  async listInvoicesByTenant(tenantId: string): Promise<SaaSBillingInvoice[]> {
    return this.invoiceRepo.listByTenantId(tenantId);
  }

  async listAllInvoices(): Promise<SaaSBillingInvoice[]> {
    return this.invoiceRepo.listAll();
  }

  async listPaymentsByInvoice(invoiceId: string): Promise<SaaSPaymentRecord[]> {
    return this.paymentRepo.listByInvoiceId(invoiceId);
  }

  async listPaymentsByTenant(tenantId: string): Promise<SaaSPaymentRecord[]> {
    return this.paymentRepo.listByTenantId(tenantId);
  }

  async listAllPayments(): Promise<SaaSPaymentRecord[]> {
    return this.paymentRepo.listAll();
  }

  async getOrCreateBillingAccount(tenantId: string, email: string, legalName: string): Promise<BillingAccount> {
    let account = await this.billingAccountRepo.findByTenantId(tenantId);
    if (!account) {
      account = await this.billingAccountRepo.create({
        tenantId,
        billingEmail: email,
        legalName,
        currency: "KES",
        status: "ACTIVE",
      });
    }
    return account;
  }

  async createSubscriptionInvoice(cmd: CreateInvoiceCommand): Promise<SaaSBillingInvoice> {
    const now = new Date();
    const dueAt = new Date(now.getTime() + (cmd.dueInDays || 14) * 24 * 60 * 60 * 1000).toISOString();
    const currency = cmd.currency || "KES";
    const subtotal = BillingMoney.round(cmd.amount);
    const tax = cmd.tax !== undefined ? BillingMoney.round(cmd.tax) : 0;
    const discount = cmd.discount !== undefined ? BillingMoney.round(cmd.discount) : 0;
    const total = BillingMoney.subtract(BillingMoney.add(subtotal, tax), discount);

    const invoice = await this.invoiceRepo.create({
      tenantId: cmd.tenantId,
      subscriptionId: cmd.subscriptionId,
      billingAccountId: cmd.billingAccountId,
      status: "OPEN",
      currency,
      subtotal,
      tax,
      discount,
      total,
      amountPaid: 0,
      amountDue: total,
      billingPeriodStart: cmd.billingPeriodStart,
      billingPeriodEnd: cmd.billingPeriodEnd,
      issuedAt: now.toISOString(),
      dueAt,
      lineItems: [
        {
          description: cmd.description,
          quantity: 1,
          unitPrice: subtotal,
          amount: subtotal,
          referenceType: "SUBSCRIPTION_BASE",
          referenceId: cmd.subscriptionId,
        },
      ],
    });

    await this.auditRepo.record({
      tenantId: cmd.tenantId,
      actorType: "SYSTEM",
      actorId: "system",
      action: "SAAS_INVOICE_GENERATED",
      resourceType: "saas_billing_invoices",
      resourceId: invoice.id,
      metadata: { invoiceNumber: invoice.invoiceNumber, total: invoice.total },
    });

    await this.outboxRepo.publish({
      eventType: "SAAS_INVOICE_CREATED",
      aggregateType: "SaaSBillingInvoice",
      aggregateId: invoice.id,
      tenantId: cmd.tenantId,
      payload: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, total: invoice.total },
    });

    return invoice;
  }

  async recordPayment(
    dto: RecordSaaSPaymentDto,
    actor?: { id: string; email?: string; type?: "PLATFORM_STAFF" | "USER" | "SYSTEM" }
  ): Promise<{ invoice: SaaSBillingInvoice; payment: SaaSPaymentRecord }> {
    const invoice = await this.invoiceRepo.findById(dto.invoiceId);
    if (!invoice) {
      throw new RecordNotFoundError("SaaSBillingInvoice", dto.invoiceId);
    }

    const paymentAmount = BillingMoney.round(dto.amount);
    if (this.isProductionLike() && (!dto.provider || dto.provider === "DEVELOPMENT_MOCK")) {
      throw new Error(
        "Production and staging require an explicit SaaS payment provider; DEVELOPMENT_MOCK is forbidden."
      );
    }

    const provider = dto.provider || "DEVELOPMENT_MOCK";

    const payment = await this.paymentRepo.record({
      tenantId: invoice.tenantId,
      invoiceId: invoice.id,
      provider,
      providerReference: dto.providerReference,
      amount: paymentAmount,
      currency: dto.currency || invoice.currency,
      status: "SUCCEEDED",
      receivedAt: new Date().toISOString(),
      recordedBy: actor?.id || "SYSTEM",
      notes: dto.notes,
    });

    const updatedInvoice = await this.invoiceRepo.recordPayment(
      invoice.id,
      paymentAmount,
      payment.receivedAt
    );

    // If fully paid and invoice is for a subscription, activate or advance the subscription
    if (updatedInvoice.status === "PAID" && invoice.subscriptionId) {
      const sub = await this.subscriptionRepo.findById(invoice.subscriptionId);
      if (sub && (sub.status === "TRIAL" || sub.status === "RENEWAL_DUE" || sub.status === "PAST_DUE" || sub.status === "GRACE_PERIOD")) {
        const nextPeriodStart = sub.currentPeriodEnd || new Date().toISOString();
        const intervalDays = sub.billingInterval === "YEARLY" || sub.billingCycle === "ANNUAL" ? 365 : 30;
        const nextPeriodEnd = new Date(
          new Date(nextPeriodStart).getTime() + intervalDays * 24 * 60 * 60 * 1000
        ).toISOString();

        await this.subscriptionRepo.update(sub.id, {
          status: "ACTIVE",
          state: "ACTIVE",
          currentPeriodStart: nextPeriodStart,
          currentPeriodEnd: nextPeriodEnd,
          renewalDueAt: new Date(new Date(nextPeriodEnd).getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          graceEndsAt: undefined,
          gracePeriodEndsAt: undefined,
        });
      }
    }

    await this.auditRepo.record({
      tenantId: invoice.tenantId,
      actorType: actor?.type || "SYSTEM",
      actorId: actor?.id || "system",
      action: "SAAS_PAYMENT_RECORDED",
      resourceType: "saas_payment_records",
      resourceId: payment.id,
      metadata: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amount: paymentAmount,
        provider,
      },
    });

    await this.outboxRepo.publish({
      eventType: "SAAS_PAYMENT_RECEIVED",
      aggregateType: "SaaSPaymentRecord",
      aggregateId: payment.id,
      tenantId: invoice.tenantId,
      payload: {
        paymentId: payment.id,
        invoiceId: invoice.id,
        amount: paymentAmount,
        status: updatedInvoice.status,
      },
    });

    return { invoice: updatedInvoice, payment };
  }
}
