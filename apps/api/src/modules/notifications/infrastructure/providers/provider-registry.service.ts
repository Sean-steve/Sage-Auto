// ============================================================================
// CAR HIRE OS — NOTIFICATION PROVIDER REGISTRY (DEV-012, SPRINT 32)
// Provider resolution and fallback orchestration
// ============================================================================

import { NotificationChannel } from "@car-hire-os/types";
import { INotificationProvider } from "../../domain/ports/notification-provider.port";
import { MockNotificationProvider } from "./mock-notification.provider";
import { EmailNotificationProvider } from "./email.provider";
import { SmsNotificationProvider } from "./sms.provider";
import { WhatsAppNotificationProvider } from "./whatsapp.provider";
import { INotificationProviderConfigRepository } from "@car-hire-os/database";

export class ProviderRegistryService {
  private providers: Map<string, INotificationProvider> = new Map();
  private mockProvider: MockNotificationProvider;
  private configRepo?: INotificationProviderConfigRepository;
  private defaultChannelProviders: Map<NotificationChannel, string> = new Map();

  private isProductionLike(): boolean {
    const envName = (process.env.APP_ENV || process.env.NODE_ENV || "development").toLowerCase();
    return envName === "production" || envName === "staging";
  }

  constructor(
    configRepo?: INotificationProviderConfigRepository,
    mockProvider?: MockNotificationProvider,
    options: { useMockAsDefault?: boolean } = {}
  ) {
    this.configRepo = configRepo;
    this.mockProvider = mockProvider || new MockNotificationProvider();

    // Register built-in providers
    this.registerProvider(this.mockProvider);
    this.registerProvider(new EmailNotificationProvider());
    this.registerProvider(new SmsNotificationProvider());
    this.registerProvider(new WhatsAppNotificationProvider());

    const shouldUseMockAsDefault = this.isProductionLike() ? false : options.useMockAsDefault;

    if (shouldUseMockAsDefault) {
      this.defaultChannelProviders.set("EMAIL", this.mockProvider.name);
      this.defaultChannelProviders.set("SMS", this.mockProvider.name);
      this.defaultChannelProviders.set("WHATSAPP", this.mockProvider.name);
    } else {
      this.defaultChannelProviders.set("EMAIL", "EMAIL_PROVIDER");
      this.defaultChannelProviders.set("SMS", "SMS_PROVIDER");
      this.defaultChannelProviders.set("WHATSAPP", "WHATSAPP_PROVIDER");
    }
  }

  public registerProvider(provider: INotificationProvider): void {
    this.providers.set(provider.name, provider);
  }

  public setDefaultProviderForChannel(channel: NotificationChannel, providerName: string): void {
    this.defaultChannelProviders.set(channel, providerName);
  }

  public getMockProvider(): MockNotificationProvider {
    return this.mockProvider;
  }

  /**
   * Resolves the active provider for a tenant and channel
   */
  public async resolveProvider(
    tenantId: string,
    channel: NotificationChannel
  ): Promise<INotificationProvider> {
    if (this.configRepo) {
      const config = await this.configRepo.findByTenantAndChannel(tenantId, channel);
      if (config && config.isEnabled) {
        const found = this.providers.get(config.providerName);
        if (found && found.supportedChannels.includes(channel)) {
          return found;
        }
      }
    }

    const defaultProviderName = this.defaultChannelProviders.get(channel);
    if (defaultProviderName && this.providers.has(defaultProviderName)) {
      if (this.isProductionLike() && defaultProviderName === this.mockProvider.name) {
        throw new Error(
          "Production and staging require explicit notification providers; MOCK_PROVIDER is forbidden."
        );
      }
      return this.providers.get(defaultProviderName)!;
    }

    if (this.isProductionLike()) {
      throw new Error(
        `No notification provider configured for channel '${channel}' in production; explicit provider configuration is required.`
      );
    }

    return this.mockProvider;
  }

  public getProviderByName(name: string): INotificationProvider | undefined {
    if (this.isProductionLike() && name === this.mockProvider.name) {
      throw new Error(
        "Production and staging require explicit notification providers; MOCK_PROVIDER is forbidden."
      );
    }
    return this.providers.get(name);
  }
}
