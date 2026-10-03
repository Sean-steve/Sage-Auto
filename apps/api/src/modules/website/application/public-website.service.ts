import {
  TenantWebsiteRecord,
  WebPageRecord,
  PublicWebsiteResolvedDto,
  PublicVehicleCatalogueItemDto,
  VehicleRecord,
} from "@car-hire-os/types";
import {
  ITenantWebsiteRepository,
  IWebPageRepository,
  IWebsiteDomainRepository,
  IWebsiteSnapshotRepository,
} from "@car-hire-os/database";
import {
  WebsiteNotFoundError,
  WebsiteUnpublishedError,
  WebPageNotFoundError,
} from "../domain/website.errors";

export interface IVehicleLookupRepository {
  listByTenant?(tenantId: string): Promise<VehicleRecord[]>;
  findAll?(tenantId: string): Promise<{ vehicles: VehicleRecord[]; total?: number } | VehicleRecord[]>;
}

export class PublicWebsiteService {
  constructor(
    private readonly websiteRepo: ITenantWebsiteRepository,
    private readonly pageRepo: IWebPageRepository,
    private readonly domainRepo: IWebsiteDomainRepository,
    private readonly snapshotRepo: IWebsiteSnapshotRepository,
    private readonly vehicleRepo?: IVehicleLookupRepository
  ) {}

  /**
   * Resolves a public website by Host header or subdomain string.
   * Checks custom domains, platform subdomains, and published state.
   */
  async resolveByHost(hostHeader: string): Promise<PublicWebsiteResolvedDto> {
    const cleanHost = hostHeader.toLowerCase().trim().split(":")[0]; // Strip port if present

    let website: TenantWebsiteRecord | null = null;

    // 1. Check custom domain table
    const domainRecord = await this.domainRepo.findByHostname(cleanHost);
    if (domainRecord && domainRecord.verificationStatus === "VERIFIED") {
      website = await this.websiteRepo.findById(domainRecord.websiteId);
    }

    // 2. Check subdomain if format is <subdomain>.platform or query
    if (!website) {
      const parts = cleanHost.split(".");
      if (parts.length > 1) {
        const potentialSubdomain = parts[0];
        website = await this.websiteRepo.findBySubdomain(potentialSubdomain);
      }
    }

    // 3. Fallback: match direct subdomain match if single word passed
    if (!website) {
      website = await this.websiteRepo.findBySubdomain(cleanHost);
    }

    if (!website) {
      throw new WebsiteNotFoundError(cleanHost);
    }

    // Invariant 1: Unconfigured or draft sites cannot be viewed publicly
    if (website.status !== "PUBLISHED" || website.isMaintenanceMode) {
      throw new WebsiteUnpublishedError(cleanHost);
    }

    // Retrieve active published snapshot to guarantee draft isolation
    let activePages: Array<{
      id: string;
      slug: string;
      title: string;
      pageType: any;
      displayOrder: number;
    }> = [];

    let publishedBranding = website.branding;
    let publishedNav = website.navigation;

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

    return {
      tenantId: website.tenantId,
      websiteId: website.id,
      subdomain: website.subdomain,
      hostname: cleanHost,
      status: website.status,
      isMaintenanceMode: Boolean(website.isMaintenanceMode),
      maintenanceMessage: website.maintenanceMessage,
      publishedVersion: website.publishedVersion || 1,
      branding: publishedBranding,
      navigation: publishedNav,
      activePages,
    };
  }

  /**
   * Retrieves full page content for a public visitor by slug
   * Isolates from draft changes using published snapshot data when available.
   */
  async getPublishedPage(tenantId: string, slug: string): Promise<WebPageRecord> {
    const website = await this.websiteRepo.findByTenantId(tenantId);
    if (!website || website.status !== "PUBLISHED" || website.isMaintenanceMode) {
      throw new WebsiteUnpublishedError(tenantId);
    }

    const normalizedSlug = slug.startsWith("/") ? slug : `/${slug}`;

    if (website.activeSnapshotId) {
      const snapshot = await this.snapshotRepo.findById(website.activeSnapshotId);
      if (snapshot) {
        const found = snapshot.snapshotData.pages.find(
          (p) => p.slug === normalizedSlug && p.status === "PUBLISHED"
        );
        if (found) {
          return found;
        }
      }
    }

    // Fallback to active published page record in repository
    const page = await this.pageRepo.findBySlug(website.id, normalizedSlug);
    if (!page || page.status !== "PUBLISHED") {
      throw new WebPageNotFoundError(normalizedSlug);
    }
    return page;
  }

