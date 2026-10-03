// ============================================================================
// CAR HIRE OS — SPRINT 29 TEST SUITE:
// TENANT WEBSITE CMS, BRANDING, CONTENT MANAGEMENT, CUSTOM DOMAIN VERIFICATION,
// SEO ENGINE & PUBLIC STOREFRONT CATALOGUE (ARCH-001, DEV-008, SEC-001)
// ============================================================================

import { strict as assert } from "node:assert";
import {
  InMemoryTenantWebsiteRepository,
  InMemoryWebPageRepository,
  InMemoryWebsiteDomainRepository,
  InMemoryWebsiteSnapshotRepository,
} from "../src/index";
import { TenantWebsiteService } from "../../../apps/api/src/modules/website/application/tenant-website.service";
import { PublicWebsiteService } from "../../../apps/api/src/modules/website/application/public-website.service";
import { WebsiteContentSanitizer } from "../../../apps/api/src/modules/website/application/website-sanitizer";
import {
  WebsiteUnpublishedError,
  StandardPageCannotBeDeletedError,
  DuplicatePageSlugError,
  DomainAlreadyRegisteredError,
  DomainVerificationFailedError,
  CrossTenantWebsiteDeniedError,
} from "../../../apps/api/src/modules/website/domain/website.errors";
import { VehicleRecord } from "@car-hire-os/types";

class MockEventPublisher {
  public events: Array<{ type: string; payload: any }> = [];

  async publish(type: string, payload: any): Promise<void> {
    this.events.push({ type, payload });
  }

  clear() {
    this.events = [];
  }
}

