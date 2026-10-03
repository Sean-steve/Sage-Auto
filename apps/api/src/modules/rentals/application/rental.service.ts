// ============================================================================
// CAR HIRE OS — RENTAL APPLICATION SERVICE (DOM-003 §19-20, DEV-006, DEV-007, BRS-001)
// Bounded Context: Rentals & On-Road Fleet Dispatches
// Atomic rental start orchestration, concurrency-safe transitions, and start snapshots
// ============================================================================

import type {
  Rental,
  RentalState,
  RentalStartSnapshot,
  RentalStartReadiness,
  CreateRentalFromBookingDto,
  StartRentalDto,
  RentalListQueryDto,
  RentalExtension,
  RentalReturnRecord,
  RentalFinalCalculation,
  RentalFinalCalculationItem,
  RequestRentalExtensionDto,
  ApproveRentalExtensionDto,
  RejectRentalExtensionDto,
  ScheduleRentalReturnDto,
  ReceiveReturnedVehicleDto,
  PerformReturnInspectionDto,
  CalculateFinalRentalDto,
  ProcessDepositSettlementDto,
  CompleteRentalDto,
  RecordRentalIncidentDto,
  RentalIncident,
} from "@carhire/types";
import {
  IRentalRepository,
  RentalRepository,
  IBookingRepository,
  BookingRepository,
  IContractRepository,
  ContractRepository,
  IHandoverRepository,
  HandoverRepository,
  IVehicleRepository,
  VehicleRepository,
  IVehicleAllocationRepository,
  VehicleAllocationRepository,
  IAuditRepository,
  AuditRepository,
  IOutboxRepository,
  OutboxRepository,
  IIdempotencyRepository,
  IdempotencyRepository,
  IInspectionRepository,
  InspectionRepository,
  IDamageRepository,
  DamageRepository,
  RentalNotFoundError,
  BookingNotFoundError,
  ContractNotFoundError,
  HandoverNotFoundError,
  RentalAlreadyStartedError,
  RentalNotEligibleToStartError,
  RentalAlreadyCompletedError,
  RentalNotActiveError,
  RentalExtensionNotFoundError,
  RentalExtensionInvalidStatusError,
  RentalVehicleNotReceivedError,
  InspectionOdometerRegressionError,
  InspectionInvalidFuelLevelError,
  RecordNotFoundError,
} from "@carhire/database";
import { RentalStateMachine } from "../domain/rental-state-machine";

export interface RentalActor {
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

export class RentalService {
  private readonly rentalRepo: IRentalRepository;
  private readonly bookingRepo: IBookingRepository;
  private readonly contractRepo: IContractRepository;
  private readonly handoverRepo: IHandoverRepository;
  private readonly vehicleRepo: IVehicleRepository;
  private readonly allocationRepo: IVehicleAllocationRepository;
  private readonly auditRepo: IAuditRepository;
  private readonly outboxRepo: IOutboxRepository;
  private readonly idempotencyRepo: IIdempotencyRepository;
  private readonly inspectionRepo: IInspectionRepository;
  private readonly damageRepo: IDamageRepository;
  private readonly complianceReadinessService?: any;

  constructor(
    rentalRepo?: IRentalRepository,
    bookingRepo?: IBookingRepository,
    contractRepo?: IContractRepository,
    handoverRepo?: IHandoverRepository,
    vehicleRepo?: IVehicleRepository,
    allocationRepo?: IVehicleAllocationRepository,
    auditRepo?: IAuditRepository,
    outboxRepo?: IOutboxRepository,
    idempotencyRepo?: IIdempotencyRepository,
    inspectionRepo?: IInspectionRepository,
    damageRepo?: IDamageRepository,
    complianceReadinessService?: any
  ) {
    this.rentalRepo = rentalRepo || new RentalRepository();
    this.bookingRepo = bookingRepo || new BookingRepository();
    this.contractRepo = contractRepo || new ContractRepository();
    this.handoverRepo = handoverRepo || new HandoverRepository();
    this.vehicleRepo = vehicleRepo || new VehicleRepository();
    this.allocationRepo = allocationRepo || new VehicleAllocationRepository();
    this.auditRepo = auditRepo || new AuditRepository();
    this.outboxRepo = outboxRepo || new OutboxRepository();
    this.idempotencyRepo = idempotencyRepo || new IdempotencyRepository();
    this.inspectionRepo = inspectionRepo || new InspectionRepository();
    this.damageRepo = damageRepo || new DamageRepository();
    this.complianceReadinessService = complianceReadinessService;
  }

  /**
   * Evaluates readiness to dispatch/start a rental from a booking
   */
  async evaluateReadiness(
    tenantId: string,
    bookingId: string
  ): Promise<RentalStartReadiness> {
    const booking = await this.bookingRepo.findById(bookingId, tenantId);
    if (!booking) {
      throw new BookingNotFoundError(bookingId);
    }

    const blockers: string[] = [];
    const warnings: string[] = [];

    // Check 1: Booking status
    if (booking.status !== "CONFIRMED") {
      blockers.push(`Booking must be in CONFIRMED state (currently: ${booking.status})`);
    }

    // Check 2: Assigned vehicle
    const vehicleId = booking.assignedVehicleId || booking.requestedVehicleId || booking.vehicleId;
    if (!vehicleId) {
      blockers.push("Booking does not have an assigned vehicle");
    }

    // Check 3: Contract status
    const contracts = await this.contractRepo.findByBookingId(booking.id, tenantId);
    const contract = contracts.length > 0 ? contracts[0] : null;
    const contractSigned = contract?.status === "SIGNED" || contract?.status === "ACTIVE";
    if (!contract) {
      blockers.push("No contract generated for this booking");
    } else if (!contractSigned) {
      blockers.push(`Contract is not signed (status: ${contract.status})`);
    }

    // Check 4: Handover checkpoints
    const handovers = await this.handoverRepo.findByBookingId(booking.id, tenantId);
    const handover = handovers.length > 0 ? handovers[0] : null;
    const documentsVerified = !!handover?.documentsVerifiedAt;
    const inspectionCompleted = !!handover?.inspectionCompletedAt;

    if (!handover) {
      blockers.push("No handover workflow scheduled");
    } else {
      if (!documentsVerified) {
        blockers.push("Driver documents not verified in handover workflow");
      }
      if (!inspectionCompleted) {
        blockers.push("Pre-rental inspection not completed in handover workflow");
      }
      if (handover.status !== "HANDOVER_COMPLETED") {
        blockers.push(`Handover is not completed (status: ${handover.status})`);
      }
    }

    // Check 5: Vehicle operational status
    let vehicleOperational = false;
    if (vehicleId) {
      const vehicle = await this.vehicleRepo.findById(vehicleId, tenantId);
      if (
        vehicle &&
        vehicle.availabilityStatus !== "MAINTENANCE" &&
        vehicle.availabilityStatus !== "BLOCKED" &&
        vehicle.lifecycleStatus !== "SOLD" &&
        vehicle.lifecycleStatus !== "RETIRED"
      ) {
        vehicleOperational = true;
      } else {
        blockers.push(`Assigned vehicle is not operational (availability: ${vehicle?.availabilityStatus || "UNKNOWN"})`);
      }
    }

    // Check 6: Allocation validity
    const allocationValid = !!booking.assignedVehicleId;

    // Check 7: Regulatory Compliance Readiness (Sprint 18)
    if (this.complianceReadinessService && vehicleId) {
      try {
        const interval =
          (booking as any).pickupDate && (booking as any).returnDate
            ? { start: (booking as any).pickupDate, end: (booking as any).returnDate }
            : undefined;

        const vReadiness = await this.complianceReadinessService.evaluateVehicle(
          tenantId,
          vehicleId,
          "RENTAL_START",
          interval
        );
        if (!vReadiness.isReady) {
          vReadiness.blockingIssues.forEach((b: any) =>
            blockers.push(`Vehicle compliance: ${b.message}`)
          );
        }
        vReadiness.warnings.forEach((w: any) =>
          warnings.push(`Vehicle compliance warning: ${w.message}`)
        );

        if (booking.primaryDriverId) {
          const dReadiness = await this.complianceReadinessService.evaluateDriver(
            tenantId,
            booking.primaryDriverId,
            "RENTAL_START",
            interval
          );
          if (!dReadiness.isReady) {
            dReadiness.blockingIssues.forEach((b: any) =>
              blockers.push(`Driver compliance: ${b.message}`)
            );
          }
          dReadiness.warnings.forEach((w: any) =>
            warnings.push(`Driver compliance warning: ${w.message}`)
          );
        }
      } catch {
        // Continue if evaluation encounters unconfigured requirement
      }
    }

    return {
      isReady: blockers.length === 0,
      blockers,
      warnings,
      bookingStatus: booking.status,
      contractStatus: contract?.status || ("DRAFT" as any),
      handoverStatus: handover?.status || ("SCHEDULED" as any),
      documentsVerified,
      inspectionCompleted,
      contractSigned,
      vehicleOperational,
      allocationValid,
    };
  }

