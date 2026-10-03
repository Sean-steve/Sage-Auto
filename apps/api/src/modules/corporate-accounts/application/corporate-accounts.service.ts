// ============================================================================
// CAR HIRE OS — CORPORATE ACCOUNTS APPLICATION SERVICE (DEV-004, DOM-001)
// B2B Corporate Client Management & Authorized Driver Operations
// ============================================================================

import type {
  CorporateAccount,
  CreateCorporateAccountDto,
  UpdateCorporateAccountDto,
  CorporateAccountFilterQueryDto,
  AuthorizedCorporateDriver,
} from "@carhire/types";
import {
  ICorporateAccountRepository,
  IAuditRepository,
  IOutboxRepository,
} from "@carhire/database";
import {
  CorporateAccountNotFoundError,
  CorporateDuplicateRegistrationError,
} from "../domain/errors/corporate-account.errors";

export class CorporateAccountsService {
  constructor(
    private readonly corporateRepository: ICorporateAccountRepository,
    private readonly auditRepository: IAuditRepository,
    private readonly outboxRepository: IOutboxRepository
  ) {}

  async createAccount(
    tenantId: string,
    dto: CreateCorporateAccountDto,
    actorId: string
  ): Promise<CorporateAccount> {
    const existing = await this.corporateRepository.findByRegistrationNumber(
      dto.registrationNumber,
      tenantId
    );
    if (existing) {
      throw new CorporateDuplicateRegistrationError(dto.registrationNumber);
    }

    const created = await this.corporateRepository.create({
      tenantId,
      companyName: dto.companyName,
      registrationNumber: dto.registrationNumber,
      taxPinNumber: dto.taxPinNumber,
      contactPerson: dto.contactPerson,
      email: dto.email,
      phone: dto.phone,
      billingAddress: dto.billingAddress,
      creditLimit: dto.creditLimit ?? 0,
      paymentTermsDays: dto.paymentTermsDays ?? 30,
      discountRatePercent: dto.discountRatePercent ?? 0,
      status: "ACTIVE",
      notes: dto.notes,
    });

    await this.auditRepository.record({
      tenantId,
      actorType: "USER",
      actorId,
      action: "corporate_account.created",
      resourceType: "CorporateAccount",
      resourceId: created.id,
      metadata: {
        accountNumber: created.accountNumber,
        companyName: created.companyName,
        creditLimit: created.creditLimit,
      },
    });

    await this.outboxRepository.publish({
      tenantId,
      eventType: "corporate_account.created",
      aggregateType: "CorporateAccount",
      aggregateId: created.id,
      payload: {
        account: created,
        createdBy: actorId,
      },
    });

    return created;
  }

  async updateAccount(
    id: string,
    tenantId: string,
    dto: UpdateCorporateAccountDto,
    actorId: string
  ): Promise<CorporateAccount> {
    const existing = await this.corporateRepository.findById(id, tenantId);
    if (!existing) {
      throw new CorporateAccountNotFoundError(id);
    }

    const updated = await this.corporateRepository.update(
      id,
      tenantId,
      {
        companyName: dto.companyName,
        registrationNumber: dto.registrationNumber,
        taxPinNumber: dto.taxPinNumber,
        contactPerson: dto.contactPerson,
        email: dto.email,
        phone: dto.phone,
        billingAddress: dto.billingAddress,
        creditLimit: dto.creditLimit,
        paymentTermsDays: dto.paymentTermsDays,
        discountRatePercent: dto.discountRatePercent,
        status: dto.status,
        notes: dto.notes,
      },
      dto.expectedVersion
    );

    await this.auditRepository.record({
      tenantId,
      actorType: "USER",
      actorId,
      action: "corporate_account.updated",
      resourceType: "CorporateAccount",
      resourceId: id,
      metadata: { updatedFields: Object.keys(dto) },
    });

    return updated;
  }

  async getAccount(id: string, tenantId: string): Promise<CorporateAccount> {
    const account = await this.corporateRepository.findById(id, tenantId);
    if (!account) {
      throw new CorporateAccountNotFoundError(id);
    }
    return account;
  }

  async listAccounts(
    tenantId: string,
    filter?: CorporateAccountFilterQueryDto
  ): Promise<{ accounts: CorporateAccount[]; total: number }> {
    return this.corporateRepository.findAll(tenantId, filter);
  }

  async authorizeDriver(
    corporateAccountId: string,
    tenantId: string,
    data: { driverId?: string; customerId?: string; roleTitle?: string; isPrimaryContact?: boolean },
    actorId: string
  ): Promise<AuthorizedCorporateDriver> {
    const account = await this.corporateRepository.findById(corporateAccountId, tenantId);
    if (!account) {
      throw new CorporateAccountNotFoundError(corporateAccountId);
    }

    const entry = await this.corporateRepository.addAuthorizedDriver({
      tenantId,
      corporateAccountId,
      driverId: data.driverId,
      customerId: data.customerId,
      roleTitle: data.roleTitle,
      isPrimaryContact: data.isPrimaryContact ?? false,
      status: "ACTIVE",
    });

    await this.auditRepository.record({
      tenantId,
      actorType: "USER",
      actorId,
      action: "corporate_account.driver_authorized",
      resourceType: "CorporateAccount",
      resourceId: corporateAccountId,
      metadata: { authorizedDriverId: entry.id, driverId: data.driverId, customerId: data.customerId },
    });

    return entry;
  }

  async listAuthorizedDrivers(
    corporateAccountId: string,
    tenantId: string
  ): Promise<AuthorizedCorporateDriver[]> {
    const account = await this.corporateRepository.findById(corporateAccountId, tenantId);
    if (!account) {
      throw new CorporateAccountNotFoundError(corporateAccountId);
    }
    return this.corporateRepository.listAuthorizedDrivers(corporateAccountId, tenantId);
  }

  async revokeAuthorizedDriver(
    corporateAccountId: string,
    authorizationId: string,
    tenantId: string,
    actorId: string
  ): Promise<void> {
    await this.corporateRepository.removeAuthorizedDriver(authorizationId, tenantId);
    await this.auditRepository.record({
      tenantId,
      actorType: "USER",
      actorId,
      action: "corporate_account.driver_revoked",
      resourceType: "CorporateAccount",
      resourceId: corporateAccountId,
      metadata: { authorizationId },
    });
  }
}
