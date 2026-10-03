// ============================================================================
// CAR HIRE OS — DOMAINS BOUNDED CONTEXT MODULE (ARCH-001, TEN-001, DEV-008)
// Encapsulates Subdomains, Custom Domains, DNS Verification & Host Resolution
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import {
  IWebsiteDomainRepository,
  InMemoryWebsiteDomainRepository,
  ITenantWebsiteRepository,
  InMemoryTenantWebsiteRepository,
  IWebPageRepository,
  InMemoryWebPageRepository,
  IWebsiteSnapshotRepository,
  InMemoryWebsiteSnapshotRepository,
  ITenantRepository,
} from "@car-hire-os/database";
import { DomainService, IEntitlementEngine } from "./application/domain.service";
import { HostResolutionService } from "./application/host-resolution.service";
import { DnsVerificationService } from "./application/domain-verification.service";
import {
  createTenantDomainController,
  createPublicResolutionController,
} from "./presentation/domain.controller";
import { IEventPublisher, DefaultEventPublisher } from "../website/application/tenant-website.service";

export interface DomainsModuleDependencies {
  domainRepo?: IWebsiteDomainRepository;
  websiteRepo?: ITenantWebsiteRepository;
  pageRepo?: IWebPageRepository;
  snapshotRepo?: IWebsiteSnapshotRepository;
  tenantRepo?: ITenantRepository;
  entitlementEngine?: IEntitlementEngine;
  dnsService?: DnsVerificationService;
  eventPublisher?: IEventPublisher;
  platformBaseDomain?: string;
  permissionGuard?: (perm: string) => (req: Request, res: Response, next: NextFunction) => void;
}

export class DomainsModule {
  public readonly domainRepo: IWebsiteDomainRepository;
  public readonly websiteRepo: ITenantWebsiteRepository;
  public readonly pageRepo: IWebPageRepository;
  public readonly snapshotRepo: IWebsiteSnapshotRepository;

  public readonly domainService: DomainService;
  public readonly hostResolutionService: HostResolutionService;
  public readonly dnsVerificationService: DnsVerificationService;

  public readonly tenantRouter: Router;
  public readonly publicRouter: Router;

  constructor(deps: DomainsModuleDependencies = {}) {
    this.domainRepo = deps.domainRepo || new InMemoryWebsiteDomainRepository();
    this.websiteRepo = deps.websiteRepo || new InMemoryTenantWebsiteRepository();
    this.pageRepo = deps.pageRepo || new InMemoryWebPageRepository();
    this.snapshotRepo = deps.snapshotRepo || new InMemoryWebsiteSnapshotRepository();

    const baseDomain = deps.platformBaseDomain || "carhireos.com";
    this.dnsVerificationService = deps.dnsService || new DnsVerificationService(`cname.${baseDomain}`);

    this.domainService = new DomainService(
      this.domainRepo,
      this.websiteRepo,
      {
        platformBaseDomain: baseDomain,
        dnsService: this.dnsVerificationService,
        eventPublisher: deps.eventPublisher || new DefaultEventPublisher(),
        entitlementEngine: deps.entitlementEngine,
      }
    );

    this.hostResolutionService = new HostResolutionService(
      this.domainRepo,
      this.websiteRepo,
      this.pageRepo,
      this.snapshotRepo,
      deps.tenantRepo,
      {
        platformBaseDomain: baseDomain,
      }
    );

    this.tenantRouter = createTenantDomainController(
      this.domainService,
      deps.permissionGuard
    );

    this.publicRouter = createPublicResolutionController(
      this.hostResolutionService
    );
  }
}
