// ============================================================================
// CAR HIRE OS — STORAGE RECONCILIATION SERVICE (DATA-002 §12, SEC-001)
// Discrepancy detection, orphan object sweeps, and storage integrity assurance
// ============================================================================

import {
  IFileRepository,
  IStorageReconciliationRepository,
  IOutboxRepository,
} from "@carhire/database";
import { StorageReconciliationReport } from "@carhire/types";
import { IObjectStorageDriver } from "../../infrastructure/storage/object-storage.interface";

export class StorageReconciliationService {
  private fileRepo: IFileRepository;
  private reconRepo: IStorageReconciliationRepository;
  private storageDriver: IObjectStorageDriver;
  private outboxRepo?: IOutboxRepository;

  constructor(
    fileRepo: IFileRepository,
    reconRepo: IStorageReconciliationRepository,
    storageDriver: IObjectStorageDriver,
    outboxRepo?: IOutboxRepository
  ) {
    this.fileRepo = fileRepo;
    this.reconRepo = reconRepo;
    this.storageDriver = storageDriver;
    this.outboxRepo = outboxRepo;
  }

  /**
   * Performs a comprehensive reconciliation between database records and storage bucket.
   */
  async reconcileTenantStorage(tenantId: string, bucket = "carhire-files"): Promise<StorageReconciliationReport> {
    const report: StorageReconciliationReport = {
      tenantId,
      checkedAt: new Date().toISOString(),
      missingObjectsCount: 0,
      orphanObjectsCount: 0,
      stuckPendingCount: 0,
      stuckQuarantinedCount: 0,
      issues: [],
    };

    // 1. Scan all active files in DB and verify existence in storage
    const { items: activeFiles } = await this.fileRepo.listByTenant(tenantId, { limit: 10000 });
    for (const file of activeFiles) {
      if (file.status === "ACTIVE") {
        const head = await this.storageDriver.headObject({ bucket: file.bucket, key: file.objectKey });
        if (!head) {
          report.missingObjectsCount++;
          const issue = await this.reconRepo.create({
            tenantId,
            fileId: file.id,
            objectKey: file.objectKey,
            issueType: "MISSING_OBJECT",
            details: { expectedSize: file.sizeBytes },
          });
          report.issues.push(issue);
        }
      }
    }

    // 2. Identify stuck pending uploads (> 24 hours)
    const pendingCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const stuckPending = await this.fileRepo.findPendingUploadsOlderThan(pendingCutoff);
    for (const pending of stuckPending.filter((f) => f.tenantId === tenantId)) {
      report.stuckPendingCount++;
      const issue = await this.reconRepo.create({
        tenantId,
        fileId: pending.id,
        objectKey: pending.objectKey,
        issueType: "STUCK_PENDING",
        details: { createdAt: pending.createdAt },
      });
      report.issues.push(issue);
    }

    // 3. Identify stuck quarantined files (> 30 days)
    const quarantineCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const stuckQuarantined = await this.fileRepo.findQuarantinedOlderThan(quarantineCutoff);
    for (const quarantined of stuckQuarantined.filter((f) => f.tenantId === tenantId)) {
      report.stuckQuarantinedCount++;
      const issue = await this.reconRepo.create({
        tenantId,
        fileId: quarantined.id,
        objectKey: quarantined.objectKey,
        issueType: "STUCK_QUARANTINED",
        details: { createdAt: quarantined.createdAt },
      });
      report.issues.push(issue);
    }

    // 4. Scan storage bucket prefix for orphan objects
    const tenantPrefix = `tenants/${tenantId}/`;
    const listed = await this.storageDriver.listObjects({ bucket, prefix: tenantPrefix, maxKeys: 10000 });
    for (const key of listed.keys) {
      const file = await this.fileRepo.findByObjectKey(key, tenantId);
      if (!file) {
        report.orphanObjectsCount++;
        const issue = await this.reconRepo.create({
          tenantId,
          objectKey: key,
          issueType: "ORPHAN_OBJECT",
          details: { bucket },
        });
        report.issues.push(issue);
      }
    }

    // 5. Emit event
    if (this.outboxRepo) {
      await this.outboxRepo.create({
        eventType: "STORAGE_RECONCILIATION_COMPLETED",
        aggregateType: "TENANT",
        aggregateId: tenantId,
        tenantId,
        payload: {
          tenantId,
          missingObjectsCount: report.missingObjectsCount,
          orphanObjectsCount: report.orphanObjectsCount,
          stuckPendingCount: report.stuckPendingCount,
          stuckQuarantinedCount: report.stuckQuarantinedCount,
        },
      });
    }

    return report;
  }
}