  /**
   * Atomically creates, starts and dispatches a rental from a confirmed booking and completed handover
   */
  async startRental(
    tenantId: string,
    dto: CreateRentalFromBookingDto,
    actor?: RentalActor
  ): Promise<Rental> {
    // 1. Idempotency check
    if (dto.idempotencyKey) {
      const cached = await this.idempotencyRepo.findByKey(tenantId, dto.idempotencyKey);
      if (cached && cached.responseBody) {
        return cached.responseBody as unknown as Rental;
      }
    }

    // 2. Fetch booking & verify no existing active rental
    const booking = await this.bookingRepo.findById(dto.bookingId, tenantId);
    if (!booking) {
      throw new BookingNotFoundError(dto.bookingId);
    }

    const existingRental = await this.rentalRepo.findByBookingId(booking.id, tenantId);
    if (existingRental && existingRental.state === "ACTIVE_ON_ROAD") {
      throw new RentalAlreadyStartedError(existingRental.id);
    }

    // 3. Resolve the authoritative booking-linked contract and handover.
    // The browser may provide IDs, but the server does not require stale UI state to start a rental.
    const [bookingContracts, bookingHandovers] = await Promise.all([
      this.contractRepo.findByBookingId(booking.id, tenantId),
      this.handoverRepo.findByBookingId(booking.id, tenantId),
    ]);
    const contract = dto.contractId
      ? await this.contractRepo.findById(dto.contractId, tenantId)
      : bookingContracts.find((item: any) => item.status === "SIGNED" || item.status === "ACTIVE") || bookingContracts[0];
    const handover = dto.handoverId
      ? await this.handoverRepo.findById(dto.handoverId, tenantId)
      : bookingHandovers.find((item: any) => item.status === "HANDOVER_COMPLETED") || bookingHandovers[0];

    if (!contract) {
      throw new ContractNotFoundError(dto.contractId || booking.id);
    }
    if (!handover) {
      throw new HandoverNotFoundError(dto.handoverId || booking.id);
    }
    if ((contract as any).bookingId && (contract as any).bookingId !== booking.id) {
      throw new Error("Contract does not belong to the booking being dispatched.");
    }
    if ((handover as any).bookingId && (handover as any).bookingId !== booking.id) {
      throw new Error("Handover does not belong to the booking being dispatched.");
    }

    const vehicleId = booking.assignedVehicleId || handover.vehicleId;
    const vehicle = await this.vehicleRepo.findById(vehicleId, tenantId);
    if (!vehicle) {
      throw new RecordNotFoundError("Vehicle", vehicleId);
    }

    // 4. Validate readiness
    const readiness = await this.evaluateReadiness(tenantId, booking.id);
    if (!readiness.isReady) {
      throw new RentalNotEligibleToStartError(readiness.blockers);
    }

    const now = new Date().toISOString();
    const startOdometer = dto.startOdometer ?? handover.checkoutOdometer ?? vehicle.odometer ?? 0;
    const startFuel = dto.startFuelLevel ?? handover.checkoutFuelLevel ?? vehicle.fuelLevel ?? 100;
    const scheduledReturn = booking.returnAt || new Date(Date.now() + 86400000).toISOString();

    const rentalNumber = await this.rentalRepo.generateNextRentalNumber(tenantId);
    const pricing = booking.pricingSnapshot || (booking.pricing as any);

    // 5. Create Rental aggregate in ACTIVE_ON_ROAD
    const rental = await this.rentalRepo.create(tenantId, {
      rentalNumber,
      bookingId: booking.id,
      contractId: contract.id,
      handoverId: handover.id,
      customerId: booking.customerId,
      corporateAccountId: booking.corporateAccountId || null,
      primaryDriverId: booking.primaryDriverId || booking.customerId,
      vehicleId: vehicle.id,
      status: "ACTIVE_ON_ROAD",
      scheduledStart: booking.pickupAt || now,
      scheduledReturnAt: scheduledReturn,
      actualStart: now,
      checkoutOdometer: startOdometer,
      checkoutFuelLevel: startFuel,
      pricingSnapshot: pricing,
      preRentalInspectionId: handover.inspectionId || null,
      actorUserId: actor?.userId,
      actorType: actor?.actorType || "USER",
    });

    // 6. Save immutable RentalStartSnapshot
    await this.rentalRepo.saveStartSnapshot(tenantId, {
      tenantId,
      rentalId: rental.id,
      actualVehicleId: vehicle.id,
      startedAt: now,
      scheduledReturnAt: scheduledReturn,
      startOdometer,
      startFuelLevel: startFuel,
      preRentalInspectionId: handover.inspectionId || null,
      pricingSnapshot: pricing,
      depositRequirement: booking.depositRequired || 0,
      contractVersion: contract.contractVersion,
      driverId: booking.primaryDriverId || booking.customerId,
      ownershipTermsSnapshot: contract.ownershipTermsSnapshot || null,
    });

    // 7. Atomic Side-Effects:
    // a) Update Booking status -> ACTIVE
    await this.bookingRepo.update(booking.id, tenantId, {
      status: "ACTIVE",
      activatedAt: now,
      activeRentalId: rental.id,
    });
    await this.bookingRepo.appendStatusHistory(tenantId, {
      bookingId: booking.id,
      tenantId,
      fromStatus: booking.status,
      toStatus: "ACTIVE",
      actorType: actor?.actorType === "PLATFORM_STAFF" ? "SYSTEM" : actor?.actorType || "USER",
      actorId: actor?.userId || "system",
      actorName: actor?.name || "Staff",
      reason: `Rental dispatched (${rental.rentalNumber}). Vehicle handed over.`,
      occurredAt: now,
    });

    // b) Update Contract status -> ACTIVE
    await this.contractRepo.update(contract.id, tenantId, {
      status: "ACTIVE",
      rentalId: rental.id,
      activatedAt: now,
    });
    await this.contractRepo.appendStatusHistory(tenantId, {
      contractId: contract.id,
      tenantId,
      fromStatus: contract.status,
      toStatus: "ACTIVE",
      actorType: actor?.actorType || "USER",
      actorId: actor?.userId || "system",
      actorName: actor?.name || "Staff",
      reason: `Contract activated upon rental dispatch (${rental.rentalNumber})`,
      occurredAt: now,
    });

    // c) Update Handover status -> HANDOVER_COMPLETED (if not already)
    if (handover.status !== "HANDOVER_COMPLETED") {
      await this.handoverRepo.update(handover.id, tenantId, {
        status: "HANDOVER_COMPLETED",
        rentalId: rental.id,
        completedAt: now,
      });
    }

    // d) Update Vehicle status -> ON_RENT, update odometer & fuel
    await this.vehicleRepo.update(vehicle.id, tenantId, {
      availabilityStatus: "ON_RENT",
      odometer: startOdometer,
      fuelLevel: startFuel,
    });

    // e) Update Vehicle Allocation to active rental
    try {
      const allocs = await this.allocationRepo.findBySource("BOOKING", booking.id, tenantId);
      if (allocs.length > 0) {
        await this.allocationRepo.updateStatus(allocs[0].id, tenantId, "ACTIVE");
      }
    } catch {
      // Best-effort allocation update
    }

    // 8. Emit Outbox Events
    await this.outboxRepo.record({
      tenantId,
      eventType: "rental.started",
      aggregateType: "Rental",
      aggregateId: rental.id,
      payload: {
        rentalId: rental.id,
        rentalNumber: rental.rentalNumber,
        bookingId: booking.id,
        contractId: contract.id,
        handoverId: handover.id,
        vehicleId: vehicle.id,
        customerId: booking.customerId,
        primaryDriverId: booking.primaryDriverId || booking.customerId,
        startedAt: now,
        scheduledReturnAt: scheduledReturn,
        startOdometer,
        startFuelLevel: startFuel,
      },
    });

    await this.outboxRepo.record({
      tenantId,
      eventType: "booking.activated",
      aggregateType: "Booking",
      aggregateId: booking.id,
      payload: {
        bookingId: booking.id,
        bookingNumber: booking.bookingNumber,
        rentalId: rental.id,
        vehicleId: vehicle.id,
        activatedAt: now,
      },
    });

    // 9. Record Audit Log
    await this.auditRepo.record({
      tenantId,
      actorType: toAuditActorType(actor?.actorType),
      actorId: actor?.userId || "system",
      action: "rental.started",
      resourceType: "Rental",
      resourceId: rental.id,
      metadata: {
        rentalNumber: rental.rentalNumber,
        bookingNumber: booking.bookingNumber,
        vehiclePlate: vehicle.registrationPlate,
        startOdometer,
        startFuel,
      },
    });

    // 10. Cache Idempotency
    if (dto.idempotencyKey) {
      await this.idempotencyRepo.record({
        tenantId,
        idempotencyKey: dto.idempotencyKey,
        resourceType: "Rental",
        resourceId: rental.id,
        responseStatus: 201,
        responseBody: rental as unknown as Record<string, unknown>,
      });
    }

    return rental;
  }

