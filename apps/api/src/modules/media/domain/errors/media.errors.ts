// ============================================================================
// CAR HIRE OS — MEDIA DOMAIN ERRORS (ARCH-001, SEC-001, DEV-006)
// Strict error taxonomy for image processing, EXIF privacy, and derivative generation
// ============================================================================

export class MediaDomainError extends Error {
  constructor(message: string, public readonly code: string, public readonly statusCode: number = 400) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class DecompressionBombDetectedError extends MediaDomainError {
  constructor(dimensions: { width: number; height: number; totalPixels: number }, maxPixels: number) {
    super(
      `Decompression bomb rejected: image dimensions ${dimensions.width}x${dimensions.height} (${dimensions.totalPixels} pixels) exceed safety ceiling of ${maxPixels} pixels.`,
      "DECOMPRESSION_BOMB_DETECTED",
      422
    );
  }
}

export class MalformedImageError extends MediaDomainError {
  constructor(details: string) {
    super(
      `Malformed image payload: file contains corrupted bytes or invalid image headers. Details: ${details}`,
      "MALFORMED_IMAGE_PAYLOAD",
      422
    );
  }
}

export class ImageDecodeError extends MediaDomainError {
  constructor(reason: string) {
    super(
      `Failed to decode image buffer: ${reason}`,
      "IMAGE_DECODE_FAILED",
      422
    );
  }
}

export class UnsupportedImageFormatError extends MediaDomainError {
  constructor(format: string, supportedFormats: string[]) {
    super(
      `Unsupported image format '${format}'. Allowed formats: ${supportedFormats.join(", ")}`,
      "UNSUPPORTED_IMAGE_FORMAT",
      415
    );
  }
}

export class DimensionLimitExceededError extends MediaDomainError {
  constructor(dimension: "width" | "height", actual: number, max: number) {
    super(
      `Image ${dimension} of ${actual}px exceeds maximum allowed limit of ${max}px.`,
      "DIMENSION_LIMIT_EXCEEDED",
      422
    );
  }
}

export class UnregisteredProfileError extends MediaDomainError {
  constructor(profileName: string) {
    super(
      `Unknown media processing profile '${profileName}'. Client-defined arbitrary resize operations are strictly prohibited.`,
      "UNREGISTERED_MEDIA_PROFILE",
      404
    );
  }
}

export class MediaProfileNotFoundError extends UnregisteredProfileError {}

export class PrivateMediaAccessViolationError extends MediaDomainError {
  constructor(resourceId: string, reason?: string) {
    super(
      `Access violation: media asset or derivative '${resourceId}' is classified as PRIVATE/CONFIDENTIAL and cannot be served via public or unauthenticated channels.${reason ? ` Reason: ${reason}` : ""}`,
      "PRIVATE_MEDIA_ACCESS_VIOLATION",
      403
    );
  }
}

export class MediaAssetNotFoundError extends MediaDomainError {
  constructor(assetId: string) {
    super(
      `Media asset with ID '${assetId}' was not found.`,
      "MEDIA_ASSET_NOT_FOUND",
      404
    );
  }
}

export class MediaDerivativeNotFoundError extends MediaDomainError {
  constructor(identifier: string) {
    super(
      `Media derivative '${identifier}' was not found.`,
      "MEDIA_DERIVATIVE_NOT_FOUND",
      404
    );
  }
}

export class SourceFileNotAvailableError extends MediaDomainError {
  constructor(fileId: string, status: string, scanStatus?: string) {
    super(
      `Source file '${fileId}' cannot be processed. Status: '${status}', ScanStatus: '${scanStatus || "UNKNOWN"}'. Files must be AVAILABLE and CLEAN before media processing.`,
      "SOURCE_FILE_NOT_AVAILABLE",
      409
    );
  }
}

export class ArbitraryTransformProhibitedError extends MediaDomainError {
  constructor(param: string) {
    super(
      `Arbitrary on-demand query transform '${param}' is strictly prohibited. Image resizing and derivative generation must execute through canonical server-side registered profiles.`,
      "ARBITRARY_TRANSFORM_PROHIBITED",
      400
    );
  }
}

export class CrossTenantMediaViolationError extends MediaDomainError {
  constructor(ownerTenantId: string, requestTenantId: string) {
    super(
      `Cross-tenant isolation breach detected: media belongs to tenant '${ownerTenantId}' but was requested by tenant '${requestTenantId}'.`,
      "CROSS_TENANT_MEDIA_VIOLATION",
      403
    );
  }
}

export class MediaProcessingTimeoutError extends MediaDomainError {
  constructor(timeoutMs: number) {
    super(
      `Image transformation timed out after ${timeoutMs}ms.`,
      "MEDIA_PROCESSING_TIMEOUT",
      504
    );
  }
}

export class NonImageMediaRejectedError extends MediaDomainError {
  constructor(mediaType: string) {
    super(
      `Media type '${mediaType}' cannot be processed by image pipeline. Video and audio transcoding require dedicated asynchronous pipeline.`,
      "NON_IMAGE_MEDIA_REJECTED",
      415
    );
  }
}
