import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — SAAS BILLING INVOICE REPOSITORY (SaaS Control Plane)
// ============================================================================

import type {
  SaaSBillingInvoice,
  SaaSBillingInvoiceItem,
  SaaSBillingInvoiceStatus,
} from "@carhire/types";
import { RecordNotFoundError, UniqueConstraintViolationError } from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface ISaaSBillingInvoiceRepository {
  findById(id: string, tx?: TransactionContext): Promise<SaaSBillingInvoice | null>;
  findByInvoiceNumber(invoiceNumber: string, tx?: TransactionContext): Promise<SaaSBillingInvoice | null>;
  listByTenantId(tenantId: string, tx?: TransactionContext): Promise<SaaSBillingInvoice[]>;
  listAll(tx?: TransactionContext): Promise<SaaSBillingInvoice[]>;
  getAll(tx?: TransactionContext): Promise<SaaSBillingInvoice[]>;
  create(
    data: Omit<SaaSBillingInvoice, "id" | "invoiceNumber" | "createdAt" | "updatedAt" | "lineItems"> & {
      invoiceNumber?: string;
      lineItems?: Array<Omit<SaaSBillingInvoiceItem, "id" | "invoiceId" | "createdAt">>;
    },
    tx?: TransactionContext
  ): Promise<SaaSBillingInvoice>;
  update(
    id: string,
    updates: Partial<SaaSBillingInvoice>,
    tx?: TransactionContext
  ): Promise<SaaSBillingInvoice>;
  recordPayment(
    id: string,
    amount: number,
    paidAt?: string,
    tx?: TransactionContext
  ): Promise<SaaSBillingInvoice>;
}

export class SaaSBillingInvoiceRepository implements ISaaSBillingInvoiceRepository {
  private static store = createRecordStore<string, SaaSBillingInvoice>("saas-billing-invoice.repository:store");
  private static lineItemsStore = createRecordStore<string, SaaSBillingInvoiceItem[]>("saas-billing-invoice.repository:lineItemsStore");
  private static counter = 1000;

  static clear(): void {
    SaaSBillingInvoiceRepository.store.clear();
    SaaSBillingInvoiceRepository.lineItemsStore.clear();
  }

  static initializeSeed(seedInvoices?: SaaSBillingInvoice[]) {
    if (seedInvoices) {
      seedInvoices.forEach((inv) => {
        this.store.set(inv.id, { ...inv });
        if (inv.lineItems) {
          this.lineItemsStore.set(inv.id, [...inv.lineItems]);
        }
      });
    }
  }

  async findById(id: string): Promise<SaaSBillingInvoice | null> {
    const inv = SaaSBillingInvoiceRepository.store.get(id);
    if (!inv) return null;
    const items = SaaSBillingInvoiceRepository.lineItemsStore.get(id) || [];
    return { ...inv, lineItems: [...items] };
  }

  async findByInvoiceNumber(invoiceNumber: string): Promise<SaaSBillingInvoice | null> {
    for (const inv of SaaSBillingInvoiceRepository.store.values()) {
      if (inv.invoiceNumber === invoiceNumber) {
        const items = SaaSBillingInvoiceRepository.lineItemsStore.get(inv.id) || [];
        return { ...inv, lineItems: [...items] };
      }
    }
    return null;
  }

  async listByTenantId(tenantId: string): Promise<SaaSBillingInvoice[]> {
    return Array.from(SaaSBillingInvoiceRepository.store.values())
      .filter((inv) => inv.tenantId === tenantId)
      .map((inv) => {
        const items = SaaSBillingInvoiceRepository.lineItemsStore.get(inv.id) || [];
        return { ...inv, lineItems: [...items] };
      })
      .sort((a, b) => new Date(b.issuedAt || 0).getTime() - new Date(a.issuedAt || 0).getTime());
  }

  async listAll(): Promise<SaaSBillingInvoice[]> {
    return Array.from(SaaSBillingInvoiceRepository.store.values())
      .map((inv) => {
        const items = SaaSBillingInvoiceRepository.lineItemsStore.get(inv.id) || [];
        return { ...inv, lineItems: [...items] };
      })
      .sort((a, b) => new Date(b.issuedAt || 0).getTime() - new Date(a.issuedAt || 0).getTime());
  }

