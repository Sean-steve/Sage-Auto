import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — FILE SCAN RECORD REPOSITORY (SEC-004, SEC-005, ARCH-001)
// Antivirus/antimalware scan inspection logs, findings, and quarantine records
// ============================================================================

import { FileScanRecord, FileScanStatus } from "@carhire/types";
import { TransactionContext } from "../transaction-manager";
import { CrossTenantViolationError } from "../errors";

export interface CreateFileScanRecordInput {
  id?: string;
  tenantId: string;
  fileId: string;
  scannerEngine: string;
  scannerVersion?: string;
  status?: FileScanStatus;
  findings?: string[];
  attempt?: number;
}

export interface IFileScanRecordRepository {
  create(input: CreateFileScanRecordInput, tx?: TransactionContext): Promise<FileScanRecord>;
  findById(id: string, tenantId?: string, tx?: TransactionContext): Promise<FileScanRecord | null>;
  findLatestByFileId(fileId: string, tenantId?: string, tx?: TransactionContext): Promise<FileScanRecord | null>;
  listByFileId(fileId: string, tenantId?: string, tx?: TransactionContext): Promise<FileScanRecord[]>;
  updateStatus(
    id: string,
    status: FileScanStatus,
    findings?: string[],
    completedAt?: string,
    tx?: TransactionContext
  ): Promise<FileScanRecord>;
}

export class FileScanRecordRepository implements IFileScanRecordRepository {
  private static store = createRecordStore<string, FileScanRecord>("file-scan-record.repository:store");

  public static clear(): void {
    FileScanRecordRepository.store.clear();
  }

  async create(input: CreateFileScanRecordInput, _tx?: TransactionContext): Promise<FileScanRecord> {
    const id = input.id || crypto.randomUUID();
    const now = new Date().toISOString();

    const record: FileScanRecord = {
      id,
      tenantId: input.tenantId,
      fileId: input.fileId,
      scannerEngine: input.scannerEngine,
      scannerVersion: input.scannerVersion,
      status: input.status || "PENDING",
      findings: input.findings,
      startedAt: now,
      attempt: input.attempt || 1,
    };

    FileScanRecordRepository.store.set(id, record);
    return { ...record };
  }

  async findById(id: string, tenantId?: string, _tx?: TransactionContext): Promise<FileScanRecord | null> {
    const record = FileScanRecordRepository.store.get(id);
    if (!record) return null;

    if (tenantId && record.tenantId !== tenantId) {
      throw new CrossTenantViolationError(record.tenantId, tenantId);
    }

    return { ...record };
  }

  async findLatestByFileId(fileId: string, tenantId?: string, _tx?: TransactionContext): Promise<FileScanRecord | null> {
    const records = await this.listByFileId(fileId, tenantId);
    if (records.length === 0) return null;

    records.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    return records[0];
  }

  async listByFileId(fileId: string, tenantId?: string, _tx?: TransactionContext): Promise<FileScanRecord[]> {
    const results: FileScanRecord[] = [];
    for (const record of FileScanRecordRepository.store.values()) {
      if (record.fileId === fileId) {
        if (tenantId && record.tenantId !== tenantId) {
          throw new CrossTenantViolationError(record.tenantId, tenantId);
        }
        results.push({ ...record });
      }
    }
    return results;
  }

  async updateStatus(
    id: string,
    status: FileScanStatus,
    findings?: string[],
    completedAt?: string,
    _tx?: TransactionContext
  ): Promise<FileScanRecord> {
    const record = FileScanRecordRepository.store.get(id);
    if (!record) throw new Error(`Scan record not found with ID ${id}`);

    const updated: FileScanRecord = {
      ...record,
      status,
      findings: findings || record.findings,
      completedAt: completedAt || new Date().toISOString(),
    };

    FileScanRecordRepository.store.set(id, updated);
    return { ...updated };
  }
}
