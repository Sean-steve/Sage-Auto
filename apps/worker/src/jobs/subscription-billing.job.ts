// ============================================================================
// CAR HIRE OS — SUBSCRIPTION BILLING AUTOMATION JOB (DEV-011, BRS-003)
// Scans SaaS subscriptions for period renewal, issues invoices and outbox events
// ============================================================================

import { CommandJobPayload, EVENT_TYPES } from "@carhire/contracts";
import { SubscriptionRepository, OutboxRepository, SaasBillingInvoiceRepository } from "@carhire/database";

export interface SubscriptionBillingJobData {
  periodWindow?: string;
  now?: string;
}

export interface SubscriptionBillingResult {
  scanned: number;
  renewedCount: number;
  invoicesIssued: number;
  status: "completed";
}

export async function processSubscriptionBilling(
  data: SubscriptionBillingJobData = {}
): Promise<SubscriptionBillingResult> {
  const subRepo = new SubscriptionRepository();
  const outboxRepo = new OutboxRepository();
  const invoiceRepo = new SaasBillingInvoiceRepository();

  const now = data.now ? new Date(data.now) : new Date();
  const allSubs = await subRepo.listAll();

  let scanned = 0;
  let renewedCount = 0;
  let invoicesIssued = 0;

  for (const sub of allSubs) {
    if (sub.status !== "ACTIVE") continue;
    scanned++;

    const periodEnd = new Date(sub.currentPeriodEnd);
    if (periodEnd <= now) {
      // Calculate renewal period (e.g. 30 days)
      const nextEnd = new Date(periodEnd.getTime() + 30 * 24 * 60 * 60 * 1000);

      await subRepo.update(sub.id, {
        currentPeriodStart: periodEnd.toISOString(),
        currentPeriodEnd: nextEnd.toISOString(),
      });
      renewedCount++;

      // Issue invoice
      const invoice = await invoiceRepo.create({
        tenantId: sub.tenantId,
        subscriptionId: sub.id,
        amount: (sub as any).price || 9900,
        currency: (sub as any).currency || "USD",
        status: "ISSUED",
        dueDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        lineItems: [
          {
            description: `SaaS Subscription Plan Renewal`,
            amount: (sub as any).price || 9900,
            quantity: 1,
          },
        ],
      } as any);
      invoicesIssued++;

      // Enqueue event
      await outboxRepo.record({
        eventType: EVENT_TYPES.BILLING_INVOICE_ISSUED,
        aggregateType: "BillingInvoice",
        aggregateId: invoice.id,
        tenantId: sub.tenantId,
        source: "carhire.worker.subscription-billing",
        correlationId: `sub-bill-${sub.id}-${now.toISOString().slice(0, 10)}`,
        payload: {
          invoiceId: invoice.id,
          subscriptionId: sub.id,
          tenantId: sub.tenantId,
          amount: (sub as any).price || 9900,
          periodStart: periodEnd.toISOString(),
          periodEnd: nextEnd.toISOString(),
        },
      });
    }
  }

  return {
    scanned,
    renewedCount,
    invoicesIssued,
    status: "completed",
  };
}

/**
 * Worker Command Handler invoked by the Background Execution Platform.
 */
export async function handleBillSubscriptionsCommand(
  command: CommandJobPayload<SubscriptionBillingJobData>
): Promise<SubscriptionBillingResult> {
  return processSubscriptionBilling(command.data || {});
}
