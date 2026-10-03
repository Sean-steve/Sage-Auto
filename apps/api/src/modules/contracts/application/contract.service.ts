// ============================================================================
// CAR HIRE OS — CONTRACT APPLICATION SERVICE (DOM-003 §17, DEV-006, DEV-007, BRS-001)
// Bounded Context: Contracts & Legal Instruments
// ============================================================================

import type {
  RentalContract,
  ContractStatus,
  ContractTermsSnapshot,
  GenerateContractDto,
  SignContractDto,
  SendContractDto,
  ContractListQueryDto,
  ContractSignature,
  ContractVersionRecord,
} from "@carhire/types";
import {
  IContractRepository,
  ContractRepository,
  IBookingRepository,
  BookingRepository,
  ICustomerRepository,
  CustomerRepository,
  IDriverRepository,
  DriverRepository,
  IVehicleRepository,
  VehicleRepository,
  IAuditRepository,
  AuditRepository,
  IOutboxRepository,
  OutboxRepository,
  IIdempotencyRepository,
  IdempotencyRepository,
  ContractNotFoundError,
  BookingNotFoundError,
  ContractImmutableError,
  RecordNotFoundError,
} from "@carhire/database";
import { ContractStateMachine } from "../domain/contract-state-machine";

export interface ContractActor {
  userId: string;
  actorType?: "USER" | "SYSTEM" | "CUSTOMER" | "AGENT" | "PLATFORM_STAFF";
  name?: string;
}

function toAuditActorType(
  actorType?: string
): "USER" | "SYSTEM" | "SUPPORT" | "API_KEY" | "ANONYMOUS" | "PLATFORM_STAFF" {
  if (
    actorType === "PLATFORM_STAFF" ||
    actorType === "SYSTEM" ||
    actorType === "SUPPORT" ||
    actorType === "API_KEY" ||
    actorType === "ANONYMOUS"
  ) {
    return actorType;
  }
  return "USER";
}

export class ContractService {
  private readonly contractRepo: IContractRepository;
  private readonly bookingRepo: IBookingRepository;
  private readonly customerRepo: ICustomerRepository;
  private readonly driverRepo: IDriverRepository;
  private readonly vehicleRepo: IVehicleRepository;
  private readonly auditRepo: IAuditRepository;
  private readonly outboxRepo: IOutboxRepository;
  private readonly idempotencyRepo: IIdempotencyRepository;

  constructor(
    contractRepo?: IContractRepository,
    bookingRepo?: IBookingRepository,
    customerRepo?: ICustomerRepository,
    driverRepo?: IDriverRepository,
    vehicleRepo?: IVehicleRepository,
    auditRepo?: IAuditRepository,
    outboxRepo?: IOutboxRepository,
    idempotencyRepo?: IIdempotencyRepository
  ) {
    this.contractRepo = contractRepo || new ContractRepository();
    this.bookingRepo = bookingRepo || new BookingRepository();
    this.customerRepo = customerRepo || new CustomerRepository();
    this.driverRepo = driverRepo || new DriverRepository();
    this.vehicleRepo = vehicleRepo || new VehicleRepository();
    this.auditRepo = auditRepo || new AuditRepository();
    this.outboxRepo = outboxRepo || new OutboxRepository();
    this.idempotencyRepo = idempotencyRepo || new IdempotencyRepository();
  }

