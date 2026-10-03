// ============================================================================
// CAR HIRE OS — DOMAIN AGGREGATE & LIFECYCLE (TEN-001, DEV-009, SEC-001)
// ============================================================================

import {
  WebsiteDomainRecord,
  DomainType,
  DomainVerificationStatus,
  DomainSslStatus,
} from "@car-hire-os/types";
import {
  CannotDeletePlatformSubdomainError,
  DomainNotRoutableError,
  InvalidDomainFormatError,
  ReservedSubdomainError,
} from "./domain.errors";

export const RESERVED_SUBDOMAINS = new Set([
  "api",
  "admin",
  "app",
  "auth",
  "billing",
  "cdn",
  "dev",
  "mail",
  "platform",
  "staging",
  "status",
  "test",
  "www",
  "portal",
  "cname",
  "assets",
  "media",
  "static",
  "webhook",
  "webhooks",
]);

export class DomainAggregate {
  constructor(private record: WebsiteDomainRecord) {}

  static validateSubdomain(subdomain: string): string {
    const normalized = subdomain.toLowerCase().trim();
    if (!normalized || normalized.length < 3 || normalized.length > 63) {
      throw new InvalidDomainFormatError(
        subdomain,
        "Subdomain must be between 3 and 63 characters long."
      );
    }
    const regex = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/;
    if (!regex.test(normalized)) {
      throw new InvalidDomainFormatError(
        subdomain,
        "Subdomain may only contain lowercase letters, numbers, and hyphens (cannot start or end with hyphen)."
      );
    }
    if (RESERVED_SUBDOMAINS.has(normalized)) {
      throw new ReservedSubdomainError(normalized);
    }
    return normalized;
  }

  static validateCustomHostname(hostname: string): string {
    const normalized = hostname.toLowerCase().trim().replace(/\.$/, ""); // Strip trailing dot if present
    if (!normalized || normalized.length > 253) {
      throw new InvalidDomainFormatError(hostname, "Domain name length invalid.");
    }
    // Must contain at least one dot
    if (!normalized.includes(".")) {
      throw new InvalidDomainFormatError(
        hostname,
        "Custom domain must be a valid FQDN containing a public suffix (e.g. rentals.example.com)."
      );
    }
    // Hostname regex checking labels
    const hostRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;
    if (!hostRegex.test(normalized)) {
      throw new InvalidDomainFormatError(hostname, "Hostname contains invalid characters or structure.");
    }
    return normalized;
  }

  get id(): string {
    return this.record.id;
  }

  get tenantId(): string {
    return this.record.tenantId;
  }

  get websiteId(): string {
    return this.record.websiteId;
  }

  get hostname(): string {
    return this.record.hostname;
  }

  get type(): DomainType {
    return this.record.type;
  }

  get verificationStatus(): DomainVerificationStatus {
    return this.record.verificationStatus;
  }

  get sslStatus(): DomainSslStatus {
    return this.record.sslStatus;
  }

  get isPrimary(): boolean {
    return this.record.isPrimary;
  }

  get raw(): WebsiteDomainRecord {
    return JSON.parse(JSON.stringify(this.record));
  }

  assertRoutable(): void {
    if (this.record.verificationStatus !== "VERIFIED") {
      throw new DomainNotRoutableError(this.record.hostname, this.record.verificationStatus);
    }
  }

  assertCanDelete(): void {
    if (this.record.type === "PLATFORM_SUBDOMAIN") {
      throw new CannotDeletePlatformSubdomainError(this.record.hostname);
    }
  }

  setPrimary(primary: boolean): void {
    this.record.isPrimary = primary;
    this.record.updatedAt = new Date().toISOString();
  }

  markVerified(): void {
    this.record.verificationStatus = "VERIFIED";
    this.record.sslStatus = "ACTIVE";
    this.record.verifiedAt = new Date().toISOString();
    this.record.updatedAt = new Date().toISOString();
  }

  markVerificationFailed(): void {
    this.record.verificationStatus = "FAILED";
    this.record.sslStatus = "FAILED";
    this.record.updatedAt = new Date().toISOString();
  }

  markRevoked(): void {
    this.record.verificationStatus = "REVOKED";
    this.record.sslStatus = "FAILED";
    this.record.isPrimary = false;
    this.record.updatedAt = new Date().toISOString();
  }

  updateTlsStatus(sslStatus: DomainSslStatus): void {
    this.record.sslStatus = sslStatus;
    this.record.updatedAt = new Date().toISOString();
  }
}
