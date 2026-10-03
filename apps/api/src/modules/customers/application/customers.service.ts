// ============================================================================
// CAR HIRE OS — CUSTOMERS APPLICATION SERVICE (DEV-004, DOM-001, DOM-003)
// Individual, VIP & Corporate Customer Orchestration
// ============================================================================

import type {
  Customer,
  CreateCustomerDto,
  UpdateCustomerDto,
  ChangeCustomerStatusDto,
  VerifyCustomerDto,
  CustomerFilterQueryDto,
  PartyDocumentItem,
  PartyStatusHistory,
} from "@carhire/types";
import {
  ICustomerRepository,
  IPartyDocumentRepository,
  IAuditRepository,
  IOutboxRepository,
} from "@carhire/database";
import { CustomerAggregate } from "../domain/customer.aggregate";
import {
  CustomerNotFoundError,
  CustomerDuplicateIdentityError,
} from "../domain/errors/customer.errors";

export class CustomersService {
  constructor(
    private readonly customerRepository: ICustomerRepository,
    private readonly documentRepository: IPartyDocumentRepository,
    private readonly auditRepository: IAuditRepository,
    private readonly outboxRepository: IOutboxRepository
  ) {}

  async createCustomer(
    tenantId: string,
    dto: CreateCustomerDto,
    actorId: string,
    actorName: string
  ): Promise<Customer> {
    // 1. Check for duplicate ID/Passport in the tenant
    const existing = await this.customerRepository.findByIdOrPassport(
      dto.idOrPassportNumber,
      tenantId
    );
    if (existing) {
      throw new CustomerDuplicateIdentityError(dto.idOrPassportNumber);
    }

    // 2. Create customer
    const created = await this.customerRepository.create({
      tenantId,
      customerType: dto.customerType || "INDIVIDUAL",
      fullName: dto.fullName,
      email: dto.email,
      phone: dto.phone,
      idOrPassportNumber: dto.idOrPassportNumber,
      taxPinNumber: dto.taxPinNumber,
      licenseNumber: dto.licenseNumber,
      licenseExpiryDate: dto.licenseExpiryDate,
      nationality: dto.nationality,
      address: dto.address,
      city: dto.city,
      country: dto.country,
      status: "ACTIVE",
      verificationStatus: "UNVERIFIED",
      corporateAccountId: dto.corporateAccountId,
      emergencyContactName: dto.emergencyContactName,
      emergencyContactPhone: dto.emergencyContactPhone,
      emergencyContactRelationship: dto.emergencyContactRelationship,
      tags: dto.tags || [],
      notes: dto.notes,
    });

    // 3. Status History Genesis Record
    await this.documentRepository.recordStatusHistory({
      tenantId,
      partyType: "CUSTOMER",
      partyId: created.id,
      previousStatus: "NONE",
      newStatus: "ACTIVE",
      reason: "Initial Customer Registration",
      actorId,
      actorName,
    });

    // 4. Audit Log
    await this.auditRepository.record({
      tenantId,
      actorType: "USER",
      actorId,
      action: "customer.created",
      resourceType: "Customer",
      resourceId: created.id,
      metadata: {
        customerNumber: created.customerNumber,
        fullName: created.fullName,
        email: created.email,
        customerType: created.customerType,
      },
    });

    // 5. Outbox Event
    await this.outboxRepository.publish({
      tenantId,
      eventType: "customer.created",
      aggregateType: "Customer",
      aggregateId: created.id,
      payload: {
        customer: created,
        createdBy: actorId,
      },
    });

    return created;
  }

  async updateCustomer(
    id: string,
    tenantId: string,
    dto: UpdateCustomerDto,
    actorId: string
  ): Promise<Customer> {
    const existing = await this.customerRepository.findById(id, tenantId);
    if (!existing) {
      throw new CustomerNotFoundError(id);
    }

    const updated = await this.customerRepository.update(
      id,
      tenantId,
      {
        customerType: dto.customerType,
        fullName: dto.fullName,
        email: dto.email,
        phone: dto.phone,
        idOrPassportNumber: dto.idOrPassportNumber,
        taxPinNumber: dto.taxPinNumber,
        licenseNumber: dto.licenseNumber,
        licenseExpiryDate: dto.licenseExpiryDate,
        nationality: dto.nationality,
        address: dto.address,
        city: dto.city,
        country: dto.country,
        corporateAccountId: dto.corporateAccountId,
        emergencyContactName: dto.emergencyContactName,
        emergencyContactPhone: dto.emergencyContactPhone,
        emergencyContactRelationship: dto.emergencyContactRelationship,
        tags: dto.tags,
        notes: dto.notes,
      },
      dto.expectedVersion
    );

    await this.auditRepository.record({
      tenantId,
      actorType: "USER",
      actorId,
      action: "customer.updated",
      resourceType: "Customer",
      resourceId: id,
      metadata: { updatedFields: Object.keys(dto) },
    });

    return updated;
  }