  /**
   * Generates a binding rental contract from a confirmed commercial booking
   */
  async generateContract(
    tenantId: string,
    dto: GenerateContractDto,
    actor?: ContractActor
  ): Promise<RentalContract> {
    // 1. Idempotency Check
    if (dto.idempotencyKey) {
      const cached = await this.idempotencyRepo.findByKey(tenantId, dto.idempotencyKey);
      if (cached && cached.responseBody) {
        return cached.responseBody as unknown as RentalContract;
      }
    }

    // 2. Fetch and validate booking
    const booking = await this.bookingRepo.findById(dto.bookingId, tenantId);
    if (!booking) {
      throw new BookingNotFoundError(dto.bookingId);
    }

    const vehicleId = booking.assignedVehicleId || booking.requestedVehicleId || booking.vehicleId;
    if (!vehicleId) {
      throw new Error(`Booking ${booking.bookingNumber} has no assigned vehicle.`);
    }

    // 3. Fetch customer, driver & vehicle details
    const [customer, vehicle] = await Promise.all([
      this.customerRepo.findById(booking.customerId, tenantId),
      this.vehicleRepo.findById(vehicleId, tenantId),
    ]);

    if (!customer) {
      throw new RecordNotFoundError("Customer", booking.customerId);
    }
    if (!vehicle) {
      throw new RecordNotFoundError("Vehicle", vehicleId);
    }

    const primaryDriverId = booking.primaryDriverId || booking.customerId;
    const driver = await this.driverRepo.findById(primaryDriverId, tenantId).catch(() => null);

    const customerFullName = customer.fullName || "Customer";
    const driverFullName = driver?.fullName || customerFullName;

    // 4. Construct terms snapshot
    const pricing = booking.pricingSnapshot || (booking.pricing as any);
    const dailyRate = pricing?.dailyRate || vehicle.dailyRate || 0;
    const billableDays = pricing?.billableDays || 1;
    const grossTotal = booking.grossTotal || pricing?.grossTotal || dailyRate * billableDays;
    const netSubtotal = booking.netRentalSubtotal || pricing?.netRentalSubtotal || dailyRate * billableDays;
    const depositAmount = booking.depositRequired || pricing?.securityDeposit || 0;
    const taxAmount = booking.taxAmount || pricing?.taxAmount || 0;
    const currency = booking.currency || pricing?.currency || "KES";

    const termsSnapshot: ContractTermsSnapshot = {
      templateId: "STD-RENTAL-2026-v1",
      templateVersion: dto.templateVersion || "1.0.0",
      vehicleRegistrationPlate: vehicle.registrationPlate,
      vehicleMake: vehicle.make,
      vehicleModel: vehicle.model,
      vehicleCategory: (vehicle.category as string) || "SEDAN",
      customerFullName,
      customerIdNumber: (customer as any).idNumber || (customer as any).nationalId || undefined,
      customerPhone: customer.phone,
      primaryDriverFullName: driverFullName,
      primaryDriverLicenseNumber: driver?.licenseNumber || undefined,
      pickupAt: booking.pickupAt || new Date().toISOString(),
      returnAt: booking.returnAt || new Date(Date.now() + 86400000).toISOString(),
      pickupLocation: booking.pickupLocationName || "Main Dispatch Station",
      returnLocation: booking.returnLocationName || booking.pickupLocationName || "Main Dispatch Station",
      baseDailyRate: dailyRate,
      billableDays,
      grossTotal,
      netRentalSubtotal: netSubtotal,
      depositAmount,
      taxAmount,
      currency,
      freeKmPerDay: 250,
      excessKmRate: 25,
      lateReturnHourlyFee: 500,
      cdwCoverIncluded: true,
      specialTerms: dto.specialTerms || [
        "Vehicle must be returned with the same fuel level as recorded at handover.",
        "Operation outside standard territory without prior written consent is strictly prohibited.",
        "Renter is responsible for all traffic fines and toll infractions incurred during the hire term.",
      ],
      governingLaw: "Laws of the Republic of Kenya",
    };

    const contractNumber = await this.contractRepo.generateNextContractNumber(tenantId);

    const contract = await this.contractRepo.create(tenantId, {
      contractNumber,
      bookingId: booking.id,
      customerId: booking.customerId,
      corporateAccountId: booking.corporateAccountId || null,
      primaryDriverId,
      vehicleId: vehicle.id,
      status: "GENERATED",
      templateVersion: dto.templateVersion || "1.0.0",
      termsSnapshot,
      pricingSnapshot: pricing || {
        dailyRate,
        billableDays,
        grossTotal,
        netRentalSubtotal: netSubtotal,
        securityDeposit: depositAmount,
        taxAmount,
        currency,
        calculatedAt: new Date().toISOString(),
      } as any,
      actorUserId: actor?.userId,
      actorType: actor?.actorType || "USER",
    });

    // 5. Emit Outbox Event
    await this.outboxRepo.record({
      tenantId,
      eventType: "contract.generated",
      aggregateType: "RentalContract",
      aggregateId: contract.id,
      payload: {
        contractId: contract.id,
        contractNumber: contract.contractNumber,
        bookingId: booking.id,
        customerId: booking.customerId,
        vehicleId: vehicle.id,
        contractVersion: contract.contractVersion,
      },
    });

    // 6. Record Audit
    await this.auditRepo.record({
      tenantId,
      actorType: toAuditActorType(actor?.actorType),
      actorId: actor?.userId || "system",
      action: "contract.generated",
      resourceType: "RentalContract",
      resourceId: contract.id,
      metadata: {
        contractNumber: contract.contractNumber,
        bookingNumber: booking.bookingNumber,
        vehiclePlate: vehicle.registrationPlate,
      },
    });

    // 7. Save Idempotency Cache
    if (dto.idempotencyKey) {
      await this.idempotencyRepo.record({
        tenantId,
        idempotencyKey: dto.idempotencyKey,
        resourceType: "RentalContract",
        resourceId: contract.id,
        responseStatus: 201,
        responseBody: contract as unknown as Record<string, unknown>,
      });
    }

    return contract;
  }

