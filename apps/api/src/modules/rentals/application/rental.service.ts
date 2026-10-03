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
    const contract = contracts
      .filter((item) => item.status !== "ARCHIVED")
      .sort((a, b) => b.contractVersion - a.contractVersion || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] || null;
    const contractSigned = contract?.status === "SIGNED" || contract?.status === "ACTIVE";
    if (!contract) {
      blockers.push("No contract generated for this booking");
    } else if (!contractSigned) {
      blockers.push(`Contract is not signed (status: ${contract.status})`);
    }

    // Check 4: Handover checkpoints
    const handovers = await this.handoverRepo.findByBookingId(booking.id, tenantId);
    const handover = handovers
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] || null;
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
        blockers.push(`Handover must be completed before Rental start (currently: ${handover.status})`);
      }
      if (contract && handover.contractId !== contract.id) {
        blockers.push("Handover is not linked to the current Contract version");
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
    let allocationValid = false;
    const allocations = await this.allocationRepo.findBySource("BOOKING", booking.id, tenantId);
    const activeBookingAllocation = allocations.find(
      (allocation) =>
        allocation.vehicleId === vehicleId &&
        ["CONFIRMED", "ACTIVE"].includes(allocation.status)
    );
    allocationValid = !!activeBookingAllocation;
    if (!allocationValid) {
      blockers.push("Booking has no active confirmed Vehicle allocation for Rental start");
    }

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

    // 3. Fetch contract, handover & vehicle
    const [contract, handover] = await Promise.all([
      this.contractRepo.findById(dto.contractId, tenantId),
      this.handoverRepo.findById(dto.handoverId, tenantId),
    ]);

    if (!contract) {
      throw new ContractNotFoundError(dto.contractId);
    }
    if (!handover) {
      throw new HandoverNotFoundError(dto.handoverId);
    }
    if (contract.bookingId !== booking.id) {
      throw new RentalNotEligibleToStartError(["Selected Contract does not belong to the Booking"]);
    }
    if (handover.bookingId !== booking.id) {
      throw new RentalNotEligibleToStartError(["Selected Handover does not belong to the Booking"]);
    }
    if (handover.contractId !== contract.id) {
      throw new RentalNotEligibleToStartError(["Selected Handover is not linked to the selected Contract"]);
    }
    if (contract.status !== "SIGNED") {
      throw new RentalNotEligibleToStartError([`Contract must be SIGNED before Rental start (currently: ${contract.status})`]);
    }
    if (handover.status !== "HANDOVER_COMPLETED") {
      throw new RentalNotEligibleToStartError([`Handover must be HANDOVER_COMPLETED before Rental start (currently: ${handover.status})`]);
    }

    const vehicleId = booking.assignedVehicleId || handover.vehicleId;
    const vehicle = await this.vehicleRepo.findById(vehicleId, tenantId);
    if (!vehicle) {
      throw new RecordNotFoundError("Vehicle", vehicleId);
    }
    if (contract.vehicleId !== vehicleId || handover.vehicleId !== vehicleId) {
      throw new RentalNotEligibleToStartError(["Booking, Contract and Handover Vehicle references do not match"]);
    }

    // 4. Validate readiness
    const readiness = await this.evaluateReadiness(tenantId, booking.id);
    if (!readiness.isReady) {
      throw new RentalNotEligibleToStartError(readiness.blockers);
    }

    const now = new Date().toISOString();
    const startOdometer = dto.startOdometer || handover.checkoutOdometer || vehicle.odometer || 0;
    const startFuel = dto.startFuelLevel || handover.checkoutFuelLevel || vehicle.fuelLevel || 100;
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

  // ==========================================================================
  // SPRINT 16: RETURN WORKFLOW & VEHICLE RECEIPT (DOM-003 §20)
  // ==========================================================================

  async scheduleReturn(
    tenantId: string,
    rentalId: string,
    dto: ScheduleRentalReturnDto,
    actor: RentalActor
  ): Promise<Rental> {
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

    return updated;
  }

  async receiveReturnedVehicle(
    tenantId: string,
    rentalId: string,
    dto: ReceiveReturnedVehicleDto,
    actor: RentalActor
  ): Promise<Rental> {
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

    const updateData: Partial<Rental> = {
      returnInspectionId: dto.inspectionId,
    };

    if (dto.odometer !== undefined) {
      if (dto.odometer < rental.checkoutOdometer) {
        throw new InspectionOdometerRegressionError(rental.checkoutOdometer, dto.odometer);
      }
      updateData.returnOdometer = dto.odometer;
    }

    if (dto.fuelLevel !== undefined) {
      if (dto.fuelLevel < 0 || dto.fuelLevel > 100) {
        throw new InspectionInvalidFuelLevelError(dto.fuelLevel);
      }
      updateData.returnFuelLevel = dto.fuelLevel;
    }

    if (RentalStateMachine.canTransition(rental.state, "DAMAGE_ASSESSMENT")) {
      updateData.state = "DAMAGE_ASSESSMENT";
    }

    const updated = await this.rentalRepo.update(rentalId, tenantId, updateData);

    await this.auditRepo.record({
      tenantId,
      actorUserId: actor.userId,
      actorType: toAuditActorType(actor.actorType),
      actorName: actor.name,
      action: "rental.inspection.linked",
      resourceType: "Rental",
      resourceId: rentalId,
      details: {
        inspectionId: dto.inspectionId,
        damageCaseIds: dto.damageCaseIds,
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
          .filter((d) => d.responsibleParty === "CUSTOMER" || !d.responsibleParty || d.preExisting !== true)
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
    let targetState: RentalState = "FINAL_CALCULATION";
    if (RentalStateMachine.canTransition(rental.state, "FINAL_CALCULATION")) {
      targetState = "FINAL_CALCULATION";
    } else if (RentalStateMachine.canTransition(rental.state, "FINAL_SETTLEMENT_PENDING")) {
      targetState = "FINAL_SETTLEMENT_PENDING";
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

    const rental = await this.rentalRepo.findById(rentalId, tenantId);
    if (rental && RentalStateMachine.canTransition(rental.state, "DEPOSIT_PROCESSING")) {
      await this.rentalRepo.update(rentalId, tenantId, {
        state: "DEPOSIT_PROCESSING",
      });
    }

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
    const rental = await this.rentalRepo.findById(rentalId, tenantId);
    if (!rental) {
      throw new RentalNotFoundError(rentalId);
    }

    if (RentalStateMachine.TERMINAL_STATES.has(rental.state)) {
      throw new RentalAlreadyCompletedError(rentalId);
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
    const targetVehicleStatus = (dto.releaseVehicleToStatus || "AVAILABLE") as any;
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

    return completedRental;
  }

  async getRentalReturnRecord(tenantId: string, rentalId: string): Promise<RentalReturnRecord | null> {
    return this.rentalRepo.getReturnRecord(rentalId, tenantId);
  }

  async getRentalFinalCalculation(tenantId: string, rentalId: string): Promise<RentalFinalCalculation | null> {
    return this.rentalRepo.getFinalCalculation(rentalId, tenantId);
  }
}
