import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — WEBHOOK RECEIPT REPOSITORY (DEV-009, DATA-002 §12)
// ============================================================================

import { UniqueConstraintViolationError } from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface WebhookRecord {
  id: string;
  provider: string;
  providerEventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  headers?: Record<string, unknown>;
  receivedAt: string;
  verifiedAt?: string;
  processedAt?: string;
  status: "RECEIVED" | "PROCESSING" | "PROCESSED" | "FAILED";
  attemptCount: number;
  lastError?: string;
}

export interface IWebhookRepository {
  recordReceipt(
    record: Omit<WebhookRecord, "id" | "receivedAt" | "status" | "attemptCount">,
    tx?: TransactionContext
  ): Promise<WebhookRecord>;
  findById(id: string, tx?: TransactionContext): Promise<WebhookRecord | null>;
  findByProviderEvent(provider: string, providerEventId: string, tx?: TransactionContext): Promise<WebhookRecord | null>;
  markProcessed(id: string, tx?: TransactionContext): Promise<void>;
  markFailed(id: string, error: string, tx?: TransactionContext): Promise<void>;
}

export class WebhookRepository implements IWebhookRepository {
  private static store = createRecordStore<string, WebhookRecord>("webhook.repository:store");

  private compositeKey(provider: string, providerEventId: string): string {
    return `${provider}::${providerEventId}`;
  }

  async recordReceipt(
    data: Omit<WebhookRecord, "id" | "receivedAt" | "status" | "attemptCount">
  ): Promise<WebhookRecord> {
    const ck = this.compositeKey(data.provider, data.providerEventId);
    if (WebhookRepository.store.has(ck)) {
      throw new UniqueConstraintViolationError("provider_event_id", `${data.provider}:${data.providerEventId}`);
    }

    const record: WebhookRecord = {
      ...data,
      id: crypto.randomUUID(),
      receivedAt: new Date().toISOString(),
      status: "RECEIVED",
      attemptCount: 0,
    };

    WebhookRepository.store.set(ck, record);
    return record;
  }

  async findById(id: string): Promise<WebhookRecord | null> {
    for (const record of WebhookRepository.store.values()) {
      if (record.id === id) return record;
    }
    return null;
  }

  async findByProviderEvent(provider: string, providerEventId: string): Promise<WebhookRecord | null> {
    const ck = this.compositeKey(provider, providerEventId);
    return WebhookRepository.store.get(ck) || null;
  }

  async markProcessed(id: string): Promise<void> {
    const record = await this.findById(id);
    if (record) {
      record.status = "PROCESSED";
      record.processedAt = new Date().toISOString();
      const ck = this.compositeKey(record.provider, record.providerEventId);
      WebhookRepository.store.set(ck, record);
    }
  }

  async markFailed(id: string, error: string): Promise<void> {
    const record = await this.findById(id);
    if (record) {
      record.attemptCount += 1;
      record.lastError = error;
      record.status = "FAILED";
      const ck = this.compositeKey(record.provider, record.providerEventId);
      WebhookRepository.store.set(ck, record);
    }
  }
}
