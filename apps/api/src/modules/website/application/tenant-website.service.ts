import { randomUUID } from "crypto";
import {
  TenantWebsiteRecord,
  WebPageRecord,
  WebsiteDomainRecord,
  WebsiteSnapshotRecord,
  WebsiteBranding,
  WebsiteNavigation,
  ContentBlock,
  CreateWebPageDto,
  UpdateWebPageDto,
} from "@car-hire-os/types";
import { EVENT_TYPES } from "@carhire/contracts";
import {
  ITenantWebsiteRepository,
  IWebPageRepository,
  IWebsiteDomainRepository,
  IWebsiteSnapshotRepository,
} from "@car-hire-os/database";
import {
  WebsiteNotFoundError,
  WebPageNotFoundError,
  DuplicatePageSlugError,
  StandardPageCannotBeDeletedError,
  DomainAlreadyRegisteredError,
  DomainVerificationFailedError,
  DomainNotFoundError,
  CrossTenantWebsiteDeniedError,
} from "../domain/website.errors";
import { WebsiteContentSanitizer } from "./website-sanitizer";

export interface IEventPublisher {
  publish(eventType: string, payload: any): Promise<void>;
}

export interface IPlatformDomainProvisioner {
  initializePlatformSubdomain(
    tenantId: string,
    websiteId: string,
    subdomain: string
  ): Promise<WebsiteDomainRecord>;
}

export class DefaultEventPublisher implements IEventPublisher {
  async publish(eventType: string, payload: any): Promise<void> {
    // In-memory / console publisher fallback
  }
}

export class TenantWebsiteService {
  private platformDomainProvisioner?: IPlatformDomainProvisioner;

  setPlatformDomainProvisioner(provisioner: IPlatformDomainProvisioner): void {
    this.platformDomainProvisioner = provisioner;
  }

  constructor(
    private readonly websiteRepo: ITenantWebsiteRepository,
    private readonly pageRepo: IWebPageRepository,
    private readonly domainRepo: IWebsiteDomainRepository,
    private readonly snapshotRepo: IWebsiteSnapshotRepository,
    private readonly eventPublisher: IEventPublisher = new DefaultEventPublisher()
  ) {}

