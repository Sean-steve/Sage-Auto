import { createRecordStore } from "../record-store";
import {
  SalesQuoteRecord,
  QuoteVersionRecord,
  SalesQuoteFilterParams,
} from "@car-hire-os/types";

export interface ISalesQuoteRepository {
  findById(id: string): Promise<SalesQuoteRecord | null>;
  findByTenantAndId(tenantId: string, id: string): Promise<SalesQuoteRecord | null>;
  findByQuoteNumber(tenantId: string, quoteNumber: string): Promise<SalesQuoteRecord | null>;
  findByPublicToken(publicToken: string): Promise<SalesQuoteRecord | null>;
  findMany(filter: SalesQuoteFilterParams): Promise<{ items: SalesQuoteRecord[]; total: number }>;
  listByTenant(tenantId: string): Promise<SalesQuoteRecord[]>;
  list(tenantId: string): Promise<SalesQuoteRecord[]>;
  save(quote: SalesQuoteRecord): Promise<SalesQuoteRecord>;
  saveVersion(version: QuoteVersionRecord): Promise<QuoteVersionRecord>;
  getVersions(tenantId: string, quoteId: string): Promise<QuoteVersionRecord[]>;
  getVersion(tenantId: string, quoteId: string, versionNumber: number): Promise<QuoteVersionRecord | null>;
  clear(): void;
}

export class InMemorySalesQuoteRepository implements ISalesQuoteRepository {
  private quotes: Map<string, SalesQuoteRecord> = createRecordStore("sales-quote.repository:quotes");
  private versions: Map<string, QuoteVersionRecord[]> = createRecordStore("sales-quote.repository:versions"); // quoteId -> versions
  private sequenceCounter: number = 2000;

  async findById(id: string): Promise<SalesQuoteRecord | null> {
    const item = this.quotes.get(id);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  async findByTenantAndId(tenantId: string, id: string): Promise<SalesQuoteRecord | null> {
    const item = this.quotes.get(id);
    if (item && item.tenantId === tenantId) {
      return JSON.parse(JSON.stringify(item));
    }
    return null;
  }

  async findByQuoteNumber(tenantId: string, quoteNumber: string): Promise<SalesQuoteRecord | null> {
    for (const item of this.quotes.values()) {
      if (item.tenantId === tenantId && item.quoteNumber === quoteNumber) {
        return JSON.parse(JSON.stringify(item));
      }
    }
    return null;
  }

  async findByPublicToken(publicToken: string): Promise<SalesQuoteRecord | null> {
    for (const item of this.quotes.values()) {
      if (item.publicToken === publicToken) {
        return JSON.parse(JSON.stringify(item));
      }
    }
    return null;
  }

  async findMany(filter: SalesQuoteFilterParams): Promise<{ items: SalesQuoteRecord[]; total: number }> {
    let result = Array.from(this.quotes.values()).filter((q) => q.tenantId === filter.tenantId);

    if (filter.leadId) {
      result = result.filter((q) => q.leadId === filter.leadId);
    }
    if (filter.customerId) {
      result = result.filter((q) => q.customerId === filter.customerId);
    }
    if (filter.status) {
      result = result.filter((q) => q.status === filter.status);
    }
    if (filter.search) {
      const s = filter.search.toLowerCase();
      result = result.filter(
        (q) =>
          q.quoteNumber.toLowerCase().includes(s) ||
          (q.pickupLocation && q.pickupLocation.toLowerCase().includes(s)) ||
          (q.customerNotes && q.customerNotes.toLowerCase().includes(s))
      );
    }

    result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const total = result.length;
    const offset = filter.offset || 0;
    const limit = filter.limit || 50;
    const items = result.slice(offset, offset + limit).map((i) => JSON.parse(JSON.stringify(i)));

    return { items, total };
  }

  async listByTenant(tenantId: string): Promise<SalesQuoteRecord[]> {
    const res = await this.findMany({ tenantId });
    return res.items;
  }

  async list(tenantId: string): Promise<SalesQuoteRecord[]> {
    return this.listByTenant(tenantId);
  }

  async save(quote: SalesQuoteRecord): Promise<SalesQuoteRecord> {
    const clone: SalesQuoteRecord = JSON.parse(JSON.stringify(quote));
    if (!clone.id) {
      clone.id = `quote-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    }
    if (!clone.quoteNumber) {
      this.sequenceCounter += 1;
      clone.quoteNumber = `QUO-${this.sequenceCounter}`;
    }
    if (!clone.publicToken) {
      clone.publicToken = `tok_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
    }
    clone.updatedAt = new Date().toISOString();
    if (!clone.createdAt) {
      clone.createdAt = clone.updatedAt;
    }
    if (!clone.version) {
      clone.version = 1;
    }

    this.quotes.set(clone.id, clone);
    return JSON.parse(JSON.stringify(clone));
  }

  async saveVersion(version: QuoteVersionRecord): Promise<QuoteVersionRecord> {
    const clone: QuoteVersionRecord = JSON.parse(JSON.stringify(version));
    if (!clone.id) {
      clone.id = `qv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    }
    if (!clone.createdAt) {
      clone.createdAt = new Date().toISOString();
    }

    const list = this.versions.get(clone.quoteId) || [];
    list.push(clone);
    this.versions.set(clone.quoteId, list);
    return JSON.parse(JSON.stringify(clone));
  }

  async getVersions(tenantId: string, quoteId: string): Promise<QuoteVersionRecord[]> {
    const list = this.versions.get(quoteId) || [];
    return list
      .filter((v) => v.tenantId === tenantId)
      .sort((a, b) => a.versionNumber - b.versionNumber)
      .map((v) => JSON.parse(JSON.stringify(v)));
  }

  async getVersion(tenantId: string, quoteId: string, versionNumber: number): Promise<QuoteVersionRecord | null> {
    const list = this.versions.get(quoteId) || [];
    const v = list.find((x) => x.tenantId === tenantId && x.versionNumber === versionNumber);
    return v ? JSON.parse(JSON.stringify(v)) : null;
  }

  clear(): void {
    this.quotes.clear();
    this.versions.clear();
  }
}

export { InMemorySalesQuoteRepository as SalesQuoteRepository };

