// ============================================================================
// CAR HIRE OS — DOCUMENT LIFECYCLE SERVICE (ARCH-001, DOM-001, SEC-001)
// Enterprise document versioning, superseded states, and metadata aggregation
// ============================================================================

import {
  IDocumentRepository,
  IDocumentVersionRepository,
  IFileRepository,
  IOutboxRepository,
} from "@carhire/database";
import {
  CreateDocumentDto,
  UploadDocumentVersionDto,
  DocumentRecord,
  DocumentVersionRecord,
  FileResourceType,
} from "@carhire/types";
import {
  DocumentNotFoundError,
  FileNotFoundError,
  InvalidFileStateError,
  DocumentVersionNotFoundError,
} from "../../domain/errors";

export interface DocumentWithVersionsDto extends DocumentRecord {
  versions: Array<
    DocumentVersionRecord & {
      filename?: string;
      sizeBytes?: number;
      contentType?: string;
    }
  >;
}

export class DocumentLifecycleService {
  private docRepo: IDocumentRepository;
  private versionRepo: IDocumentVersionRepository;
  private fileRepo: IFileRepository;
  private outboxRepo?: IOutboxRepository;

  constructor(
    docRepo: IDocumentRepository,
    versionRepo: IDocumentVersionRepository,
    fileRepo: IFileRepository,
    outboxRepo?: IOutboxRepository
  ) {
    this.docRepo = docRepo;
    this.versionRepo = versionRepo;
    this.fileRepo = fileRepo;
    this.outboxRepo = outboxRepo;
  }

  /**
   * Creates a new Document aggregate and its initial Version 1 record.
   */
  async createDocument(
    tenantId: string,
    actorId: string,
    input: CreateDocumentDto
  ): Promise<DocumentRecord> {
    // 1. If fileId provided, verify it exists, belongs to tenant, and is ACTIVE
    if (input.fileId) {
      const file = await this.fileRepo.findById(input.fileId, tenantId);
      if (!file) throw new FileNotFoundError(input.fileId);
      if (file.status !== "ACTIVE") {
        throw new InvalidFileStateError(file.id, file.status, "ACTIVE");
      }
    }

    // 2. Create Document aggregate root
    const doc = await this.docRepo.create({
      tenantId,
      documentType: input.documentType,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      title: input.title,
      description: input.description,
      classification: input.classification || "PRIVATE",
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
      createdBy: actorId,
      currentVersionNumber: input.fileId ? 1 : 0,
    });

    // 3. Create Version 1 if initial file was supplied
    if (input.fileId) {
      const version1 = await this.versionRepo.create({
        tenantId,
        documentId: doc.id,
        versionNumber: 1,
        fileId: input.fileId,
        uploadedBy: actorId,
        changeReason: input.changeReason || "Initial document upload",
        metadataSnapshot: {
          title: doc.title,
          documentType: doc.documentType,
          issuedAt: doc.issuedAt,
          expiresAt: doc.expiresAt,
        },
      });

      await this.docRepo.update(
        doc.id,
        {
          currentVersionId: version1.id,
          currentVersionNumber: 1,
        },
        tenantId
      );

      doc.currentVersionId = version1.id;
      doc.currentVersionNumber = 1;
    }

    // 4. Outbox event
    if (this.outboxRepo) {
      await this.outboxRepo.create({
        eventType: "DOCUMENT_CREATED",
        aggregateType: "DOCUMENT",
        aggregateId: doc.id,
        tenantId,
        actorId,
        payload: {
          documentId: doc.id,
          documentType: doc.documentType,
          resourceType: doc.resourceType,
          resourceId: doc.resourceId,
          title: doc.title,
          currentVersionId: doc.currentVersionId,
          fileId: input.fileId,
        },
      });
    }

    return doc;
  }

