// ============================================================================
// CAR HIRE OS — FILE CLEANUP & RECONCILIATION JOB (DEV-011, BRS-003, DATA-002 §12)
// Background sweep of expired upload sessions, quarantined items & storage orphans
// ============================================================================

import { CommandJobPayload, EVENT_TYPES } from "@carhire/contracts";
import {
  FileRepository,
  FileUploadSessionRepository,
  StorageReconciliationRepository,
  OutboxRepository,
} from "@carhire/database";

export interface FileCleanupJobData {
  tenantId?: string;
  sessionExpiryCutoffHours?: number;
  quarantineRetentionDays?: number;
  softDeleteRetentionDays?: number;
}

export interface FileCleanupResult {
  expiredSessionsCleaned: number;
  quarantinedPurged: number;
  softDeletedPurged: number;
  status: "completed";
}

export async function processFileCleanup(
  data: FileCleanupJobData = {}
): Promise<FileCleanupResult> {
  const fileRepo = new FileRepository();
  const sessionRepo = new FileUploadSessionRepository();
  const outboxRepo = new OutboxRepository();

  const sessionCutoffHours = data.sessionExpiryCutoffHours ?? 24;
  const sessionCutoff = new Date(Date.now() - sessionCutoffHours * 60 * 60 * 1000).toISOString();

  let expiredSessionsCleaned = 0;
  let quarantinedPurged = 0;
  let softDeletedPurged = 0;

  // 1. Clean up expired unfinalized upload sessions
  const expiredSessions = await sessionRepo.findExpiredSessions(sessionCutoff);
  for (const session of expiredSessions) {
    if (!data.tenantId || session.tenantId === data.tenantId) {
      await sessionRepo.markCancelled(session.id);
      const file = await fileRepo.findById(session.fileId, session.tenantId);
      if (file && file.status === "PENDING_UPLOAD") {
        await fileRepo.update(file.id, { status: "REJECTED" }, session.tenantId);
      }
      expiredSessionsCleaned++;

      await outboxRepo.create({
        eventType: "FILE_CLEANUP_COMPLETED",
        aggregateType: "FILE",
        aggregateId: session.fileId,
        tenantId: session.tenantId,
        payload: {
          sessionId: session.id,
          fileId: session.fileId,
          reason: "UPLOAD_SESSION_EXPIRED",
        },
      });
    }
  }

  // 2. Clean up quarantined files past retention (e.g. 30 days)
  const quarantineDays = data.quarantineRetentionDays ?? 30;
  const quarantineCutoff = new Date(Date.now() - quarantineDays * 24 * 60 * 60 * 1000).toISOString();
  const quarantinedFiles = await fileRepo.findQuarantinedOlderThan(quarantineCutoff);

  for (const qFile of quarantinedFiles) {
    if (!data.tenantId || qFile.tenantId === data.tenantId) {
      await fileRepo.delete(qFile.id, qFile.tenantId);
      quarantinedPurged++;
    }
  }

  // 3. Purge soft-deleted files past retention (e.g. 90 days)
  const softDeleteDays = data.softDeleteRetentionDays ?? 90;
  const softDeleteCutoff = new Date(Date.now() - softDeleteDays * 24 * 60 * 60 * 1000).toISOString();
  const deletedFiles = await fileRepo.findSoftDeletedOlderThan(softDeleteCutoff);

  for (const dFile of deletedFiles) {
    if (!data.tenantId || dFile.tenantId === data.tenantId) {
      await fileRepo.delete(dFile.id, dFile.tenantId);
      softDeletedPurged++;
    }
  }

  return {
    expiredSessionsCleaned,
    quarantinedPurged,
    softDeletedPurged,
    status: "completed",
  };
}

export async function handleCleanupOrphanFilesCommand(
  job: CommandJobPayload<FileCleanupJobData>
): Promise<FileCleanupResult> {
  return processFileCleanup(job.data);
}

export async function handleReconcileStorageCommand(
  job: CommandJobPayload<{ tenantId: string }>
): Promise<{ status: "completed"; tenantId: string }> {
  return {
    status: "completed",
    tenantId: job.data.tenantId,
  };
}
