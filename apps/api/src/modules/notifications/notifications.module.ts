// ============================================================================
// CAR HIRE OS — NOTIFICATIONS MODULE (DEV-012, SPRINT 32)
// Complete communication orchestration engine: multi-channel delivery,
// policy consumer, templates, preferences, suppressions & receipts
// ============================================================================

import { Router } from "express";
import {
  InMemoryNotificationRepository,
  InMemoryNotificationReceiptRepository,
  InMemoryNotificationTemplateRepository,
  InMemoryCommunicationPreferenceRepository,
  InMemoryNotificationSuppressionRepository,
  InMemoryNotificationProviderConfigRepository,
  INotificationRepository,
  INotificationReceiptRepository,
  INotificationTemplateRepository,
  ICommunicationPreferenceRepository,
  INotificationSuppressionRepository,
  INotificationProviderConfigRepository,
  ITenantRepository,
  ITenantWebsiteRepository,
  IWebsiteDomainRepository,
} from "@car-hire-os/database";
import { IEventBus } from "../../infrastructure/events/event-bus";
import { ProviderRegistryService } from "./infrastructure/providers/provider-registry.service";
import { NotificationOrchestratorService } from "./application/services/notification-orchestrator.service";
import { NotificationPolicyConsumer } from "./application/services/notification-policy-consumer";
import { createNotificationController } from "./presentation/notification.controller";

export interface NotificationsModuleOptions {
  eventBus?: IEventBus;
  tenantRepo?: ITenantRepository;
  websiteRepo?: ITenantWebsiteRepository;
  domainRepo?: IWebsiteDomainRepository;
  notificationRepo?: INotificationRepository;
  receiptRepo?: INotificationReceiptRepository;
  templateRepo?: INotificationTemplateRepository;
  preferenceRepo?: ICommunicationPreferenceRepository;
  suppressionRepo?: INotificationSuppressionRepository;
  providerConfigRepo?: INotificationProviderConfigRepository;
}

export class NotificationsModule {
  public readonly router: Router;
  public readonly orchestrator: NotificationOrchestratorService;
  public readonly policyConsumer: NotificationPolicyConsumer;
  public readonly providerRegistry: ProviderRegistryService;

  public readonly notificationRepo: INotificationRepository;
  public readonly receiptRepo: INotificationReceiptRepository;
  public readonly templateRepo: INotificationTemplateRepository;
  public readonly preferenceRepo: ICommunicationPreferenceRepository;
  public readonly suppressionRepo: INotificationSuppressionRepository;
  public readonly providerConfigRepo: INotificationProviderConfigRepository;

  constructor(options: NotificationsModuleOptions = {}) {
    this.notificationRepo = options.notificationRepo || new InMemoryNotificationRepository();
    this.receiptRepo = options.receiptRepo || new InMemoryNotificationReceiptRepository();
    this.templateRepo = options.templateRepo || new InMemoryNotificationTemplateRepository();
    this.preferenceRepo = options.preferenceRepo || new InMemoryCommunicationPreferenceRepository();
    this.suppressionRepo = options.suppressionRepo || new InMemoryNotificationSuppressionRepository();
    this.providerConfigRepo = options.providerConfigRepo || new InMemoryNotificationProviderConfigRepository();

    this.providerRegistry = new ProviderRegistryService(this.providerConfigRepo);

    this.orchestrator = new NotificationOrchestratorService(
      this.notificationRepo,
      this.receiptRepo,
      this.templateRepo,
      this.preferenceRepo,
      this.suppressionRepo,
      this.providerRegistry,
      options.eventBus,
      options.tenantRepo,
      options.websiteRepo,
      options.domainRepo
    );

    this.policyConsumer = new NotificationPolicyConsumer(this.orchestrator);

    // Register consumer with EventBus if available
    if (options.eventBus) {
      options.eventBus.subscribe(this.policyConsumer);
    }

    // Seed default system notification templates asynchronously
    this.orchestrator.initializeDefaultTemplates().catch((err) => {
      console.error("[NotificationsModule] Failed to seed default templates:", err);
    });

    this.router = createNotificationController(
      this.orchestrator,
      this.notificationRepo,
      this.receiptRepo,
      this.templateRepo,
      this.preferenceRepo,
      this.suppressionRepo,
      this.providerRegistry
    );
  }
}
