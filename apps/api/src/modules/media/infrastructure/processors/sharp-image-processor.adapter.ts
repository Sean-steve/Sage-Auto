// ============================================================================
// CAR HIRE OS — SHARP IMAGE PROCESSOR ADAPTER (DEV-006, SEC-001)
// High-performance libvips production adapter with decompression bomb defense & EXIF privacy
// ============================================================================

import sharp from "sharp";
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
  ImageDecodeError,
  MediaProcessingTimeoutError,
} from "../../domain/errors/media.errors";
import { MediaDerivativeFormat } from "@carhire/types";

export class SharpImageProcessor implements IImageProcessor {
  private readonly defaultMaxPixels: number;
  private readonly defaultMaxDimension: number;

  constructor(options?: { defaultMaxPixels?: number; defaultMaxDimension?: number }) {
    this.defaultMaxPixels = options?.defaultMaxPixels || 40_000_000;
    this.defaultMaxDimension = options?.defaultMaxDimension || 8000;
  }

  public async inspect(
    buffer: Buffer,
    options?: { maxPixels?: number; maxDimension?: number }
  ): Promise<ImageMetadata> {
    if (!buffer || buffer.length === 0) {
      throw new MalformedImageError("Buffer is empty.");
    }

    try {
      const metadata = await sharp(buffer).metadata();

      const width = metadata.width || 0;
      const height = metadata.height || 0;

      if (width <= 0 || height <= 0) {
        throw new MalformedImageError("Image contains invalid zero dimensions.");
      }

      const totalPixels = width * height;
      const maxPixels = options?.maxPixels || this.defaultMaxPixels;
      const maxDimension = options?.maxDimension || this.defaultMaxDimension;

      // Decompression bomb check
      if (totalPixels > maxPixels) {
        throw new DecompressionBombDetectedError(
          { width, height, totalPixels },
          maxPixels
        );
      }

      // Max single dimension check
      if (width > maxDimension) {
        throw new DimensionLimitExceededError("width", width, maxDimension);
      }
      if (height > maxDimension) {
        throw new DimensionLimitExceededError("height", height, maxDimension);
      }

      // Detect GPS in EXIF
      const hasGps = Boolean(
        metadata.exif &&
          (metadata.exif.toString("latin1").includes("GPS") ||
            (metadata as any).gps)
      );

      return {
        format: metadata.format || "unknown",
        width,
        height,
        totalPixels,
        channels: metadata.channels,
        hasAlpha: metadata.hasAlpha,
        orientation: metadata.orientation,
        hasGps,
      };
    } catch (err: any) {
      if (
        err instanceof DecompressionBombDetectedError ||
        err instanceof DimensionLimitExceededError ||
        err instanceof MalformedImageError
      ) {
        throw err;
      }
      throw new MalformedImageError(err?.message || "Failed to parse image headers.");
    }
  }

  public async transform(
    buffer: Buffer,
    options: ImageTransformOptions
  ): Promise<ProcessedImageResult> {
    const timeoutMs = options.timeoutMs || 15_000;

    const transformPromise = async (): Promise<ProcessedImageResult> => {
      try {
        let pipeline = sharp(buffer);

        // Orientation normalization
        if (options.normalizeOrientation) {
          pipeline = pipeline.rotate(); // Auto-rotate by EXIF and remove orientation flag
        }

        // Fit mode translation
        const fitMode = options.fit === "inside" ? "inside" : options.fit === "contain" ? "contain" : "cover";

        pipeline = pipeline.resize({
          width: options.width,
          height: options.height,
          fit: fitMode,
          withoutEnlargement: true,
        });

        // EXIF Stripping: By default, sharp strips all EXIF/GPS metadata unless .withMetadata() is called!
        if (!options.stripExif) {
          pipeline = pipeline.withMetadata();
        }

        let contentType = "image/jpeg";

        switch (options.format) {
          case "JPEG":
            pipeline = pipeline.jpeg({
              quality: options.quality,
              mozjpeg: true,
            });
            contentType = "image/jpeg";
            break;
          case "PNG":
            pipeline = pipeline.png({
              quality: options.quality,
              compressionLevel: 9,
            });
            contentType = "image/png";
            break;
          case "WEBP":
            pipeline = pipeline.webp({
              quality: options.quality,
              effort: 4,
            });
            contentType = "image/webp";
            break;
          case "AVIF":
            pipeline = pipeline.avif({
              quality: options.quality,
              effort: 4,
            });
            contentType = "image/avif";
            break;
          default:
            pipeline = pipeline.jpeg({ quality: options.quality });
            contentType = "image/jpeg";
        }

        const outputBuffer = await pipeline.toBuffer();
        const info = await sharp(outputBuffer).metadata();

        const checksumSha256 = crypto
          .createHash("sha256")
          .update(outputBuffer)
          .digest("hex");

        return {
          buffer: outputBuffer,
          format: options.format,
          width: info.width || options.width,
          height: info.height || options.height,
          sizeBytes: outputBuffer.length,
          contentType,
          checksumSha256,
        };
      } catch (err: any) {
        throw new ImageDecodeError(err?.message || "Sharp processing error");
      }
    };

    // Run with timeout guard
    let timeoutHandle: any;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new MediaProcessingTimeoutError(timeoutMs));
      }, timeoutMs);
    });

    try {
      return await Promise.race([transformPromise(), timeoutPromise]);
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  public async extractDominantColor(buffer: Buffer): Promise<string | undefined> {
    try {
      const stats = await sharp(buffer).stats();
      if (stats.channels && stats.channels.length >= 3) {
        const r = Math.round(stats.channels[0].mean);
        const g = Math.round(stats.channels[1].mean);
        const b = Math.round(stats.channels[2].mean);
        return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }
}
