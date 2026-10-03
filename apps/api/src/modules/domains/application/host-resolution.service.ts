// ============================================================================
// CAR HIRE OS — AUTHORITATIVE HOST RESOLUTION PIPELINE (TEN-001, DEV-008, SEC-001)
// Resolves: Host -> Domain -> Website -> Tenant -> PublicWebsiteContext
// Zero-trust in client-supplied headers (X-Tenant-ID), port-stripping, caching
// ============================================================================

import {
  PublicWebsiteContext,
  WebsiteDomainRecord,
  TenantWebsiteRecord,
} from "@car-hire-os/types";
import {
  IWebsiteDomainRepository,
  ITenantWebsiteRepository,
  IWebPageRepository,
  IWebsiteSnapshotRepository,
  ITenantRepository,
} from "@car-hire-os/database";
import {
  WebsiteNotFoundError,
  WebsiteUnpublishedError,
} from "../../website/domain/website.errors";
import {
  DomainNotRoutableError,
} from "../domain/domain.errors";

export interface HostResolverOptions {
  platformBaseDomain?: string;
  cacheTtlMs?: number;
  trustedProxyIps?: string[];
}

export interface HttpRequestLike {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}

export class HostResolutionService {
  private readonly platformBaseDomain: string;
  private readonly cacheTtlMs: number;
  private readonly trustedProxyIps: Set<string>;
  private readonly cache: Map<string, { context: PublicWebsiteContext; expiresAt: number }> = new Map();

  constructor(
    private readonly domainRepo: IWebsiteDomainRepository,
    private readonly websiteRepo: ITenantWebsiteRepository,
    private readonly pageRepo: IWebPageRepository,
    private readonly snapshotRepo: IWebsiteSnapshotRepository,
    private readonly tenantRepo?: ITenantRepository,
    options: HostResolverOptions = {}
  ) {
    this.platformBaseDomain = options.platformBaseDomain || "carhireos.com";
    this.cacheTtlMs = options.cacheTtlMs || 60000; // 60s default in-memory TTL
    this.trustedProxyIps = new Set(options.trustedProxyIps || ["127.0.0.1", "::1"]);
  }

  /**
   * Extracts and normalizes the authoritative hostname from request headers.
   * Defends against Host-Header Poisoning by checking trusted proxy configuration.
   */
  extractHost(req: HttpRequestLike): string {
    const rawForwardedHost = req.headers["x-forwarded-host"];
    const rawHost = req.headers["host"];
    const clientIp = req.ip || "";

    let chosenHost: string = "";

    // Only trust X-Forwarded-Host if request originated from a trusted proxy
    if (rawForwardedHost && (this.trustedProxyIps.has(clientIp) || !clientIp)) {
      const forwardedStr = Array.isArray(rawForwardedHost) ? rawForwardedHost[0] : rawForwardedHost;
      chosenHost = forwardedStr.split(",")[0].trim();
    } else if (rawHost) {
      chosenHost = Array.isArray(rawHost) ? rawHost[0] : rawHost;
    }

    return this.normalizeHost(chosenHost);
  }

  /**
   * Normalizes hostname:
   * 1. Port stripping (example.com:3000 -> example.com)
   * 2. Lowercase
   * 3. Trim whitespace
   * 4. Remove trailing dots
   */
  normalizeHost(rawHost: string): string {
    if (!rawHost) return "";
    return rawHost
      .toLowerCase()
      .trim()
      .split(":")[0]
      .replace(/\.$/, "");
  }

