// ============================================================================
// CAR HIRE OS — MEDIA QUERY SERVICE (DEV-006, SEC-001, ARCH-001)
// Read models, responsive srcset generation, format negotiation, and secure download URLs
// ============================================================================

import {
  IMediaAssetRepository,
  IMediaDerivativeRepository,
} from "@carhire/database";
import {
  MediaAssetDto,
  MediaVariantDto,
  ResponsiveSrcsetDto,
  MediaDerivativeRecord,
  MediaDerivativeFormat,
} from "@carhire/types";
import { IObjectStorageDriver } from "../../../files/infrastructure/storage/object-storage.interface";
import {
  MediaAssetNotFoundError,
  MediaDerivativeNotFoundError,
  PrivateMediaAccessViolationError,
} from "../../domain/errors/media.errors";

export class MediaQueryService {
  constructor(
    private mediaAssetRepo: IMediaAssetRepository,
    private derivativeRepo: IMediaDerivativeRepository,
    private storageDriver: IObjectStorageDriver,
    private cdnBaseUrl: string = "/api/v1/media/public"
  ) {}

  /**
   * Retrieves full MediaAsset aggregate with all its active variants.
   */
  public async getMediaAsset(arg1: string, arg2?: string): Promise<MediaAssetDto> {
    let asset;
    let tenantId = arg2;
    try {
      asset = await this.mediaAssetRepo.findById(arg1, arg2);
      if (!asset && arg2) {
        asset = await this.mediaAssetRepo.findById(arg2, arg1);
        tenantId = arg1;
      }
    } catch (err: any) {
      if (err.name === "CrossTenantViolationError" || err?.constructor?.name === "CrossTenantViolationError") {
        throw new MediaAssetNotFoundError(arg2 && arg2 !== asset?.tenantId ? arg2 : arg1);
      }
      throw err;
    }
    if (!asset) {
      throw new MediaAssetNotFoundError(arg1);
    }
    tenantId = tenantId || asset.tenantId;

    const derivatives = await this.derivativeRepo.listByAssetId(asset.id, tenantId);
    const variants: MediaVariantDto[] = derivatives.map((d) => this.mapDerivativeToDto(d));

    // Determine primary and thumbnail URLs
    const primary = derivatives.find(
      (d) => d.variantName === "large" || d.variantName === "medium" || d.variantName === "hero_desktop"
    ) || derivatives[0];

    const thumb = derivatives.find(
      (d) => d.variantName === "thumbnail" || d.variantName === "thumb_standard" || d.variantName === "evidence_thumb"
    );

    let primaryUrl: string | undefined;
    if (primary) {
      if (primary.isPublic) {
        primaryUrl = `${this.cdnBaseUrl}/${primary.id}`;
      } else {
        primaryUrl = await this.storageDriver.createSignedDownloadUrl({
          bucket: primary.storageBucket,
          key: primary.objectKey,
          expiresInSeconds: 300,
        });
      }
    }

    let thumbnailUrl: string | undefined;
    if (thumb) {
      if (thumb.isPublic) {
        thumbnailUrl = `${this.cdnBaseUrl}/${thumb.id}`;
      } else {
        thumbnailUrl = await this.storageDriver.createSignedDownloadUrl({
          bucket: thumb.storageBucket,
          key: thumb.objectKey,
          expiresInSeconds: 300,
        });
      }
    }

    return {
      id: asset.id,
      tenantId: asset.tenantId,
      sourceFileId: asset.sourceFileId,
      mediaType: asset.mediaType,
      classification: asset.classification,
      status: asset.status,
      processingProfile: asset.processingProfile,
      profileVersion: asset.profileVersion,
      dominantColor: asset.dominantColor,
      blurHash: asset.blurHash,
      width: asset.width,
      height: asset.height,
      variants,
      primaryUrl,
      thumbnailUrl,
      createdAt: asset.createdAt,
    };
  }

  public async getMediaAssetById(arg1: string, arg2?: string): Promise<MediaAssetDto> {
    return this.getMediaAsset(arg1, arg2);
  }

  public async getPublicDeliveryStream(derivativeId: string): Promise<any> {
    const derivative = await this.derivativeRepo.findById(derivativeId);
    if (!derivative) {
      throw new MediaDerivativeNotFoundError(derivativeId);
    }
    if (!derivative.isPublic) {
      throw new PrivateMediaAccessViolationError(derivativeId);
    }
    return this.storageDriver.getObject({
      bucket: derivative.storageBucket,
      key: derivative.objectKey,
    });
  }

