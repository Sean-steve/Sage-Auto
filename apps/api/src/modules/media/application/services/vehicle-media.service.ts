// ============================================================================
// CAR HIRE OS — VEHICLE MEDIA SERVICE (DEV-006, FLEET-001, ARCH-001)
// Vehicle gallery management, primary photo selection, and responsive image resolution
// ============================================================================

import {
  IVehicleMediaRepository,
  IMediaAssetRepository,
  IMediaDerivativeRepository,
} from "@carhire/database";
import { VehicleMediaDto } from "@carhire/types";
import { MediaAssetNotFoundError } from "../../domain/errors/media.errors";

export class VehicleMediaService {
  constructor(
    private vehicleMediaRepo: IVehicleMediaRepository,
    private mediaAssetRepo: IMediaAssetRepository,
    private derivativeRepo: IMediaDerivativeRepository,
    private cdnBaseUrl: string = "/api/v1/media/public"
  ) {}

  /**
   * Links a processed MediaAsset to a vehicle with ordering and primary photo designation.
   */
  public async attachMediaToVehicle(
    tenantId: string,
    vehicleId: string,
    mediaAssetId: string,
    isPrimary?: boolean,
    sortOrder?: number
  ): Promise<VehicleMediaDto> {
    const asset = await this.mediaAssetRepo.findById(mediaAssetId, tenantId);
    if (!asset) {
      throw new MediaAssetNotFoundError(mediaAssetId);
    }

    const record = await this.vehicleMediaRepo.create({
      tenantId,
      vehicleId,
      mediaAssetId,
      isPrimary,
      sortOrder,
    });

    return this.enrichVehicleMedia(record.id, vehicleId, mediaAssetId, record.isPrimary, record.sortOrder, tenantId);
  }

  /**
   * Retrieves all gallery photos for a vehicle, sorted by display order.
   */
  public async listVehicleMedia(tenantId: string, vehicleId: string): Promise<VehicleMediaDto[]> {
    const records = await this.vehicleMediaRepo.listByVehicle(vehicleId, tenantId);
    const results: VehicleMediaDto[] = [];

    for (const r of records) {
      const dto = await this.enrichVehicleMedia(
        r.id,
        r.vehicleId,
        r.mediaAssetId,
        r.isPrimary,
        r.sortOrder,
        tenantId
      );
      results.push(dto);
    }

    return results;
  }

  /**
   * Returns primary photo for vehicle.
   */
  public async getPrimaryVehiclePhoto(tenantId: string, vehicleId: string): Promise<VehicleMediaDto | null> {
    const primary = await this.vehicleMediaRepo.getPrimaryForVehicle(vehicleId, tenantId);
    if (!primary) return null;

    return this.enrichVehicleMedia(
      primary.id,
      primary.vehicleId,
      primary.mediaAssetId,
      primary.isPrimary,
      primary.sortOrder,
      tenantId
    );
  }

  /**
   * Sets designated photo as primary vehicle thumbnail.
   */
  public async setPrimaryVehicleMedia(
    tenantId: string,
    vehicleId: string,
    mediaAssetId: string
  ): Promise<VehicleMediaDto> {
    const updated = await this.vehicleMediaRepo.setPrimary(vehicleId, mediaAssetId, tenantId);
    return this.enrichVehicleMedia(
      updated.id,
      updated.vehicleId,
      updated.mediaAssetId,
      updated.isPrimary,
      updated.sortOrder,
      tenantId
    );
  }

  /**
   * Reorders vehicle gallery photos.
   */
  public async reorderVehicleMedia(
    tenantId: string,
    vehicleId: string,
    orderedMediaAssetIds: string[]
  ): Promise<VehicleMediaDto[]> {
    await this.vehicleMediaRepo.reorder(vehicleId, orderedMediaAssetIds, tenantId);
    return this.listVehicleMedia(tenantId, vehicleId);
  }

  /**
   * Removes media from vehicle.
   */
  public async removeVehicleMedia(
    tenantId: string,
    vehicleId: string,
    mediaAssetId: string
  ): Promise<boolean> {
    const record = await this.vehicleMediaRepo.findByVehicleAndAsset(vehicleId, mediaAssetId, tenantId);
    if (!record) return false;

    const wasPrimary = record.isPrimary;
    const deleted = await this.vehicleMediaRepo.delete(record.id, tenantId);

    if (wasPrimary && deleted) {
      // Re-assign primary to first remaining photo
      const remaining = await this.vehicleMediaRepo.listByVehicle(vehicleId, tenantId);
      if (remaining.length > 0) {
        await this.vehicleMediaRepo.setPrimary(vehicleId, remaining[0].mediaAssetId, tenantId);
      }
    }

    return deleted;
  }

  private async enrichVehicleMedia(
    id: string,
    vehicleId: string,
    mediaAssetId: string,
    isPrimary: boolean,
    sortOrder: number,
    tenantId: string
  ): Promise<VehicleMediaDto> {
    const asset = await this.mediaAssetRepo.findById(mediaAssetId, tenantId);
    const derivatives = await this.derivativeRepo.listByAssetId(mediaAssetId, tenantId);

    const thumb = derivatives.find((d) => d.variantName === "thumbnail" || d.variantName === "thumb_standard");
    const medium = derivatives.find((d) => d.variantName === "medium");
    const large = derivatives.find((d) => d.variantName === "large");

    const formatUrl = (d: any) =>
      d.isPublic ? `${this.cdnBaseUrl}/${d.id}` : `/api/v1/media/derivatives/${d.id}/download-url`;

    return {
      id,
      vehicleId,
      mediaAssetId,
      isPrimary,
      sortOrder,
      status: asset ? asset.status : "AVAILABLE",
      thumbnailUrl: thumb ? formatUrl(thumb) : undefined,
      mediumUrl: medium ? formatUrl(medium) : undefined,
      largeUrl: large ? formatUrl(large) : undefined,
      isPublic: thumb?.isPublic ?? false,
      availableVariants: derivatives.map((d) => d.variantName),
    };
  }
}
