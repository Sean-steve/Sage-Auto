// ============================================================================
// CAR HIRE OS — DOMAIN APPLICATION SERVICE (ARCH-001, TEN-001, DEV-009, SEC-001)
// Domain lifecycle management: registration, challenge verification, deletion
// ============================================================================

import { randomUUID } from "crypto";
import {
  WebsiteDomainRecord,
  DomainType,
  DomainSslStatus,
} from "@car-hire-os/types";
import { EVENT_TYPES } from "@carhire/contracts";
import {
  IWebsiteDomainRepository,
  ITenantWebsiteRepository,
} from "@car-hire-os/database";

export interface IEntitlementEngine {
  hasFeature(tenantId: string, featureKey: string): Promise<boolean>;
}
import { DomainAggregate } from "../domain/domain.entity";
import {
  DomainAlreadyRegisteredError,
  DomainNotFoundError,
  DomainVerificationFailedError,
  CrossTenantDomainDeniedError,
  DomainEntitlementRequiredError,
  DomainVerificationRateLimitedError,
} from "../domain/domain.errors";
import { DnsVerificationService } from "./domain-verification.service";
import { IEventPublisher, DefaultEventPublisher } from "../../website/application/tenant-website.service";

export interface DomainServiceOptions {
  platformBaseDomain?: string;
  dnsService?: DnsVerificationService;
  eventPublisher?: IEventPublisher;
  entitlementEngine?: IEntitlementEngine;
}

export class DomainService {
  private readonly platformBaseDomain: string;
  private readonly dnsService: DnsVerificationService;
  private readonly eventPublisher: IEventPublisher;
  private readonly entitlementEngine?: IEntitlementEngine;
  private readonly verificationTimestamps: Map<string, number[]> = new Map();

  constructor(
    private readonly domainRepo: IWebsiteDomainRepository,
    private readonly websiteRepo: ITenantWebsiteRepository,
    options: DomainServiceOptions = {}
  ) {
    this.platformBaseDomain = options.platformBaseDomain || "carhireos.com";
    this.dnsService = options.dnsService || new DnsVerificationService(`cname.${this.platformBaseDomain}`);
    this.eventPublisher = options.eventPublisher || new DefaultEventPublisher();
    this.entitlementEngine = options.entitlementEngine;
  }

