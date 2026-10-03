// ============================================================================
// CAR HIRE OS — FILES & DOCUMENTS MODULE (ARCH-001, SEC-001, SEC-002, DATA-001)
// Enterprise bounded context module for secure files, document management & storage
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import {
  IFileRepository,
  FileRepository,
  IFileUploadSessionRepository,
  FileUploadSessionRepository,
  IFileScanRecordRepository,
  FileScanRecordRepository,
  IDocumentRepository,
  DocumentRepository,
  IDocumentVersionRepository,
  DocumentVersionRepository,
  IFileResourceLinkRepository,
  FileResourceLinkRepository,
  IFileAccessRecordRepository,
  FileAccessRecordRepository,
  IStorageReconciliationRepository,
  StorageReconciliationRepository,
  IOutboxRepository,
} from "@carhire/database";
import { IObjectStorageDriver } from "./infrastructure/storage/object-storage.interface";
import { InMemoryObjectStorageDriver } from "./infrastructure/storage/in-memory-storage.driver";
import { S3CompatibleStorageDriver } from "./infrastructure/storage/s3-storage.driver";
import { IMalwareScanner } from "./infrastructure/scanner/malware-scanner.interface";
import { MockMalwareScanner } from "./infrastructure/scanner/mock-malware-scanner";
import { FileUploadService } from "./application/services/file-upload.service";
import { FileAccessService } from "./application/services/file-access.service";
import { DocumentLifecycleService } from "./application/services/document-lifecycle.service";
import { StorageReconciliationService } from "./application/services/storage-reconciliation.service";
import { createFilesController } from "./presentation/controllers/files.controller";
import { createDocumentsController } from "./presentation/controllers/documents.controller";

export interface FilesModuleDependencies {
  fileRepo?: IFileRepository;
  sessionRepo?: IFileUploadSessionRepository;
  scanRepo?: IFileScanRecordRepository;
  docRepo?: IDocumentRepository;
  versionRepo?: IDocumentVersionRepository;
  linkRepo?: IFileResourceLinkRepository;
  accessRepo?: IFileAccessRecordRepository;
  reconRepo?: IStorageReconciliationRepository;
  outboxRepo?: IOutboxRepository;
  storageDriver?: IObjectStorageDriver;
  scanner?: IMalwareScanner;
  permissionGuard?: (perm: string) => (req: Request, res: Response, next: NextFunction) => void;
}

export class FilesModule {
  public readonly fileRepo: IFileRepository;
  public readonly sessionRepo: IFileUploadSessionRepository;
  public readonly scanRepo: IFileScanRecordRepository;
  public readonly docRepo: IDocumentRepository;
  public readonly versionRepo: IDocumentVersionRepository;
  public readonly linkRepo: IFileResourceLinkRepository;
  public readonly accessRepo: IFileAccessRecordRepository;
  public readonly reconRepo: IStorageReconciliationRepository;
  public readonly storageDriver: IObjectStorageDriver;
  public readonly scanner: IMalwareScanner;

  public readonly fileUploadService: FileUploadService;
  public readonly fileAccessService: FileAccessService;
  public readonly documentLifecycleService: DocumentLifecycleService;
  public readonly storageReconciliationService: StorageReconciliationService;

  public readonly filesRouter: Router;
  public readonly documentsRouter: Router;

  constructor(deps: FilesModuleDependencies = {}) {
    this.fileRepo = deps.fileRepo || new FileRepository();
    this.sessionRepo = deps.sessionRepo || new FileUploadSessionRepository();
    this.scanRepo = deps.scanRepo || new FileScanRecordRepository();
    this.docRepo = deps.docRepo || new DocumentRepository();
    this.versionRepo = deps.versionRepo || new DocumentVersionRepository();
    this.linkRepo = deps.linkRepo || new FileResourceLinkRepository();
    this.accessRepo = deps.accessRepo || new FileAccessRecordRepository();
    this.reconRepo = deps.reconRepo || new StorageReconciliationRepository();

    const isProductionLike = process.env.APP_ENV === "production" || process.env.APP_ENV === "staging" ||
      process.env.NODE_ENV === "production" || process.env.NODE_ENV === "staging";

    if (deps.storageDriver) {
      this.storageDriver = deps.storageDriver;
    } else if (process.env.STORAGE_DRIVER === "s3" || process.env.STORAGE_DRIVER === "minio" || process.env.S3_ENDPOINT) {
      this.storageDriver = new S3CompatibleStorageDriver();
    } else if (isProductionLike) {
      throw new Error("Production and staging require STORAGE_DRIVER=s3 or STORAGE_DRIVER=minio; in-memory storage is not permitted.");
    } else {
      this.storageDriver = new InMemoryObjectStorageDriver();
    }

    if (deps.scanner) {
      this.scanner = deps.scanner;
    } else if (isProductionLike) {
      throw new Error("Production and staging require an explicit malware scanner adapter; MockMalwareScanner is not permitted.");
    } else {
      this.scanner = new MockMalwareScanner();
    }

    // Application services
    this.fileUploadService = new FileUploadService(
      this.fileRepo,
      this.sessionRepo,
      this.scanRepo,
      this.linkRepo,
      this.storageDriver,
      this.scanner,
      deps.outboxRepo
    );

    this.fileAccessService = new FileAccessService(
      this.fileRepo,
      this.accessRepo,
      this.linkRepo,
      this.storageDriver,
      deps.outboxRepo
    );

    this.documentLifecycleService = new DocumentLifecycleService(
      this.docRepo,
      this.versionRepo,
      this.fileRepo,
      deps.outboxRepo
    );

    this.storageReconciliationService = new StorageReconciliationService(
      this.fileRepo,
      this.reconRepo,
      this.storageDriver,
      deps.outboxRepo
    );

    // Presentation routers
    this.filesRouter = createFilesController(
      this.fileUploadService,
      this.fileAccessService,
      this.storageReconciliationService,
      deps.permissionGuard
    );

    this.documentsRouter = createDocumentsController(
      this.documentLifecycleService,
      deps.permissionGuard
    );
  }

  /**
   * Public file download handler (e.g. for tenant logos and public assets)
   */
  public handlePublicFileDownload = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const fileId = req.params.fileId;
      const file = await this.fileAccessService.getPublicFile(fileId);
      res.setHeader("Content-Type", file.contentType);
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(file.filename)}"`);
      res.status(200).send(file.body);
    } catch (err) {
      next(err);
    }
  };
}