  /**
   * Captures digital signatures for a rental contract
   */
  async signContract(
    tenantId: string,
    contractId: string,
    dto: SignContractDto,
    actor?: ContractActor
  ): Promise<RentalContract> {
    const contract = await this.contractRepo.findById(contractId, tenantId);
    if (!contract) {
      throw new ContractNotFoundError(contractId);
    }

    // Add signature record
    const sig = await this.contractRepo.addSignature(tenantId, contractId, {
      contractId,
      contractVersion: contract.contractVersion,
      signerType: dto.signerType,
      signerId: dto.signerId,
      signerName: dto.signerName,
      signatureMethod: dto.signatureMethod,
      signatureReference: dto.signatureReference,
      ipAddress: dto.ipAddress || "127.0.0.1",
      userAgent: dto.userAgent || "CarHireOS-App",
      signedAt: new Date().toISOString(),
    });

    // Transition state to SIGNED if currently GENERATED or SENT
    let updatedContract = contract;
    if (contract.status === "GENERATED" || contract.status === "SENT") {
      ContractStateMachine.validateTransition(contract.status, "SIGNED");
      updatedContract = await this.contractRepo.update(
        contractId,
        tenantId,
        {
          status: "SIGNED",
          signedAt: new Date().toISOString(),
        },
        dto.expectedVersion
      );

      await this.contractRepo.appendStatusHistory(tenantId, {
        contractId,
        tenantId,
        fromStatus: contract.status,
        toStatus: "SIGNED",
        actorType: actor?.actorType || "CUSTOMER",
        actorId: actor?.userId || dto.signerId,
        actorName: dto.signerName,
        reason: `Contract digitally signed by ${dto.signerName} (${dto.signerType}) via ${dto.signatureMethod}`,
        occurredAt: new Date().toISOString(),
      });
    }

    // Emit outbox event
    await this.outboxRepo.record({
      tenantId,
      eventType: "contract.signed",
      aggregateType: "RentalContract",
      aggregateId: contract.id,
      payload: {
        contractId: contract.id,
        contractNumber: contract.contractNumber,
        signerType: dto.signerType,
        signerId: dto.signerId,
        signerName: dto.signerName,
        signatureMethod: dto.signatureMethod,
        isFullySigned: true,
      },
    });

    // Audit log
    await this.auditRepo.record({
      tenantId,
      actorType: toAuditActorType(actor?.actorType),
      actorId: actor?.userId || dto.signerId,
      action: "contract.signed",
      resourceType: "RentalContract",
      resourceId: contract.id,
      metadata: {
        contractNumber: contract.contractNumber,
        signerType: dto.signerType,
        signatureMethod: dto.signatureMethod,
      },
    });

    return updatedContract;
  }