  /**
   * Initializes an automatic platform subdomain for a website.
   * Auto-verified, SSL active, permanent default.
   */
  async initializePlatformSubdomain(
    tenantId: string,
    websiteId: string,
    subdomain: string
  ): Promise<WebsiteDomainRecord> {
    const cleanSubdomain = DomainAggregate.validateSubdomain(subdomain);
    const fullHostname = `${cleanSubdomain}.${this.platformBaseDomain}`;

    const existing = await this.domainRepo.findByHostname(fullHostname);
    if (existing) {
      if (existing.tenantId === tenantId && existing.websiteId === websiteId) {
        return existing;
      }
      throw new DomainAlreadyRegisteredError(fullHostname);
    }

    const domainRecord: WebsiteDomainRecord = {
      id: `dom-${randomUUID().slice(0, 8)}`,
      tenantId,
      websiteId,
      hostname: fullHostname,
      type: "PLATFORM_SUBDOMAIN",
      verificationStatus: "VERIFIED",
      verificationMethod: "DNS_TXT",
      verificationToken: "platform-provisioned",
      expectedTxtRecord: "platform-managed",
      expectedCnameRecord: `cname.${this.platformBaseDomain}`,
      sslStatus: "ACTIVE",
      isPrimary: true,
      verifiedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saved = await this.domainRepo.save(domainRecord);

    await this.eventPublisher.publish(EVENT_TYPES.WEBSITE_DOMAIN_REGISTERED, {
      domainId: saved.id,
      websiteId,
      tenantId,
      hostname: saved.hostname,
      type: saved.type,
      verificationToken: saved.verificationToken,
      registeredAt: saved.createdAt,
    });

    return saved;
  }

  /**
   * Registers a custom domain for a tenant website.
   * Enforces Entitlement Engine (Sprint 7) check for 'custom_domain' feature.
   */
  async registerCustomDomain(
    tenantId: string,
    websiteId: string,
    hostname: string
  ): Promise<WebsiteDomainRecord> {
    // 1. Entitlement check
    if (this.entitlementEngine) {
      const isEntitled = await this.entitlementEngine.hasFeature(tenantId, "custom_domain");
      if (!isEntitled) {
        throw new DomainEntitlementRequiredError(tenantId);
      }
    }

    // 2. Validate hostname
    const normalizedHost = DomainAggregate.validateCustomHostname(hostname);

    // 3. Collision check
    const existing = await this.domainRepo.findByHostname(normalizedHost);
    if (existing) {
      throw new DomainAlreadyRegisteredError(normalizedHost);
    }

    // 4. Validate website ownership
    const website = await this.websiteRepo.findById(websiteId);
    if (!website || website.tenantId !== tenantId) {
      throw new CrossTenantDomainDeniedError(tenantId, website?.tenantId || "unknown");
    }

    // 5. Generate challenge
    const challenge = this.dnsService.generateChallenge(normalizedHost);

    const domainRecord: WebsiteDomainRecord = {
      id: `dom-${randomUUID().slice(0, 8)}`,
      tenantId,
      websiteId,
      hostname: normalizedHost,
      type: "CUSTOM_DOMAIN",
      verificationStatus: "PENDING_VERIFICATION",
      verificationMethod: "DNS_TXT",
      verificationToken: challenge.verificationToken,
      expectedTxtRecord: challenge.expectedTxtRecord,
      expectedCnameRecord: challenge.expectedCnameRecord,
      sslStatus: "INITIALIZING",
      isPrimary: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saved = await this.domainRepo.save(domainRecord);

    await this.eventPublisher.publish(EVENT_TYPES.WEBSITE_DOMAIN_REGISTERED, {
      domainId: saved.id,
      websiteId: saved.websiteId,
      tenantId,
      hostname: saved.hostname,
      type: saved.type,
      verificationToken: saved.verificationToken,
      registeredAt: saved.createdAt,
    });

    return saved;
  }

  /**
   * Triggers DNS challenge verification for a custom domain.
   */
  async verifyCustomDomain(
    tenantId: string,
    domainId: string,
    options: { simulate?: boolean; simulateSuccess?: boolean; failureReason?: string } = {}
  ): Promise<WebsiteDomainRecord> {
    const domain = await this.domainRepo.findById(domainId);
    if (!domain) {
      throw new DomainNotFoundError(domainId);
    }
    if (domain.tenantId !== tenantId) {
      throw new CrossTenantDomainDeniedError(tenantId, domain.tenantId);
    }

    // Rate limiting: Max 5 checks per 15 minutes per domain
    const now = Date.now();
    const timestamps = this.verificationTimestamps.get(domainId) || [];
    const recent = timestamps.filter((t) => now - t < 15 * 60 * 1000);
    if (recent.length >= 5) {
      throw new DomainVerificationRateLimitedError(domain.hostname);
    }
    recent.push(now);
    this.verificationTimestamps.set(domainId, recent);

    const aggregate = new DomainAggregate(domain);

    const result = await this.dnsService.verifyDnsChallenge(domain, {
      simulate: options.simulate !== undefined ? options.simulate : true,
      simulateSuccess: options.simulateSuccess !== undefined ? options.simulateSuccess : true,
      failureReason: options.failureReason,
    });

    if (!result.txtMatched) {
      aggregate.markVerificationFailed();
      const failedDomain = await this.domainRepo.save(aggregate.raw);

      await this.eventPublisher.publish(EVENT_TYPES.WEBSITE_DOMAIN_VERIFICATION_FAILED, {
        domainId: failedDomain.id,
        websiteId: failedDomain.websiteId,
        tenantId,
        hostname: failedDomain.hostname,
        failureReason: result.error || "DNS challenge records missing or invalid.",
        failedAt: new Date().toISOString(),
      });

      throw new DomainVerificationFailedError(
        domain.hostname,
        result.error || "TXT record matching verification token not found in DNS zone."
      );
    }

    aggregate.markVerified();
    const verifiedDomain = await this.domainRepo.save(aggregate.raw);

    await this.eventPublisher.publish(EVENT_TYPES.WEBSITE_DOMAIN_VERIFIED, {
      domainId: verifiedDomain.id,
      websiteId: verifiedDomain.websiteId,
      tenantId,
      hostname: verifiedDomain.hostname,
      verifiedAt: verifiedDomain.verifiedAt!,
    });

    return verifiedDomain;
  }

  /**
   * Sets a verified domain as the primary domain for a website.
   * Unsets primary on other domains for the same website.
   */
  async setPrimaryDomain(tenantId: string, domainId: string): Promise<WebsiteDomainRecord> {
    const targetDomain = await this.domainRepo.findById(domainId);
    if (!targetDomain) {
      throw new DomainNotFoundError(domainId);
    }
    if (targetDomain.tenantId !== tenantId) {
      throw new CrossTenantDomainDeniedError(tenantId, targetDomain.tenantId);
    }

    const aggregate = new DomainAggregate(targetDomain);
    aggregate.assertRoutable();

    // Fetch all domains for website
    const allDomains = await this.domainRepo.listByWebsiteId(targetDomain.websiteId);
    for (const d of allDomains) {
      if (d.id === domainId) {
        d.isPrimary = true;
      } else if (d.isPrimary) {
        d.isPrimary = false;
      }
      d.updatedAt = new Date().toISOString();
      await this.domainRepo.save(d);
    }

    await this.eventPublisher.publish(EVENT_TYPES.WEBSITE_DOMAIN_PRIMARY_SET, {
      domainId,
      websiteId: targetDomain.websiteId,
      tenantId,
      hostname: targetDomain.hostname,
      updatedAt: new Date().toISOString(),
    });

    const updated = await this.domainRepo.findById(domainId);
    return updated!;
  }

  /**
   * Deletes a custom domain.
   * Automatic platform subdomains are protected from deletion.
   */
  async removeDomain(tenantId: string, domainId: string): Promise<boolean> {
    const domain = await this.domainRepo.findById(domainId);
    if (!domain) {
      throw new DomainNotFoundError(domainId);
    }
    if (domain.tenantId !== tenantId) {
      throw new CrossTenantDomainDeniedError(tenantId, domain.tenantId);
    }

    const aggregate = new DomainAggregate(domain);
    aggregate.assertCanDelete();

    // If deleting the primary domain, designate platform subdomain as primary
    if (domain.isPrimary) {
      const allDomains = await this.domainRepo.listByWebsiteId(domain.websiteId);
      const platformSub = allDomains.find(
        (d) => d.id !== domainId && d.type === "PLATFORM_SUBDOMAIN"
      );
      if (platformSub) {
        platformSub.isPrimary = true;
        platformSub.updatedAt = new Date().toISOString();
        await this.domainRepo.save(platformSub);
      }
    }

    const deleted = await this.domainRepo.delete(domainId);

    await this.eventPublisher.publish(EVENT_TYPES.WEBSITE_DOMAIN_REMOVED, {
      domainId,
      websiteId: domain.websiteId,
      tenantId,
      hostname: domain.hostname,
      removedAt: new Date().toISOString(),
    });

    return deleted;
  }

  /**
   * Updates TLS certificate status (used by TLS readiness / ACME listener).
   */
  async updateTlsStatus(
    domainId: string,
    sslStatus: DomainSslStatus
  ): Promise<WebsiteDomainRecord> {
    const domain = await this.domainRepo.findById(domainId);
    if (!domain) {
      throw new DomainNotFoundError(domainId);
    }

    const aggregate = new DomainAggregate(domain);
    aggregate.updateTlsStatus(sslStatus);
    const saved = await this.domainRepo.save(aggregate.raw);

    await this.eventPublisher.publish(EVENT_TYPES.WEBSITE_DOMAIN_TLS_UPDATED, {
      domainId: saved.id,
      websiteId: saved.websiteId,
      tenantId: saved.tenantId,
      hostname: saved.hostname,
      sslStatus,
      updatedAt: saved.updatedAt,
    });

    return saved;
  }

  /**
   * Lists all domains associated with a website.
   */
  async listDomains(tenantId: string, websiteId: string): Promise<WebsiteDomainRecord[]> {
    const website = await this.websiteRepo.findById(websiteId);
    if (!website || website.tenantId !== tenantId) {
      throw new CrossTenantDomainDeniedError(tenantId, website?.tenantId || "unknown");
    }
    return this.domainRepo.listByWebsiteId(websiteId);
  }
}
