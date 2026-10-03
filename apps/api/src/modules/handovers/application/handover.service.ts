// ============================================================================
// CAR HIRE OS — HANDOVER APPLICATION SERVICE (DOM-003 §18, DEV-006, DEV-007, BRS-001)
// Bounded Context: Vehicle Handover & Physical Dispatch Checklist
// ============================================================================

import type {
  VehicleHandover,
  HandoverStatus,
  ScheduleHandoverDto,
  RecordCustomerArrivalDto,
  VerifyHandoverDocumentsDto,
  CompleteInspectionCheckpointDto,
  ConfirmSignatureCheckpointDto,
  HandoverKeysDto,
  CompleteHandoverDto,
  HandoverListQueryDto,
} from "@carhire/types";
import {
  IHandoverRepository,
  HandoverRepository,
  IBookingRepository,
  BookingRepository,
  IContractRepository,
  ContractRepository,
  IVehicleRepository,
  VehicleRepository,
  IInspectionRepository,
  InspectionRepository,
  IAuditRepository,
  AuditRepository,
  IOutboxRepository,
  OutboxRepository,
  IIdempotencyRepository,
  IdempotencyRepository,
  HandoverNotFoundError,
  BookingNotFoundError,
  ContractNotFoundError,
  RecordNotFoundError,
} from "@carhire/database";
import { HandoverStateMachine } from "../domain/handover-state-machine";

export interface HandoverActor {
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

export class HandoverService {
  private readonly handoverRepo: IHandoverRepository;
  private readonly bookingRepo: IBookingRepository;
  private readonly contractRepo: IContractRepository;
  private readonly vehicleRepo: IVehicleRepository;
  private readonly inspectionRepo: IInspectionRepository;
  private readonly auditRepo: IAuditRepository;
  private readonly outboxRepo: IOutboxRepository;
  private readonly idempotencyRepo: IIdempotencyRepository;
  private readonly complianceReadinessService?: any;

  constructor(
    handoverRepo?: IHandoverRepository,
    bookingRepo?: IBookingRepository,
    contractRepo?: IContractRepository,
    vehicleRepo?: IVehicleRepository,
    auditRepo?: IAuditRepository,
    outboxRepo?: IOutboxRepository,
    idempotencyRepo?: IIdempotencyRepository,
    inspectionRepo?: IInspectionRepository,
    complianceReadinessService?: any
  ) {
    this.handoverRepo = handoverRepo || new HandoverRepository();
    this.bookingRepo = bookingRepo || new BookingRepository();
    this.contractRepo = contractRepo || new ContractRepository();
    this.vehicleRepo = vehicleRepo || new VehicleRepository();
    this.inspectionRepo = inspectionRepo || new InspectionRepository();
    this.auditRepo = auditRepo || new AuditRepository();
    this.outboxRepo = outboxRepo || new OutboxRepository();
    this.idempotencyRepo = idempotencyRepo || new IdempotencyRepository();
    this.complianceReadinessService = complianceReadinessService;
  }

