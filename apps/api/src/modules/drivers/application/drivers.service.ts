// ============================================================================
// CAR HIRE OS — DRIVERS APPLICATION SERVICE (DEV-004, DOM-001, DOM-003)
// Commercial, Chauffeur & Designated Driver Orchestration
// ============================================================================

import type {
  Driver,
  CreateDriverDto,
  UpdateDriverDto,
  ChangeDriverStatusDto,
  VerifyDriverDto,
  DriverFilterQueryDto,
  CustomerDriverRelationship,
  PartyDocumentItem,
  PartyStatusHistory,
} from "@carhire/types";
import {
  IDriverRepository,
  ICustomerRepository,
  IPartyDocumentRepository,
  IAuditRepository,
  IOutboxRepository,
} from "@carhire/database";
import { DriverAggregate } from "../domain/driver.aggregate";
import {
  DriverNotFoundError,
  DriverDuplicateLicenseError,
} from "../domain/errors/driver.errors";

export class DriversService {
  constructor(
    private readonly driverRepository: IDriverRepository,
    private readonly documentRepository: IPartyDocumentRepository,
    private readonly auditRepository: IAuditRepository,
    private readonly outboxRepository: IOutboxRepository,
    private readonly customerRepository?: ICustomerRepository
  ) {}

  async createDriver(
    tenantId: string,
    dto: CreateDriverDto,
    actorId: string,
    actorName: string
  ): Promise<Driver> {
    const existing = await this.driverRepository.findByLicenseNumber(
      dto.licenseNumber,
      tenantId
    );
    if (existing) {
      throw new DriverDuplicateLicenseError(dto.licenseNumber);
    }

    const created = await this.driverRepository.create({
      tenantId,
      fullName: dto.fullName,
      email: dto.email,
      phone: dto.phone,
      nationalId: dto.nationalId,
      licenseNumber: dto.licenseNumber,
      licenseClasses: dto.licenseClasses || ["B", "C"],
      licenseExpiryDate: dto.licenseExpiryDate,
      badgeNumber: dto.badgeNumber,
      medicalExpiryDate: dto.medicalExpiryDate,
      verificationStatus: "UNVERIFIED",
      status: "ACTIVE",
      rating: 5.0,
      emergencyContactName: dto.emergencyContactName,
      emergencyContactPhone: dto.emergencyContactPhone,
      notes: dto.notes,
    });

    await this.documentRepository.recordStatusHistory({
      tenantId,
      partyType: "DRIVER",
      partyId: created.id,
      previousStatus: "NONE",
      newStatus: "ACTIVE",
      reason: "Initial Driver Onboarding",
      actorId,
      actorName,
    });

    await this.auditRepository.record({
      tenantId,
      actorType: "USER",
      actorId,
      action: "driver.created",
      resourceType: "Driver",
      resourceId: created.id,
      metadata: {
        driverNumber: created.driverNumber,
        fullName: created.fullName,
        licenseNumber: created.licenseNumber,
      },
    });

    await this.outboxRepository.publish({
      tenantId,
      eventType: "driver.created",
      aggregateType: "Driver",
      aggregateId: created.id,
      payload: {
        driver: created,
        createdBy: actorId,
      },
    });

    return created;
  }

  async updateDriver(
    id: string,
    tenantId: string,
    dto: UpdateDriverDto,
    actorId: string
  ): Promise<Driver> {
    const existing = await this.driverRepository.findById(id, tenantId);
    if (!existing) {
      throw new DriverNotFoundError(id);
    }

    const updated = await this.driverRepository.update(
      id,
      tenantId,
      {
        fullName: dto.fullName,
        email: dto.email,
        phone: dto.phone,
        nationalId: dto.nationalId,
        licenseNumber: dto.licenseNumber,
        licenseClasses: dto.licenseClasses,
        licenseExpiryDate: dto.licenseExpiryDate,
        badgeNumber: dto.badgeNumber,
        medicalExpiryDate: dto.medicalExpiryDate,
        status: dto.status,
        emergencyContactName: dto.emergencyContactName,
        emergencyContactPhone: dto.emergencyContactPhone,
        notes: dto.notes,
      },
      dto.expectedVersion
    );

    await this.auditRepository.record({
      tenantId,
      actorType: "USER",
      actorId,
      action: "driver.updated",
      resourceType: "Driver",
      resourceId: id,
      metadata: { updatedFields: Object.keys(dto) },
    });

    return updated;
  }

