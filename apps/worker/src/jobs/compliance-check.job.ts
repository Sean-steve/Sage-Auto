// ============================================================================
// CAR HIRE OS — COMPLIANCE SCAN & EXPIRY AUTOMATION JOB (DEV-011, BRS-003)
// Scans vehicle permits, licenses, inspection certificates, and enqueues outbox events
// ============================================================================

import { CommandJobPayload, EVENT_TYPES } from "@carhire/contracts";
import { ComplianceRecordRepository, OutboxRepository } from "@carhire/database";

export interface ComplianceCheckJobData {
  tenantId?: string;
  daysThreshold?: number;
  now?: string;
}

export interface ComplianceCheckResult {
  scanned: number;
  expiredCount: number;
  impendingCount: number;
  status: "completed";
}

export async function processComplianceCheck(
  data: ComplianceCheckJobData = { daysThreshold: 14 }
): Promise<ComplianceCheckResult> {
  const complianceRepo = new ComplianceRecordRepository();
  const outboxRepo = new OutboxRepository();

  const now = data.now ? new Date(data.now) : new Date();
  const thresholdDays = data.daysThreshold ?? 14;
  const warningCutoff = new Date(now.getTime() + thresholdDays * 24 * 60 * 60 * 1000);

  let scanned = 0;
  let expiredCount = 0;
  let impendingCount = 0;

  // Scan across tenants or target tenant
  const tenants: string[] = data.tenantId ? [data.tenantId] : Array.from((ComplianceRecordRepository as any).store?.keys() || []);

  for (const tenantId of tenants) {
    try {
      const records = await complianceRepo.list(tenantId, {});
      scanned += records.length;

      for (const record of records) {
        const expiryStr = record.expiresAt || (record as any).validUntil;
        if (!expiryStr) continue;
        const validUntil = new Date(expiryStr);

        if (validUntil < now && record.status !== "EXPIRED") {
          // Transition status to EXPIRED
          await complianceRepo.update(record.id, tenantId, {
            status: "EXPIRED" as any,
          });

          // Enqueue canonical domain event into transactional outbox
          await outboxRepo.record({
            eventType: EVENT_TYPES.COMPLIANCE_DOCUMENT_EXPIRED,
            aggregateType: "ComplianceRecord",
            aggregateId: record.id,
            tenantId,
            source: "carhire.worker.compliance-check",
            correlationId: crypto.randomUUID(),
            payload: {
              recordId: record.id,
              subjectType: record.subjectType,
              subjectId: record.subjectId,
              requirementCode: record.requirementCode,
              expiredAt: validUntil.toISOString(),
            },
          });

          expiredCount++;
        } else if (validUntil >= now && validUntil <= warningCutoff) {
          impendingCount++;
        }
      }
    } catch (err) {
      console.error(`[Worker:ComplianceCheck] Error scanning compliance for tenant ${tenantId}:`, err);
    }
  }

  return {
    scanned,
    expiredCount,
    impendingCount,
    status: "completed",
  };
}

/**
 * Worker Command Handler invoked by the Background Execution Platform.
 */
export async function handleScanComplianceCommand(
  command: CommandJobPayload<ComplianceCheckJobData>
): Promise<ComplianceCheckResult> {
  const data: ComplianceCheckJobData = {
    ...command.data,
    tenantId: command.tenantId || command.data?.tenantId,
  };
  return processComplianceCheck(data);
}
