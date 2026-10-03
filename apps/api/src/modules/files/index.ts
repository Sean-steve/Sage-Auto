// ============================================================================
// CAR HIRE OS — FILES & DOCUMENTS MODULE INDEX (ARCH-001, SEC-001)
// ============================================================================

export * from "./domain/file-security.service";
export * from "./domain/errors";
export * from "./infrastructure/storage/object-storage.interface";
export * from "./infrastructure/storage/in-memory-storage.driver";
export * from "./infrastructure/storage/s3-storage.driver";
export * from "./infrastructure/scanner/malware-scanner.interface";
export * from "./infrastructure/scanner/mock-malware-scanner";
export * from "./application/services/file-upload.service";
export * from "./application/services/file-access.service";
export * from "./application/services/document-lifecycle.service";
export * from "./application/services/storage-reconciliation.service";
export * from "./presentation/controllers/files.controller";
export * from "./presentation/controllers/documents.controller";
export * from "./files.module";
