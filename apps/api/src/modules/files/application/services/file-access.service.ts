// ============================================================================
// CAR HIRE OS — FILE ACCESS SERVICE (SEC-002, SEC-006, ARCH-001, AUD-001)
// Zero-trust private file access, signed download tokens & resource binding
// ============================================================================

import {
  IFileRepository,
  IFileAccessRecordRepository,
  IFileResourceLinkRepository,
  IOutboxRepository,
} from "@carhire/database";
import {
  FileRecord,
  FileResourceLink,
  FileResourceType,
  FileResourceRole,
} from "@carhire/types";
import { IObjectStorageDriver } from "../../infrastructure/storage/object-storage.interface";
import {
  FileNotFoundError,
  InvalidFileStateError,
  SensitiveDocumentAccessDeniedError,
} from "../../domain/errors";

export interface ActorContext {
  id: string;
  type?: "USER" | "SUPPORT" | "SYSTEM" | "CUSTOMER" | "OWNER";
  ipAddress?: string;
  userAgent?: string;
  permissions?: string[];
}

export interface GenerateDownloadUrlOptions {
  disposition?: "inline" | "attachment";
  expiresInSeconds?: number;
}

export interface DownloadUrlResult {
  downloadUrl: string;
  expiresAt: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}

export class FileAccessService {
  private fileRepo: IFileRepository;
  private accessRepo: IFileAccessRecordRepository;
  private linkRepo: IFileResourceLinkRepository;
  private storageDriver: IObjectStorageDriver;
  private outboxRepo?: IOutboxRepository;

  constructor(
    fileRepo: IFileRepository,
    accessRepo: IFileAccessRecordRepository,
    linkRepo: IFileResourceLinkRepository,
    storageDriver: IObjectStorageDriver,
    outboxRepo?: IOutboxRepository
  ) {
    this.fileRepo = fileRepo;
    this.accessRepo = accessRepo;
    this.linkRepo = linkRepo;
    this.storageDriver = storageDriver;
    this.outboxRepo = outboxRepo;
  }

