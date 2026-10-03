// ============================================================================
// CAR HIRE OS — FILE SECURITY SERVICE (SEC-001, SEC-004, SEC-005, SEC-007)
// Filename sanitization, magic-byte inspection, size policies, and key generation
// ============================================================================

import crypto from "node:crypto";
import path from "node:path";
import {
  FileSizeLimitExceededError,
  ProhibitedFileExtensionError,
  MimeTypeMismatchError,
} from "./errors";
import { FileResourceRole } from "@carhire/types";

export const CATEGORY_SIZE_LIMITS: Record<string, number> = {
  IMAGE: 15 * 1024 * 1024,      // 15 MB
  DOCUMENT: 25 * 1024 * 1024,   // 25 MB
  VIDEO: 100 * 1024 * 1024,     // 100 MB
  SIGNATURE: 2 * 1024 * 1024,    // 2 MB
  DEFAULT: 25 * 1024 * 1024,    // 25 MB
};

export const PROHIBITED_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".sh", ".bash", ".php", ".js", ".mjs", ".vbs",
  ".dll", ".so", ".dylib", ".com", ".scr", ".msi", ".ps1", ".jar", ".html", ".htm"
]);

export interface DetectedMimeResult {
  detectedMime: string;
  isExecutable: boolean;
}

export class FileSecurityService {
  /**
   * Sanitizes user-provided filename by removing path traversal characters,
   * non-printable characters, shell escapes, and limiting length.
   */
  public sanitizeFilename(rawFilename: string): string {
    if (!rawFilename || typeof rawFilename !== "string") {
      return `file_${crypto.randomUUID().substring(0, 8)}.bin`;
    }

    // Extract basename to prevent directory traversal across POSIX and Windows
    const segments = rawFilename.trim().split(/[/\\]/);
    const base = segments[segments.length - 1] || "";

    // Remove null bytes, directory separators, control chars
    let sanitized = base
      .replace(/[\0\r\n\t]/g, "")
      .replace(/[\/\\]/g, "_")
      .replace(/[^\w\s.-]/gi, "_")
      .trim();

    // Prevent hidden files starting with dot
    while (sanitized.startsWith(".")) {
      sanitized = sanitized.substring(1);
    }

    if (!sanitized) {
      sanitized = `file_${crypto.randomUUID().substring(0, 8)}`;
    }

    // Split extension and stem to truncate stem safely
    const ext = path.extname(sanitized).toLowerCase();
    const stem = path.basename(sanitized, ext);

    const truncatedStem = stem.substring(0, 80);
    return `${truncatedStem}${ext}`;
  }

  /**
   * Validates that the filename extension is not prohibited.
   */
  public validateExtension(filename: string): void {
    const ext = path.extname(filename).toLowerCase();
    if (PROHIBITED_EXTENSIONS.has(ext)) {
      throw new ProhibitedFileExtensionError(filename, ext);
    }
  }

  /**
   * Resolves the maximum permitted size based on resource role and declared content type.
   */
  public getMaxSizeBytes(role?: FileResourceRole, contentType?: string): number {
    if (role === "INSPECTION_PHOTO" || role === "DAMAGE_EVIDENCE") {
      if (contentType?.startsWith("video/")) {
        return CATEGORY_SIZE_LIMITS.VIDEO;
      }
      return CATEGORY_SIZE_LIMITS.IMAGE;
    }

    if (role === "WEBSITE_LOGO") {
      return CATEGORY_SIZE_LIMITS.IMAGE;
    }

    if (contentType?.startsWith("image/")) {
      return CATEGORY_SIZE_LIMITS.IMAGE;
    }

    if (contentType?.startsWith("video/")) {
      return CATEGORY_SIZE_LIMITS.VIDEO;
    }

    return CATEGORY_SIZE_LIMITS.DOCUMENT;
  }

  /**
   * Validates that declared size does not exceed the allowed limit.
   */
  public validateFileSize(filename: string, sizeBytes: number, maxBytes: number): void {
    if (sizeBytes > maxBytes) {
      throw new FileSizeLimitExceededError(filename, sizeBytes, maxBytes);
    }
  }

