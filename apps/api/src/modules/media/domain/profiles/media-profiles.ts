// ============================================================================
// CAR HIRE OS — MEDIA PROCESSING PROFILES REGISTRY (ARCH-001, DATA-001, SEC-001)
// Canonical profiles, pre-approved variants, aspect ratios, formats, and safety bounds
// ============================================================================

import {
  MediaDerivativeFormat,
  MediaFitMode,
} from "@carhire/types";
import { UnregisteredProfileError } from "../errors/media.errors";

export interface MediaVariantDefinition {
  name: string;
  format: MediaDerivativeFormat;
  width: number;
  height: number;
  fit: MediaFitMode;
  quality: number;
  preserveAlpha?: boolean;
}

export interface MediaProcessingProfile {
  name: string;
  version: number;
  description: string;
  isPublicAllowed: boolean;
  allowedMimeTypes: string[];
  maxSourcePixels: number;
  maxSourceDimension: number;
  stripExif: boolean;
  normalizeOrientation: boolean;
  variants: MediaVariantDefinition[];
}

export const CANONICAL_MEDIA_PROFILES: Record<string, MediaProcessingProfile> = {
  VEHICLE_GALLERY: {
    name: "VEHICLE_GALLERY",
    version: 1,
    description: "Public vehicle catalog, responsive showcase, and gallery imagery",
    isPublicAllowed: true,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    maxSourcePixels: 40_000_000, // 40 megapixels safety bound
    maxSourceDimension: 8000,
    stripExif: true,
    normalizeOrientation: true,
    variants: [
      { name: "thumbnail", format: "JPEG", width: 320, height: 240, fit: "cover", quality: 80 },
      { name: "medium", format: "JPEG", width: 800, height: 600, fit: "inside", quality: 85 },
      { name: "large", format: "JPEG", width: 1600, height: 1200, fit: "inside", quality: 85 },
      { name: "webp_thumb", format: "WEBP", width: 320, height: 240, fit: "cover", quality: 80 },
      { name: "webp_medium", format: "WEBP", width: 800, height: 600, fit: "inside", quality: 85 },
      { name: "webp_large", format: "WEBP", width: 1600, height: 1200, fit: "inside", quality: 85 },
      { name: "avif_medium", format: "AVIF", width: 800, height: 600, fit: "inside", quality: 75 },
    ],
  },

  VEHICLE_THUMBNAIL: {
    name: "VEHICLE_THUMBNAIL",
    version: 1,
    description: "High-density fleet lists, dispatch queues, and booking card thumbnails",
    isPublicAllowed: true,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    maxSourcePixels: 30_000_000,
    maxSourceDimension: 6000,
    stripExif: true,
    normalizeOrientation: true,
    variants: [
      { name: "thumb_small", format: "JPEG", width: 160, height: 120, fit: "cover", quality: 80 },
      { name: "thumb_standard", format: "JPEG", width: 320, height: 240, fit: "cover", quality: 80 },
      { name: "webp_small", format: "WEBP", width: 160, height: 120, fit: "cover", quality: 80 },
      { name: "webp_standard", format: "WEBP", width: 320, height: 240, fit: "cover", quality: 80 },
    ],
  },

  WEBSITE_HERO: {
    name: "WEBSITE_HERO",
    version: 1,
    description: "Tenant public booking portal hero banners across desktop and mobile",
    isPublicAllowed: true,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    maxSourcePixels: 50_000_000,
    maxSourceDimension: 8000,
    stripExif: true,
    normalizeOrientation: true,
    variants: [
      { name: "hero_desktop", format: "JPEG", width: 1920, height: 1080, fit: "cover", quality: 85 },
      { name: "hero_tablet", format: "JPEG", width: 1280, height: 720, fit: "cover", quality: 85 },
      { name: "hero_mobile", format: "JPEG", width: 768, height: 432, fit: "cover", quality: 80 },
      { name: "webp_hero_desktop", format: "WEBP", width: 1920, height: 1080, fit: "cover", quality: 85 },
      { name: "webp_hero_tablet", format: "WEBP", width: 1280, height: 720, fit: "cover", quality: 85 },
      { name: "webp_hero_mobile", format: "WEBP", width: 768, height: 432, fit: "cover", quality: 80 },
    ],
  },

  TENANT_LOGO: {
    name: "TENANT_LOGO",
    version: 1,
    description: "Tenant branding logos with transparency preservation",
    isPublicAllowed: true,
    allowedMimeTypes: ["image/png", "image/webp", "image/jpeg"],
    maxSourcePixels: 20_000_000,
    maxSourceDimension: 4000,
    stripExif: true,
    normalizeOrientation: true,
    variants: [
      { name: "logo_small", format: "PNG", width: 128, height: 128, fit: "contain", quality: 90, preserveAlpha: true },
      { name: "logo_medium", format: "PNG", width: 256, height: 256, fit: "contain", quality: 90, preserveAlpha: true },
      { name: "logo_large", format: "PNG", width: 512, height: 512, fit: "contain", quality: 90, preserveAlpha: true },
      { name: "webp_logo_medium", format: "WEBP", width: 256, height: 256, fit: "contain", quality: 90, preserveAlpha: true },
    ],
  },

  TENANT_FAVICON: {
    name: "TENANT_FAVICON",
    version: 1,
    description: "Browser favicon and app icon representations",
    isPublicAllowed: true,
    allowedMimeTypes: ["image/png", "image/webp"],
    maxSourcePixels: 10_000_000,
    maxSourceDimension: 2048,
    stripExif: true,
    normalizeOrientation: false,
    variants: [
      { name: "favicon_32", format: "PNG", width: 32, height: 32, fit: "contain", quality: 95, preserveAlpha: true },
      { name: "favicon_192", format: "PNG", width: 192, height: 192, fit: "contain", quality: 95, preserveAlpha: true },
    ],
  },

  INSPECTION_EVIDENCE_PREVIEW: {
    name: "INSPECTION_EVIDENCE_PREVIEW",
    version: 1,
    description: "Private check-in/check-out handover inspection evidence photos",
    isPublicAllowed: false, // Strictly confidential/private!
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    maxSourcePixels: 40_000_000,
    maxSourceDimension: 8000,
    stripExif: true, // Strips GPS on generated derivatives, while Sprint 27 source retains raw evidence
    normalizeOrientation: true,
    variants: [
      { name: "evidence_thumb", format: "JPEG", width: 320, height: 240, fit: "cover", quality: 80 },
      { name: "evidence_preview", format: "JPEG", width: 1200, height: 900, fit: "inside", quality: 85 },
      { name: "webp_preview", format: "WEBP", width: 1200, height: 900, fit: "inside", quality: 85 },
    ],
  },

  DAMAGE_EVIDENCE_PREVIEW: {
    name: "DAMAGE_EVIDENCE_PREVIEW",
    version: 1,
    description: "Private incident, claim and accident damage evidence photos",
    isPublicAllowed: false, // Strictly confidential/private!
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    maxSourcePixels: 40_000_000,
    maxSourceDimension: 8000,
    stripExif: true,
    normalizeOrientation: true,
    variants: [
      { name: "evidence_thumb", format: "JPEG", width: 320, height: 240, fit: "cover", quality: 85 },
      { name: "evidence_preview", format: "JPEG", width: 1600, height: 1200, fit: "inside", quality: 88 },
      { name: "webp_preview", format: "WEBP", width: 1600, height: 1200, fit: "inside", quality: 85 },
    ],
  },
};