  /**
   * Initializes a website for a tenant, including standard pages and default branding.
   */
  async initializeWebsite(
    tenantId: string,
    subdomain: string,
    brandingOverrides?: Partial<WebsiteBranding>
  ): Promise<TenantWebsiteRecord> {
    const existing = await this.websiteRepo.findByTenantId(tenantId);
    if (existing) {
      return existing;
    }

    const cleanSubdomain = subdomain.toLowerCase().trim().replace(/[^a-z0-9-]/g, "");

    if (!/^[a-z0-9-]{2,80}$/.test(cleanSubdomain) || await this.websiteRepo.findBySubdomain(cleanSubdomain)) {
      throw new Error("Choose an available website address of 2–80 letters, numbers or hyphens.");
    }
    const defaultBranding: WebsiteBranding = {
      primaryColor: brandingOverrides?.primaryColor || "#059669",
      secondaryColor: brandingOverrides?.secondaryColor || "#0f172a",
      accentColor: brandingOverrides?.accentColor || "#f59e0b",
      backgroundColor: brandingOverrides?.backgroundColor || "#ffffff",
      fontHeading: brandingOverrides?.fontHeading || "Outfit",
      fontBody: brandingOverrides?.fontBody || "Plus Jakarta Sans",
      borderRadius: brandingOverrides?.borderRadius || "md",
      buttonStyle: brandingOverrides?.buttonStyle || "solid",
      logoUrl: brandingOverrides?.logoUrl,
      logoMediaAssetId: brandingOverrides?.logoMediaAssetId,
      faviconUrl: brandingOverrides?.faviconUrl,
      faviconMediaAssetId: brandingOverrides?.faviconMediaAssetId,
    };

    const defaultNavigation: WebsiteNavigation = {
      headerNavigation: [
        { id: "nav-home", label: "Home", type: "INTERNAL_PAGE", slug: "/", sortOrder: 0 },
        { id: "nav-fleet", label: "Our Fleet", type: "INTERNAL_PAGE", slug: "/fleet", sortOrder: 1 },
        { id: "nav-about", label: "About", type: "INTERNAL_PAGE", slug: "/about", sortOrder: 2 },
        { id: "nav-contact", label: "Contact", type: "INTERNAL_PAGE", slug: "/contact", sortOrder: 3 },
      ],
      footerNavigation: [
        {
          columnTitle: "Vehicles",
          items: [
            { id: "foot-all", label: "All Vehicles", type: "INTERNAL_PAGE", slug: "/fleet", sortOrder: 0 },
            { id: "foot-suv", label: "SUVs & Luxury", type: "INTERNAL_PAGE", slug: "/fleet?category=suv", sortOrder: 1 },
            { id: "foot-econ", label: "Economy & Electric", type: "INTERNAL_PAGE", slug: "/fleet?category=electric", sortOrder: 2 },
          ],
        },
        {
          columnTitle: "Company",
          items: [
            { id: "foot-about", label: "About Us", type: "INTERNAL_PAGE", slug: "/about", sortOrder: 0 },
            { id: "foot-contact", label: "Contact Us", type: "INTERNAL_PAGE", slug: "/contact", sortOrder: 1 },
          ],
        },
      ],
    };

    const website: TenantWebsiteRecord = {
      id: `web-${randomUUID().slice(0, 8)}`,
      tenantId,
      subdomain: cleanSubdomain,
      status: "DRAFT",
      branding: defaultBranding,
      navigation: defaultNavigation,
      publishedVersion: 0,
      isMaintenanceMode: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saved = await this.websiteRepo.save(website);

    // Domain ownership is a separate bounded context. When the application
    // composes it, provision the canonical platform subdomain through that
    // service rather than creating an implicit website-only routing record.
    if (this.platformDomainProvisioner) {
      await this.platformDomainProvisioner.initializePlatformSubdomain(
        tenantId,
        saved.id,
        saved.subdomain
      );
    }

    // Create standard default pages
    await this.seedStandardPages(saved);

    await this.eventPublisher.publish(EVENT_TYPES.WEBSITE_INITIALIZED, {
      websiteId: saved.id,
      tenantId,
      subdomain: saved.subdomain,
      initializedAt: saved.createdAt,
    });

    return saved;
  }

  private async seedStandardPages(website: TenantWebsiteRecord): Promise<void> {
    const now = new Date().toISOString();

    // 1. Home Page
    const homeBlocks: ContentBlock[] = [
      {
        id: `blk-${randomUUID().slice(0, 8)}`,
        type: "HERO",
        sortOrder: 0,
        title: "Hero Banner",
        data: {
          headline: "Premium Car Rentals, Reimagined",
          subheadline: "Browse our vehicles and request your rental dates.",
          primaryCtaLabel: "Browse Fleet",
          primaryCtaLink: "/fleet",
          showSearchWidget: true,
          badge: "Book online",
        },
      },
      {
        id: `blk-${randomUUID().slice(0, 8)}`,
        type: "FEATURE_GRID",
        sortOrder: 1,
        title: "Why Rent With Us",
        data: {
          enabled: true,
          columns: 3,
          items: [
            { icon: "ShieldCheck", title: "Clear rental terms", description: "See pricing, deposit expectations and booking progress before pickup." },
            { icon: "Clock", title: "Fast online booking", description: "Choose your dates, check live availability and submit your reservation online." },
            { icon: "Car", title: "Quality fleet", description: "Browse vehicles that are published and operational in the live fleet." },
          ],
        },
      },
      {
        id: `blk-${randomUUID().slice(0, 8)}`,
        type: "VEHICLE_SHOWCASE",
        sortOrder: 2,
        title: "Featured Vehicles",
        data: {
          enabled: true,
          categoryFilter: "ALL",
          limit: 6,
          layout: "GRID_3",
          sortOrder: "FEATURED",
          customBadge: "Popular Choice",
        },
      },
      {
        id: `blk-${randomUUID().slice(0, 8)}`,
        type: "TEXT_IMAGE",
        sortOrder: 3,
        title: "A Better Rental Experience",
        data: {
          enabled: true,
          richText: "<p>From choosing a vehicle to pickup and return, we keep the rental journey clear, connected and easy to follow.</p>",
          imageAlignment: "RIGHT",
          ctaLabel: "Explore the fleet",
          ctaLink: "/fleet",
        },
      },
      {
        id: `blk-${randomUUID().slice(0, 8)}`,
        type: "FAQ",
        sortOrder: 4,
        title: "Frequently Asked Questions",
        data: {
          enabled: true,
          faqs: [
            { question: "What do I need to rent a vehicle?", answer: "You will need the valid identification and driving licence details requested during booking." },
            { question: "How do I know my booking is confirmed?", answer: "Open My Booking using your booking reference and email to follow the reservation status as the rental team processes it." },
            { question: "Can a vehicle shown on the website be unavailable for my dates?", answer: "Yes. The catalogue shows rentable vehicles; your date search also checks existing bookings, temporary holds and operating blocks." },
          ],
        },
      },
      {
        id: `blk-${randomUUID().slice(0, 8)}`,
        type: "CALL_TO_ACTION",
        sortOrder: 5,
        title: "Ready to Drive?",
        data: {
          enabled: true,
          headline: "Find a car that fits your next journey",
          description: "Search live availability, submit your reservation and follow its progress from your renter account.",
          buttonLabel: "Browse vehicles",
          buttonLink: "/fleet",
          accentBadge: "Book online",
        },
      },
    ];

    const homePage: WebPageRecord = {
      id: `page-${randomUUID().slice(0, 8)}`,
      websiteId: website.id,
      tenantId: website.tenantId,
      slug: "/",
      title: "Home",
      pageType: "HOME",
      isStandardPage: true,
      status: "PUBLISHED",
      displayOrder: 0,
      seoConfig: {
        metaTitle: "Car Rental Fleet & Instant Booking",
        metaDescription: "Book premium and economy cars at transparent daily rates.",
      },
      contentBlocks: homeBlocks,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    await this.pageRepo.save(homePage);

    // 2. Fleet Page
    const fleetPage: WebPageRecord = {
      id: `page-${randomUUID().slice(0, 8)}`,
      websiteId: website.id,
      tenantId: website.tenantId,
      slug: "/fleet",
      title: "Our Fleet",
      pageType: "FLEET_CATALOGUE",
      isStandardPage: true,
      status: "PUBLISHED",
      displayOrder: 1,
      seoConfig: {
        metaTitle: "Available Vehicles & Rates",
        metaDescription: "Browse our entire fleet of premium sedans, electric vehicles, and SUVs.",
      },
      contentBlocks: [
        {
          id: `blk-${randomUUID().slice(0, 8)}`,
          type: "VEHICLE_SHOWCASE",
          sortOrder: 0,
          title: "All Available Vehicles",
          data: { categoryFilter: "ALL", limit: 20, layout: "GRID_3" },
        },
      ],
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    await this.pageRepo.save(fleetPage);

    // 3. About Page
    const aboutPage: WebPageRecord = {
      id: `page-${randomUUID().slice(0, 8)}`,
      websiteId: website.id,
      tenantId: website.tenantId,
      slug: "/about",
      title: "About Us",
      pageType: "ABOUT",
      isStandardPage: true,
      status: "PUBLISHED",
      displayOrder: 2,
      seoConfig: {
        metaTitle: "About Our Rental Fleet",
        metaDescription: "Learn more about our mission, vehicles, and customer commitment.",
      },
      contentBlocks: [
        {
          id: `blk-${randomUUID().slice(0, 8)}`,
          type: "TEXT_IMAGE",
          sortOrder: 0,
          title: "Our Mission",
          data: {
            richText: "<p>We provide frictionless car hire experiences for travelers and locals alike. Browse our fleet and request a quote.</p>",
            imageAlignment: "RIGHT",
          },
        },
      ],
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    await this.pageRepo.save(aboutPage);

    // 4. Contact Page
    const contactPage: WebPageRecord = {
      id: `page-${randomUUID().slice(0, 8)}`,
      websiteId: website.id,
      tenantId: website.tenantId,
      slug: "/contact",
      title: "Contact Us",
      pageType: "CONTACT",
      isStandardPage: true,
      status: "PUBLISHED",
      displayOrder: 3,
      seoConfig: {
        metaTitle: "Contact & Support",
        metaDescription: "Get in touch with our rental desk.",
      },
      contentBlocks: [
        {
          id: `blk-${randomUUID().slice(0, 8)}`,
          type: "CONTACT_INFO",
          sortOrder: 0,
          title: "Our Locations",
          data: {
            phone: "",
            email: "",
            address: "",
            operatingHours: "",
          },
        },
      ],
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    await this.pageRepo.save(contactPage);
  }

  async getWebsite(tenantId: string): Promise<TenantWebsiteRecord> {
    const site = await this.websiteRepo.findByTenantId(tenantId);
    if (!site) {
      throw new WebsiteNotFoundError(tenantId);
    }
    return site;
  }

  async updateBranding(
    tenantId: string,
    brandingOverrides: Partial<WebsiteBranding>
  ): Promise<TenantWebsiteRecord> {
    const site = await this.getWebsite(tenantId);

    const mergedBranding: WebsiteBranding = {
      ...site.branding,
      ...brandingOverrides,
    };

    // Validate hex colors
    const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    if (mergedBranding.primaryColor && !hexRegex.test(mergedBranding.primaryColor)) {
      mergedBranding.primaryColor = site.branding.primaryColor;
    }
    if (mergedBranding.secondaryColor && !hexRegex.test(mergedBranding.secondaryColor)) {
      mergedBranding.secondaryColor = site.branding.secondaryColor;
    }
    if (mergedBranding.accentColor && !hexRegex.test(mergedBranding.accentColor)) {
      mergedBranding.accentColor = site.branding.accentColor;
    }

    site.branding = mergedBranding;
    site.updatedAt = new Date().toISOString();

    const saved = await this.websiteRepo.save(site);

    await this.eventPublisher.publish(EVENT_TYPES.WEBSITE_DRAFT_UPDATED, {
      websiteId: saved.id,
      tenantId,
      updatedFields: ["branding"],
      updatedAt: saved.updatedAt,
    });

    return saved;
  }

  async updateNavigation(
    tenantId: string,
    navigation: WebsiteNavigation
  ): Promise<TenantWebsiteRecord> {
    const site = await this.getWebsite(tenantId);
    site.navigation = navigation;
    site.updatedAt = new Date().toISOString();

    const saved = await this.websiteRepo.save(site);
    await this.eventPublisher.publish(EVENT_TYPES.WEBSITE_DRAFT_UPDATED, {
      websiteId: saved.id,
      tenantId,
      updatedFields: ["navigation"],
      updatedAt: saved.updatedAt,
    });
    return saved;
  }

  // --- Web Page Operations ---
  async listPages(tenantId: string): Promise<WebPageRecord[]> {
    const site = await this.getWebsite(tenantId);
    return this.pageRepo.listByWebsiteId(site.id);
  }

  async getPage(tenantId: string, pageId: string): Promise<WebPageRecord> {
    const site = await this.getWebsite(tenantId);
    const page = await this.pageRepo.findById(pageId);
    if (!page || page.websiteId !== site.id) {
      throw new WebPageNotFoundError(pageId);
    }
    return page;
  }

  async createPage(tenantId: string, dto: CreateWebPageDto): Promise<WebPageRecord> {
    const site = await this.getWebsite(tenantId);
    const normalizedSlug = WebsiteContentSanitizer.normalizeSlug(dto.slug);

    // Invariant 7: Slug uniqueness check
    const existing = await this.pageRepo.findBySlug(site.id, normalizedSlug);
    if (existing) {
      throw new DuplicatePageSlugError(normalizedSlug);
    }

    const pages = await this.pageRepo.listByWebsiteId(site.id);
    const maxOrder = pages.reduce((max, p) => Math.max(max, p.displayOrder), 0);

    const cleanBlocks = (dto.contentBlocks || []).map((blk, idx) => ({
      ...blk,
      id: blk.id || `blk-${randomUUID().slice(0, 8)}`,
      sortOrder: blk.sortOrder !== undefined ? blk.sortOrder : idx,
      title: WebsiteContentSanitizer.sanitizePlainText(blk.title),
      subtitle: WebsiteContentSanitizer.sanitizePlainText(blk.subtitle),
    }));

    const page: WebPageRecord = {
      id: `page-${randomUUID().slice(0, 8)}`,
      websiteId: site.id,
      tenantId,
      slug: normalizedSlug,
      title: WebsiteContentSanitizer.sanitizePlainText(dto.title),
      pageType: dto.pageType,
      isStandardPage: false,
      status: "DRAFT",
      displayOrder: maxOrder + 1,
      seoConfig: {
        metaTitle: WebsiteContentSanitizer.sanitizePlainText(dto.seoConfig?.metaTitle),
        metaDescription: WebsiteContentSanitizer.sanitizePlainText(dto.seoConfig?.metaDescription),
        socialShareImageUrl: dto.seoConfig?.socialShareImageUrl,
        noIndex: dto.seoConfig?.noIndex,
      },
      contentBlocks: cleanBlocks,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saved = await this.pageRepo.save(page);

    await this.eventPublisher.publish(EVENT_TYPES.WEBSITE_PAGE_CREATED, {
      pageId: saved.id,
      websiteId: site.id,
      tenantId,
      slug: saved.slug,
      title: saved.title,
      pageType: saved.pageType,
      createdAt: saved.createdAt,
    });

    return saved;
  }

  async updatePage(
    tenantId: string,
    pageId: string,
    dto: UpdateWebPageDto
  ): Promise<WebPageRecord> {
    const site = await this.getWebsite(tenantId);
    const page = await this.pageRepo.findById(pageId);
    if (!page || page.websiteId !== site.id) {
      throw new WebPageNotFoundError(pageId);
    }

    if (dto.slug) {
      const normalized = WebsiteContentSanitizer.normalizeSlug(dto.slug);
      if (normalized !== page.slug) {
        if (page.isStandardPage && (page.slug === "/" || page.slug === "/fleet")) {
          // Keep primary system routes fixed
        } else {
          const clash = await this.pageRepo.findBySlug(site.id, normalized);
          if (clash && clash.id !== page.id) {
            throw new DuplicatePageSlugError(normalized);
          }
          page.slug = normalized;
        }
      }
    }

    if (dto.title) {
      page.title = WebsiteContentSanitizer.sanitizePlainText(dto.title);
    }

    if (dto.status) {
      page.status = dto.status;
    }

    if (dto.displayOrder !== undefined) {
      page.displayOrder = dto.displayOrder;
    }

    if (dto.seoConfig) {
      page.seoConfig = {
        ...page.seoConfig,
        metaTitle: dto.seoConfig.metaTitle !== undefined ? WebsiteContentSanitizer.sanitizePlainText(dto.seoConfig.metaTitle) : page.seoConfig.metaTitle,
        metaDescription: dto.seoConfig.metaDescription !== undefined ? WebsiteContentSanitizer.sanitizePlainText(dto.seoConfig.metaDescription) : page.seoConfig.metaDescription,
        socialShareImageUrl: dto.seoConfig.socialShareImageUrl ?? page.seoConfig.socialShareImageUrl,
        noIndex: dto.seoConfig.noIndex ?? page.seoConfig.noIndex,
      };
    }

    if (dto.contentBlocks) {
      page.contentBlocks = dto.contentBlocks.map((blk, idx) => ({
        ...blk,
        id: blk.id || `blk-${randomUUID().slice(0, 8)}`,
        sortOrder: blk.sortOrder !== undefined ? blk.sortOrder : idx,
        title: WebsiteContentSanitizer.sanitizePlainText(blk.title),
        subtitle: WebsiteContentSanitizer.sanitizePlainText(blk.subtitle),
      }));
    }

    page.version += 1;
    page.updatedAt = new Date().toISOString();

    const saved = await this.pageRepo.save(page);

    await this.eventPublisher.publish(EVENT_TYPES.WEBSITE_PAGE_UPDATED, {
      pageId: saved.id,
      websiteId: site.id,
      tenantId,
      slug: saved.slug,
      updatedAt: saved.updatedAt,
    });

    return saved;
  }

  async deletePage(tenantId: string, pageId: string): Promise<boolean> {
    const site = await this.getWebsite(tenantId);
    const page = await this.pageRepo.findById(pageId);
    if (!page || page.websiteId !== site.id) {
      throw new WebPageNotFoundError(pageId);
    }

    // Invariant 6: Standard pages cannot be deleted
    if (page.isStandardPage) {
      throw new StandardPageCannotBeDeletedError(page.slug);
    }

    const deleted = await this.pageRepo.delete(pageId);

    await this.eventPublisher.publish(EVENT_TYPES.WEBSITE_PAGE_DELETED, {
      pageId,
      websiteId: site.id,
      tenantId,
      slug: page.slug,
      deletedAt: new Date().toISOString(),
    });

    return deleted;
  }

  // --- Snapshot Publishing & Rollback ---
  async publishWebsite(
    tenantId: string,
    publishedByUserId: string,
    changeSummary: string = "Published latest draft configuration"
  ): Promise<WebsiteSnapshotRecord> {
    const site = await this.getWebsite(tenantId);
    const pages = await this.pageRepo.listByWebsiteId(site.id);

    const nextVersion = (site.publishedVersion || 0) + 1;
    const snapshotId = `snap-${randomUUID().slice(0, 8)}`;

    const snapshot: WebsiteSnapshotRecord = {
      id: snapshotId,
      websiteId: site.id,
      tenantId,
      versionNumber: nextVersion,
      snapshotData: {
        website: JSON.parse(JSON.stringify(site)),
        branding: JSON.parse(JSON.stringify(site.branding)),
        pages: JSON.parse(JSON.stringify(pages)),
        navigation: JSON.parse(JSON.stringify(site.navigation)),
      },
      publishedByUserId,
      changeSummary,
      publishedAt: new Date().toISOString(),
    };

    const savedSnapshot = await this.snapshotRepo.save(snapshot);

    // Update website state to PUBLISHED
    site.status = "PUBLISHED";
    site.activeSnapshotId = savedSnapshot.id;
    site.publishedVersion = nextVersion;
    site.updatedAt = new Date().toISOString();
    await this.websiteRepo.save(site);

    await this.eventPublisher.publish(EVENT_TYPES.WEBSITE_PUBLISHED, {
      websiteId: site.id,
      tenantId,
      snapshotId: savedSnapshot.id,
      versionNumber: nextVersion,
      publishedByUserId,
      changeSummary,
      publishedAt: savedSnapshot.publishedAt,
    });

    return savedSnapshot;
  }

  async unpublishWebsite(tenantId: string): Promise<TenantWebsiteRecord> {
    const site = await this.getWebsite(tenantId);
    site.status = "DRAFT";
    site.updatedAt = new Date().toISOString();
    const saved = await this.websiteRepo.save(site);

    await this.eventPublisher.publish(EVENT_TYPES.WEBSITE_UNPUBLISHED, {
      websiteId: site.id,
      tenantId,
      unpublishedAt: saved.updatedAt,
    });

    return saved;
  }

  async toggleMaintenanceMode(
    tenantId: string,
    enabled: boolean,
    maintenanceMessage?: string
  ): Promise<TenantWebsiteRecord> {
    const site = await this.getWebsite(tenantId);
    site.isMaintenanceMode = enabled;
    if (maintenanceMessage !== undefined) {
      site.maintenanceMessage = WebsiteContentSanitizer.sanitizePlainText(maintenanceMessage);
    }
    site.updatedAt = new Date().toISOString();
    const saved = await this.websiteRepo.save(site);

    await this.eventPublisher.publish(EVENT_TYPES.WEBSITE_MAINTENANCE_TOGGLED, {
      websiteId: site.id,
      tenantId,
      isMaintenanceMode: enabled,
      maintenanceMessage: site.maintenanceMessage,
      toggledAt: saved.updatedAt,
    });

    return saved;
  }

  async rollbackWebsite(
    tenantId: string,
    targetVersionNumber: number,
    rolledBackByUserId: string
  ): Promise<WebsiteSnapshotRecord> {
    const site = await this.getWebsite(tenantId);
    const targetSnapshot = await this.snapshotRepo.findByVersion(site.id, targetVersionNumber);
    if (!targetSnapshot) {
      throw new WebsiteNotFoundError(`Snapshot version ${targetVersionNumber} not found`);
    }

    // Restore draft state from target snapshot
    site.branding = JSON.parse(JSON.stringify(targetSnapshot.snapshotData.branding));
    site.navigation = JSON.parse(JSON.stringify(targetSnapshot.snapshotData.navigation));
    await this.websiteRepo.save(site);

    // Restore pages
    for (const pageData of targetSnapshot.snapshotData.pages) {
      await this.pageRepo.save(JSON.parse(JSON.stringify(pageData)));
    }

    // Now publish a new snapshot representing the rollback
    const newSnapshot = await this.publishWebsite(
      tenantId,
      rolledBackByUserId,
      `Rollback executed to target version v${targetVersionNumber}`
    );

    await this.eventPublisher.publish(EVENT_TYPES.WEBSITE_ROLLBACK_EXECUTED, {
      websiteId: site.id,
      tenantId,
      targetVersionNumber,
      rolledBackByUserId,
      executedAt: new Date().toISOString(),
    });

    return newSnapshot;
  }

  async listSnapshots(tenantId: string): Promise<WebsiteSnapshotRecord[]> {
    const site = await this.getWebsite(tenantId);
    return this.snapshotRepo.listByWebsiteId(site.id);
  }

  // --- Domain Verification & Routing ---
  async registerDomain(tenantId: string, hostname: string): Promise<WebsiteDomainRecord> {
    const normalizedHost = hostname.toLowerCase().trim();

    // Check if domain is already registered anywhere across the platform
    const existing = await this.domainRepo.findByHostname(normalizedHost);
    if (existing) {
      throw new DomainAlreadyRegisteredError(normalizedHost);
    }

    const site = await this.getWebsite(tenantId);

    const verificationToken = `carhire-verify-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const domainRecord: WebsiteDomainRecord = {
      id: `dom-${randomUUID().slice(0, 8)}`,
      tenantId,
      websiteId: site.id,
      hostname: normalizedHost,
      type: "CUSTOM_DOMAIN",
      verificationStatus: "PENDING_VERIFICATION",
      verificationMethod: "DNS_TXT",
      verificationToken,
      expectedTxtRecord: `car-hire-verification=${verificationToken}`,
      expectedCnameRecord: "cname.carhireos.com",
      sslStatus: "INITIALIZING",
      isPrimary: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saved = await this.domainRepo.save(domainRecord);

    await this.eventPublisher.publish(EVENT_TYPES.WEBSITE_DOMAIN_REGISTERED, {
      domainId: saved.id,
      websiteId: site.id,
      tenantId,
      hostname: saved.hostname,
      type: saved.type,
      verificationToken,
      registeredAt: saved.createdAt,
    });

    return saved;
  }

  async verifyDomain(
    tenantId: string,
    domainId: string,
    simulateSuccess: boolean = true
  ): Promise<WebsiteDomainRecord> {
    const domain = await this.domainRepo.findById(domainId);
    if (!domain) {
      throw new DomainNotFoundError(domainId);
    }
    if (domain.tenantId !== tenantId) {
      throw new CrossTenantWebsiteDeniedError(tenantId, domain.tenantId);
    }

    if (!simulateSuccess) {
      domain.verificationStatus = "FAILED";
      domain.sslStatus = "FAILED";
      domain.updatedAt = new Date().toISOString();
      await this.domainRepo.save(domain);
      throw new DomainVerificationFailedError(
        domain.hostname,
        "TXT record matching verification token not found in DNS zone."
      );
    }

    domain.verificationStatus = "VERIFIED";
    domain.sslStatus = "ACTIVE";
    domain.verifiedAt = new Date().toISOString();
    domain.updatedAt = new Date().toISOString();
    const saved = await this.domainRepo.save(domain);

    await this.eventPublisher.publish(EVENT_TYPES.WEBSITE_DOMAIN_VERIFIED, {
      domainId: saved.id,
      websiteId: saved.websiteId,
      tenantId,
      hostname: saved.hostname,
      verifiedAt: saved.verifiedAt,
    });

    return saved;
  }

  async removeDomain(tenantId: string, domainId: string): Promise<boolean> {
    const domain = await this.domainRepo.findById(domainId);
    if (!domain) {
      throw new DomainNotFoundError(domainId);
    }
    if (domain.tenantId !== tenantId) {
      throw new CrossTenantWebsiteDeniedError(tenantId, domain.tenantId);
    }

    const removed = await this.domainRepo.delete(domainId);

    await this.eventPublisher.publish(EVENT_TYPES.WEBSITE_DOMAIN_REMOVED, {
      domainId,
      websiteId: domain.websiteId,
      tenantId,
      hostname: domain.hostname,
      removedAt: new Date().toISOString(),
    });

    return removed;
  }

  async listDomains(tenantId: string): Promise<WebsiteDomainRecord[]> {
    const site = await this.getWebsite(tenantId);
    return this.domainRepo.listByWebsiteId(site.id);
  }
}