  /**
   * Schedules a handover process for a confirmed booking
   */
  async scheduleHandover(
    tenantId: string,
    dto: ScheduleHandoverDto,
    actor?: HandoverActor
  ): Promise<VehicleHandover> {
    if (dto.idempotencyKey) {
      const cached = await this.idempotencyRepo.findByKey(tenantId, dto.idempotencyKey);
      if (cached && cached.responseBody) {
        return cached.responseBody as unknown as VehicleHandover;
      }
    }

    const booking = await this.bookingRepo.findById(dto.bookingId, tenantId);
    if (!booking) {
      throw new BookingNotFoundError(dto.bookingId);
    }
    if (booking.status !== "CONFIRMED") {
      throw new Error(`Handover scheduling requires a CONFIRMED booking. Booking ${booking.bookingNumber} is currently ${booking.status}.`);
    }

    const vehicleId = booking.assignedVehicleId;
    if (!vehicleId) {
      throw new Error(`Booking ${booking.bookingNumber} has no confirmed assigned Vehicle for handover.`);
    }

    const existingHandovers = await this.handoverRepo.findByBookingId(booking.id, tenantId);
    const currentHandover = existingHandovers
      .filter((item) => item.status !== "HANDOVER_COMPLETED")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    if (currentHandover) {
      throw new Error(`Booking ${booking.bookingNumber} already has active Handover ${currentHandover.handoverNumber}.`);
    }

    // Handover must be anchored to the current non-terminal Contract.
    const contracts = await this.contractRepo.findByBookingId(booking.id, tenantId);
    const contract = contracts
      .filter((item) => !["ACTIVE", "COMPLETED", "ARCHIVED"].includes(item.status))
      .sort((a, b) => b.contractVersion - a.contractVersion || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    if (!contract) {
      throw new ContractNotFoundError(`booking:${booking.id}`);
    }
    if (contract.vehicleId !== vehicleId) {
      throw new Error(`Contract ${contract.contractNumber} Vehicle does not match Booking assigned Vehicle.`);
    }
    const contractId = contract.id;

    const vehicle = await this.vehicleRepo.findById(vehicleId, tenantId);
    if (!vehicle) {
      throw new RecordNotFoundError("Vehicle", vehicleId);
    }
    const initialOdometer = vehicle.odometer ?? 0;
    const initialFuel = vehicle.fuelLevel ?? 100;

    const handoverNumber = await this.handoverRepo.generateNextHandoverNumber(tenantId);
    const scheduledAt = dto.scheduledAt || booking.pickupAt || new Date().toISOString();

    const handover = await this.handoverRepo.create(tenantId, {
      handoverNumber,
      bookingId: booking.id,
      contractId,
      vehicleId,
      customerId: booking.customerId,
      primaryDriverId: booking.primaryDriverId || booking.customerId,
      scheduledAt,
      status: "SCHEDULED",
      checkoutOdometer: initialOdometer,
      checkoutFuelLevel: initialFuel,
      notes: dto.notes || null,
      actorUserId: actor?.userId,
      actorType: actor?.actorType || "USER",
    });

    await this.outboxRepo.record({
      tenantId,
      eventType: "handover.scheduled",
      aggregateType: "VehicleHandover",
      aggregateId: handover.id,
      payload: {
        handoverId: handover.id,
        handoverNumber: handover.handoverNumber,
        bookingId: booking.id,
        contractId,
        vehicleId,
        scheduledAt,
      },
    });

    await this.auditRepo.record({
      tenantId,
      actorType: toAuditActorType(actor?.actorType),
      actorId: actor?.userId || "system",
      action: "handover.scheduled",
      resourceType: "VehicleHandover",
      resourceId: handover.id,
      metadata: {
        handoverNumber: handover.handoverNumber,
        bookingNumber: booking.bookingNumber,
        scheduledAt,
      },
    });

    if (dto.idempotencyKey) {
      await this.idempotencyRepo.record({
        tenantId,
        idempotencyKey: dto.idempotencyKey,
        resourceType: "VehicleHandover",
        resourceId: handover.id,
        responseStatus: 201,
        responseBody: handover as unknown as Record<string, unknown>,
      });
    }

    return handover;
  }

  /**
   * Checkpoint 1: Record customer physical arrival
   */
  async recordCustomerArrival(
    tenantId: string,
    handoverId: string,
    dto: RecordCustomerArrivalDto,
    actor?: HandoverActor
  ): Promise<VehicleHandover> {
    const handover = await this.handoverRepo.findById(handoverId, tenantId);
    if (!handover) {
      throw new HandoverNotFoundError(handoverId);
    }

    HandoverStateMachine.validateTransition(handover.status, "CUSTOMER_ARRIVED");
    const arrivedAt = dto.arrivedAt || new Date().toISOString();

    const updated = await this.handoverRepo.update(
      handoverId,
      tenantId,
      {
        status: "CUSTOMER_ARRIVED",
        customerArrivedAt: arrivedAt,
        notes: dto.notes ? `${handover.notes ? handover.notes + " | " : ""}${dto.notes}` : handover.notes,
      },
      dto.expectedVersion
    );

    await this.handoverRepo.appendStatusHistory(tenantId, {
      handoverId,
      tenantId,
      fromStatus: handover.status,
      toStatus: "CUSTOMER_ARRIVED",
      actorType: actor?.actorType || "USER",
      actorId: actor?.userId,
      actorName: actor?.name || "Staff",
      reason: "Customer physical arrival verified",
      occurredAt: arrivedAt,
    });

    return updated;
  }

  /**
   * Checkpoint 2: Verify driver license & identity documents
   */
  async verifyDocuments(
    tenantId: string,
    handoverId: string,
    dto: VerifyHandoverDocumentsDto,
    actor?: HandoverActor
  ): Promise<VehicleHandover> {
    const handover = await this.handoverRepo.findById(handoverId, tenantId);
    if (!handover) {
      throw new HandoverNotFoundError(handoverId);
    }

    HandoverStateMachine.validateTransition(handover.status, "DOCUMENT_VERIFIED");
    if (!dto.driverLicenseVerified || !dto.idDocumentVerified) {
      throw new Error("Cannot verify documents: both driver's license and national ID/passport must be verified.");
    }

    if (this.complianceReadinessService) {
      const vehicleReadiness = await this.complianceReadinessService.evaluateVehicle(tenantId, handover.vehicleId, "HANDOVER");
      if (!vehicleReadiness.isReady) {
        const issues = vehicleReadiness.blockingIssues.map((b: any) => b.message).join("; ");
        throw new Error(`Vehicle compliance check failed for handover: ${issues}`);
      }
      if (handover.primaryDriverId) {
        const driverReadiness = await this.complianceReadinessService.evaluateDriver(tenantId, handover.primaryDriverId, "HANDOVER");
        if (!driverReadiness.isReady) {
          const issues = driverReadiness.blockingIssues.map((b: any) => b.message).join("; ");
          throw new Error(`Driver compliance check failed for handover: ${issues}`);
        }
      }
    }

    const verifiedAt = new Date().toISOString();
    const updated = await this.handoverRepo.update(
      handoverId,
      tenantId,
      {
        status: "DOCUMENT_VERIFIED",
        documentsVerifiedAt: verifiedAt,
        notes: dto.notes ? `${handover.notes ? handover.notes + " | " : ""}${dto.notes}` : handover.notes,
      },
      dto.expectedVersion
    );

    await this.handoverRepo.appendStatusHistory(tenantId, {
      handoverId,
      tenantId,
      fromStatus: handover.status,
      toStatus: "DOCUMENT_VERIFIED",
      actorType: actor?.actorType || "USER",
      actorId: actor?.userId,
      actorName: actor?.name || dto.verifiedBy || "Staff",
      reason: `Documents verified by ${dto.verifiedBy || actor?.name || "Staff"}`,
      occurredAt: verifiedAt,
    });

    return updated;
  }

  /**
   * Checkpoint 3: Complete physical pre-rental vehicle inspection
   */
  async completeInspectionCheckpoint(
    tenantId: string,
    handoverId: string,
    dto: CompleteInspectionCheckpointDto,
    actor?: HandoverActor
  ): Promise<VehicleHandover> {
    const handover = await this.handoverRepo.findById(handoverId, tenantId);
    if (!handover) {
      throw new HandoverNotFoundError(handoverId);
    }

    HandoverStateMachine.validateTransition(handover.status, "PRE_RENTAL_INSPECTION");
    if (!dto.passed) {
      throw new Error("Vehicle inspection failed. Vehicle is not roadworthy for handover.");
    }

    const inspection = await this.inspectionRepo.findById(dto.inspectionId, tenantId);
    if (!inspection) {
      throw new RecordNotFoundError("Inspection", dto.inspectionId);
    }
    if (inspection.status !== "COMPLETED") {
      throw new Error(`Pre-rental Inspection ${inspection.inspectionNumber} must be COMPLETED before Handover can advance.`);
    }
    if (inspection.inspectionType !== "PRE_RENTAL") {
      throw new Error(`Inspection ${inspection.inspectionNumber} is ${inspection.inspectionType}; Handover requires PRE_RENTAL.`);
    }
    if (inspection.vehicleId !== handover.vehicleId) {
      throw new Error(`Inspection ${inspection.inspectionNumber} belongs to a different Vehicle.`);
    }
    if (inspection.bookingId && inspection.bookingId !== handover.bookingId) {
      throw new Error(`Inspection ${inspection.inspectionNumber} belongs to a different Booking.`);
    }
    if (inspection.handoverId && inspection.handoverId !== handover.id) {
      throw new Error(`Inspection ${inspection.inspectionNumber} belongs to a different Handover.`);
    }
    if (inspection.odometer < 0 || inspection.fuelLevel < 0 || inspection.fuelLevel > 100) {
      throw new Error(`Inspection ${inspection.inspectionNumber} contains invalid odometer/fuel readings.`);
    }

    const inspectionCompletedAt = inspection.completedAt || new Date().toISOString();
    const updated = await this.handoverRepo.update(
      handoverId,
      tenantId,
      {
        status: "PRE_RENTAL_INSPECTION",
        inspectionId: inspection.id,
        inspectionCompletedAt,
        checkoutOdometer: inspection.odometer,
        checkoutFuelLevel: inspection.fuelLevel,
        notes: dto.notes ? `${handover.notes ? handover.notes + " | " : ""}${dto.notes}` : handover.notes,
      },
      dto.expectedVersion
    );

    await this.handoverRepo.appendStatusHistory(tenantId, {
      handoverId,
      tenantId,
      fromStatus: handover.status,
      toStatus: "PRE_RENTAL_INSPECTION",
      actorType: actor?.actorType || "USER",
      actorId: actor?.userId,
      actorName: actor?.name || "Inspector",
      reason: `Pre-rental inspection completed (Odometer: ${inspection.odometer} km, Fuel: ${inspection.fuelLevel}%)`,
      occurredAt: inspectionCompletedAt,
    });

    return updated;
  }

  /**
   * Checkpoint 4: Confirm contract digital signature
   */
  async confirmSignatureCheckpoint(
    tenantId: string,
    handoverId: string,
    dto: ConfirmSignatureCheckpointDto,
    actor?: HandoverActor
  ): Promise<VehicleHandover> {
    const handover = await this.handoverRepo.findById(handoverId, tenantId);
    if (!handover) {
      throw new HandoverNotFoundError(handoverId);
    }

    HandoverStateMachine.validateTransition(handover.status, "SIGNATURE");
    if (!dto.contractSigned) {
      throw new Error("Contract signature is required before proceeding to key handover.");
    }
    if (!handover.contractId) {
      throw new ContractNotFoundError(`handover:${handover.id}`);
    }
    const contract = await this.contractRepo.findById(handover.contractId, tenantId);
    if (!contract) {
      throw new ContractNotFoundError(handover.contractId);
    }
    if (contract.bookingId !== handover.bookingId || contract.vehicleId !== handover.vehicleId) {
      throw new Error(`Contract ${contract.contractNumber} does not match this Handover Booking/Vehicle.`);
    }
    if (contract.status !== "SIGNED") {
      throw new Error(`Contract ${contract.contractNumber} must be SIGNED before the signature Handover checkpoint (currently ${contract.status}).`);
    }
    const hasCurrentVersionSignature = (contract.signatures || []).some(
      (signature) => signature.contractVersion === contract.contractVersion
    );
    if (!hasCurrentVersionSignature) {
      throw new Error(`Contract ${contract.contractNumber} current version ${contract.contractVersion} has no recorded signature.`);
    }

    const signatureCompletedAt = new Date().toISOString();
    const updated = await this.handoverRepo.update(
      handoverId,
      tenantId,
      {
        status: "SIGNATURE",
        signatureCompletedAt,
        notes: dto.notes ? `${handover.notes ? handover.notes + " | " : ""}${dto.notes}` : handover.notes,
      },
      dto.expectedVersion
    );

    await this.handoverRepo.appendStatusHistory(tenantId, {
      handoverId,
      tenantId,
      fromStatus: handover.status,
      toStatus: "SIGNATURE",
      actorType: actor?.actorType || "USER",
      actorId: actor?.userId,
      actorName: actor?.name || "Staff",
      reason: `Contract signature confirmed (Ref: ${dto.signatureReference || "Digital Signature Verified"})`,
      occurredAt: signatureCompletedAt,
    });

    return updated;
  }

  /**
   * Checkpoint 5: Physical key handover & dispatch snapshot
   */
  async handoverKeys(
    tenantId: string,
    handoverId: string,
    dto: HandoverKeysDto,
    actor?: HandoverActor
  ): Promise<VehicleHandover> {
    const handover = await this.handoverRepo.findById(handoverId, tenantId);
    if (!handover) {
      throw new HandoverNotFoundError(handoverId);
    }

    HandoverStateMachine.validateTransition(handover.status, "KEY_HANDOVER");
    if (!Number.isFinite(dto.checkoutOdometer) || dto.checkoutOdometer < handover.checkoutOdometer) {
      throw new Error(`Key-handover odometer cannot be lower than the verified inspection reading (${handover.checkoutOdometer} km).`);
    }
    if (!Number.isFinite(dto.checkoutFuelLevel) || dto.checkoutFuelLevel < 0 || dto.checkoutFuelLevel > 100) {
      throw new Error("Key-handover fuel level must be between 0 and 100.");
    }
    if (!dto.handedOverTo?.trim()) {
      throw new Error("Key handover requires the recipient name.");
    }

    const keyHandedOverAt = new Date().toISOString();
    const updated = await this.handoverRepo.update(
      handoverId,
      tenantId,
      {
        status: "KEY_HANDOVER",
        keyHandedOverAt,
        checkoutOdometer: dto.checkoutOdometer,
        checkoutFuelLevel: dto.checkoutFuelLevel,
        notes: dto.notes ? `${handover.notes ? handover.notes + " | " : ""}${dto.notes}` : handover.notes,
      },
      dto.expectedVersion
    );

    await this.handoverRepo.appendStatusHistory(tenantId, {
      handoverId,
      tenantId,
      fromStatus: handover.status,
      toStatus: "KEY_HANDOVER",
      actorType: actor?.actorType || "USER",
      actorId: actor?.userId,
      actorName: actor?.name || "Staff",
      reason: `Keys handed over to ${dto.handedOverTo}${dto.keyTagNumber ? ` (Tag: ${dto.keyTagNumber})` : ""}`,
      occurredAt: keyHandedOverAt,
    });

    return updated;
  }

  /**
   * Final Step: Complete Handover
   */
  async completeHandover(
    tenantId: string,
    handoverId: string,
    dto: CompleteHandoverDto = {},
    actor?: HandoverActor
  ): Promise<VehicleHandover> {
    const handover = await this.handoverRepo.findById(handoverId, tenantId);
    if (!handover) {
      throw new HandoverNotFoundError(handoverId);
    }

    HandoverStateMachine.validateTransition(handover.status, "HANDOVER_COMPLETED");

    const completedAt = new Date().toISOString();
    const updated = await this.handoverRepo.update(
      handoverId,
      tenantId,
      {
        status: "HANDOVER_COMPLETED",
        completedAt,
        checkoutOdometer: dto.checkoutOdometer !== undefined ? dto.checkoutOdometer : handover.checkoutOdometer,
        checkoutFuelLevel: dto.checkoutFuelLevel !== undefined ? dto.checkoutFuelLevel : handover.checkoutFuelLevel,
        notes: dto.notes ? `${handover.notes ? handover.notes + " | " : ""}${dto.notes}` : handover.notes,
      },
      dto.expectedVersion
    );

    await this.handoverRepo.appendStatusHistory(tenantId, {
      handoverId,
      tenantId,
      fromStatus: handover.status,
      toStatus: "HANDOVER_COMPLETED",
      actorType: actor?.actorType || "USER",
      actorId: actor?.userId,
      actorName: actor?.name || "Staff",
      reason: "Handover workflow successfully completed",
      occurredAt: completedAt,
    });

    await this.outboxRepo.record({
      tenantId,
      eventType: "handover.completed",
      aggregateType: "VehicleHandover",
      aggregateId: handover.id,
      payload: {
        handoverId: handover.id,
        handoverNumber: handover.handoverNumber,
        bookingId: handover.bookingId,
        contractId: handover.contractId,
        vehicleId: handover.vehicleId,
        checkoutOdometer: updated.checkoutOdometer,
        checkoutFuelLevel: updated.checkoutFuelLevel,
        completedAt,
      },
    });

    await this.auditRepo.record({
      tenantId,
      actorType: toAuditActorType(actor?.actorType),
      actorId: actor?.userId || "system",
      action: "handover.completed",
      resourceType: "VehicleHandover",
      resourceId: handover.id,
      metadata: {
        handoverNumber: handover.handoverNumber,
        bookingId: handover.bookingId,
        finalOdometer: updated.checkoutOdometer,
      },
    });

    return updated;
  }

  async getHandoverById(tenantId: string, handoverId: string): Promise<VehicleHandover> {
    const handover = await this.handoverRepo.findById(handoverId, tenantId);
    if (!handover) {
      throw new HandoverNotFoundError(handoverId);
    }
    return handover;
  }

  async getHandoversByBookingId(tenantId: string, bookingId: string): Promise<VehicleHandover[]> {
    return this.handoverRepo.findByBookingId(bookingId, tenantId);
  }

  async listHandovers(
    tenantId: string,
    query: HandoverListQueryDto = {}
  ): Promise<{ items: VehicleHandover[]; total: number }> {
    return this.handoverRepo.findMany(tenantId, query);
  }
}
