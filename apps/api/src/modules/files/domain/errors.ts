// ============================================================================
// CAR HIRE OS — FILES & DOCUMENTS DOMAIN ERRORS (ARCH-001, SEC-001, SEC-006)
// ============================================================================

export class FileNotFoundError extends Error {
  constructor(fileId: string) {
    super(`File not found with ID: ${fileId}`);
    this.name = "FileNotFoundError";
  }
}

export class UploadSessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Upload session not found with ID: ${sessionId}`);
    this.name = "UploadSessionNotFoundError";
  }
}

export class UploadSessionExpiredError extends Error {
  constructor(sessionId: string, expiresAt: string) {
    super(`Upload session ${sessionId} expired at ${expiresAt}`);
    this.name = "UploadSessionExpiredError";
  }
}

export class InvalidFileStateError extends Error {
  constructor(fileId: string, currentStatus: string, expectedStatus: string) {
    super(`File ${fileId} is in status '${currentStatus}', expected '${expectedStatus}'`);
    this.name = "InvalidFileStateError";
  }
}

export class StorageQuotaExceededError extends Error {
  constructor(tenantId: string, requiredBytes: number, remainingBytes: number) {
    super(
      `Tenant ${tenantId} storage quota exceeded. Requested: ${requiredBytes} bytes, Remaining: ${remainingBytes} bytes`
    );
    this.name = "StorageQuotaExceededError";
  }
}

export class FileSizeLimitExceededError extends Error {
  constructor(filename: string, sizeBytes: number, maxBytes: number) {
    super(`File '${filename}' size (${sizeBytes} bytes) exceeds category limit of ${maxBytes} bytes`);
    this.name = "FileSizeLimitExceededError";
  }
}

export class ProhibitedFileExtensionError extends Error {
  constructor(filename: string, extension: string) {
    super(`File '${filename}' contains prohibited extension '${extension}'`);
    this.name = "ProhibitedFileExtensionError";
  }
}

export class MimeTypeMismatchError extends Error {
  constructor(declaredMime: string, detectedMime: string) {
    super(`MIME type mismatch: declared '${declaredMime}', detected '${detectedMime}'`);
    this.name = "MimeTypeMismatchError";
  }
}

export class ChecksumMismatchError extends Error {
  constructor(expectedChecksum: string, actualChecksum: string) {
    super(`Checksum verification failed. Expected '${expectedChecksum}', got '${actualChecksum}'`);
    this.name = "ChecksumMismatchError";
  }
}

export class MalwareDetectedError extends Error {
  public findings: string[];
  constructor(fileId: string, findings: string[]) {
    super(`Malware or prohibited threat detected in file ${fileId}: ${findings.join("; ")}`);
    this.name = "MalwareDetectedError";
    this.findings = findings;
  }
}

export class DocumentNotFoundError extends Error {
  constructor(documentId: string) {
    super(`Document not found with ID: ${documentId}`);
    this.name = "DocumentNotFoundError";
  }
}

export class DocumentVersionNotFoundError extends Error {
  constructor(documentId: string, versionNumber: number) {
    super(`Document ${documentId} version ${versionNumber} not found`);
    this.name = "DocumentVersionNotFoundError";
  }
}

export class SensitiveDocumentAccessDeniedError extends Error {
  constructor(documentId: string, requiredPermission: string) {
    super(`Access denied to sensitive document ${documentId}. Required permission: ${requiredPermission}`);
    this.name = "SensitiveDocumentAccessDeniedError";
  }
}