  /**
   * Uploads a new version of an existing Document.
   * Increments version number, marks previous version SUPERSEDED, and updates current pointer.
   */
  async uploadNewVersion(
    tenantId: string,
    actorId: string,
    documentId: string,
    input: UploadDocumentVersionDto
  ): Promise<{ document: DocumentRecord; version: DocumentVersionRecord }> {
    const doc = await this.docRepo.findById(documentId, tenantId);
    if (!doc) throw new DocumentNotFoundError(documentId);

    if (doc.status === "DELETED") {
      throw new Error(`Cannot add new version to deleted document ${documentId}`);
    }

    // Verify file
    const file = await this.fileRepo.findById(input.fileId, tenantId);
    if (!file) throw new FileNotFoundError(input.fileId);
    if (file.status !== "ACTIVE") {
      throw new InvalidFileStateError(file.id, file.status, "ACTIVE");
    }

    const nextVersionNumber = doc.currentVersionNumber + 1;
    const now = new Date().toISOString();

    // Mark existing current version superseded if exists
    if (doc.currentVersionId) {
      await this.versionRepo.markSuperseded(doc.currentVersionId, now);
    }

    // Create new version record
    const newVersion = await this.versionRepo.create({
      tenantId,
      documentId: doc.id,
      versionNumber: nextVersionNumber,
      fileId: file.id,
      uploadedBy: actorId,
      changeReason: input.changeReason || `Version ${nextVersionNumber} update`,
      metadataSnapshot: {
        title: doc.title,
        documentType: doc.documentType,
        issuedAt: input.issuedAt || doc.issuedAt,
        expiresAt: input.expiresAt || doc.expiresAt,
      },
    });

    // Update document root
    const updatedDoc = await this.docRepo.update(
      doc.id,
      {
        currentVersionId: newVersion.id,
        currentVersionNumber: nextVersionNumber,
        status: "ACTIVE",
        issuedAt: input.issuedAt || doc.issuedAt,
        expiresAt: input.expiresAt || doc.expiresAt,
      },
      tenantId
    );

    // Outbox event
    if (this.outboxRepo) {
      await this.outboxRepo.create({
        eventType: "DOCUMENT_VERSION_CREATED",
        aggregateType: "DOCUMENT",
        aggregateId: doc.id,
        tenantId,
        actorId,
        payload: {
          documentId: doc.id,
          versionId: newVersion.id,
          versionNumber: nextVersionNumber,
          fileId: file.id,
          changeReason: input.changeReason,
        },
      });
    }

    return { document: updatedDoc, version: newVersion };
  }

  /**
   * Retrieves document and all historical versions with file details.
   */
  async getDocumentWithVersions(tenantId: string, documentId: string): Promise<DocumentWithVersionsDto> {
    const doc = await this.docRepo.findById(documentId, tenantId);
    if (!doc) throw new DocumentNotFoundError(documentId);

    const versions = await this.versionRepo.listByDocumentId(documentId, tenantId);
    const enrichedVersions: DocumentWithVersionsDto["versions"] = [];

    for (const v of versions) {
      const file = await this.fileRepo.findById(v.fileId, tenantId);
      enrichedVersions.push({
        ...v,
        filename: file?.sanitizedFilename,
        sizeBytes: file?.sizeBytes,
        contentType: file?.contentType,
      });
    }

    return {
      ...doc,
      versions: enrichedVersions,
    };
  }

  /**
   * Archives a document.
   */
  async archiveDocument(tenantId: string, documentId: string, actorId: string): Promise<DocumentRecord> {
    const doc = await this.docRepo.findById(documentId, tenantId);
    if (!doc) throw new DocumentNotFoundError(documentId);

    const now = new Date().toISOString();
    const updated = await this.docRepo.update(
      doc.id,
      {
        status: "ARCHIVED",
        archivedAt: now,
      },
      tenantId
    );

    if (this.outboxRepo) {
      await this.outboxRepo.create({
        eventType: "DOCUMENT_ARCHIVED",
        aggregateType: "DOCUMENT",
        aggregateId: doc.id,
        tenantId,
        actorId,
        payload: { documentId: doc.id, archivedAt: now },
      });
    }

    return updated;
  }

  /**
   * Lists documents by resource.
   */
  async listByResource(
    tenantId: string,
    resourceType: FileResourceType,
    resourceId: string
  ): Promise<DocumentRecord[]> {
    return this.docRepo.listByResource(tenantId, resourceType, resourceId);
  }

  /**
   * Lists all documents for a tenant with optional filters.
   */
  async listDocuments(
    tenantId: string,
    options?: {
      documentType?: string;
      status?: "ACTIVE" | "SUPERSEDED" | "ARCHIVED" | "DELETED";
      limit?: number;
      offset?: number;
    }
  ): Promise<{ items: DocumentRecord[]; total: number }> {
    return this.docRepo.listByTenant(tenantId, options);
  }
}