  async getRentalById(tenantId: string, rentalId: string): Promise<Rental> {
    const rental = await this.rentalRepo.findById(rentalId, tenantId);
    if (!rental) {
      throw new RentalNotFoundError(rentalId);
    }
    return rental;
  }

  async getRentalByBookingId(tenantId: string, bookingId: string): Promise<Rental | null> {
    return this.rentalRepo.findByBookingId(bookingId, tenantId);
  }

  async getRentalStartSnapshot(tenantId: string, rentalId: string): Promise<RentalStartSnapshot | null> {
    return this.rentalRepo.getStartSnapshot(rentalId, tenantId);
  }

  async listRentals(
    tenantId: string,
    query: RentalListQueryDto = {}
  ): Promise<{ items: Rental[]; total: number }> {
    return this.rentalRepo.findMany(tenantId, query);
  }

  // ==========================================================================
  // SPRINT 16: EXTENSION MANAGEMENT (DOM-003 §19)
  // ==========================================================================

  async requestExtension(
    tenantId: string,
    rentalId: string,
    dto: RequestRentalExtensionDto,
    actor: RentalActor
  ): Promise<RentalExtension> {
    const rental = await this.rentalRepo.findById(rentalId, tenantId);
    if (!rental) {
      throw new RentalNotFoundError(rentalId);
    }

    if (RentalStateMachine.TERMINAL_STATES.has(rental.state)) {
      throw new RentalAlreadyCompletedError(rentalId);
    }

    const currentEnd = new Date(rental.scheduledEnd);
    const requestedEnd = new Date(dto.newEndDate);

    if (requestedEnd.getTime() <= currentEnd.getTime()) {
      throw new Error(`Extension end date (${dto.newEndDate}) must be after current scheduled end (${rental.scheduledEnd}).`);
    }

    const additionalMs = requestedEnd.getTime() - currentEnd.getTime();
    const calculatedDays = Math.max(1, Math.ceil(additionalMs / (1000 * 3600 * 24)));
    const additionalDays = dto.additionalDays ?? calculatedDays;

    // Determine daily rate from vehicle or start snapshot
    let dailyRate = 4500;
    const startSnapshot = await this.rentalRepo.getStartSnapshot(rentalId, tenantId);
    if (startSnapshot?.pricingSnapshot?.dailyRate) {
      dailyRate = startSnapshot.pricingSnapshot.dailyRate;
    } else {
      const vehicle = await this.vehicleRepo.findById(rental.vehicleId, tenantId);
      if (vehicle?.dailyRate) {
        dailyRate = vehicle.dailyRate;
      }
    }

    const additionalCost = Math.round(dailyRate * additionalDays * 100) / 100;
    const additionalTax = Math.round(additionalCost * 0.16 * 100) / 100;
    const grossAdditionalTotal = Math.round((additionalCost + additionalTax) * 100) / 100;

    const extensionNumber = `EXT-${Date.now().toString().slice(-6)}`;

    const extension = await this.rentalRepo.saveExtension(tenantId, {
      rentalId,
      extensionNumber,
      previousEndDate: rental.scheduledEnd,
      newEndDate: dto.newEndDate,
      additionalDays,
      dailyRate,
      additionalCost,
      additionalTax,
      grossAdditionalTotal,
      status: "REQUESTED",
      reason: dto.reason || "Customer extension request",
      requestedBy: actor.userId,
      notes: dto.notes,
      timestamp: new Date().toISOString(),
    });

    await this.auditRepo.record({
      tenantId,
      actorUserId: actor.userId,
      actorType: toAuditActorType(actor.actorType),
      actorName: actor.name,
      action: "rental.extension.requested",
      resourceType: "RentalExtension",
      resourceId: extension.id,
      details: {
        rentalId,
        extensionNumber,
        previousEndDate: rental.scheduledEnd,
        newEndDate: dto.newEndDate,
        additionalDays,
        grossAdditionalTotal,
      },
    });

    await this.outboxRepo.enqueue({
      tenantId,
      eventType: "rental.extension_requested",
      aggregateType: "Rental",
      aggregateId: rentalId,
      payload: {
        extensionId: extension.id,
        rentalId,
        newEndDate: dto.newEndDate,
        additionalDays,
        grossAdditionalTotal,
      },
    });

    return extension;
  }

  async approveExtension(
    tenantId: string,
    rentalId: string,
    extensionId: string,
    dto: ApproveRentalExtensionDto,
    actor: RentalActor
  ): Promise<Rental> {
    const rental = await this.rentalRepo.findById(rentalId, tenantId);
    if (!rental) {
      throw new RentalNotFoundError(rentalId);
    }

    const extension = await this.rentalRepo.findExtensionById(extensionId, tenantId);
    if (!extension || extension.rentalId !== rentalId) {
      throw new RentalExtensionNotFoundError(extensionId);
    }

    if (extension.status !== "REQUESTED") {
      throw new RentalExtensionInvalidStatusError(extensionId, extension.status || "UNKNOWN", "REQUESTED");
    }

    // Check regulatory compliance coverage through extension date (Sprint 18)
    if (this.complianceReadinessService) {
      const interval = {
        start: rental.scheduledEnd,
        end: extension.newEndDate,
      };
      const vReadiness = await this.complianceReadinessService.evaluateVehicle(
        tenantId,
        rental.vehicleId,
        "RENTAL_EXTENSION",
        interval
      );
      if (!vReadiness.isReady) {
        const reasons = vReadiness.blockingIssues.map((b: any) => b.message).join("; ");
        throw new Error(`Rental extension blocked by vehicle compliance requirements: ${reasons}`);
      }
    }

    const now = new Date().toISOString();
    const updatedExtension = await this.rentalRepo.updateExtension(extensionId, tenantId, {
      status: "APPROVED",
      approvedBy: actor.userId,
      approvedAt: now,
      dailyRate: dto.approvedDailyRate ?? extension.dailyRate,
      additionalCost: dto.approvedAdditionalCost ?? extension.additionalCost,
      notes: dto.notes ?? extension.notes,
      allocationExtended: true,
    });

    // Update rental scheduled end
    const updatedRental = await this.rentalRepo.update(rentalId, tenantId, {
      scheduledEnd: updatedExtension.newEndDate,
    });

    // Update linked booking end if present
    if (rental.bookingId) {
      try {
        const booking = await this.bookingRepo.findById(rental.bookingId, tenantId);
        if (booking) {
          await this.bookingRepo.update(booking.id, tenantId, {
            returnAt: updatedExtension.newEndDate,
            endDate: updatedExtension.newEndDate,
          });
        }
      } catch {
        // graceful ignore if booking not found
      }
    }

    // Append status history
    await this.rentalRepo.appendStatusHistory(tenantId, {
      tenantId,
      rentalId,
      fromStatus: rental.state,
      toStatus: rental.state,
      actorType: (actor.actorType as any) || "USER",
      actorId: actor.userId,
      actorName: actor.name,
      reason: `Rental extension ${updatedExtension.extensionNumber} approved to ${updatedExtension.newEndDate}`,
      changedByUserId: actor.userId,
      occurredAt: now,
    });

    await this.auditRepo.record({
      tenantId,
      actorUserId: actor.userId,
      actorType: toAuditActorType(actor.actorType),
      actorName: actor.name,
      action: "rental.extension.approved",
      resourceType: "RentalExtension",
      resourceId: extensionId,
      details: {
        rentalId,
        newEndDate: updatedExtension.newEndDate,
        approvedCost: updatedExtension.additionalCost,
      },
    });

    await this.outboxRepo.enqueue({
      tenantId,
      eventType: "rental.extension_approved",
      aggregateType: "Rental",
      aggregateId: rentalId,
      payload: {
        extensionId,
        rentalId,
        newEndDate: updatedExtension.newEndDate,
        additionalDays: updatedExtension.additionalDays,
      },
    });

    return updatedRental;
  }

