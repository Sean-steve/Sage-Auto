// ============================================================================
// CAR HIRE OS — TENANT SLUG VALUE OBJECT (DEV-004, DOM-003 §4)
// ============================================================================

export class TenantSlug {
  private static readonly SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  private readonly value: string;

  constructor(rawSlug: string) {
    if (!rawSlug || typeof rawSlug !== "string") {
      throw new Error("Tenant slug is required and must be a string");
    }

    const normalized = rawSlug.trim().toLowerCase();

    if (normalized.length < 3 || normalized.length > 63) {
      throw new Error("Tenant slug must be between 3 and 63 characters in length");
    }

    if (!TenantSlug.SLUG_REGEX.test(normalized)) {
      throw new Error(
        "Tenant slug must consist only of lowercase alphanumeric characters and single hyphens (no consecutive hyphens or leading/trailing hyphens)"
      );
    }

    this.value = normalized;
  }

  getValue(): string {
    return this.value;
  }

  toString(): string {
    return this.value;
  }

  static fromName(name: string): TenantSlug {
    const slugified = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return new TenantSlug(slugified || "tenant");
  }
}
