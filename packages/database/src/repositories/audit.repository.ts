// ============================================================================
// CAR HIRE OS — AUDIT LOG REPOSITORY (SEC-003, DATA-003)
// Append-only audit record persistence
// ============================================================================

import { TransactionContext } from "../transaction-manager";

export interface AuditRecord {
  id: string;
  tenantId?: string;
  actorType?: "USER" | "SYSTEM" | "SUPPORT" | "API_KEY" | "ANONYMOUS" | "PLATFORM_STAFF";
  actorId?: string;
  actorUserId?: string;
  actorName?: string;
  userId?: string;
  action: string;
  resource?: string;
  resourceType?: string;
  resourceId: string;
  requestId?: string;
  beforeSnapshot?: Record<string, unknown>;
  afterSnapshot?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  details?: Record<string, unknown>;
  description?: string;
  payload?: Record<string, unknown>;
  occurredAt: string;
}

export interface IAuditRepository {
  create(record: Omit<AuditRecord, "id" | "occurredAt">, tx?: TransactionContext): Promise<AuditRecord>;
  append(record: Omit<AuditRecord, "id" | "occurredAt">, tx?: TransactionContext): Promise<AuditRecord>;
  record(record: Omit<AuditRecord, "id" | "occurredAt">, tx?: TransactionContext): Promise<AuditRecord>;
  findByResource(resourceType: string, resourceId: string, tx?: TransactionContext): Promise<AuditRecord[]>;
  findByTenant(tenantId: string, limit?: number, tx?: TransactionContext): Promise<AuditRecord[]>;
  findRecentByAction(action: string, limit?: number): Promise<AuditRecord[]>;
  listAll(limit?: number): Promise<AuditRecord[]>;
}

export class AuditRepository implements IAuditRepository {
  private static store: AuditRecord[] = [];

  async create(data: Omit<AuditRecord, "id" | "occurredAt">, tx?: TransactionContext): Promise<AuditRecord> {
    return this.append(data, tx);
  }

  async append(data: Omit<AuditRecord, "id" | "occurredAt">, tx?: TransactionContext): Promise<AuditRecord> {
    const record: AuditRecord = {
      ...data,
      id: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
    };

    AuditRepository.store.push(record);
    return record;
  }

  async record(data: Omit<AuditRecord, "id" | "occurredAt">, tx?: TransactionContext): Promise<AuditRecord> {
    return this.append(data, tx);
  }

  async findByResource(resourceType: string, resourceId: string): Promise<AuditRecord[]> {
    return AuditRepository.store.filter(
      (a) => a.resourceType === resourceType && a.resourceId === resourceId
    );
  }

  async findByTenant(tenantId: string, limit = 100): Promise<AuditRecord[]> {
    return AuditRepository.store
      .filter((a) => a.tenantId === tenantId)
      .slice(-limit);
  }

  async listByTenant(tenantId: string, limit = 100): Promise<AuditRecord[]> {
    return this.findByTenant(tenantId, limit);
  }

  async findRecentByAction(action: string, limit = 100): Promise<AuditRecord[]> {
    return AuditRepository.store
      .filter((a) => a.action === action)
      .slice(-limit);
  }

  async listAll(limit = 200): Promise<AuditRecord[]> {
    return AuditRepository.store.slice(-limit).reverse();
  }

  static clear(): void {
    AuditRepository.store = [];
  }
}