export class MediaProfileRegistry {
  private static profiles = new Map<string, MediaProcessingProfile>([
    ...Object.entries(CANONICAL_MEDIA_PROFILES),
    ["FLEET_GALLERY_PHOTO", { ...CANONICAL_MEDIA_PROFILES.VEHICLE_GALLERY, name: "FLEET_GALLERY_PHOTO" }],
    ["VEHICLE_SHOWCASE", { ...CANONICAL_MEDIA_PROFILES.VEHICLE_GALLERY, name: "VEHICLE_SHOWCASE" }],
    ["DAMAGE_INSPECTION", { ...CANONICAL_MEDIA_PROFILES.DAMAGE_EVIDENCE_PREVIEW, name: "DAMAGE_INSPECTION" }],
  ]);

  public static get(profileName: string): MediaProcessingProfile {
    const profile = this.profiles.get(profileName.toUpperCase());
    if (!profile) {
      throw new UnregisteredProfileError(profileName);
    }
    return profile;
  }

  public static has(profileName: string): boolean {
    return this.profiles.has(profileName.toUpperCase());
  }

  public static register(profile: MediaProcessingProfile): void {
    if (!profile.name || profile.name.trim().length === 0) {
      throw new Error("Profile name must not be empty.");
    }
    if (profile.version < 1) {
      throw new Error("Profile version must be >= 1.");
    }
    if (!profile.variants || profile.variants.length === 0) {
      throw new Error("Profile must define at least one variant.");
    }
    for (const v of profile.variants) {
      if (v.width <= 0 || v.height <= 0) {
        throw new Error(`Variant '${v.name}' width and height must be positive numbers.`);
      }
      if (v.quality < 1 || v.quality > 100) {
        throw new Error(`Variant '${v.name}' quality must be between 1 and 100.`);
      }
    }
    this.profiles.set(profile.name.toUpperCase(), profile);
  }

  public static isValidVariantWidth(profileName: string, width: number): boolean {
    const profile = this.profiles.get(profileName.toUpperCase());
    if (!profile) return false;
    return profile.variants.some((v) => v.width === width);
  }

  public static list(): MediaProcessingProfile[] {
    return Array.from(this.profiles.values());
  }

  public static resetToCanonical(): void {
    this.profiles.clear();
    for (const [key, value] of Object.entries(CANONICAL_MEDIA_PROFILES)) {
      this.profiles.set(key, value);
    }
    this.profiles.set("FLEET_GALLERY_PHOTO", { ...CANONICAL_MEDIA_PROFILES.VEHICLE_GALLERY, name: "FLEET_GALLERY_PHOTO" });
    this.profiles.set("VEHICLE_SHOWCASE", { ...CANONICAL_MEDIA_PROFILES.VEHICLE_GALLERY, name: "VEHICLE_SHOWCASE" });
    this.profiles.set("DAMAGE_INSPECTION", { ...CANONICAL_MEDIA_PROFILES.DAMAGE_EVIDENCE_PREVIEW, name: "DAMAGE_INSPECTION" });
  }
}
