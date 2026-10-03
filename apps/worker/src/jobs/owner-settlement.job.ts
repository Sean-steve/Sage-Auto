// ============================================================================
// CAR HIRE OS — OWNER SETTLEMENT BATCH AUTOMATION JOB (DEV-011, BRS-003)
// Scheduled adapter only. All calculation authority remains in OwnerSettlementsService.
// ============================================================================

import { CommandJobPayload } from "@carhire/contracts";
import { OwnerSettlementPeriodRepository } from "@carhire/database";
import { LedgerModule } from "../../../api/src/modules/ledger/ledger.module";
import { FinanceModule } from "../../../api/src/modules/finance/finance.module";
import { OwnerSettlementsModule } from "../../../api/src/modules/owner-settlements/owner-settlements.module";

export interface SettlementBatchJobData {
  tenantId?: string;
  periodClose?: boolean;
  periodId?: string;
  now?: string;
}

export interface SettlementBatchResult {
  settlementsProcessed: number;
  periodsProcessed: number;
  status: "completed" | "skipped";
}

export async function processSettlementBatch(
  data: SettlementBatchJobData = {}
): Promise<SettlementBatchResult> {
  // Background settlement processing is intentionally tenant-scoped. A worker
  // must never discover tenants by peeking into repository internals.
  if (!data.tenantId) {
    console.warn("[Worker:OwnerSettlement] Skipped settlement batch: trusted tenantId is required.");
    return { settlementsProcessed: 0, periodsProcessed: 0, status: "skipped" };
  }

  const tenantId = data.tenantId;
  const now = data.now ? new Date(data.now) : new Date();
  const today = now.toISOString().split("T")[0];
  const actor = { userId: "system:settlement-batch-worker" };

  const ledgerModule = new LedgerModule();
  const financeModule = new FinanceModule(undefined, {
    ledgerService: ledgerModule.ledgerService,
  });
  const settlementsModule = new OwnerSettlementsModule(
    undefined,
    ledgerModule.ledgerService,
    financeModule.financeService
  );
  const periodRepo = new OwnerSettlementPeriodRepository();

  const periods = data.periodId
    ? [await periodRepo.findById(data.periodId, tenantId)].filter(Boolean)
    : (await periodRepo.listByTenant(tenantId)).filter(
        (period) =>
          ["OPEN", "SETTLING"].includes(period.status) &&
          period.endDate <= today
      );

  let settlementsProcessed = 0;
  let periodsProcessed = 0;

  for (const period of periods) {
    if (!period) continue;
    try {
      const result = await settlementsModule.settlementService.generateBatch(
        tenantId,
        {
          periodId: period.id,
          idempotencyKey: `scheduled-settlement-batch:${tenantId}:${period.id}`,
        },
        actor
      );
      settlementsProcessed += result.settlements.length;
      periodsProcessed += 1;
    } catch (err: any) {
      // Retry/DLQ orchestration remains owned by the worker platform. We do not
      // synthesize a second settlement calculation path here.
      console.error(
        `[Worker:OwnerSettlement] Batch failed for ${tenantId}/${period.periodNumber}:`,
        err?.message || err
      );
      throw err;
    }
  }

  return {
    settlementsProcessed,
    periodsProcessed,
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