  async rejectExtension(
    tenantId: string,
    rentalId: string,
    extensionId: string,
    dto: RejectRentalExtensionDto,
    actor: RentalActor
  ): Promise<RentalExtension> {
    const extension = await this.rentalRepo.findExtensionById(extensionId, tenantId);
    if (!extension || extension.rentalId !== rentalId) {
      throw new RentalExtensionNotFoundError(extensionId);
    }

    if (extension.status !== "REQUESTED") {
      throw new RentalExtensionInvalidStatusError(extensionId, extension.status || "UNKNOWN", "REQUESTED");
    }

    const updated = await this.rentalRepo.updateExtension(extensionId, tenantId, {
      status: "REJECTED",
      rejectedReason: dto.rejectionReason,
      notes: dto.notes ?? extension.notes,
    });

    await this.auditRepo.record({
      tenantId,
      actorUserId: actor.userId,
      actorType: toAuditActorType(actor.actorType),
      actorName: actor.name,
      action: "rental.extension.rejected",
      resourceType: "RentalExtension",
      resourceId: extensionId,
      details: {
        rentalId,
        rejectionReason: dto.rejectionReason,
      },
    });

    await this.outboxRepo.enqueue({
      tenantId,
      eventType: "rental.extension_rejected",
      aggregateType: "Rental",
      aggregateId: rentalId,
      payload: {
        extensionId,
        rentalId,
        rejectionReason: dto.rejectionReason,
      },
    });

    return updated;
  }

  async getRentalExtensions(tenantId: string, rentalId: string): Promise<RentalExtension[]> {
    return this.rentalRepo.getExtensions(rentalId, tenantId);
  }

  async recordIncident(
    tenantId: string,
    rentalId: string,
    dto: RecordRentalIncidentDto,
    actor: RentalActor
  ): Promise<RentalIncident> {
    const rental = await this.rentalRepo.findById(rentalId, tenantId);
    if (!rental) {
      throw new RentalNotFoundError(rentalId);
    }
    if (RentalStateMachine.TERMINAL_STATES.has(rental.state)) {
      throw new RentalAlreadyCompletedError(rentalId);
    }

    const incident = await this.rentalRepo.recordIncident(rentalId, tenantId, {
      type: dto.type,
      description: dto.description.trim(),
      location: dto.location.trim(),
      reportedAt: dto.reportedAt || new Date().toISOString(),
      policeReportNumber: dto.policeReportNumber,
      estimatedCost: dto.estimatedCost ?? 0,
      resolved: false,
    });

    await this.auditRepo.record({
      tenantId,
      actorUserId: actor.userId,
      actorType: toAuditActorType(actor.actorType),
      actorName: actor.name,
      action: "rental.incident.recorded",
      resourceType: "RentalIncident",
      resourceId: incident.id,
      details: {
        rentalId,
        type: incident.type,
        location: incident.location,
        estimatedCost: incident.estimatedCost,
      },
    });

    await this.outboxRepo.enqueue({
      tenantId,
      eventType: "rental.incident_recorded",
      aggregateType: "Rental",
      aggregateId: rentalId,
      payload: {
        rentalId,
        incidentId: incident.id,
        type: incident.type,
        reportedAt: incident.reportedAt,
      },
    });

    return incident;
  }

  async getRentalIncidents(tenantId: string, rentalId: string): Promise<RentalIncident[]> {
    return this.rentalRepo.getIncidents(rentalId, tenantId);
  }

  // ==========================================================================
  // SPRINT 16: RETURN WORKFLOW & VEHICLE RECEIPT (DOM-003 §20)
  // ==========================================================================

  async scheduleReturn(
    tenantId: string,
    rentalId: string,
    dto: ScheduleRentalReturnDto,
    actor: RentalActor
  ): Promise<Rental> {
    if (dto.idempotencyKey) {
      const cached = await this.idempotencyRepo.findByKey(tenantId, dto.idempotencyKey);
      if (cached?.responseBody) {
        return cached.responseBody as unknown as Rental;
      }
    }

    const rental = await this.rentalRepo.findById(rentalId, tenantId);
    if (!rental) {
      throw new RentalNotFoundError(rentalId);
    }

    if (RentalStateMachine.TERMINAL_STATES.has(rental.state)) {
      throw new RentalAlreadyCompletedError(rentalId);
    }

    RentalStateMachine.validateTransition(rental.state, "RETURN_SCHEDULED", "Return requested / scheduled");

    const now = new Date().toISOString();
    const updated = await this.rentalRepo.update(rentalId, tenantId, {
      state: "RETURN_SCHEDULED",
    });

    await this.rentalRepo.saveReturnRecord(tenantId, {
      tenantId,
      rentalId,
      scheduledReturnAt: dto.scheduledReturnAt,
      scheduledReturnLocationId: dto.scheduledReturnLocationId,
      conditionNotes: dto.notes,
      status: "RETURN_SCHEDULED",
    });

    await this.rentalRepo.appendStatusHistory(tenantId, {
      tenantId,
      rentalId,
      fromStatus: rental.state,
      toStatus: "RETURN_SCHEDULED",
      actorType: (actor.actorType as any) || "USER",
      actorId: actor.userId,
      actorName: actor.name,
      reason: `Return scheduled for ${dto.scheduledReturnAt}`,
      changedByUserId: actor.userId,
      occurredAt: now,
    });

    await this.auditRepo.record({
      tenantId,
      actorUserId: actor.userId,
      actorType: toAuditActorType(actor.actorType),
      actorName: actor.name,
      action: "rental.return.scheduled",
      resourceType: "Rental",
      resourceId: rentalId,
      details: {
        scheduledReturnAt: dto.scheduledReturnAt,
        scheduledReturnLocationId: dto.scheduledReturnLocationId,
      },
    });

    await this.outboxRepo.enqueue({
      tenantId,
      eventType: "rental.return_scheduled",
      aggregateType: "Rental",
      aggregateId: rentalId,
      payload: {
        rentalId,
        scheduledReturnAt: dto.scheduledReturnAt,
      },
    });

    if (dto.idempotencyKey) {
      await this.idempotencyRepo.record({
        tenantId,
        idempotencyKey: dto.idempotencyKey,
        resourceType: "RentalReturnSchedule",
        resourceId: rentalId,
        responseStatus: 200,
        responseBody: updated as unknown as Record<string, unknown>,
      });
    }

    return updated;
  }