  /**
   * Dispatches contract copy to customer via email / messaging
   */
  async sendContract(
    tenantId: string,
    contractId: string,
    dto: SendContractDto,
    actor?: ContractActor
  ): Promise<RentalContract> {
    const contract = await this.contractRepo.findById(contractId, tenantId);
    if (!contract) {
      throw new ContractNotFoundError(contractId);
    }

    let updated = contract;
    if (contract.status === "GENERATED") {
      ContractStateMachine.validateTransition("GENERATED", "SENT");
      updated = await this.contractRepo.update(contractId, tenantId, {
        status: "SENT",
        sentAt: new Date().toISOString(),
      });

      await this.contractRepo.appendStatusHistory(tenantId, {
        contractId,
        tenantId,
        fromStatus: "GENERATED",
        toStatus: "SENT",
        actorType: actor?.actorType || "USER",
        actorId: actor?.userId || "system",
        actorName: actor?.name || "Operator",
        reason: `Dispatched contract to ${dto.recipientEmail || dto.recipientPhone || "customer"} via ${dto.deliveryMethod}`,
        occurredAt: new Date().toISOString(),
      });
    }

    return updated;
  }

  /**
   * Creates an amended contract version (DOM-003 §17: Immutability & Versioning)
   */
  async amendContractVersion(
    tenantId: string,
    contractId: string,
    data: {
      changeReason: string;
      termsSnapshot?: Partial<ContractTermsSnapshot>;
    },
    actor?: ContractActor
  ): Promise<ContractVersionRecord> {
    const contract = await this.contractRepo.findById(contractId, tenantId);
    if (!contract) {
      throw new ContractNotFoundError(contractId);
    }

    const nextVersion = contract.contractVersion + 1;
    const mergedTerms: ContractTermsSnapshot = {
      ...contract.termsSnapshot,
      ...(data.termsSnapshot || {}),
    };

    const versionRecord = await this.contractRepo.createVersion(tenantId, {
      contractId,
      tenantId,
      version: nextVersion,
      termsSnapshot: mergedTerms,
      pricingSnapshot: contract.pricingSnapshot,
      vehicleId: contract.vehicleId,
      customerId: contract.customerId,
      primaryDriverId: contract.primaryDriverId,
      isCurrent: true,
      createdBy: actor?.userId || "system",
      changeReason: data.changeReason,
      createdAt: new Date().toISOString(),
    });

    await this.contractRepo.update(contractId, tenantId, {
      contractVersion: nextVersion,
      termsSnapshot: mergedTerms,
    });

    await this.auditRepo.record({
      tenantId,
      actorType: toAuditActorType(actor?.actorType),
      actorId: actor?.userId || "system",
      action: "contract.amended",
      resourceType: "RentalContract",
      resourceId: contract.id,
      metadata: {
        contractNumber: contract.contractNumber,
        newVersion: nextVersion,
        reason: data.changeReason,
      },
    });

    return versionRecord;
  }

  async getContractById(tenantId: string, contractId: string): Promise<RentalContract> {
    const contract = await this.contractRepo.findById(contractId, tenantId);
    if (!contract) {
      throw new ContractNotFoundError(contractId);
    }
    return contract;
  }

  async getContractsByBookingId(tenantId: string, bookingId: string): Promise<RentalContract[]> {
    return this.contractRepo.findByBookingId(bookingId, tenantId);
  }

  async listContracts(
    tenantId: string,
    query: ContractListQueryDto = {}
  ): Promise<{ items: RentalContract[]; total: number }> {
    return this.contractRepo.findMany(tenantId, query);
  }
}
