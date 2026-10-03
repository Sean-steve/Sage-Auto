import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — DOCUMENT VERSION REPOSITORY (ARCH-001, DATA-001, SEC-001)
// Immutable historical versions of documents linking to secure file references
// ============================================================================

import { DocumentVersionRecord } from "@carhire/types";
import { TransactionContext } from "../transaction-manager";
import { CrossTenantViolationError } from "../errors";

export interface CreateDocumentVersionInput {
  id?: string;
  tenantId: string;
  documentId: string;
  versionNumber: number;
  fileId: string;
  uploadedBy: string;
  changeReason?: string;
  metadataSnapshot?: Record<string, any>;
}

export interface IDocumentVersionRepository {
  create(input: CreateDocumentVersionInput, tx?: TransactionContext): Promise<DocumentVersionRecord>;
  findById(id: string, tenantId?: string, tx?: TransactionContext): Promise<DocumentVersionRecord | null>;
  findByDocumentAndVersion(
    documentId: string,
    versionNumber: number,
    tenantId?: string,
    tx?: TransactionContext
  ): Promise<DocumentVersionRecord | null>;
  listByDocumentId(documentId: string, tenantId?: string, tx?: TransactionContext): Promise<DocumentVersionRecord[]>;
  markSuperseded(id: string, supersededAt?: string, tx?: TransactionContext): Promise<DocumentVersionRecord>;
}

export class DocumentVersionRepository implements IDocumentVersionRepository {
  private static store = createRecordStore<string, DocumentVersionRecord>("document-version.repository:store");

  public static clear(): void {
    DocumentVersionRepository.store.clear();
  }

  async create(input: CreateDocumentVersionInput, _tx?: TransactionContext): Promise<DocumentVersionRecord> {
    const id = input.id || crypto.randomUUID();
    const now = new Date().toISOString();

    const record: DocumentVersionRecord = {
      id,
      tenantId: input.tenantId,
      documentId: input.documentId,
      versionNumber: input.versionNumber,
      fileId: input.fileId,
      uploadedBy: input.uploadedBy,
      changeReason: input.changeReason,
      metadataSnapshot: input.metadataSnapshot,
      createdAt: now,
    };

    DocumentVersionRepository.store.set(id, record);
    return { ...record };
  }

  async findById(id: string, tenantId?: string, _tx?: TransactionContext): Promise<DocumentVersionRecord | null> {
    const version = DocumentVersionRepository.store.get(id);
    if (!version) return null;

    if (tenantId && version.tenantId !== tenantId) {
      throw new CrossTenantViolationError(version.tenantId, tenantId);
    }

    return { ...version };
  }

  async findByDocumentAndVersion(
    documentId: string,
    versionNumber: number,
    tenantId?: string,
    _tx?: TransactionContext
  ): Promise<DocumentVersionRecord | null> {
    for (const version of DocumentVersionRepository.store.values()) {
      if (version.documentId === documentId && version.versionNumber === versionNumber) {
        if (tenantId && version.tenantId !== tenantId) {
          throw new CrossTenantViolationError(version.tenantId, tenantId);
        }
        return { ...version };
      }
    }
    return null;
  }

  async listByDocumentId(documentId: string, tenantId?: string, _tx?: TransactionContext): Promise<DocumentVersionRecord[]> {
    const versions: DocumentVersionRecord[] = [];
    for (const version of DocumentVersionRepository.store.values()) {
      if (version.documentId === documentId) {
        if (tenantId && version.tenantId !== tenantId) {
          throw new CrossTenantViolationError(version.tenantId, tenantId);
        }
        versions.push({ ...version });
      }
    }

    versions.sort((a, b) => b.versionNumber - a.versionNumber);
    return versions;
  }

  async markSuperseded(id: string, supersededAt?: string, _tx?: TransactionContext): Promise<DocumentVersionRecord> {
    const version = DocumentVersionRepository.store.get(id);
    if (!version) throw new Error(`Document version not found with ID ${id}`);

    const updated: DocumentVersionRecord = {
      ...version,
      supersededAt: supersededAt || new Date().toISOString(),
    };

    DocumentVersionRepository.store.set(id, updated);
    return { ...updated };
  }
}