  /**
   * Retrieves public vehicle catalogue, filtering out non-rentable or decommissioned vehicles.
   */
  async getPublicCatalogue(
    tenantId: string,
    categoryFilter?: string
  ): Promise<PublicVehicleCatalogueItemDto[]> {
    const website = await this.websiteRepo.findByTenantId(tenantId);
    if (!website || website.status !== "PUBLISHED" || website.isMaintenanceMode) throw new WebsiteUnpublishedError(tenantId);
    if (!this.vehicleRepo) {
      return [];
    }

    let allVehicles: VehicleRecord[] = [];
    if (this.vehicleRepo.listByTenant) {
      allVehicles = await this.vehicleRepo.listByTenant(tenantId);
    } else if (this.vehicleRepo.findAll) {
      const res = await this.vehicleRepo.findAll(tenantId);
      allVehicles = Array.isArray(res) ? res : res.vehicles;
    }

    // Invariant 4: Filter out DECOMMISSIONED, ARCHIVED, or non-active vehicles
    const rentableVehicles = allVehicles.filter((v) => {
      const status = ((v as any).status || "").toUpperCase();
      const lifecycle = (v.lifecycleStatus || "").toUpperCase();
      const availability = (v.availabilityStatus || "").toUpperCase();
      if (lifecycle === "DECOMMISSIONED" || lifecycle === "SOLD" || lifecycle === "RETIRED" || lifecycle === "INACTIVE") {
        return false;
      }
      if (status === "DECOMMISSIONED" || status === "MAINTENANCE") {
        return false;
      }
      if (availability === "MAINTENANCE" || availability === "BLOCKED") {
        return false;
      }
      return true;
    });

    return rentableVehicles
      .filter((v) => {
        if (!categoryFilter || categoryFilter.toUpperCase() === "ALL") return true;
        return (v.category || "").toLowerCase() === categoryFilter.toLowerCase();
      })
      .map((v) => {
        const primaryImg = (v as any).primaryImageUrl || (v as any).imageUrl || "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800&auto=format&fit=crop&q=80";
        return {
          id: v.id,
          tenantId: v.tenantId,
          make: v.make,
          model: v.model,
          year: v.year,
          category: v.category || "Sedan",
          transmission: (v as any).transmission || "Automatic",
          fuelType: (v as any).fuelType || "Petrol",
          seats: (v as any).seats || 5,
          dailyRate: (v as any).dailyRate || (v as any).pricing?.dailyRate || 85,
          currency: (v as any).currency || "GBP",
          currencySymbol: (v as any).currencySymbol || "£",
          isAvailable: (v as any).isAvailable !== undefined ? (v as any).isAvailable : true,
          primaryImageUrl: primaryImg,
          thumbnailUrl: (v as any).thumbnailUrl || primaryImg,
          mediumUrl: (v as any).mediumUrl || primaryImg,
          largeUrl: (v as any).largeUrl || primaryImg,
          badges: (v as any).badges || ["Instant Book", "Zero Deposit"],
          features: (v as any).features || ["GPS Navigation", "Bluetooth", "Air Conditioning", "USB Charger"],
        };
      });
  }

  /**
   * Generates a compliant XML sitemap for SEO discovery (Invariant 8)
   */
  async generateSitemapXml(tenantId: string, baseUrl: string): Promise<string> {
    const website = await this.websiteRepo.findByTenantId(tenantId);
    if (!website) {
      throw new WebsiteNotFoundError(tenantId);
    }

    const pages = await this.pageRepo.listByWebsiteId(website.id);
    const publishedPages = pages.filter((p) => p.status === "PUBLISHED" && !p.seoConfig.noIndex);

    const cleanBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;

    const urlsXml = publishedPages
      .map((p) => {
        const pageLoc = p.slug === "/" ? cleanBaseUrl : `${cleanBaseUrl}${p.slug}`;
        const lastMod = p.updatedAt ? p.updatedAt.split("T")[0] : new Date().toISOString().split("T")[0];
        const priority = p.slug === "/" ? "1.0" : p.slug === "/fleet" ? "0.9" : "0.7";
        return `  <url>\n    <loc>${pageLoc}</loc>\n    <lastmod>${lastMod}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
      })
      .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlsXml}\n</urlset>`;
  }

  /**
   * Generates a robots.txt payload with sitemap reference
   */
  async generateRobotsTxt(tenantId: string, baseUrl: string): Promise<string> {
    const cleanBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    return `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin/\n\nSitemap: ${cleanBaseUrl}/sitemap.xml\n`;
  }
}