  async changeStatus(
    id: string,
    tenantId: string,
    dto: ChangeCustomerStatusDto,
    actorId: string,
    actorName: string
  ): Promise<Customer> {
    const customer = await this.customerRepository.findById(id, tenantId);
    if (!customer) {
      throw new CustomerNotFoundError(id);
    }

    CustomerAggregate.validateStatusTransition(customer.status, dto.status, dto.reason);

    const updated = await this.customerRepository.update(
      id,
      tenantId,
      {
        status: dto.status,
        notes: dto.reason ? `${customer.notes ? customer.notes + " | " : ""}${dto.reason}` : customer.notes,
      },
      dto.expectedVersion
    );

    // Record Status History
    await this.documentRepository.recordStatusHistory({
      tenantId,
      partyType: "CUSTOMER",
      partyId: id,
      previousStatus: customer.status,
      newStatus: dto.status,
      reason: dto.reason,
      actorId,
      actorName,
    });

    // Audit log
    await this.auditRepository.record({
      tenantId,
      actorType: "USER",
      actorId,
      action: "customer.status_changed",
      resourceType: "Customer",
      resourceId: id,
      metadata: {
        previousStatus: customer.status,
        newStatus: dto.status,
        reason: dto.reason,
      },
    });

    // Outbox event
    await this.outboxRepository.publish({
      tenantId,
      eventType: dto.status === "BLOCKED" ? "customer.blocked" : "customer.status_changed",
      aggregateType: "Customer",
      aggregateId: id,
      payload: {
        customerId: id,
        previousStatus: customer.status,
        newStatus: dto.status,
        reason: dto.reason,
      },
    });

    return updated;
  }

  async verifyKYC(
    id: string,
    tenantId: string,
    dto: VerifyCustomerDto,
    actorId: string,
    actorName: string
  ): Promise<Customer> {
    const customer = await this.customerRepository.findById(id, tenantId);
    if (!customer) {
      throw new CustomerNotFoundError(id);
    }

    CustomerAggregate.validateVerificationTransition(
      customer.verificationStatus,
      dto.verificationStatus
    );

    const updated = await this.customerRepository.update(
      id,
      tenantId,
      {
        verificationStatus: dto.verificationStatus,
      },
      dto.expectedVersion
    );

    await this.auditRepository.record({
      tenantId,
      actorType: "USER",
      actorId,
      action: "customer.kyc_verified",
      resourceType: "Customer",
      resourceId: id,
      metadata: {
        previousVerificationStatus: customer.verificationStatus,
        newVerificationStatus: dto.verificationStatus,
        notes: dto.notes,
      },
    });

    await this.outboxRepository.publish({
      tenantId,
      eventType: "customer.kyc_updated",
      aggregateType: "Customer",
      aggregateId: id,
      payload: {
        customerId: id,
        verificationStatus: dto.verificationStatus,
      },
    });

    return updated;
  }

  async getCustomer(id: string, tenantId: string): Promise<Customer> {
    const customer = await this.customerRepository.findById(id, tenantId);
    if (!customer) {
      throw new CustomerNotFoundError(id);
    }
    return customer;
  }

  async getCustomerDetails(
    id: string,
    tenantId: string
  ): Promise<{
    customer: Customer;
    documents: PartyDocumentItem[];
    statusHistory: PartyStatusHistory[];
  }> {
    const customer = await this.customerRepository.findById(id, tenantId);
    if (!customer) {
      throw new CustomerNotFoundError(id);
    }

    const documents = await this.documentRepository.listForCustomer(id, tenantId);
    const statusHistory = await this.documentRepository.listStatusHistory("CUSTOMER", id, tenantId);

    return {
      customer,
      documents,
      statusHistory,
    };
  }

  async listCustomers(
    tenantId: string,
    query?: CustomerFilterQueryDto
  ): Promise<{ customers: Customer[]; total: number }> {
    return this.customerRepository.findAll(tenantId, query);
  }
}