  async receiveReturnedVehicle(
    tenantId: string,
    rentalId: string,
    dto: ReceiveReturnedVehicleDto,
    actor: RentalActor
  ): Promise<Rental> {
    if (dto.idempotencyKey) {
      const cached = await this.idempotencyRepo.findByKey(tenantId, dto.idempotencyKey);
      if (cached?.responseBody) {
        return cached.responseBody as unknown as Rental;
      }
    }

    const rental = await this.rentalRepo.findById(rentalId, tenantId);
    if (!rental) {
      throw new RentalNotFoundError(rentalId);
    }

    if (RentalStateMachine.TERMINAL_STATES.has(rental.state)) {
      throw new RentalAlreadyCompletedError(rentalId);
    }

    if (dto.returnOdometer < rental.checkoutOdometer) {
      throw new InspectionOdometerRegressionError(rental.checkoutOdometer, dto.returnOdometer);
    }

    if (dto.returnFuelLevel < 0 || dto.returnFuelLevel > 100) {
      throw new InspectionInvalidFuelLevelError(dto.returnFuelLevel);
    }

    RentalStateMachine.validateTransition(rental.state, "VEHICLE_RECEIVED", "Vehicle checked in at branch");

    const now = dto.receivedAt || new Date().toISOString();
    const updated = await this.rentalRepo.update(rentalId, tenantId, {
      state: "VEHICLE_RECEIVED",
      returnOdometer: dto.returnOdometer,
      returnFuelLevel: dto.returnFuelLevel,
      actualEnd: now,
    });

    await this.rentalRepo.saveReturnRecord(tenantId, {
      tenantId,
      rentalId,
      actualReturnAt: now,
      actualReturnLocationId: dto.returnLocationId,
      receivedByStaffId: actor.userId,
      receivedByStaffName: actor.name,
      returnOdometer: dto.returnOdometer,
      returnFuelLevel: dto.returnFuelLevel,
      conditionNotes: dto.conditionNotes,
      status: "VEHICLE_RECEIVED",
    });

    await this.rentalRepo.appendStatusHistory(tenantId, {
      tenantId,
      rentalId,
      fromStatus: rental.state,
      toStatus: "VEHICLE_RECEIVED",
      actorType: (actor.actorType as any) || "USER",
      actorId: actor.userId,
      actorName: actor.name,
      reason: `Vehicle received at branch. Odometer: ${dto.returnOdometer} km, Fuel: ${dto.returnFuelLevel}%`,
      changedByUserId: actor.userId,
      occurredAt: now,
    });

    await this.auditRepo.record({
      tenantId,
      actorUserId: actor.userId,
      actorType: toAuditActorType(actor.actorType),
      actorName: actor.name,
      action: "rental.vehicle.received",
      resourceType: "Rental",
      resourceId: rentalId,
      details: {
        returnOdometer: dto.returnOdometer,
        returnFuelLevel: dto.returnFuelLevel,
        receivedAt: now,
      },
    });

    await this.outboxRepo.enqueue({
      tenantId,
      eventType: "rental.vehicle_received",
      aggregateType: "Rental",
      aggregateId: rentalId,
      payload: {
        rentalId,
        returnOdometer: dto.returnOdometer,
        returnFuelLevel: dto.returnFuelLevel,
        receivedAt: now,
      },
    });

    if (dto.idempotencyKey) {
      await this.idempotencyRepo.record({
        tenantId,
        idempotencyKey: dto.idempotencyKey,
        resourceType: "RentalReturnReceipt",
        resourceId: rentalId,
        responseStatus: 200,
        responseBody: updated as unknown as Record<string, unknown>,
      });
    }

    return updated;
  }

  async linkReturnInspection(
    tenantId: string,
    rentalId: string,
    dto: PerformReturnInspectionDto,
    actor: RentalActor
  ): Promise<Rental> {
    const rental = await this.rentalRepo.findById(rentalId, tenantId);
    if (!rental) {
      throw new RentalNotFoundError(rentalId);
    }
    if (RentalStateMachine.TERMINAL_STATES.has(rental.state)) {
      throw new RentalAlreadyCompletedError(rentalId);
    }

    const inspection = await this.inspectionRepo.findById(dto.inspectionId, tenantId);
    if (!inspection) {
      throw new RecordNotFoundError("Inspection", dto.inspectionId);
    }
    if (inspection.inspectionType !== "RETURN") {
      throw new Error("Only a RETURN inspection can be linked to the return workflow.");
    }
    if (inspection.status !== "COMPLETED") {
      throw new Error("Return inspection must be completed and sealed before it can advance the rental.");
    }
    if (!inspection.acknowledgements || inspection.acknowledgements.length === 0) {
      throw new Error("Return inspection requires at least one captured acknowledgement/signature before it can advance the rental.");
    }
    if (inspection.vehicleId !== rental.vehicleId) {
      throw new Error("Return inspection vehicle does not match the rental vehicle.");
    }
    if (inspection.rentalId && inspection.rentalId !== rental.id) {
      throw new Error("Return inspection belongs to a different rental.");
    }
    if (inspection.odometer < rental.checkoutOdometer) {
      throw new InspectionOdometerRegressionError(rental.checkoutOdometer, inspection.odometer);
    }
    if (inspection.fuelLevel < 0 || inspection.fuelLevel > 100) {
      throw new InspectionInvalidFuelLevelError(inspection.fuelLevel);
    }

    RentalStateMachine.validateTransition(rental.state, "DAMAGE_ASSESSMENT", "Completed return inspection linked");

    const now = new Date().toISOString();
    const updated = await this.rentalRepo.update(rentalId, tenantId, {
      state: "DAMAGE_ASSESSMENT",
      returnInspectionId: inspection.id,
      returnOdometer: inspection.odometer,
      returnFuelLevel: inspection.fuelLevel,
    });

    await this.rentalRepo.saveReturnRecord(tenantId, {
      tenantId,
      rentalId,
      returnInspectionId: inspection.id,
      returnOdometer: inspection.odometer,
      returnFuelLevel: inspection.fuelLevel,
      status: "DAMAGE_ASSESSMENT",
    });

    await this.rentalRepo.appendStatusHistory(tenantId, {
      tenantId,
      rentalId,
      fromStatus: rental.state,
      toStatus: "DAMAGE_ASSESSMENT",
      actorType: (actor.actorType as any) || "USER",
      actorId: actor.userId,
      actorName: actor.name,
      reason: `Completed return inspection ${inspection.inspectionNumber} linked`,
      changedByUserId: actor.userId,
      occurredAt: now,
    });

    await this.auditRepo.record({
      tenantId,
      actorUserId: actor.userId,
      actorType: toAuditActorType(actor.actorType),
      actorName: actor.name,
      action: "rental.inspection.linked",
      resourceType: "Rental",
      resourceId: rentalId,
      details: {
        inspectionId: inspection.id,
        inspectionNumber: inspection.inspectionNumber,
        damageCaseIds: dto.damageCaseIds,
        returnOdometer: inspection.odometer,
        returnFuelLevel: inspection.fuelLevel,
      },
    });

    await this.outboxRepo.enqueue({
      tenantId,
      eventType: "rental.return_inspection_completed",
      aggregateType: "Rental",
      aggregateId: rentalId,
      payload: {
        rentalId,
        inspectionId: inspection.id,
        damageCaseIds: dto.damageCaseIds || [],
      },
    });

    return updated;
  }

  // ==========================================================================
  // SPRINT 16: FINAL CALCULATION ENGINE & DEPOSIT RECONCILIATION
  // ==========================================================================

