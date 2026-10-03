// ============================================================================
// CAR HIRE OS — WEBSITE CMS & BRANDING MODULE (ARCH-001, DEV-008, SEC-001)
// Bounded context module for Tenant Website, Branding, Custom Domains & Storefront
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import {
  ITenantWebsiteRepository,
  InMemoryTenantWebsiteRepository,
  IWebPageRepository,
  InMemoryWebPageRepository,
  IWebsiteDomainRepository,
  InMemoryWebsiteDomainRepository,
  IWebsiteSnapshotRepository,
  InMemoryWebsiteSnapshotRepository,
} from "@car-hire-os/database";
import { TenantWebsiteService, IEventPublisher, DefaultEventPublisher } from "./application/tenant-website.service";
import { PublicWebsiteService, IVehicleLookupRepository } from "./application/public-website.service";
import { createTenantWebsiteController } from "./presentation/tenant-website.controller";
import { createPublicWebsiteController } from "./presentation/public-website.controller";

export interface WebsiteModuleDependencies {
  websiteRepo?: ITenantWebsiteRepository;
  pageRepo?: IWebPageRepository;
  domainRepo?: IWebsiteDomainRepository;
  snapshotRepo?: IWebsiteSnapshotRepository;
  vehicleRepo?: IVehicleLookupRepository;
  eventPublisher?: IEventPublisher;
  permissionGuard?: (perm: string) => (req: Request, res: Response, next: NextFunction) => void;
}

export class WebsiteModule {
  public readonly websiteRepo: ITenantWebsiteRepository;
  public readonly pageRepo: IWebPageRepository;
  public readonly domainRepo: IWebsiteDomainRepository;
  public readonly snapshotRepo: IWebsiteSnapshotRepository;

  public readonly websiteService: TenantWebsiteService;
  public readonly publicWebsiteService: PublicWebsiteService;

  public readonly tenantRouter: Router;
  public readonly publicRouter: Router;

  constructor(deps: WebsiteModuleDependencies = {}) {
    this.websiteRepo = deps.websiteRepo || new InMemoryTenantWebsiteRepository();
    this.pageRepo = deps.pageRepo || new InMemoryWebPageRepository();
    this.domainRepo = deps.domainRepo || new InMemoryWebsiteDomainRepository();
    this.snapshotRepo = deps.snapshotRepo || new InMemoryWebsiteSnapshotRepository();

    const eventPublisher = deps.eventPublisher || new DefaultEventPublisher();

    this.websiteService = new TenantWebsiteService(
      this.websiteRepo,
      this.pageRepo,
      this.domainRepo,
      this.snapshotRepo,
      eventPublisher
    );

    this.publicWebsiteService = new PublicWebsiteService(
      this.websiteRepo,
      this.pageRepo,
      this.domainRepo,
      this.snapshotRepo,
      deps.vehicleRepo
    );

    this.tenantRouter = createTenantWebsiteController(
      this.websiteService,
      deps.permissionGuard
    );

    this.publicRouter = createPublicWebsiteController(
      this.publicWebsiteService
    );
  }
}
