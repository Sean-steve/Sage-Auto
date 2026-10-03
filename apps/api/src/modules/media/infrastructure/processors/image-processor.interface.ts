// ============================================================================
// CAR HIRE OS — IMAGE PROCESSOR INTERFACE (DEV-006, ARCH-001, SEC-001)
// Clean architectural abstraction decoupling domain from Sharp/native imaging libraries
// ============================================================================

import {
  MediaDerivativeFormat,
  MediaFitMode,
} from "@carhire/types";

export interface ImageMetadata {
  format: string;
  width: number;
  height: number;
  totalPixels: number;
  channels?: number;
  hasAlpha?: boolean;
  orientation?: number;
  hasGps?: boolean;
  dominantColor?: string;
}

export interface ImageTransformOptions {
  width: number;
  height: number;
  fit: MediaFitMode;
  format: MediaDerivativeFormat;
  quality: number;
  stripExif: boolean;
  normalizeOrientation: boolean;
  preserveAlpha?: boolean;
  timeoutMs?: number;
}

export interface ProcessedImageResult {
  buffer: Buffer;
  format: MediaDerivativeFormat;
  width: number;
  height: number;
  sizeBytes: number;
  contentType: string;
  checksumSha256: string;
}

export interface IImageProcessor {
  /**
   * Inspects image headers and metadata safely.
   * Throws DecompressionBombDetectedError if pixel count exceeds safety threshold.
   * Throws MalformedImageError if buffer is corrupted.
   */
  inspect(
    buffer: Buffer,
    options?: { maxPixels?: number; maxDimension?: number }
  ): Promise<ImageMetadata>;

  /**
   * Transcodes, resizes, normalizes orientation, and strips EXIF from image buffer.
   */
  transform(
    buffer: Buffer,
    options: ImageTransformOptions
  ): Promise<ProcessedImageResult>;

  /**
   * Samples dominant color for progressive loading blur and placeholder UI.
   */
  extractDominantColor(buffer: Buffer): Promise<string | undefined>;
}
