// ============================================================================
// CAR HIRE OS — BACKUP & DISASTER RECOVERY DOMAIN TYPES
// SPRINT 43: Authoritative Backup, Restore Assurance, PITR & Disaster Recovery
// ============================================================================

export type DataDurabilityClass =
  | "AUTHORITATIVE_DURABLE"
  | "DERIVED_REBUILDABLE"
  | "TRANSIENT_OPERATIONAL"
  | "IMMUTABLE_ARTIFACT"
  | "SECRET_CONFIGURATION";

export type BackupType = "FULL_PHYSICAL" | "LOGICAL_SNAPSHOT" | "INCREMENTAL_WAL" | "TENANT_SELECTIVE";

export type BackupStatus = "COMPLETED" | "IN_PROGRESS" | "FAILED" | "VERIFIED" | "CORRUPTED";

export type RestoreMode = "FULL_DISASTER_RECOVERY" | "POINT_IN_TIME" | "TENANT_SELECTIVE" | "SIMULATED_DRILL";

export type DrillStatus = "SUCCESS" | "FAILED" | "IN_PROGRESS" | "ABORTED";

export interface BackupMetadata {
  id: string;
  backupType: BackupType;
  status: BackupStatus;
  startedAt: string;
  completedAt: string;
  sizeBytes: number;
  sha256Checksum: string;
  encryptionKeyId: string;
  encryptionAlgorithm: "AES-256-GCM" | "CHACHA20-POLY1305";
  storageLocation: string;
  storageRegion: string;
  storageTier: "STANDARD" | "INFREQUENT_ACCESS" | "GLACIER_INSTANT" | "WORM_COMPLIANCE";
  retentionDays: number;
  immutableUntil: string;
  databaseVersion: string;
  migrationBatch: number;
  migrationChecksums: Record<string, string>;
  tableRecordCounts: Record<string, number>;
  tenantIds: string[];
  walStartLsn?: string;
  walEndLsn?: string;
  metadataSignature: string;
}

export interface RestoreRequest {
  id: string;
  backupId: string;
  mode: RestoreMode;
  targetEnvironment: "PRODUCTION" | "STAGING" | "DR_SANDBOX";
  targetTimestamp?: string;
  targetLsn?: string;
  tenantIdFilter?: string; // If tenant-selective
  requestedBy: string;
  authorizedBy: string;
  reason: string;
  dryRun?: boolean;
}

export interface RestoreResult {
  restoreId: string;
  backupId: string;
  mode: RestoreMode;
  status: "SUCCESS" | "FAILED" | "ROLLED_BACK";
  startedAt: string;
  completedAt: string;
  durationMs: number;
  tablesRestored: number;
  recordsRestored: number;
  schemaValid: boolean;
  migrationsVerified: boolean;
  ledgerBalanced: boolean;
  tenantIsolationVerified: boolean;
  financialReconciled: boolean;
  observedRpoSeconds: number;
  observedRtoSeconds: number;
  auditRecordId: string;
  errors?: string[];
  warnings?: string[];
}

export interface LedgerBalanceVerification {
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
  discrepancy: number;
  accountsAudited: number;
  entriesAudited: number;
}

export interface FinancialReconciliationReport {
  reconciliationId: string;
  executedAt: string;
  totalProviderPaymentsChecked: number;
  matchedPayments: number;
  missingInDbInserted: number;
  duplicatePrevented: number;
  totalAmountReconciledKes: number;
  payoutBatchesVerified: number;
  discrepanciesFound: number;
  resolved: boolean;
}

export interface QueueReconstructionReport {
  rebuiltAt: string;
  queuesRebuilt: string[];
  outboxEventsScanned: number;
  outboxEventsReenqueued: number;
  scheduledJobsRegistered: number;
  stalledJobsPruned: number;
  success: boolean;
}

export interface ObjectStorageReconciliationReport {
  reconciledAt: string;
  totalFilesAudited: number;
  validObjectsFound: number;
  missingObjectsFound: number;
  quarantinedObjects: number;
  integrityPercentage: number;
  wormProtectionVerified: boolean;
  crossRegionReplicationActive: boolean;
}

export interface DrDrillReport {
  drillId: string;
  drillType: RestoreMode;
  targetScenario: "MULTI_REGION_FAILOVER" | "TENANT_DATA_CORRUPTION" | "RANSOMWARE_WORM_DEFENSE" | "POINT_IN_TIME_ROLLBACK";
  startedAt: string;
  completedAt: string;
  status: DrillStatus;
  candidateRpoTargetSeconds: number;
  observedRpoSeconds: number;
  candidateRtoTargetSeconds: number;
  observedRtoSeconds: number;
  rpoCompliant: boolean;
  rtoCompliant: boolean;
  tenantsAudited: number;
  ledgerAuditPassed: boolean;
  financialReconciliationPassed: boolean;
  invariantsPreserved: boolean;
  logSummary: string[];
}
