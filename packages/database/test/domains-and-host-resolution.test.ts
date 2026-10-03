// ============================================================================
// CAR HIRE OS — SPRINT 30 INTEGRATION TEST SUITE:
// AUTOMATIC SUBDOMAINS, CUSTOM DOMAINS, DNS VERIFICATION, TLS READINESS,
// AND AUTHORITATIVE HOST RESOLUTION PIPELINE (TEN-001, DEV-008, DEV-009, SEC-001)
// ============================================================================

import { strict as assert } from "node:assert";
import {
  InMemoryTenantWebsiteRepository,
  InMemoryWebPageRepository,
  InMemoryWebsiteDomainRepository,
  InMemoryWebsiteSnapshotRepository,
  TenantRepository,
} from "../src/index";
import { TenantWebsiteService } from "../../../apps/api/src/modules/website/application/tenant-website.service";
import {
  DomainService,
  HostResolutionService,
  DnsVerificationService,
  DomainAggregate,
  DomainNotRoutableError,
  DomainEntitlementRequiredError,
  CannotDeletePlatformSubdomainError,
  ReservedSubdomainError,
  CrossTenantDomainDeniedError,
  InvalidDomainFormatError,
  DomainVerificationRateLimitedError,
  DomainAlreadyRegisteredError,
} from "../../../apps/api/src/modules/domains/index";
import {
  WebsiteUnpublishedError,
  WebsiteNotFoundError,
} from "../../../apps/api/src/modules/website/domain/website.errors";
import { EVENT_TYPES } from "@carhire/contracts";

class MockEventPublisher {
  public events: Array<{ type: string; payload: any }> = [];

  async publish(type: string, payload: any): Promise<void> {
    this.events.push({ type, payload });
  }

  clear() {
    this.events = [];
  }
}

class MockEntitlementEngine {
  public entitledTenants: Set<string> = new Set();

  async hasFeature(tenantId: string, featureKey: string): Promise<boolean> {
    if (featureKey === "custom_domain") {
      return this.entitledTenants.has(tenantId);
    }
    return true;
  }
}