  async changeStatus(
    id: string,
    tenantId: string,
    dto: ChangeDriverStatusDto,
    actorId: string,
    actorName: string
  ): Promise<Driver> {
    const driver = await this.driverRepository.findById(id, tenantId);
    if (!driver) {
      throw new DriverNotFoundError(id);
    }

    DriverAggregate.validateStatusTransition(driver.status, dto.status, dto.reason);

    const updated = await this.driverRepository.update(
      id,
      tenantId,
      {
        status: dto.status,
        notes: dto.reason ? `${driver.notes ? driver.notes + " | " : ""}${dto.reason}` : driver.notes,
      },
      dto.expectedVersion
    );

    await this.documentRepository.recordStatusHistory({
      tenantId,
      partyType: "DRIVER",
      partyId: id,
      previousStatus: driver.status,
      newStatus: dto.status,
      reason: dto.reason,
      actorId,
      actorName,
    });

    await this.auditRepository.record({
      tenantId,
      actorType: "USER",
      actorId,
      action: "driver.status_changed",
      resourceType: "Driver",
      resourceId: id,
      metadata: {
        previousStatus: driver.status,
        newStatus: dto.status,
        reason: dto.reason,
      },
    });

    await this.outboxRepository.publish({
      tenantId,
      eventType: "driver.status_changed",
      aggregateType: "Driver",
      aggregateId: id,
      payload: {
        driverId: id,
        previousStatus: driver.status,
        newStatus: dto.status,
        reason: dto.reason,
      },
    });

    return updated;
  }

  async verifyDriver(
    id: string,
    tenantId: string,
    dto: VerifyDriverDto,
    actorId: string
  ): Promise<Driver> {
    const driver = await this.driverRepository.findById(id, tenantId);
    if (!driver) {
      throw new DriverNotFoundError(id);
    }

    const updated = await this.driverRepository.update(
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
      action: "driver.verified",
      resourceType: "Driver",
      resourceId: id,
      metadata: { verificationStatus: dto.verificationStatus },
    });

    return updated;
  }

  async getDriver(id: string, tenantId: string): Promise<Driver> {
    const driver = await this.driverRepository.findById(id, tenantId);
    if (!driver) {
      throw new DriverNotFoundError(id);
    }
    return driver;
  }

  async getDriverDetails(
    id: string,
    tenantId: string
  ): Promise<{
    driver: Driver;
    documents: PartyDocumentItem[];
    statusHistory: PartyStatusHistory[];
  }> {
    const driver = await this.driverRepository.findById(id, tenantId);
    if (!driver) {
      throw new DriverNotFoundError(id);
    }

    const documents = await this.documentRepository.listForDriver(id, tenantId);
    const statusHistory = await this.documentRepository.listStatusHistory("DRIVER", id, tenantId);

    return {
      driver,
      documents,
      statusHistory,
    };
  }

  async listDrivers(
    tenantId: string,
    query?: DriverFilterQueryDto
  ): Promise<{ drivers: Driver[]; total: number }> {
    return this.driverRepository.findAll(tenantId, query);
  }

  // Customer-Driver linking
  async linkDriverToCustomer(
    tenantId: string,
    customerId: string,
    driverId: string,
    relationshipType: "PERSONAL_CHAUFFEUR" | "FAMILY_MEMBER" | "CORPORATE_DESIGNATED" | "OTHER" = "PERSONAL_CHAUFFEUR",
    isDefault: boolean = false,
    actorId?: string
  ): Promise<CustomerDriverRelationship> {
    const driver = await this.driverRepository.findById(driverId, tenantId);
    if (!driver) throw new DriverNotFoundError(driverId);
    if (this.customerRepository) {
      const customer = await this.customerRepository.findById(customerId, tenantId);
      if (!customer) {
        const err: any = new Error(`Customer ${customerId} was not found in the selected tenant.`);
        err.statusCode = 404;
        throw err;
      }
    }
    const relationship = await this.driverRepository.linkCustomerDriver({
      tenantId,
      customerId,
      driverId,
      relationshipType,
      isDefault,
      status: "ACTIVE",
    });
    if (actorId) {
      await this.auditRepository.record({
        tenantId,
        actorType: "USER",
        actorId,
        action: "driver.customer_linked",
        resourceType: "CustomerDriverRelationship",
        resourceId: relationship.id,
        metadata: { customerId, driverId, relationshipType, isDefault },
      });
      await this.outboxRepository.publish({
        tenantId,
        eventType: "driver.customer_linked",
        aggregateType: "CustomerDriverRelationship",
        aggregateId: relationship.id,
        payload: { customerId, driverId, relationshipType, isDefault },
      });
    }
    return relationship;
  }

  async listCustomerDrivers(
    customerId: string,
    tenantId: string
  ): Promise<CustomerDriverRelationship[]> {
    if (this.customerRepository) {
      const customer = await this.customerRepository.findById(customerId, tenantId);
      if (!customer) {
        const err: any = new Error(`Customer ${customerId} was not found in the selected tenant.`);
        err.statusCode = 404;
        throw err;
      }
    }
    return this.driverRepository.listCustomerDrivers(customerId, tenantId);
  }

  async unlinkDriverFromCustomer(
    relationshipId: string,
    tenantId: string,
    actorId?: string
  ): Promise<void> {
    await this.driverRepository.unlinkCustomerDriver(relationshipId, tenantId);
    if (actorId) {
      await this.auditRepository.record({
        tenantId,
        actorType: "USER",
        actorId,
        action: "driver.customer_unlinked",
        resourceType: "CustomerDriverRelationship",
        resourceId: relationshipId,
      });
      await this.outboxRepository.publish({
        tenantId,
        eventType: "driver.customer_unlinked",
        aggregateType: "CustomerDriverRelationship",
        aggregateId: relationshipId,
        payload: { relationshipId },
      });
    }
  }
}
