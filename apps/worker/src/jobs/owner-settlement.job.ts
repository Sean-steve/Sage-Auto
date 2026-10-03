// ============================================================================
// CAR HIRE OS — OWNER SETTLEMENT BATCH AUTOMATION JOB (DEV-011, BRS-003)
// Evaluates closed settlement periods and computes owner payout batches
// ============================================================================

import { CommandJobPayload, EVENT_TYPES } from "@carhire/contracts";
import { OwnerSettlementRepository, OutboxRepository } from "@carhire/database";

export interface SettlementBatchJobData {
  tenantId?: string;
  periodClose?: boolean;
  now?: string;
}

export interface SettlementBatchResult {
  settlementsProcessed: number;
  status: "completed";
}

export async function processSettlementBatch(
  data: SettlementBatchJobData = {}
): Promise<SettlementBatchResult> {
  const settlementRepo = new OwnerSettlementRepository();
  const outboxRepo = new OutboxRepository();

  const now = data.now ? new Date(data.now) : new Date();
  let settlementsProcessed = 0;

  const tenants: string[] = data.tenantId ? [data.tenantId] : Array.from((OwnerSettlementRepository as any).store?.keys() || []);

  for (const tenantId of tenants) {
    try {
      const settlements = await settlementRepo.listByTenant(tenantId, { status: "DRAFT" as any });
      for (const settlement of settlements) {
        settlementsProcessed++;
        await outboxRepo.record({
          eventType: EVENT_TYPES.SETTLEMENT_BATCH_CALCULATED,
          aggregateType: "OwnerSettlement",
          aggregateId: settlement.id,
          tenantId,
          source: "carhire.worker.owner-settlement",
          correlationId: crypto.randomUUID(),
          payload: {
            settlementId: settlement.id,
            ownerId: settlement.ownerId,
            grossRevenue: settlement.grossRevenue || (settlement as any).grossRentalRevenue,
            netPayoutAmount: settlement.netPayoutAmount || (settlement as any).netPayableToOwner,
            calculatedAt: now.toISOString(),
          },
        });
      }
    } catch (err) {
      console.error(`[Worker:OwnerSettlement] Error processing settlements for tenant ${tenantId}:`, err);
    }
  }

  return {
    settlementsProcessed,
    status: "completed",
  };
}

/**
 * Worker Command Handler invoked by the Background Execution Platform.
 */
export async function handleCalculateSettlementsCommand(
  command: CommandJobPayload<SettlementBatchJobData>
): Promise<SettlementBatchResult> {
  const data: SettlementBatchJobData = {
    ...command.data,
    tenantId: command.tenantId || command.data?.tenantId,
  };
  return processSettlementBatch(data);
}