  /**
   * Retrieves file metadata and records an audit log entry.
   */
  async getFileMetadata(tenantId: string, fileId: string, actor: ActorContext): Promise<FileRecord> {
    const file = await this.fileRepo.findById(fileId, tenantId);
    if (!file) {
      throw new FileNotFoundError(fileId);
    }

    // Record audit log
    await this.accessRepo.create({
      tenantId,
      fileId,
      actorId: actor.id,
      actorType: actor.type || "USER",
      accessType: "METADATA_READ",
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return file;
  }

  /**
   * Generates a time-limited signed download URL (default 15 minutes = 900s).
   * Enforces zero-trust: checks tenant ownership, status, classification, and logs audit access.
   */
  async generateDownloadUrl(
    tenantId: string,
    fileId: string,
    actor: ActorContext,
    options?: GenerateDownloadUrlOptions
  ): Promise<DownloadUrlResult> {
    const file = await this.fileRepo.findById(fileId, tenantId);
    if (!file) {
      throw new FileNotFoundError(fileId);
    }

    // Enforce active status: never grant download for pending, quarantined, or deleted files
    if (file.status !== "ACTIVE") {
      throw new InvalidFileStateError(file.id, file.status, "ACTIVE");
    }

    // Check classification-based access
    if (file.classification === "CONFIDENTIAL" || file.classification === "RESTRICTED") {
      if (
        actor.permissions &&
        !actor.permissions.includes("DOCUMENT_VIEW_CONFIDENTIAL") &&
        !actor.permissions.includes("ADMIN")
      ) {
        throw new SensitiveDocumentAccessDeniedError(file.id, "DOCUMENT_VIEW_CONFIDENTIAL");
      }
    }

    const ttl = Math.min(options?.expiresInSeconds || 900, 3600); // 15 mins default, capped at 1 hr
    const disposition = options?.disposition || "attachment";

    const downloadUrl = await this.storageDriver.createSignedDownloadUrl({
      bucket: file.bucket,
      key: file.objectKey,
      expiresInSeconds: ttl,
      disposition,
      filename: file.sanitizedFilename,
    });

    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

    // Record audit log
    await this.accessRepo.create({
      tenantId,
      fileId,
      actorId: actor.id,
      actorType: actor.type || "USER",
      accessType: "DOWNLOAD_URL_ISSUED",
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    // Transactional outbox event
    if (this.outboxRepo) {
      await this.outboxRepo.create({
        eventType: "FILE_DOWNLOADED",
        aggregateType: "FILE",
        aggregateId: file.id,
        tenantId,
        actorId: actor.id,
        payload: {
          fileId: file.id,
          objectKey: file.objectKey,
          disposition,
          expiresAt,
        },
      });
    }

    return {
      downloadUrl,
      expiresAt,
      filename: file.sanitizedFilename,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
    };
  }

  /**
   * Retrieves a public file directly without auth, strictly validating classification === PUBLIC.
   */
  async getPublicFile(fileId: string): Promise<{ body: Buffer; contentType: string; filename: string }> {
    const file = await this.fileRepo.findById(fileId);
    if (!file || file.status !== "ACTIVE" || file.deletedAt) {
      throw new FileNotFoundError(fileId);
    }

    if (file.classification !== "PUBLIC") {
      throw new Error(`File ${fileId} is private and cannot be accessed via the public endpoint`);
    }

    const obj = await this.storageDriver.getObject({
      bucket: file.bucket,
      key: file.objectKey,
    });

    return {
      body: obj.body,
      contentType: file.contentType,
      filename: file.sanitizedFilename,
    };
  }

  /**
   * Soft deletes a file.
   */
  async softDeleteFile(tenantId: string, fileId: string, actorId: string): Promise<void> {
    const file = await this.fileRepo.findById(fileId, tenantId);
    if (!file) throw new FileNotFoundError(fileId);

    const now = new Date().toISOString();
    await this.fileRepo.update(
      file.id,
      {
        status: "DELETED",
        deletedAt: now,
      },
      tenantId
    );

    if (this.outboxRepo) {
      await this.outboxRepo.create({
        eventType: "FILE_DELETED",
        aggregateType: "FILE",
        aggregateId: file.id,
        tenantId,
        actorId,
        payload: {
          fileId: file.id,
          objectKey: file.objectKey,
          deletedAt: now,
        },
      });
    }
  }

  /**
   * Links an active file to a business aggregate (Customer, Vehicle, Booking, etc.).
   */
  async linkFileToResource(
    tenantId: string,
    fileId: string,
    resourceType: FileResourceType,
    resourceId: string,
    role: FileResourceRole
  ): Promise<FileResourceLink> {
    const file = await this.fileRepo.findById(fileId, tenantId);
    if (!file) throw new FileNotFoundError(fileId);

    return this.linkRepo.create({
      tenantId,
      fileId,
      resourceType,
      resourceId,
      role,
    });
  }

  /**
   * Unlinks a file from a resource.
   */
  async unlinkFileFromResource(
    tenantId: string,
    fileId: string,
    resourceType: FileResourceType,
    resourceId: string,
    role?: FileResourceRole
  ): Promise<boolean> {
    return this.linkRepo.deleteByFileAndResource(fileId, resourceType, resourceId, role, tenantId);
  }

  /**
   * Lists all files attached to a given resource.
   */
  async listFilesByResource(
    tenantId: string,
    resourceType: FileResourceType,
    resourceId: string,
    role?: FileResourceRole
  ): Promise<Array<FileRecord & { role: FileResourceRole }>> {
    const links = await this.linkRepo.listByResource(tenantId, resourceType, resourceId, role);
    const results: Array<FileRecord & { role: FileResourceRole }> = [];

    for (const link of links) {
      const file = await this.fileRepo.findById(link.fileId, tenantId);
      if (file && file.status === "ACTIVE" && !file.deletedAt) {
        results.push({
          ...file,
          role: link.role,
        });
      }
    }

    return results;
  }
}