async function runSprint29TestSuite() {
  console.log("======================================================================");
  console.log("RUNNING SPRINT 29: TENANT WEBSITE CMS & PUBLIC STOREFRONT TEST SUITE");
  console.log("======================================================================");

  const websiteRepo = new InMemoryTenantWebsiteRepository();
  const pageRepo = new InMemoryWebPageRepository();
  const domainRepo = new InMemoryWebsiteDomainRepository();
  const snapshotRepo = new InMemoryWebsiteSnapshotRepository();
  const eventPublisher = new MockEventPublisher();

  const mockVehicles: VehicleRecord[] = [
    {
      id: "veh-001",
      tenantId: "tenant-apex",
      make: "BMW",
      model: "3 Series",
      year: 2024,
      category: "Sedan",
      status: "AVAILABLE",
      vin: "WBA12345678901234",
      licensePlate: "APEX-01",
      currentOdometer: 1500,
      fuelType: "Petrol",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dailyRate: 110,
    } as any,
    {
      id: "veh-002",
      tenantId: "tenant-apex",
      make: "Tesla",
      model: "Model Y",
      year: 2024,
      category: "Electric",
      status: "AVAILABLE",
      vin: "5YJ12345678901234",
      licensePlate: "APEX-02",
      currentOdometer: 2000,
      fuelType: "Electric",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dailyRate: 135,
    } as any,
    {
      id: "veh-003",
      tenantId: "tenant-apex",
      make: "Mercedes",
      model: "C-Class",
      year: 2023,
      category: "Sedan",
      status: "DECOMMISSIONED",
      vin: "WDD12345678901234",
      licensePlate: "APEX-03",
      currentOdometer: 85000,
      fuelType: "Diesel",
      lifecycleStatus: "DECOMMISSIONED",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dailyRate: 95,
    } as any,
  ];

  const vehicleRepo = {
    listByTenant: async (tId: string) => mockVehicles.filter((v) => v.tenantId === tId),
  };

  const websiteService = new TenantWebsiteService(
    websiteRepo,
    pageRepo,
    domainRepo,
    snapshotRepo,
    eventPublisher
  );

  const publicService = new PublicWebsiteService(
    websiteRepo,
    pageRepo,
    domainRepo,
    snapshotRepo,
    vehicleRepo
  );

  // --------------------------------------------------------------------------
  // TEST 1: Website Initialization & Standard Pages
  // --------------------------------------------------------------------------
  console.log("\n[TEST 1] Initializing website with standard pages and default branding...");
  const site = await websiteService.initializeWebsite("tenant-apex", "apex-rentals", {
    primaryColor: "#059669",
    fontHeading: "Outfit",
  });

  assert.equal(site.tenantId, "tenant-apex");
  assert.equal(site.subdomain, "apex-rentals");
  assert.equal(site.status, "DRAFT");
  assert.equal(site.branding.primaryColor, "#059669");
  assert.equal(site.branding.fontHeading, "Outfit");

  const initialPages = await websiteService.listPages("tenant-apex");
  assert.equal(initialPages.length, 4, "Should initialize 4 standard pages");
  const homePage = initialPages.find((p) => p.slug === "/");
  const fleetPage = initialPages.find((p) => p.slug === "/fleet");
  assert.ok(homePage && homePage.isStandardPage, "Home page must exist and be standard");
  assert.ok(fleetPage && fleetPage.isStandardPage, "Fleet page must exist and be standard");
  console.log("✓ Initialized successfully with 4 standard pages and branding.");

  // --------------------------------------------------------------------------
  // TEST 2: Invariant 1 - Draft / Unconfigured Isolation
  // --------------------------------------------------------------------------
  console.log("\n[TEST 2] Verifying draft site cannot be resolved on public storefront...");
  await assert.rejects(
    async () => {
      await publicService.resolveByHost("apex-rentals.carhireos.com");
    },
    WebsiteUnpublishedError,
    "Must reject resolution of unpublished draft site"
  );
  console.log("✓ Correctly prevented public access to unpublished draft.");

  // --------------------------------------------------------------------------
  // TEST 3: Invariant 2 - Content Sanitization & Anti-XSS (SEC-001)
  // --------------------------------------------------------------------------
  console.log("\n[TEST 3] Testing strict XSS sanitization in plain text and rich text blocks...");
  const maliciousHeadline = "Super Car <script>alert('XSS')</script> Rental";
  const cleanHeadline = WebsiteContentSanitizer.sanitizePlainText(maliciousHeadline);
  assert.equal(cleanHeadline, "Super Car alert('XSS') Rental", "HTML tags must be completely stripped");

  const maliciousRichText = `<p>Welcome!</p><script>fetch('http://evil.com')</script><a href="javascript:alert(1)" onclick="steal()">Click here</a>`;
  const cleanRichText = WebsiteContentSanitizer.sanitizeRichText(maliciousRichText);
  assert.ok(!cleanRichText.includes("<script"), "Script tags must be eliminated");
  assert.ok(!cleanRichText.includes("onclick="), "Inline event handlers must be stripped");
  assert.ok(!cleanRichText.includes("javascript:"), "Javascript protocol must be neutralized");
  assert.ok(cleanRichText.includes('rel="noopener noreferrer"'), "Anchor links must include security rel attributes");
  console.log("✓ Sanitizer strictly neutralized script injections and malicious attributes.");

  // --------------------------------------------------------------------------
  // TEST 4: Invariant 7 - Page Slug Uniqueness
  // --------------------------------------------------------------------------
  console.log("\n[TEST 4] Verifying slug uniqueness enforcement within tenant...");
  await assert.rejects(
    async () => {
      await websiteService.createPage("tenant-apex", {
        slug: "/fleet", // Already exists
        title: "Another Fleet",
        pageType: "FLEET_CATALOGUE",
      });
    },
    DuplicatePageSlugError,
    "Must throw DuplicatePageSlugError when slug already exists"
  );
  console.log("✓ Duplicate page slug correctly rejected.");

  // --------------------------------------------------------------------------
  // TEST 5: Invariant 6 - Protection of Standard Pages
  // --------------------------------------------------------------------------
  console.log("\n[TEST 5] Testing protection of standard pages from accidental deletion...");
  await assert.rejects(
    async () => {
      await websiteService.deletePage("tenant-apex", homePage!.id);
    },
    StandardPageCannotBeDeletedError,
    "Standard home page cannot be deleted"
  );

  // But a custom page CAN be created and deleted
  const customPage = await websiteService.createPage("tenant-apex", {
    slug: "/summer-specials",
    title: "Summer Specials",
    pageType: "CUSTOM",
    contentBlocks: [
      {
        id: "blk-promo",
        type: "CALL_TO_ACTION",
        sortOrder: 0,
        data: {
          headline: "Save 20% on all weekend rentals",
          buttonLabel: "Claim Discount",
          buttonLink: "/fleet",
        },
      },
    ],
  });
  assert.equal(customPage.slug, "/summer-specials");
  const deleteResult = await websiteService.deletePage("tenant-apex", customPage.id);
  assert.equal(deleteResult, true, "Custom page should be deletable");
  console.log("✓ Standard pages protected; custom pages can be managed dynamically.");

  // --------------------------------------------------------------------------
  // TEST 6: Invariant 9 - Publishing & Version Snapshots
  // --------------------------------------------------------------------------
  console.log("\n[TEST 6] Testing snapshot publishing and version incrementation...");
  const snapshot1 = await websiteService.publishWebsite(
    "tenant-apex",
    "user-admin-1",
    "Initial public launch v1"
  );

  assert.equal(snapshot1.versionNumber, 1);
  assert.equal(snapshot1.publishedByUserId, "user-admin-1");

  const updatedSite = await websiteService.getWebsite("tenant-apex");
  assert.equal(updatedSite.status, "PUBLISHED");
  assert.equal(updatedSite.publishedVersion, 1);
  assert.equal(updatedSite.activeSnapshotId, snapshot1.id);

  // Now public resolution works!
  const publicResolved = await publicService.resolveByHost("apex-rentals.carhireos.com");
  assert.equal(publicResolved.tenantId, "tenant-apex");
  assert.equal(publicResolved.status, "PUBLISHED");
  assert.equal(publicResolved.publishedVersion, 1);
  assert.equal(publicResolved.activePages.length, 4);
  console.log("✓ Website published successfully as snapshot v1 and resolves publicly.");

  // --------------------------------------------------------------------------
  // TEST 7: Invariant 4 - Public Vehicle Catalogue Rentable Isolation
  // --------------------------------------------------------------------------
  console.log("\n[TEST 7] Verifying public vehicle catalogue filters out non-rentable fleet...");
  const publicVehicles = await publicService.getPublicCatalogue("tenant-apex");
  assert.equal(publicVehicles.length, 2, "Should only return 2 rentable vehicles (BMW and Tesla)");
  const ids = publicVehicles.map((v) => v.id);
  assert.ok(ids.includes("veh-001"), "BMW must be included");
  assert.ok(ids.includes("veh-002"), "Tesla must be included");
  assert.ok(!ids.includes("veh-003"), "Decommissioned Mercedes must NEVER be returned");
  console.log("✓ Decommissioned and non-rentable fleet strictly filtered from storefront.");

  // --------------------------------------------------------------------------
  // TEST 8: Invariant 5 - Custom Domain Registration & DNS Verification
  // --------------------------------------------------------------------------
  console.log("\n[TEST 8] Testing custom domain registration, DNS challenge and routing...");
  const domain = await websiteService.registerDomain("tenant-apex", "rent.apexauto.co.uk");
  assert.equal(domain.hostname, "rent.apexauto.co.uk");
  assert.equal(domain.verificationStatus, "PENDING_VERIFICATION");
  assert.ok(domain.expectedTxtRecord.startsWith("car-hire-verification="));

  // Should fail duplicate registration
  await assert.rejects(
    async () => {
      await websiteService.registerDomain("tenant-other", "rent.apexauto.co.uk");
    },
    DomainAlreadyRegisteredError,
    "Cannot register already registered domain"
  );

  // Verify domain
  const verifiedDomain = await websiteService.verifyDomain("tenant-apex", domain.id, true);
  assert.equal(verifiedDomain.verificationStatus, "VERIFIED");
  assert.equal(verifiedDomain.sslStatus, "ACTIVE");

  // Public resolution via custom domain header
  const customResolved = await publicService.resolveByHost("rent.apexauto.co.uk");
  assert.equal(customResolved.tenantId, "tenant-apex");
  assert.equal(customResolved.websiteId, updatedSite.id);
  console.log("✓ Custom domain verified and routed to tenant website successfully.");

  // --------------------------------------------------------------------------
  // TEST 9: Invariant 8 - Canonical SEO Sitemap & Robots.txt Generation
  // --------------------------------------------------------------------------
  console.log("\n[TEST 9] Testing XML sitemap and robots.txt generation...");
  const sitemapXml = await publicService.generateSitemapXml("tenant-apex", "https://rent.apexauto.co.uk");
  assert.ok(sitemapXml.includes("<urlset"), "Sitemap must be valid XML urlset");
  assert.ok(sitemapXml.includes("<loc>https://rent.apexauto.co.uk</loc>"), "Must include home page");
  assert.ok(sitemapXml.includes("<loc>https://rent.apexauto.co.uk/fleet</loc>"), "Must include fleet catalogue");

  const robotsTxt = await publicService.generateRobotsTxt("tenant-apex", "https://rent.apexauto.co.uk");
  assert.ok(robotsTxt.includes("User-agent: *"));
  assert.ok(robotsTxt.includes("Sitemap: https://rent.apexauto.co.uk/sitemap.xml"));
  console.log("✓ XML sitemap and robots.txt generated according to SEO standards.");

  // --------------------------------------------------------------------------
  // TEST 10: Invariant 10 - Maintenance Mode Gate
  // --------------------------------------------------------------------------
  console.log("\n[TEST 10] Testing maintenance mode toggle and storefront notification...");
  await websiteService.toggleMaintenanceMode(
    "tenant-apex",
    true,
    "Upgrading booking systems. Back online shortly."
  );

  const maintenanceResolved = await publicService.resolveByHost("rent.apexauto.co.uk");
  assert.equal(maintenanceResolved.isMaintenanceMode, true);
  assert.equal(maintenanceResolved.maintenanceMessage, "Upgrading booking systems. Back online shortly.");

  await websiteService.toggleMaintenanceMode("tenant-apex", false);
  const backOnline = await publicService.resolveByHost("rent.apexauto.co.uk");
  assert.equal(backOnline.isMaintenanceMode, false);
  console.log("✓ Maintenance mode toggle successfully gates and restores access.");

  // --------------------------------------------------------------------------
  // TEST 11: Rollback to Snapshot Version
  // --------------------------------------------------------------------------
  console.log("\n[TEST 11] Testing branding update, second publication, and rollback...");
  // Update branding in draft
  await websiteService.updateBranding("tenant-apex", {
    primaryColor: "#2563eb",
  });
  const snapshot2 = await websiteService.publishWebsite("tenant-apex", "user-admin-1", "Changed to blue branding");
  assert.equal(snapshot2.versionNumber, 2);

  const v2Resolved = await publicService.resolveByHost("rent.apexauto.co.uk");
  assert.equal(v2Resolved.branding.primaryColor, "#2563eb");

  // Rollback to version 1
  const rollbackSnap = await websiteService.rollbackWebsite("tenant-apex", 1, "user-admin-1");
  assert.equal(rollbackSnap.versionNumber, 3); // Rollback snapshot is published as next version v3
  assert.equal(rollbackSnap.snapshotData.branding.primaryColor, "#059669"); // Restored original color

  const rolledBackResolved = await publicService.resolveByHost("rent.apexauto.co.uk");
  assert.equal(rolledBackResolved.branding.primaryColor, "#059669");
  console.log("✓ Snapshot rollback successfully restored previous configuration.");

  console.log("\n======================================================================");
  console.log("ALL SPRINT 29 TESTS PASSED CLEANLY (11/11 SUITES)");
  console.log("======================================================================");
}

runSprint29TestSuite().catch((err) => {
  console.error("Test Suite Execution Failed:", err);
  process.exit(1);
});