  /**
   * Generates responsive srcset and sizes data for modern web clients.
   */
  public async getResponsiveSrcset(
    arg1: string,
    arg2: string,
    preferredFormat: MediaDerivativeFormat = "WEBP"
  ): Promise<ResponsiveSrcsetDto> {
    let asset = await this.mediaAssetRepo.findById(arg1, arg2);
    let tenantId = arg2;
    if (!asset) {
      asset = await this.mediaAssetRepo.findById(arg2, arg1);
      tenantId = arg1;
    }
    if (!asset) {
      throw new MediaAssetNotFoundError(arg1);
    }

    const derivatives = await this.derivativeRepo.listByAssetId(asset.id, tenantId);
    if (derivatives.length === 0) {
      throw new Error(`No available derivatives found for media asset '${asset.id}'.`);
    }

    // Try finding variants of preferredFormat, fallback to JPEG
    let matching = derivatives.filter((d) => d.format === preferredFormat);
    let activeFormat = preferredFormat;
    if (matching.length === 0) {
      matching = derivatives.filter((d) => d.format === "JPEG");
      activeFormat = "JPEG";
    }
    if (matching.length === 0) {
      matching = derivatives;
      activeFormat = derivatives[0].format;
    }

    // Sort ascending by width
    matching.sort((a, b) => a.width - b.width);

    const variantItems = matching.map((d) => ({
      width: d.width,
      url: this.formatVariantUrl(d),
      descriptor: `${d.width}w`,
    }));

    const srcSet = variantItems.map((v) => `${v.url} ${v.descriptor}`).join(", ");
    const fallback = matching[matching.length - 1];

    const aspectRatio = asset.width && asset.height ? asset.width / asset.height : 1.333;

    return {
      mediaAssetId: asset.id,
      format: activeFormat,
      src: this.formatVariantUrl(fallback),
      srcSet,
      width: fallback.width,
      height: fallback.height,
      aspectRatio,
      blurPlaceholder: asset.dominantColor,
      variants: variantItems,
    };
  }

  /**
   * Generates secure delivery URL:
   * - Public variants return CDN-ready URLs.
   * - Private/Confidential variants return temporary HMAC/pre-signed download URLs.
   */
  public async getDerivativeDeliveryUrl(
    derivativeId: string,
    tenantId: string,
    options?: { expiresInSeconds?: number; forceSignedUrl?: boolean }
  ): Promise<{ url: string; isPublic: boolean; format: string; sizeBytes: number }> {
    const derivative = await this.derivativeRepo.findById(derivativeId, tenantId);
    if (!derivative) {
      throw new MediaDerivativeNotFoundError(derivativeId);
    }

    // If public and not forced signed
    if (derivative.isPublic && !options?.forceSignedUrl) {
      return {
        url: `${this.cdnBaseUrl}/${derivative.id}`,
        isPublic: true,
        format: derivative.format,
        sizeBytes: derivative.sizeBytes,
      };
    }

    // Private evidence or forced signature: generate signed temporary URL
    const expiresIn = options?.expiresInSeconds || 300; // 5 min default
    const signedUrl = await this.storageDriver.createSignedDownloadUrl({
      bucket: derivative.storageBucket,
      key: derivative.objectKey,
      expiresInSeconds: expiresIn,
    });

    return {
      url: signedUrl,
      isPublic: false,
      format: derivative.format,
      sizeBytes: derivative.sizeBytes,
    };
  }

  private mapDerivativeToDto(d: MediaDerivativeRecord): MediaVariantDto {
    return {
      id: d.id,
      variantName: d.variantName,
      format: d.format,
      width: d.width,
      height: d.height,
      sizeBytes: d.sizeBytes,
      url: this.formatVariantUrl(d),
      isPublic: d.isPublic,
      checksum: d.checksum,
      contentType: d.contentType,
      quality: d.quality,
    };
  }

  private formatVariantUrl(d: MediaDerivativeRecord): string {
    if (d.isPublic) {
      return `${this.cdnBaseUrl}/${d.id}`;
    }
    // For private media, return API signed endpoint
    return `/api/v1/media/derivatives/${d.id}/download-url`;
  }
}
