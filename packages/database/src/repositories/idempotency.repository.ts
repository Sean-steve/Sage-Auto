import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — IDEMPOTENCY REPOSITORY (DEV-009, DATA-002 §10)
// ============================================================================

import { UniqueConstraintViolationError } from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IdempotencyRecord {
  id: string;
  tenantId?: string;
  idempotencyKey: string;
  operationScope: string;
  requestHash: string;
  responseStatus?: number;
  responseBody?: Record<string, unknown>;
  status: "PENDING" | "COMPLETED" | "FAILED";
  createdAt: string;
  expiresAt: string;
}

export interface IIdempotencyRepository {
  find(key: string, scope: string, tx?: TransactionContext): Promise<IdempotencyRecord | null>;
  findByKey(tenantId: string, key: string, tx?: TransactionContext): Promise<IdempotencyRecord | null>;
  createPending(key: string, scope: string, requestHash: string, expiresAt: string, tenantId?: string, tx?: TransactionContext): Promise<IdempotencyRecord>;
  record(data: { tenantId?: string; idempotencyKey: string; resourceType?: string; resourceId?: string; responseStatus: number; responseBody: string | Record<string, unknown> }, tx?: TransactionContext): Promise<IdempotencyRecord>;
  complete(key: string, scope: string, status: number, body: Record<string, unknown>, tx?: TransactionContext): Promise<void>;
  fail(key: string, scope: string, tx?: TransactionContext): Promise<void>;
}

export class IdempotencyRepository implements IIdempotencyRepository {
  private static store = createRecordStore<string, IdempotencyRecord>("idempotency.repository:store");

  public static clear(): void {
    IdempotencyRepository.store.clear();
  }

  private compositeKey(key: string, scope: string): string {
    return `${scope}::${key}`;
  }

  async findByKey(tenantId: string, key: string): Promise<IdempotencyRecord | null> {
    for (const record of IdempotencyRepository.store.values()) {
      if (record.idempotencyKey === key && (!tenantId || record.tenantId === tenantId)) {
        if (new Date(record.expiresAt) < new Date()) {
          IdempotencyRepository.store.delete(this.compositeKey(record.idempotencyKey, record.operationScope));
          return null;
        }
        return record;
      }
    }
    return null;
  }

  async record(data: { tenantId?: string; idempotencyKey: string; resourceType?: string; resourceId?: string; responseStatus: number; responseBody: string | Record<string, unknown> }): Promise<IdempotencyRecord> {
    const scope = data.resourceType || "GLOBAL";
    const ck = this.compositeKey(data.idempotencyKey, scope);
    const body = typeof data.responseBody === "string" ? JSON.parse(data.responseBody) : data.responseBody;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const record: IdempotencyRecord = {
      id: crypto.randomUUID(),
      tenantId: data.tenantId,
      idempotencyKey: data.idempotencyKey,
      operationScope: scope,
      requestHash: "hash",
      status: "COMPLETED",
      responseStatus: data.responseStatus,
      responseBody: body,
      createdAt: now.toISOString(),
      expiresAt,
    };

    IdempotencyRepository.store.set(ck, record);
    return record;
  }

  async find(key: string, scope: string): Promise<IdempotencyRecord | null> {
    const ck = this.compositeKey(key, scope);
    const record = IdempotencyRepository.store.get(ck);
    if (!record) return null;

    // Check expiration
    if (new Date(record.expiresAt) < new Date()) {
      IdempotencyRepository.store.delete(ck);
      return null;
    }
    return record;
  }

  async createPending(
    key: string,
    scope: string,
    requestHash: string,
    expiresAt: string,
    tenantId?: string
  ): Promise<IdempotencyRecord> {
    const ck = this.compositeKey(key, scope);
    const existing = IdempotencyRepository.store.get(ck);
    if (existing && new Date(existing.expiresAt) >= new Date()) {
      throw new UniqueConstraintViolationError("idempotency_key", `${scope}:${key}`);
    }

    const record: IdempotencyRecord = {
      id: crypto.randomUUID(),
      tenantId,
      idempotencyKey: key,
      operationScope: scope,
      requestHash,
      status: "PENDING",
      createdAt: new Date().toISOString(),
      expiresAt,
    };

    IdempotencyRepository.store.set(ck, record);
    return record;
  }

  async complete(key: string, scope: string, responseStatus: number, responseBody: Record<string, unknown>): Promise<void> {
    const ck = this.compositeKey(key, scope);
    const record = IdempotencyRepository.store.get(ck);
    if (record) {
      record.status = "COMPLETED";
      record.responseStatus = responseStatus;
      record.responseBody = responseBody;
      IdempotencyRepository.store.set(ck, record);
    }
  }

  async fail(key: string, scope: string): Promise<void> {
    const ck = this.compositeKey(key, scope);
    const record = IdempotencyRepository.store.get(ck);
    if (record) {
      record.status = "FAILED";
      IdempotencyRepository.store.set(ck, record);
    }
  }
}