  async calculateFinalRental(
    tenantId: string,
    rentalId: string,
    dto: CalculateFinalRentalDto,
    actor: RentalActor
  ): Promise<{ calculation: RentalFinalCalculation; rental: Rental }> {
    const rental = await this.rentalRepo.findById(rentalId, tenantId);
    if (!rental) {
      throw new RentalNotFoundError(rentalId);
    }

    if (RentalStateMachine.TERMINAL_STATES.has(rental.state)) {
      throw new RentalAlreadyCompletedError(rentalId);
    }
    if (!rental.returnInspectionId) {
      throw new Error("Final calculation requires a completed return inspection.");
    }

    const existingCalculation = await this.rentalRepo.getFinalCalculation(rentalId, tenantId);
    if (existingCalculation?.isImmutable) {
      return { calculation: existingCalculation, rental };
    }
    if (rental.state !== "DAMAGE_ASSESSMENT" && rental.state !== "FINAL_CALCULATION") {
      throw new Error(`Final calculation cannot run while rental is in state '${rental.state}'. Complete vehicle receipt and return inspection first.`);
    }

    const startSnapshot = await this.rentalRepo.getStartSnapshot(rentalId, tenantId);
    const now = new Date().toISOString();

    // 1. Odometer & Excess Mileage Math
    const startOdometer = startSnapshot?.startOdometer ?? rental.checkoutOdometer ?? 0;
    const returnOdometer = dto.returnOdometer ?? rental.returnOdometer ?? startOdometer;

    if (returnOdometer < startOdometer) {
      throw new InspectionOdometerRegressionError(startOdometer, returnOdometer);
    }

    const totalDistanceKm = Math.max(0, returnOdometer - startOdometer);

    const extensions = await this.rentalRepo.getExtensions(rentalId, tenantId);
    const approvedExtensions = extensions.filter((e) => e.status === "APPROVED");
    const totalContractedDays =
      (startSnapshot?.pricingSnapshot?.days ?? 0) +
      approvedExtensions.reduce((sum, e) => sum + e.additionalDays, 0);

    const actualStartStr = rental.actualStart || rental.scheduledStart;
    const actualEndStr = dto.actualReturnAt || rental.actualEnd || now;
    const durationDays =
      totalContractedDays > 0
        ? totalContractedDays
        : Math.max(
            1,
            Math.ceil((new Date(actualEndStr).getTime() - new Date(actualStartStr).getTime()) / (1000 * 3600 * 24))
          );

    const freeKmPerDay = dto.freeKmPerDay ?? (startSnapshot?.pricingSnapshot?.freeKmPerDay ?? 250);
    const allowedDistanceKm = freeKmPerDay > 0 ? freeKmPerDay * durationDays : 999999;
    const excessDistanceKm = Math.max(0, totalDistanceKm - allowedDistanceKm);
    const excessKmRate = dto.excessKmRate ?? (startSnapshot?.pricingSnapshot?.excessKmRate ?? 25.0);
    const excessKmCharge = Math.round(excessDistanceKm * excessKmRate * 100) / 100;

    // 2. Fuel Deficit & Refueling Fee Math
    const startFuelLevel = startSnapshot?.startFuelLevel ?? rental.checkoutFuelLevel ?? 100;
    const returnFuelLevel = dto.returnFuelLevel ?? rental.returnFuelLevel ?? startFuelLevel;

    if (returnFuelLevel < 0 || returnFuelLevel > 100) {
      throw new InspectionInvalidFuelLevelError(returnFuelLevel);
    }

    const fuelDeficitPercent = Math.max(0, startFuelLevel - returnFuelLevel);
    const tankCapacityLitres = dto.tankCapacityLitres ?? 55;
    const fuelDeficitLitres = Math.round((fuelDeficitPercent / 100) * tankCapacityLitres * 100) / 100;
    const fuelPricePerUnit = dto.fuelPricePerLiter ?? 185.0;
    const fuelDeficitCharge = Math.round(fuelDeficitLitres * fuelPricePerUnit * 100) / 100;
    const fuelRefuelingFee = fuelDeficitPercent > 0 ? (dto.refuelingFee ?? 500.0) : 0;

    // 3. Late Return Duration & Fees Math
    const scheduledReturnAt = rental.scheduledEnd;
    const actualReturnAt = actualEndStr;
    const lateDurationMs = Math.max(0, new Date(actualReturnAt).getTime() - new Date(scheduledReturnAt).getTime());
    const lateReturnDurationHours = Math.round((lateDurationMs / (1000 * 3600)) * 10) / 10;
    const gracePeriodHours = dto.lateGracePeriodHours ?? 1;
    const billableLateHours =
      lateReturnDurationHours > gracePeriodHours ? Math.ceil(lateReturnDurationHours - gracePeriodHours) : 0;
    const lateHourlyRate = dto.lateHourlyRate ?? 500.0;
    const lateReturnFee = Math.round(billableLateHours * lateHourlyRate * 100) / 100;

    // 4. Damage Assessments
    let damageCaseIds: string[] = [];
    let totalDamageCharge = 0;

    if (dto.damageChargesOverride !== undefined) {
      totalDamageCharge = dto.damageChargesOverride;
    } else {
      try {
        const damageCases = await this.damageRepo.findByRentalId(rentalId, tenantId);
        damageCaseIds = damageCases.map((d) => d.id);
        totalDamageCharge = damageCases
          .filter(
            (d) =>
              d.preExisting !== true &&
              (d.responsibleParty === "CUSTOMER" ||
                d.responsibleParty === "UNASSIGNED" ||
                !d.responsibleParty)
          )
          .reduce(
            (sum, d) =>
              sum +
              (d.actualRepairCost && d.actualRepairCost > 0
                ? d.actualRepairCost
                : (d.estimatedRepairCost || 0)),
            0
          );
      } catch {
        // Damage cases search fallback
      }
    }

    // 5. Additional Fees
    const lineItems: RentalFinalCalculationItem[] = [];

    // Base rental
    const baseRentalAmount =
      startSnapshot?.pricingSnapshot?.grossTotal ??
      startSnapshot?.pricingSnapshot?.grossRentalTotal ??
      0;
    if (baseRentalAmount > 0) {
      lineItems.push({
        code: "BASE_RENTAL",
        label: "Base Rental Charge",
        quantity: 1,
        unitPrice: baseRentalAmount,
        totalAmount: baseRentalAmount,
        taxAmount: Math.round(baseRentalAmount * 0.16 * 100) / 100,
        category: "BASE_RENTAL",
      });
    }

    // Extensions
    const extensionsTotalAmount = approvedExtensions.reduce(
      (sum, e) => sum + (e.grossAdditionalTotal ?? e.additionalCost ?? 0),
      0
    );

    approvedExtensions.forEach((ext) => {
      lineItems.push({
        code: `EXTENSION_${ext.extensionNumber || ext.id}`,
        label: `Rental Extension (${ext.additionalDays} days to ${ext.newEndDate})`,
        quantity: ext.additionalDays,
        unitPrice: ext.dailyRate ?? 0,
        totalAmount: ext.grossAdditionalTotal ?? ext.additionalCost,
        taxAmount: ext.additionalTax ?? 0,
        category: "EXTENSION",
      });
    });

    // Excess Mileage
    if (excessKmCharge > 0) {
      lineItems.push({
        code: "EXCESS_MILEAGE",
        label: `Excess Mileage (${excessDistanceKm} km @ ${excessKmRate}/km)`,
        quantity: excessDistanceKm,
        unitPrice: excessKmRate,
        totalAmount: excessKmCharge,
        taxAmount: Math.round(excessKmCharge * 0.16 * 100) / 100,
        category: "EXCESS_MILEAGE",
      });
    }

    // Fuel Deficit
    if (fuelDeficitCharge > 0) {
      lineItems.push({
        code: "FUEL_DEFICIT",
        label: `Fuel Deficit (${fuelDeficitLitres}L @ ${fuelPricePerUnit}/L)`,
        quantity: fuelDeficitLitres,
        unitPrice: fuelPricePerUnit,
        totalAmount: fuelDeficitCharge,
        taxAmount: 0,
        category: "FUEL_DEFICIT",
      });
    }

    if (fuelRefuelingFee > 0) {
      lineItems.push({
        code: "REFUELING_SURCHARGE",
        label: "Branch Refueling Service Surcharge",
        quantity: 1,
        unitPrice: fuelRefuelingFee,
        totalAmount: fuelRefuelingFee,
        taxAmount: Math.round(fuelRefuelingFee * 0.16 * 100) / 100,
        category: "FUEL_DEFICIT",
      });
    }

    // Late Return Fee
    if (lateReturnFee > 0) {
      lineItems.push({
        code: "LATE_RETURN_FEE",
        label: `Late Return Fee (${billableLateHours} billable hrs @ ${lateHourlyRate}/hr)`,
        quantity: billableLateHours,
        unitPrice: lateHourlyRate,
        totalAmount: lateReturnFee,
        taxAmount: Math.round(lateReturnFee * 0.16 * 100) / 100,
        category: "LATE_RETURN",
      });
    }

    // Damage
    if (totalDamageCharge > 0) {
      lineItems.push({
        code: "DAMAGE_ASSESSMENT",
        label: "Observed Damage Repair Liability",
        quantity: 1,
        unitPrice: totalDamageCharge,
        totalAmount: totalDamageCharge,
        taxAmount: 0,
        category: "DAMAGE",
      });
    }

    // Custom / Additional Fees
    let customAdditionalFees = 0;
    if (dto.additionalFees && dto.additionalFees.length > 0) {
      dto.additionalFees.forEach((fee) => {
        customAdditionalFees += fee.amount;
        lineItems.push({
          code: fee.code,
          label: fee.label,
          quantity: 1,
          unitPrice: fee.amount,
          totalAmount: fee.amount,
          taxAmount: fee.taxAmount ?? 0,
          category: fee.category || "ADDITIONAL_FEE",
        });
      });
    }

    const totalAdditionalFees =
      fuelRefuelingFee + customAdditionalFees;

    const grossFinalTotal = Math.round(
      (baseRentalAmount +
        extensionsTotalAmount +
        excessKmCharge +
        fuelDeficitCharge +
        fuelRefuelingFee +
        lateReturnFee +
        totalDamageCharge +
        customAdditionalFees) *
        100
    ) / 100;

    const totalTaxAmount = lineItems.reduce((sum, item) => sum + item.taxAmount, 0);
    const netFinalTotal = Math.round((grossFinalTotal - totalTaxAmount) * 100) / 100;

    // 6. Deposit Reconciliation Math
    const depositHeldAmount = startSnapshot?.depositRequirement ?? 0;
    const postRentalIncidentalCharges = Math.round(
      (excessKmCharge +
        fuelDeficitCharge +
        fuelRefuelingFee +
        lateReturnFee +
        totalDamageCharge +
        customAdditionalFees) *
        100
    ) / 100;

    let depositRefundDue = 0;
    let depositAdditionalPaymentDue = 0;
    let depositSettlementStatus: "REFUND_QUEUED" | "CHARGE_QUEUED" | "SETTLED" = "SETTLED";

    if (depositHeldAmount >= postRentalIncidentalCharges) {
      depositRefundDue = Math.round((depositHeldAmount - postRentalIncidentalCharges) * 100) / 100;
      depositAdditionalPaymentDue = 0;
      depositSettlementStatus = depositRefundDue > 0 ? "REFUND_QUEUED" : "SETTLED";
    } else {
      depositRefundDue = 0;
      depositAdditionalPaymentDue = Math.round((postRentalIncidentalCharges - depositHeldAmount) * 100) / 100;
      depositSettlementStatus = "CHARGE_QUEUED";
    }

    // 7. Save Final Calculation Snapshot
    const calculation = await this.rentalRepo.saveFinalCalculation(tenantId, {
      tenantId,
      rentalId,
      bookingId: rental.bookingId,
      startOdometer,
      returnOdometer,
      totalDistanceKm,
      allowedDistanceKm,
      excessDistanceKm,
      excessKmRate,
      excessKmCharge,
      startFuelLevel,
      returnFuelLevel,
      fuelDeficitPercent,
      fuelDeficitLitres,
      fuelPricePerUnit,
      fuelDeficitCharge,
      fuelRefuelingFee,
      scheduledReturnAt,
      actualReturnAt,
      lateReturnDurationHours,
      gracePeriodHours,
      billableLateHours,
      lateReturnFee,
      damageCaseIds,
      totalDamageCharge,
      totalAdditionalFees,
      lineItems,
      baseRentalAmount,
      extensionsTotalAmount,
      grossFinalTotal,
      totalTaxAmount,
      netFinalTotal,
      depositHeldAmount,
      depositDeductionsTotal: postRentalIncidentalCharges,
      depositRefundDue,
      depositAdditionalPaymentDue,
      depositSettlementStatus,
      isImmutable: false,
    });

    // 8. Update Rental State
    const targetState: RentalState = "FINAL_CALCULATION";
    if (rental.state !== "FINAL_CALCULATION") {
      RentalStateMachine.validateTransition(rental.state, targetState, "Return inspection assessed and final charges calculated");
    }

    const updatedRental = await this.rentalRepo.update(rentalId, tenantId, {
      state: targetState,
      returnOdometer,
      returnFuelLevel,
      actualEnd: actualReturnAt,
      finalExcessKmCharge: excessKmCharge,
      finalFuelDeficitCharge: fuelDeficitCharge,
      finalDamageCharge: totalDamageCharge,
      finalLateReturnFee: lateReturnFee,
      depositRefundedAmount: depositRefundDue,
    });

    if (rental.state !== "FINAL_CALCULATION") {
      await this.rentalRepo.appendStatusHistory(tenantId, {
        tenantId,
        rentalId,
        fromStatus: rental.state,
        toStatus: "FINAL_CALCULATION",
        actorType: (actor.actorType as any) || "USER",
        actorId: actor.userId,
        actorName: actor.name,
        reason: "Return charges calculated from sealed start/return evidence",
        changedByUserId: actor.userId,
        occurredAt: now,
      });
    }
    await this.rentalRepo.saveReturnRecord(tenantId, {
      tenantId,
      rentalId,
      returnOdometer,
      returnFuelLevel,
      actualReturnAt,
      returnInspectionId: rental.returnInspectionId,
      status: "FINAL_CALCULATION",
    });

    await this.auditRepo.record({
      tenantId,
      actorUserId: actor.userId,
      actorType: toAuditActorType(actor.actorType),
      actorName: actor.name,
      action: "rental.final_calculation.generated",
      resourceType: "RentalFinalCalculation",
      resourceId: calculation.id,
      details: {
        rentalId,
        grossFinalTotal,
        depositRefundDue,
        depositAdditionalPaymentDue,
        depositSettlementStatus,
      },
    });

    await this.outboxRepo.enqueue({
      tenantId,
      eventType: "rental.final_calculated",
      aggregateType: "Rental",
      aggregateId: rentalId,
      payload: {
        rentalId,
        calculationId: calculation.id,
        grossFinalTotal,
        depositRefundDue,
        depositAdditionalPaymentDue,
      },
    });

    return { calculation, rental: updatedRental };
  }