  /**
   * Authoritative Resolution Pipeline:
   * Host -> Domain -> Website -> Tenant -> PublicWebsiteContext
   */
  async resolve(hostOrReq: string | HttpRequestLike): Promise<PublicWebsiteContext> {
    const normalizedHost =
      typeof hostOrReq === "string"
        ? this.normalizeHost(hostOrReq)
        : this.extractHost(hostOrReq);

    if (!normalizedHost) {
      throw new WebsiteNotFoundError("Empty or invalid Host header");
    }

    // 1. Check cache
    const cached = this.cache.get(normalizedHost);
    if (cached && cached.expiresAt > Date.now()) {
      return JSON.parse(JSON.stringify(cached.context));
    }

    // 2. Stage 1: Lookup Domain entity
    let domainRecord: WebsiteDomainRecord | null = await this.domainRepo.findByHostname(normalizedHost);

    // If not found directly, check if it is a platform subdomain
    if (!domainRecord) {
      if (normalizedHost.endsWith(`.${this.platformBaseDomain}`)) {
        const subdomainPart = normalizedHost.replace(`.${this.platformBaseDomain}`, "");
        const websiteBySub = await this.websiteRepo.findBySubdomain(subdomainPart);
        if (websiteBySub) {
          // Look up domain records for this website
          const websiteDomains = await this.domainRepo.listByWebsiteId(websiteBySub.id);
          domainRecord = websiteDomains.find((d) => d.type === "PLATFORM_SUBDOMAIN") || null;
        }
      } else {
        // Fallback for direct local dev subdomain strings (e.g. "safari-cars")
        const websiteBySub = await this.websiteRepo.findBySubdomain(normalizedHost);
        if (websiteBySub) {
          const websiteDomains = await this.domainRepo.listByWebsiteId(websiteBySub.id);
          domainRecord = websiteDomains.find((d) => d.type === "PLATFORM_SUBDOMAIN") || null;
        }
      }
    }

    if (!domainRecord) {
      throw new WebsiteNotFoundError(normalizedHost);
    }

    // 3. Stage 2: Verification Gate
    // Invariant: Unverified custom domains MUST NOT route traffic
    if (domainRecord.verificationStatus !== "VERIFIED") {
      throw new DomainNotRoutableError(domainRecord.hostname, domainRecord.verificationStatus);
    }

    // 4. Stage 3: Resolve Website entity
    const website = await this.websiteRepo.findById(domainRecord.websiteId);
    if (!website) {
      throw new WebsiteNotFoundError(domainRecord.hostname);
    }

    // 5. Stage 4: Publication Gate
    if (website.status !== "PUBLISHED" && !website.activeSnapshotId) {
      throw new WebsiteUnpublishedError(domainRecord.hostname);
    }

    // 6. Stage 5: Tenant Account Standing Gate
    if (this.tenantRepo) {
      const tenant = await this.tenantRepo.findById(website.tenantId);
      if (!tenant) {
        throw new WebsiteNotFoundError(`Tenant ${website.tenantId} not found`);
      }
      if (tenant.status === "SUSPENDED" || tenant.status === "CANCELLED") {
        throw new WebsiteUnpublishedError(`Tenant account is inactive.`);
      }
    }

    // 7. Stage 6: Hydrate Published Snapshot
    let publishedBranding = website.branding;
    let publishedNav = website.navigation;
    let activePages: Array<{
      id: string;
      slug: string;
      title: string;
      pageType: any;
      displayOrder: number;
    }> = [];

    if (website.activeSnapshotId) {
      const snapshot = await this.snapshotRepo.findById(website.activeSnapshotId);
      if (snapshot) {
        publishedBranding = snapshot.snapshotData.branding;
        publishedNav = snapshot.snapshotData.navigation;
        activePages = snapshot.snapshotData.pages
          .filter((p) => p.status === "PUBLISHED")
          .map((p) => ({
            id: p.id,
            slug: p.slug,
            title: p.title,
            pageType: p.pageType,
            displayOrder: p.displayOrder,
          }));
      }
    } else {
      const pages = await this.pageRepo.listByWebsiteId(website.id);
      activePages = pages
        .filter((p) => p.status === "PUBLISHED")
        .map((p) => ({
          id: p.id,
          slug: p.slug,
          title: p.title,
          pageType: p.pageType,
          displayOrder: p.displayOrder,
        }));
    }

    // 8. Stage 7: Assemble Context
    const context: PublicWebsiteContext = {
      tenantId: website.tenantId,
      websiteId: website.id,
      domainId: domainRecord.id,
      domainType: domainRecord.type,
      isPrimary: domainRecord.isPrimary,
      subdomain: website.subdomain,
      hostname: normalizedHost,
      status: website.status,
      isMaintenanceMode: Boolean(website.isMaintenanceMode),
      maintenanceMessage: website.maintenanceMessage,
      publishedVersion: website.publishedVersion || 1,
      branding: publishedBranding,
      navigation: publishedNav,
      activePages,
    };

    // Cache context
    this.cache.set(normalizedHost, {
      context,
      expiresAt: Date.now() + this.cacheTtlMs,
    });

    return context;
  }

  /**
   * Evicts cached hostname (invoked when website is published, domain is modified, etc.)
   */
  evictCache(hostname?: string): void {
    if (hostname) {
      this.cache.delete(this.normalizeHost(hostname));
    } else {
      this.cache.clear();
    }
  }
}