  async getAll(): Promise<SaaSBillingInvoice[]> {
    return this.listAll();
  }

  async create(
    data: Omit<SaaSBillingInvoice, "id" | "invoiceNumber" | "createdAt" | "updatedAt" | "lineItems"> & {
      invoiceNumber?: string;
      lineItems?: Array<Omit<SaaSBillingInvoiceItem, "id" | "invoiceId" | "createdAt">>;
    }
  ): Promise<SaaSBillingInvoice> {
    const now = new Date().toISOString();
    const id = `saas-inv-${crypto.randomUUID()}`;
    const year = new Date().getFullYear();
    SaaSBillingInvoiceRepository.counter += 1;
    const invoiceNumber =
      data.invoiceNumber ||
      `SAAS-INV-${year}-${String(SaaSBillingInvoiceRepository.counter).padStart(6, "0")}`;

    const items: SaaSBillingInvoiceItem[] = (data.lineItems || []).map((item) => ({
      ...item,
      id: `saas-item-${crypto.randomUUID()}`,
      invoiceId: id,
      createdAt: now,
    }));

    const subtotal = data.subtotal !== undefined
      ? data.subtotal
      : items.reduce((acc, i) => acc + i.amount, 0);
    const tax = data.tax || 0;
    const discount = data.discount || 0;
    const total = data.total !== undefined ? data.total : subtotal + tax - discount;
    const amountPaid = data.amountPaid || 0;
    const amountDue = data.amountDue !== undefined ? data.amountDue : Math.max(0, total - amountPaid);

    const newInvoice: SaaSBillingInvoice = {
      ...data,
      id,
      invoiceNumber,
      status: data.status || "OPEN",
      subtotal,
      tax,
      discount,
      total,
      amountPaid,
      amountDue,
      currency: data.currency || "KES",
      lineItems: items,
      createdAt: now,
      updatedAt: now,
    };

    SaaSBillingInvoiceRepository.store.set(id, newInvoice);
    SaaSBillingInvoiceRepository.lineItemsStore.set(id, items);
    return { ...newInvoice, lineItems: [...items] };
  }

  async update(
    id: string,
    updates: Partial<SaaSBillingInvoice>
  ): Promise<SaaSBillingInvoice> {
    const inv = await this.findById(id);
    if (!inv) {
      throw new RecordNotFoundError("SaaSBillingInvoice", id);
    }

    const updated: SaaSBillingInvoice = {
      ...inv,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    SaaSBillingInvoiceRepository.store.set(id, updated);
    return { ...updated };
  }

  async recordPayment(
    id: string,
    amount: number,
    paidAt?: string
  ): Promise<SaaSBillingInvoice> {
    const inv = await this.findById(id);
    if (!inv) {
      throw new RecordNotFoundError("SaaSBillingInvoice", id);
    }

    const prevPaid = inv.amountPaid ?? 0;
    const invTotal = inv.total ?? 0;
    const newAmountPaid = prevPaid + amount;
    const newAmountDue = Math.max(0, invTotal - newAmountPaid);
    const isFullyPaid = newAmountDue <= 0.0001;
    const nextStatus: SaaSBillingInvoiceStatus = isFullyPaid ? "PAID" : inv.status;
    const paymentTimestamp = paidAt || new Date().toISOString();

    const updated: SaaSBillingInvoice = {
      ...inv,
      amountPaid: newAmountPaid,
      amountDue: newAmountDue,
      status: nextStatus,
      paidAt: isFullyPaid ? paymentTimestamp : inv.paidAt,
      updatedAt: new Date().toISOString(),
    };

    SaaSBillingInvoiceRepository.store.set(id, updated);
    return { ...updated };
  }

  static clearStore() {
    this.store.clear();
    this.lineItemsStore.clear();
  }
}

export { SaaSBillingInvoiceRepository as SaasBillingInvoiceRepository };