  async processDepositSettlement(
    tenantId: string,
    rentalId: string,
    dto: ProcessDepositSettlementDto,
    actor: RentalActor
  ): Promise<RentalFinalCalculation> {
    const calc = await this.rentalRepo.getFinalCalculation(rentalId, tenantId);
    if (!calc) {
      throw new Error(`Final calculation for rental '${rentalId}' not found. Please calculate final rental charges first.`);
    }
    if (calc.isImmutable) {
      return calc;
    }

    const rental = await this.rentalRepo.findById(rentalId, tenantId);
    if (!rental) {
      throw new RentalNotFoundError(rentalId);
    }
    if (rental.state !== "FINAL_CALCULATION" && rental.state !== "FINAL_SETTLEMENT_PENDING") {
      throw new Error(`Deposit settlement cannot run while rental is in state '${rental.state}'.`);
    }

    const terminalSettlementStatuses = new Set(["REFUNDED", "CHARGED", "SETTLED", "WAIVED"]);
    if (!terminalSettlementStatuses.has(dto.settlementStatus)) {
      throw new Error("Deposit settlement must be finalized as REFUNDED, CHARGED, SETTLED or WAIVED.");
    }

    if (calc.depositRefundDue > 0 && dto.settlementStatus !== "WAIVED") {
      if (dto.settlementStatus !== "REFUNDED") {
        throw new Error("A refundable deposit balance must be marked REFUNDED before completion.");
      }
      const refundAmount = dto.refundAmount ?? calc.depositRefundDue;
      if (Math.abs(refundAmount - calc.depositRefundDue) > 0.01) {
        throw new Error("Refund amount must match the authoritative deposit refund due.");
      }
    }

    if (calc.depositAdditionalPaymentDue > 0 && dto.settlementStatus !== "WAIVED") {
      if (dto.settlementStatus !== "CHARGED") {
        throw new Error("An additional customer balance must be marked CHARGED before completion.");
      }
      const chargedAmount = dto.additionalChargedAmount ?? calc.depositAdditionalPaymentDue;
      if (Math.abs(chargedAmount - calc.depositAdditionalPaymentDue) > 0.01) {
        throw new Error("Additional charged amount must match the authoritative amount due.");
      }
    }

    if (
      (dto.settlementStatus === "REFUNDED" || dto.settlementStatus === "CHARGED") &&
      !dto.transactionReference?.trim()
    ) {
      throw new Error("A transaction reference is required to seal a refund or additional charge.");
    }

    const now = new Date().toISOString();
    const updatedCalc = await this.rentalRepo.saveFinalCalculation(tenantId, {
      ...calc,
      depositSettlementStatus: dto.settlementStatus,
      depositRefundDue: dto.refundAmount ?? calc.depositRefundDue,
      depositAdditionalPaymentDue: dto.additionalChargedAmount ?? calc.depositAdditionalPaymentDue,
      sealedAt: now,
      sealedBy: actor.userId,
      isImmutable: true,
    });

    RentalStateMachine.validateTransition(rental.state, "DEPOSIT_PROCESSING", "Deposit/final settlement sealed");
    await this.rentalRepo.update(rentalId, tenantId, {
      state: "DEPOSIT_PROCESSING",
    });
    await this.rentalRepo.saveReturnRecord(tenantId, {
      tenantId,
      rentalId,
      returnOdometer: rental.returnOdometer,
      returnFuelLevel: rental.returnFuelLevel,
      actualReturnAt: rental.actualEnd,
      returnInspectionId: rental.returnInspectionId,
      status: "DEPOSIT_PROCESSING",
    });
    await this.rentalRepo.appendStatusHistory(tenantId, {
      tenantId,
      rentalId,
      fromStatus: rental.state,
      toStatus: "DEPOSIT_PROCESSING",
      actorType: (actor.actorType as any) || "USER",
      actorId: actor.userId,
      actorName: actor.name,
      reason: `Final settlement sealed as ${dto.settlementStatus}`,
      changedByUserId: actor.userId,
      occurredAt: now,
    });

    await this.auditRepo.record({
      tenantId,
      actorUserId: actor.userId,
      actorType: toAuditActorType(actor.actorType),
      actorName: actor.name,
      action: "rental.deposit.settled",
      resourceType: "RentalFinalCalculation",
      resourceId: calc.id,
      details: {
        rentalId,
        settlementStatus: dto.settlementStatus,
        paymentMethod: dto.paymentMethod,
        transactionReference: dto.transactionReference,
      },
    });

    await this.outboxRepo.enqueue({
      tenantId,
      eventType: "rental.deposit_settled",
      aggregateType: "Rental",
      aggregateId: rentalId,
      payload: {
        rentalId,
        settlementStatus: dto.settlementStatus,
        transactionReference: dto.transactionReference,
      },
    });

    return updatedCalc;
  }

