import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — DOCUMENT REPOSITORY (ARCH-001, DOM-001, DATA-001)
// Enterprise document aggregate root managing versioning, status, and classification
// ============================================================================

import { DocumentRecord, FileResourceType, FileClassification } from "@carhire/types";
import { TransactionContext } from "../transaction-manager";
import { CrossTenantViolationError } from "../errors";

export interface CreateDocumentInput {
  id?: string;
  tenantId: string;
  documentType: string;
  resourceType: FileResourceType;
  resourceId: string;
  title: string;
  description?: string;
  currentVersionId?: string;
  currentVersionNumber?: number;
  classification?: FileClassification;
  issuedAt?: string;
  expiresAt?: string;
  createdBy: string;
}

export interface UpdateDocumentInput {
  title?: string;
  description?: string;
  status?: "ACTIVE" | "SUPERSEDED" | "ARCHIVED" | "DELETED";
  currentVersionId?: string;
  currentVersionNumber?: number;
  classification?: FileClassification;
  issuedAt?: string;
  expiresAt?: string;
  archivedAt?: string;
}

export interface IDocumentRepository {
  create(input: CreateDocumentInput, tx?: TransactionContext): Promise<DocumentRecord>;
  findById(id: string, tenantId?: string, tx?: TransactionContext): Promise<DocumentRecord | null>;
  update(id: string, input: UpdateDocumentInput, tenantId?: string, tx?: TransactionContext): Promise<DocumentRecord>;
  listByResource(
    tenantId: string,
    resourceType: FileResourceType,
    resourceId: string,
    tx?: TransactionContext
  ): Promise<DocumentRecord[]>;
  listByTenant(
    tenantId: string,
    options?: {
      documentType?: string;
      status?: "ACTIVE" | "SUPERSEDED" | "ARCHIVED" | "DELETED";
      limit?: number;
      offset?: number;
    },
    tx?: TransactionContext
  ): Promise<{ items: DocumentRecord[]; total: number }>;
}

export class DocumentRepository implements IDocumentRepository {
  private static store = createRecordStore<string, DocumentRecord>("document.repository:store");

  public static clear(): void {
    DocumentRepository.store.clear();
  }

  async create(input: CreateDocumentInput, _tx?: TransactionContext): Promise<DocumentRecord> {
    const id = input.id || crypto.randomUUID();
    const now = new Date().toISOString();

    const record: DocumentRecord = {
      id,
      tenantId: input.tenantId,
      documentType: input.documentType,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      title: input.title,
      description: input.description,
      status: "ACTIVE",
      currentVersionId: input.currentVersionId,
      currentVersionNumber: input.currentVersionNumber || 1,
      classification: input.classification || "PRIVATE",
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    DocumentRepository.store.set(id, record);
    return { ...record };
  }

  async findById(id: string, tenantId?: string, _tx?: TransactionContext): Promise<DocumentRecord | null> {
    const doc = DocumentRepository.store.get(id);
    if (!doc) return null;

    if (tenantId && doc.tenantId !== tenantId) {
      throw new CrossTenantViolationError(doc.tenantId, tenantId);
    }

    return { ...doc };
  }

  async update(id: string, input: UpdateDocumentInput, tenantId?: string, _tx?: TransactionContext): Promise<DocumentRecord> {
    const doc = await this.findById(id, tenantId);
    if (!doc) throw new Error(`Document not found with ID ${id}`);

    const updated: DocumentRecord = {
      ...doc,
      ...input,
      updatedAt: new Date().toISOString(),
      version: doc.version + 1,
    };

    DocumentRepository.store.set(id, updated);
    return { ...updated };
  }

  async listByResource(
    tenantId: string,
    resourceType: FileResourceType,
    resourceId: string,
    _tx?: TransactionContext
  ): Promise<DocumentRecord[]> {
    return Array.from(DocumentRepository.store.values())
      .filter(
        (d) =>
          d.tenantId === tenantId &&
          d.resourceType === resourceType &&
          d.resourceId === resourceId &&
          d.status !== "DELETED"
      )
      .map((d) => ({ ...d }));
  }

  async listByTenant(
    tenantId: string,
    options?: {
      documentType?: string;
      status?: "ACTIVE" | "SUPERSEDED" | "ARCHIVED" | "DELETED";
      limit?: number;
      offset?: number;
    },
    _tx?: TransactionContext
  ): Promise<{ items: DocumentRecord[]; total: number }> {
    let items = Array.from(DocumentRepository.store.values()).filter(
      (d) => d.tenantId === tenantId && d.status !== "DELETED"
    );

    if (options?.documentType) {
      items = items.filter((d) => d.documentType === options.documentType);
    }
    if (options?.status) {
      items = items.filter((d) => d.status === options.status);
    }

    const total = items.length;
    const offset = options?.offset || 0;
    const limit = options?.limit || 50;
    const paginated = items.slice(offset, offset + limit);

    return { items: paginated.map((d) => ({ ...d })), total };
  }
}