async function runSprint30TestSuite() {
  console.log("======================================================================");
  console.log("RUNNING SPRINT 30: AUTOMATIC SUBDOMAINS, CUSTOM DOMAINS & HOST RESOLUTION TEST SUITE");
  console.log("======================================================================");

  const websiteRepo = new InMemoryTenantWebsiteRepository();
  const pageRepo = new InMemoryWebPageRepository();
  const domainRepo = new InMemoryWebsiteDomainRepository();
  const snapshotRepo = new InMemoryWebsiteSnapshotRepository();
  const tenantRepo = new TenantRepository();
  const eventPublisher = new MockEventPublisher();
  const entitlementEngine = new MockEntitlementEngine();

  const websiteService = new TenantWebsiteService(
    websiteRepo,
    pageRepo,
    domainRepo,
    snapshotRepo,
    eventPublisher
  );

  const domainService = new DomainService(
    domainRepo,
    websiteRepo,
    {
      platformBaseDomain: "carhireos.com",
      eventPublisher,
      entitlementEngine: entitlementEngine as any,
    }
  );

  websiteService.setPlatformDomainProvisioner(domainService);

  const hostResolver = new HostResolutionService(
    domainRepo,
    websiteRepo,
    pageRepo,
    snapshotRepo,
    tenantRepo as any,
    {
      platformBaseDomain: "carhireos.com",
      trustedProxyIps: ["127.0.0.1", "10.0.0.1"],
    }
  );

  const tenantApexId = "tenant-apex-motors";
  const tenantSafariId = "tenant-safari-rentals";

  // Setup tenants
  await tenantRepo.create({
    name: "Apex Motors",
    slug: "apex-motors",
    status: "ACTIVE",
    country: "KE",
    currency: "KES",
  } as any);
  // Re-key in repository store for exact id match
  (tenantRepo as any).constructor.store.set(tenantApexId, {
    id: tenantApexId,
    name: "Apex Motors",
    slug: "apex-motors",
    status: "ACTIVE",
    country: "KE",
    currency: "KES",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  (tenantRepo as any).constructor.store.set(tenantSafariId, {
    id: tenantSafariId,
    name: "Safari Rentals",
    slug: "safari-rentals",
    status: "ACTIVE",
    country: "KE",
    currency: "KES",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // --------------------------------------------------------------------------
  // TEST 1: Automatic Platform Subdomain Provisioning on Website Init
  // --------------------------------------------------------------------------
  console.log("[TEST 1] Initializing website and verifying automatic platform subdomain...");
  const apexWebsite = await websiteService.initializeWebsite(tenantApexId, "apex-motors");
  assert.equal(apexWebsite.subdomain, "apex-motors");

  const domains = await domainRepo.listByWebsiteId(apexWebsite.id);
  assert.equal(domains.length, 1);
  const platformDomain = domains[0];
  assert.equal(platformDomain.hostname, "apex-motors.carhireos.com");
  assert.equal(platformDomain.type, "PLATFORM_SUBDOMAIN");
  assert.equal(platformDomain.verificationStatus, "VERIFIED");
  assert.equal(platformDomain.sslStatus, "ACTIVE");
  assert.equal(platformDomain.isPrimary, true);
  console.log("✓ Automatic platform subdomain provisioned, verified and marked primary.");

  // --------------------------------------------------------------------------
  // TEST 2: Reserved Subdomain & Validation Defense
  // --------------------------------------------------------------------------
  console.log("[TEST 2] Verifying reserved platform subdomains are blocked...");
  assert.throws(
    () => DomainAggregate.validateSubdomain("api"),
    ReservedSubdomainError
  );
  assert.throws(
    () => DomainAggregate.validateSubdomain("admin"),
    ReservedSubdomainError
  );
  assert.throws(
    () => DomainAggregate.validateSubdomain("www"),
    ReservedSubdomainError
  );
  assert.throws(
    () => DomainAggregate.validateSubdomain("ab"), // Too short
    InvalidDomainFormatError
  );
  console.log("✓ Reserved platform keywords and invalid subdomains strictly rejected.");

  // --------------------------------------------------------------------------
  // TEST 3: Custom Domain Entitlement Gating (BRS-001, Sprint 7/8)
  // --------------------------------------------------------------------------
  console.log("[TEST 3] Testing custom domain plan entitlement gating...");
  // Tenant is not entitled initially
  await assert.rejects(
    () => domainService.registerCustomDomain(tenantApexId, apexWebsite.id, "rentals.apexmotors.com"),
    DomainEntitlementRequiredError
  );
  console.log("✓ Unentitled tenant blocked from registering custom domain.");

  // Grant custom_domain entitlement
  entitlementEngine.entitledTenants.add(tenantApexId);
  const customDomain = await domainService.registerCustomDomain(
    tenantApexId,
    apexWebsite.id,
    "rentals.apexmotors.com"
  );
  assert.equal(customDomain.hostname, "rentals.apexmotors.com");
  assert.equal(customDomain.verificationStatus, "PENDING_VERIFICATION");
  assert.equal(customDomain.sslStatus, "INITIALIZING");
  assert.equal(customDomain.isPrimary, false);
  assert.ok(customDomain.verificationToken.startsWith("ch-verify-"));
  console.log("✓ Entitled tenant successfully registered custom domain in pending state.");

  // --------------------------------------------------------------------------
  // TEST 4: Global Domain Collision Prevention & Cross-Tenant Hijacking
  // --------------------------------------------------------------------------
  console.log("[TEST 4] Testing global domain collision and cross-tenant hijacking...");
  entitlementEngine.entitledTenants.add(tenantSafariId);
  const safariWebsite = await websiteService.initializeWebsite(tenantSafariId, "safari-rentals");

  // Attempting to register the same custom domain from another tenant must fail with 409
  await assert.rejects(
    () => domainService.registerCustomDomain(tenantSafariId, safariWebsite.id, "rentals.apexmotors.com"),
    DomainAlreadyRegisteredError
  );
  console.log("✓ Cross-tenant domain collision prevented with DomainAlreadyRegisteredError.");

  // --------------------------------------------------------------------------
  // TEST 5: Unverified Custom Domain Rejection in Host Resolution
  // --------------------------------------------------------------------------
  console.log("[TEST 5] Testing that unverified custom domains cannot route traffic...");
  // Publish Apex website first
  await websiteService.publishWebsite(tenantApexId, "user-admin", "Initial live release v1");

  // Request via unverified custom domain must be rejected
  await assert.rejects(
    () => hostResolver.resolve("rentals.apexmotors.com"),
    DomainNotRoutableError
  );
  console.log("✓ Unverified custom domain rejected from routing traffic.");

  // --------------------------------------------------------------------------
  // TEST 6: DNS Challenge Verification Lifecycle
  // --------------------------------------------------------------------------
  console.log("[TEST 6] Testing DNS challenge verification flow (failure and success)...");
  // Test simulated DNS failure
  await assert.rejects(
    () =>
      domainService.verifyCustomDomain(tenantApexId, customDomain.id, {
        simulate: true,
        simulateSuccess: false,
        failureReason: "Missing TXT record in DNS zone.",
      }),
    (err: any) => err.code === "DOMAIN_VERIFICATION_FAILED"
  );

  let updatedDomain = await domainRepo.findById(customDomain.id);
  assert.equal(updatedDomain?.verificationStatus, "FAILED");
  assert.equal(updatedDomain?.sslStatus, "FAILED");

  // Test successful verification
  const verifiedDomain = await domainService.verifyCustomDomain(tenantApexId, customDomain.id, {
    simulate: true,
    simulateSuccess: true,
  });
  assert.equal(verifiedDomain.verificationStatus, "VERIFIED");
  assert.equal(verifiedDomain.sslStatus, "ACTIVE");
  assert.ok(verifiedDomain.verifiedAt);
  console.log("✓ DNS challenge state transitions verified cleanly.");

  // --------------------------------------------------------------------------
  // TEST 7: Authoritative Host Resolution (Host -> Domain -> Website -> Context)
  // --------------------------------------------------------------------------
  console.log("[TEST 7] Testing authoritative host resolution pipeline...");
  // Now rentals.apexmotors.com is verified and website is published
  const resolvedContext = await hostResolver.resolve("rentals.apexmotors.com");
  assert.equal(resolvedContext.tenantId, tenantApexId);
  assert.equal(resolvedContext.websiteId, apexWebsite.id);
  assert.equal(resolvedContext.hostname, "rentals.apexmotors.com");
  assert.equal(resolvedContext.status, "PUBLISHED");
  assert.ok(resolvedContext.activePages.length > 0);
  console.log("✓ Custom domain successfully resolved into PublicWebsiteContext.");

  // --------------------------------------------------------------------------
  // TEST 8: Dual Routing & Automatic Subdomain Fallback
  // --------------------------------------------------------------------------
  console.log("[TEST 8] Testing automatic platform subdomain routing alongside custom domain...");
  const subContext = await hostResolver.resolve("apex-motors.carhireos.com");
  assert.equal(subContext.tenantId, tenantApexId);
  assert.equal(subContext.websiteId, apexWebsite.id);
  assert.equal(subContext.subdomain, "apex-motors");
  console.log("✓ Automatic platform subdomain operates concurrently with custom domain.");

  // --------------------------------------------------------------------------
  // TEST 9: Port Stripping & Host Header Security (DEV-006, SEC-001)
  // --------------------------------------------------------------------------
  console.log("[TEST 9] Testing port stripping and untrusted header isolation...");
  // Port in host header (e.g. rentals.apexmotors.com:3000)
  const portContext = await hostResolver.resolve("rentals.apexmotors.com:3000");
  assert.equal(portContext.tenantId, tenantApexId);

  // Untrusted proxy test: connecting IP not in trusted list cannot poison Host via X-Forwarded-Host
  const poisonedHost = hostResolver.extractHost({
    headers: {
      host: "apex-motors.carhireos.com",
      "x-forwarded-host": "malicious-hacker.com",
    },
    ip: "198.51.100.42", // Untrusted public IP
  });
  assert.equal(poisonedHost, "apex-motors.carhireos.com");

  // Trusted proxy test
  const trustedForwarded = hostResolver.extractHost({
    headers: {
      host: "internal-lb",
      "x-forwarded-host": "rentals.apexmotors.com",
    },
    ip: "127.0.0.1", // Trusted local reverse proxy
  });
  assert.equal(trustedForwarded, "rentals.apexmotors.com");
  console.log("✓ Host-header security and reverse-proxy port normalization verified.");

  // --------------------------------------------------------------------------
  // TEST 10: Primary Domain Designation & Permanent Subdomain Protection
  // --------------------------------------------------------------------------
  console.log("[TEST 10] Testing primary domain switching and protection of platform subdomain...");
  // Set custom domain as primary
  const primaryCustom = await domainService.setPrimaryDomain(tenantApexId, customDomain.id);
  assert.equal(primaryCustom.isPrimary, true);

  const recheckPlatform = await domainRepo.findById(platformDomain.id);
  assert.equal(recheckPlatform?.isPrimary, false);

  // Attempting to delete the platform subdomain must throw
  await assert.rejects(
    () => domainService.removeDomain(tenantApexId, platformDomain.id),
    CannotDeletePlatformSubdomainError
  );

  // Removing the custom domain should automatically restore the platform subdomain as primary
  await domainService.removeDomain(tenantApexId, customDomain.id);
  const restoredPlatform = await domainRepo.findById(platformDomain.id);
  assert.equal(restoredPlatform?.isPrimary, true);
  console.log("✓ Primary domain toggle verified; platform subdomain cannot be deleted.");

  // --------------------------------------------------------------------------
  // TEST 11: Cross-Tenant Domain Isolation & Tenant Inactivity Gate
  // --------------------------------------------------------------------------
  console.log("[TEST 11] Testing cross-tenant domain isolation & tenant suspension gates...");
  // Tenant Safari cannot manage Apex's domain
  await assert.rejects(
    () => domainService.setPrimaryDomain(tenantSafariId, platformDomain.id),
    CrossTenantDomainDeniedError
  );

  // Suspending tenant account immediately gates public resolution
  await tenantRepo.update(tenantApexId, {
    status: "SUSPENDED",
  });

  hostResolver.evictCache();
  await assert.rejects(
    () => hostResolver.resolve("apex-motors.carhireos.com"),
    WebsiteUnpublishedError
  );
  console.log("✓ Cross-tenant domain isolation and tenant account standing checks verified.");

  console.log("======================================================================");
  console.log("ALL SPRINT 30 TESTS PASSED CLEANLY (11/11 SUITES)");
  console.log("======================================================================");
}

runSprint30TestSuite().catch((err) => {
  console.error("Sprint 30 test suite failed:", err);
  process.exit(1);
});