  /**
   * Generates a tenant-scoped deterministic storage key.
   * Format: tenants/{tenantId}/files/{year}/{month}/{fileId}/{sanitizedFilename}
   */
  public generateObjectKey(tenantId: string, fileId: string, sanitizedFilename: string): string {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    return `tenants/${tenantId}/files/${year}/${month}/${fileId}/${sanitizedFilename}`;
  }

  /**
   * Generates a quarantine storage key for suspicious or infected files.
   */
  public generateQuarantineKey(tenantId: string, fileId: string, sanitizedFilename: string): string {
    return `tenants/${tenantId}/quarantine/${fileId}/${sanitizedFilename}`;
  }

  /**
   * Detects true MIME type from magic bytes header.
   */
  public detectMimeFromBytes(buffer: Buffer): DetectedMimeResult {
    if (!buffer || buffer.length === 0) {
      return { detectedMime: "application/octet-stream", isExecutable: false };
    }

    // Check executable headers first
    // Windows PE: 'MZ' (0x4D 0x5A)
    if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
      return { detectedMime: "application/x-dosexec", isExecutable: true };
    }

    // Linux ELF: 0x7F 'E' 'L' 'F'
    if (
      buffer.length >= 4 &&
      buffer[0] === 0x7f &&
      buffer[1] === 0x45 &&
      buffer[2] === 0x4c &&
      buffer[3] === 0x46
    ) {
      return { detectedMime: "application/x-elf", isExecutable: true };
    }

    // Script shebang: '#!'
    if (buffer.length >= 2 && buffer[0] === 0x23 && buffer[1] === 0x21) {
      return { detectedMime: "text/x-shellscript", isExecutable: true };
    }

    // PDF: '%PDF-'
    if (
      buffer.length >= 5 &&
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46 &&
      buffer[4] === 0x2d
    ) {
      return { detectedMime: "application/pdf", isExecutable: false };
    }

    // JPEG: 0xFF 0xD8 0xFF
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return { detectedMime: "image/jpeg", isExecutable: false };
    }

    // PNG: 0x89 'P' 'N' 'G' 0x0D 0x0A 0x1A 0x0A
    if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return { detectedMime: "image/png", isExecutable: false };
    }

    // WebP: 'RIFF' .... 'WEBP'
    if (
      buffer.length >= 12 &&
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return { detectedMime: "image/webp", isExecutable: false };
    }

    // SVG / XML: starts with '<svg' or '<?xml' after whitespace
    const textSnippet = buffer.subarray(0, Math.min(buffer.length, 512)).toString("utf8").trim();
    if (textSnippet.startsWith("<svg") || (textSnippet.startsWith("<?xml") && textSnippet.includes("<svg"))) {
      return { detectedMime: "image/svg+xml", isExecutable: false };
    }

    return { detectedMime: "application/octet-stream", isExecutable: false };
  }

  /**
   * Verifies that declared MIME is compatible with detected magic bytes.
   */
  public verifyMimeCompatibility(declaredMime: string, detectedMime: string): void {
    if (detectedMime === "application/octet-stream") {
      // Magic bytes could not decisively identify, allow declared if not executable
      return;
    }

    // Normalize
    const normDeclared = declaredMime.toLowerCase().split(";")[0].trim();
    const normDetected = detectedMime.toLowerCase().split(";")[0].trim();

    if (normDeclared === normDetected) {
      return;
    }

    // Acceptable aliases (e.g. image/jpg vs image/jpeg)
    if (
      (normDeclared === "image/jpg" && normDetected === "image/jpeg") ||
      (normDeclared === "image/jpeg" && normDetected === "image/jpg")
    ) {
      return;
    }

    throw new MimeTypeMismatchError(declaredMime, detectedMime);
  }

  /**
   * Calculates SHA-256 checksum of a buffer.
   */
  public computeSha256(buffer: Buffer): string {
    return crypto.createHash("sha256").update(buffer).digest("hex");
  }
}