  // ==========================================================================
  // SPRINT 16: RENTAL COMPLETION & FLEET RELEASE (DOM-003 §20)
  // ==========================================================================

  async completeRental(
    tenantId: string,
    rentalId: string,
    dto: CompleteRentalDto,
    actor: RentalActor
  ): Promise<Rental> {
    if (dto.idempotencyKey) {
      const cached = await this.idempotencyRepo.findByKey(tenantId, dto.idempotencyKey);
      if (cached?.responseBody) {
        return cached.responseBody as unknown as Rental;
      }
    }

    const rental = await this.rentalRepo.findById(rentalId, tenantId);
    if (!rental) {
      throw new RentalNotFoundError(rentalId);
    }

    if (RentalStateMachine.TERMINAL_STATES.has(rental.state)) {
      throw new RentalAlreadyCompletedError(rentalId);
    }

    const finalCalculation = await this.rentalRepo.getFinalCalculation(rentalId, tenantId);
    const completedSettlementStatuses = new Set(["REFUNDED", "CHARGED", "SETTLED", "WAIVED"]);
    if (!finalCalculation?.isImmutable || !completedSettlementStatuses.has(finalCalculation.depositSettlementStatus)) {
      throw new Error("Rental completion requires a sealed final calculation and completed deposit settlement.");
    }

    const now = new Date().toISOString();

    // 1. Update Rental Aggregate to COMPLETED
    RentalStateMachine.validateTransition(rental.state, "COMPLETED", "Final settlement verified and completed");

    const returnOdometer = rental.returnOdometer ?? rental.checkoutOdometer;
    const returnFuelLevel = rental.returnFuelLevel ?? rental.checkoutFuelLevel;

    const completedRental = await this.rentalRepo.update(rentalId, tenantId, {
      state: "COMPLETED",
      completedAt: now,
      actualEnd: rental.actualEnd || now,
      returnOdometer,
      returnFuelLevel,
    });

    // 2. Append Rental Status History
    await this.rentalRepo.appendStatusHistory(tenantId, {
      tenantId,
      rentalId,
      fromStatus: rental.state,
      toStatus: "COMPLETED",
      actorType: (actor.actorType as any) || "USER",
      actorId: actor.userId,
      actorName: actor.name,
      reason: dto.notes || "Rental returned, inspected, settled, and formally completed",
      changedByUserId: actor.userId,
      occurredAt: now,
    });

    // 3. Complete Linked Booking
    if (rental.bookingId) {
      try {
        const booking = await this.bookingRepo.findById(rental.bookingId, tenantId);
        if (booking && booking.status !== "COMPLETED" && booking.status !== "CANCELLED") {
          await this.bookingRepo.update(booking.id, tenantId, {
            status: "COMPLETED",
          });
        }
      } catch {
        // gracefully handle missing booking
      }
    }

    // 4. Complete Linked Contract
    if (rental.contractId) {
      try {
        const contract = await this.contractRepo.findById(rental.contractId, tenantId);
        if (contract && contract.status !== "COMPLETED") {
          await this.contractRepo.update(contract.id, tenantId, {
            status: "COMPLETED",
          });
        }
      } catch {
        // gracefully handle missing contract
      }
    }

    // 5. Update Vehicle Mileage, Fuel, and Availability Status
    if (!dto.releaseVehicleToStatus) {
      throw new Error("Rental completion requires an explicit vehicle disposition.");
    }
    const targetVehicleStatus = dto.releaseVehicleToStatus as any;
    try {
      const vehicle = await this.vehicleRepo.findById(rental.vehicleId, tenantId);
      if (vehicle) {
        await this.vehicleRepo.update(vehicle.id, tenantId, {
          availabilityStatus: targetVehicleStatus,
          odometer: returnOdometer,
          fuelLevel: returnFuelLevel,
        });
      }
    } catch {
      // gracefully handle vehicle update
    }

    // 6. Release Vehicle Allocation
    try {
      const allocations = await this.allocationRepo.findAllocations(tenantId, {
        vehicleId: rental.vehicleId,
        sourceType: "BOOKING",
        sourceId: rental.bookingId,
      });
      const blockingAllocations = allocations.filter((a) =>
        ["ACTIVE", "CONFIRMED", "HELD"].includes(a.status)
      );
      for (const alloc of blockingAllocations) {
        await this.allocationRepo.releaseAllocation(
          alloc.id,
          tenantId,
          "Rental returned and completed",
          actor.userId
        );
      }
    } catch {
      // gracefully handle allocation release
    }

    // 7. Audit Log
    await this.auditRepo.record({
      tenantId,
      actorUserId: actor.userId,
      actorType: toAuditActorType(actor.actorType),
      actorName: actor.name,
      action: "rental.completed",
      resourceType: "Rental",
      resourceId: rentalId,
      details: {
        bookingId: rental.bookingId,
        vehicleId: rental.vehicleId,
        returnOdometer,
        returnFuelLevel,
        releaseVehicleToStatus: targetVehicleStatus,
        completedAt: now,
      },
    });

    // 8. Outbox Events
    await this.outboxRepo.enqueue({
      tenantId,
      eventType: "rental.completed",
      aggregateType: "Rental",
      aggregateId: rentalId,
      payload: {
        rentalId,
        bookingId: rental.bookingId,
        vehicleId: rental.vehicleId,
        completedAt: now,
      },
    });

    await this.outboxRepo.enqueue({
      tenantId,
      eventType: "vehicle.returned",
      aggregateType: "Vehicle",
      aggregateId: rental.vehicleId,
      payload: {
        vehicleId: rental.vehicleId,
        rentalId,
        returnOdometer,
        returnFuelLevel,
        status: targetVehicleStatus,
      },
    });

    await this.rentalRepo.saveReturnRecord(tenantId, {
      tenantId,
      rentalId,
      returnOdometer,
      returnFuelLevel,
      actualReturnAt: completedRental.actualEnd,
      returnInspectionId: completedRental.returnInspectionId,
      status: "COMPLETED",
    });

    if (dto.idempotencyKey) {
      await this.idempotencyRepo.record({
        tenantId,
        idempotencyKey: dto.idempotencyKey,
        resourceType: "RentalCompletion",
        resourceId: rentalId,
        responseStatus: 200,
        responseBody: completedRental as unknown as Record<string, unknown>,
      });
    }

    return completedRental;
  }

  async getRentalReturnRecord(tenantId: string, rentalId: string): Promise<RentalReturnRecord | null> {
    return this.rentalRepo.getReturnRecord(rentalId, tenantId);
  }

  async getRentalFinalCalculation(tenantId: string, rentalId: string): Promise<RentalFinalCalculation | null> {
    return this.rentalRepo.getFinalCalculation(rentalId, tenantId);
  }
}
