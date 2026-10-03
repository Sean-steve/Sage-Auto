// ============================================================================
// CAR HIRE OS — DETERMINISTIC FAKE IMAGE PROCESSOR (DEV-006, SEC-001)
// Fast test double for domain unit testing, failure simulations & CI environments
// ============================================================================

import crypto from "node:crypto";
import {
  IImageProcessor,
  ImageMetadata,
  ImageTransformOptions,
  ProcessedImageResult,
} from "./image-processor.interface";
import {
  DecompressionBombDetectedError,
  DimensionLimitExceededError,
  MalformedImageError,
  MediaProcessingTimeoutError,
} from "../../domain/errors/media.errors";

export class FakeImageProcessor implements IImageProcessor {
  public simulateBomb: boolean = false;
  public simulateMalformed: boolean = false;
  public simulateTimeout: boolean = false;
  public mockWidth: number = 1600;
  public mockHeight: number = 1200;
  public mockFormat: string = "jpeg";
  public mockHasGps: boolean = true;
  public transformCallCount: number = 0;

  public async inspect(
    buffer: Buffer,
    options?: { maxPixels?: number; maxDimension?: number }
  ): Promise<ImageMetadata> {
    if (this.simulateMalformed || !buffer || buffer.length === 0) {
      throw new MalformedImageError("Simulated corrupt image buffer");
    }

    if (this.simulateBomb) {
      const totalPixels = 100_000_000;
      throw new DecompressionBombDetectedError(
        { width: 10_000, height: 10_000, totalPixels },
        options?.maxPixels || 40_000_000
      );
    }

    const totalPixels = this.mockWidth * this.mockHeight;
    const maxPixels = options?.maxPixels || 40_000_000;
    const maxDimension = options?.maxDimension || 8000;

    if (totalPixels > maxPixels) {
      throw new DecompressionBombDetectedError(
        { width: this.mockWidth, height: this.mockHeight, totalPixels },
        maxPixels
      );
    }

    if (this.mockWidth > maxDimension) {
      throw new DimensionLimitExceededError("width", this.mockWidth, maxDimension);
    }

    return {
      format: this.mockFormat,
      width: this.mockWidth,
      height: this.mockHeight,
      totalPixels,
      hasAlpha: false,
      orientation: 1,
      hasGps: this.mockHasGps,
      dominantColor: "#1a2b3c",
    };
  }

  public async transform(
    _buffer: Buffer,
    options: ImageTransformOptions
  ): Promise<ProcessedImageResult> {
    this.transformCallCount++;

    if (this.simulateTimeout) {
      throw new MediaProcessingTimeoutError(options.timeoutMs || 15_000);
    }

    if (this.simulateMalformed) {
      throw new MalformedImageError("Failed to transform corrupted image.");
    }

    // Generate deterministic mock output buffer
    const mockContent = `FAKE_IMAGE_${options.format}_${options.width}x${options.height}_Q${options.quality}`;
    const outputBuffer = Buffer.from(mockContent);
    const checksumSha256 = crypto
      .createHash("sha256")
      .update(outputBuffer)
      .digest("hex");

    const contentTypes: Record<string, string> = {
      JPEG: "image/jpeg",
      PNG: "image/png",
      WEBP: "image/webp",
      AVIF: "image/avif",
    };

    return {
      buffer: outputBuffer,
      format: options.format,
      width: options.width,
      height: options.height,
      sizeBytes: outputBuffer.length,
      contentType: contentTypes[options.format] || "image/jpeg",
      checksumSha256,
    };
  }

  public async extractDominantColor(_buffer: Buffer): Promise<string | undefined> {
    return "#3b82f6";
  }

  public setInspectResult(meta: { width?: number; height?: number; format?: string; [key: string]: any }): void {
    if (meta.width !== undefined) this.mockWidth = meta.width;
    if (meta.height !== undefined) this.mockHeight = meta.height;
    if (meta.format !== undefined) this.mockFormat = meta.format;
  }

  public reset(): void {
    this.simulateBomb = false;
    this.simulateMalformed = false;
    this.simulateTimeout = false;
    this.mockWidth = 1600;
    this.mockHeight = 1200;
    this.mockFormat = "jpeg";
    this.mockHasGps = true;
    this.transformCallCount = 0;
  }
}
