// ============================================================================
// CAR HIRE OS — AVAILABILITY APPLICATION SERVICE (DEV-006, DEV-007, BRS-001)
// Authoritative fleet availability orchestration, holds, and concurrency safety
// ============================================================================

import type {
  VehicleAllocation,
  VehicleBlock,
  AllocationHold,
  AvailabilityRequest,
  AvailabilityCheckResult,
  AvailabilitySearchRequestDto,
  AvailabilitySearchResultDto,
  AvailableCandidateVehicle,
  CreateAllocationDto,
  CreateHoldDto,
  ConfirmHoldDto,
  CreateVehicleBlockDto,
  VehicleAvailabilityCalendarResponse,
} from "@carhire/types";
import type { AllocationFilter, HoldFilter, VehicleBlockFilter } from "@carhire/database";
import {
  IVehicleAllocationRepository,
  VehicleAllocationRepository,
  IVehicleBlockRepository,
  VehicleBlockRepository,
  IVehicleRepository,
  VehicleRepository,
  ISubscriptionRepository,
  SubscriptionRepository,
  IAuditRepository,
  AuditRepository,
  IOutboxRepository,
  OutboxRepository,
  RecordNotFoundError,
  CrossTenantViolationError,
  VehicleNotOperationalError,
  SubscriptionSuspendedError,
} from "@carhire/database";
import { TimeInterval } from "../domain/time-interval";
import { AvailabilityEngine } from "../domain/availability-engine";

export class AvailabilityService {
  private readonly allocationRepo: IVehicleAllocationRepository;
  private readonly blockRepo: IVehicleBlockRepository;
  private readonly vehicleRepo: IVehicleRepository;
  private readonly subscriptionRepo?: ISubscriptionRepository;
  private readonly auditRepo: IAuditRepository;
  private readonly outboxRepo: IOutboxRepository;

  constructor(
    allocationRepo?: IVehicleAllocationRepository,
    blockRepo?: IVehicleBlockRepository,
    vehicleRepo?: IVehicleRepository,
    subscriptionRepo?: ISubscriptionRepository,
    auditRepo?: IAuditRepository,
    outboxRepo?: IOutboxRepository
  ) {
    this.allocationRepo = allocationRepo || new VehicleAllocationRepository();
    this.blockRepo = blockRepo || new VehicleBlockRepository();
    this.vehicleRepo = vehicleRepo || new VehicleRepository();
    this.subscriptionRepo = subscriptionRepo || new SubscriptionRepository();
    this.auditRepo = auditRepo || new AuditRepository();
    this.outboxRepo = outboxRepo || new OutboxRepository();
  }

  /**
   * Asserts that tenant subscription permits commercial write operations
   */
  private async assertSubscriptionPermitsWrite(tenantId: string): Promise<void> {
    if (!this.subscriptionRepo) return;
    try {
      const sub = await this.subscriptionRepo.findByTenantId(tenantId);
      if (sub && sub.status === "SUSPENDED") {
        throw new SubscriptionSuspendedError(
          tenantId,
          "Tenant subscription is SUSPENDED. New vehicle allocations and holds are blocked."
        );
      }
    } catch (err) {
      if (err instanceof SubscriptionSuspendedError) throw err;
      // Allow if no subscription repository or unconfigured
    }
  }

  async listAllocations(
    tenantId: string,
    filter?: AllocationFilter
  ): Promise<VehicleAllocation[]> {
    return this.allocationRepo.findAllocations(tenantId, filter);
  }

  async listHolds(
    tenantId: string,
    filter?: HoldFilter
  ): Promise<AllocationHold[]> {
    return this.allocationRepo.listHolds(tenantId, filter);
  }

  async listVehicleBlocks(
    tenantId: string,
    filter?: VehicleBlockFilter
  ): Promise<VehicleBlock[]> {
    return this.blockRepo.listBlocks(tenantId, filter);
  }

  /**
   * Checks availability of a specific vehicle or category for a time window
   */
  async checkVehicleAvailability(
    tenantId: string,
    request: AvailabilityRequest
  ): Promise<AvailabilityCheckResult> {
    const rawInterval = new TimeInterval(request.pickupAt, request.returnAt);
    const turnaroundMinutes = request.turnaroundMinutes || 0;
    const effectiveInterval = rawInterval.withTurnaroundBuffer(turnaroundMinutes);

    if (!request.vehicleId) {
      // If vehicleId is omitted, perform search across category / fleet
      const searchRes = await this.searchAvailableVehicles(tenantId, {
        pickupAt: request.pickupAt,
        returnAt: request.returnAt,
        vehicleCategoryId: request.vehicleCategoryId,
        branchId: request.branchId,
        turnaroundMinutes,
        limit: 10,
      });

      const hasAvailable = searchRes.vehicles.length > 0;
      return {
        available: hasAvailable,
        vehicleId: hasAvailable ? searchRes.vehicles[0].id : undefined,
        code: hasAvailable ? "AVAILABLE" : "NO_VEHICLES_AVAILABLE",
        message: hasAvailable
          ? `${searchRes.vehicles.length} vehicle(s) available for requested window.`
          : "No vehicles available in the requested category and time window.",
        requestedInterval: {
          startsAt: rawInterval.startsAtIso,
          endsAt: rawInterval.endsAtIso,
          durationHours: rawInterval.durationHours,
        },
        effectiveInterval: {
          startsAt: effectiveInterval.startsAtIso,
          endsAt: effectiveInterval.endsAtIso,
        },
        alternativeVehicleIds: searchRes.vehicles.map((v) => v.id),
      };
    }

    // Direct check for specific vehicle
    const vehicle = await this.vehicleRepo.findById(request.vehicleId, tenantId);
    if (!vehicle) {
      throw new RecordNotFoundError("Vehicle", request.vehicleId);
    }

    if (vehicle.tenantId !== tenantId) {
      throw new CrossTenantViolationError(tenantId, vehicle.tenantId);
    }

    // Check operational / lifecycle eligibility
    if (!AvailabilityEngine.isVehicleOperable(vehicle)) {
      return {
        available: false,
        vehicleId: vehicle.id,
        code: "VEHICLE_NOT_OPERATIONAL",
        message: `Vehicle ${vehicle.registrationPlate} is not in operational status (${vehicle.lifecycleStatus}).`,
        requestedInterval: {
          startsAt: rawInterval.startsAtIso,
          endsAt: rawInterval.endsAtIso,
          durationHours: rawInterval.durationHours,
        },
      };
    }

    // Fetch allocations & blocks for interval
    const allocations = await this.allocationRepo.findOverlappingAllocations(
      tenantId,
      vehicle.id,
      effectiveInterval.startsAtIso,
      effectiveInterval.endsAtIso,
      request.excludeAllocationId
    );

    const blocks = await this.blockRepo.findOverlappingBlocks(
      tenantId,
      vehicle.id,
      effectiveInterval.startsAtIso,
      effectiveInterval.endsAtIso
    );

    const conflict = AvailabilityEngine.checkIntervalConflict(
      effectiveInterval,
      allocations,
      blocks,
      request.excludeAllocationId
    );

    if (conflict.hasConflict) {
      return {
        available: false,
        vehicleId: vehicle.id,
        code: "AVAILABILITY_CONFLICT",
        message: conflict.reason || "Vehicle has an overlapping allocation or active block.",
        conflictingAllocationId: conflict.conflictingAllocation?.id,
        conflictingType: conflict.conflictingAllocation?.allocationType || null,
        requestedInterval: {
          startsAt: rawInterval.startsAtIso,
          endsAt: rawInterval.endsAtIso,
          durationHours: rawInterval.durationHours,
        },
        effectiveInterval: {
          startsAt: effectiveInterval.startsAtIso,
          endsAt: effectiveInterval.endsAtIso,
        },
      };
    }

    return {
      available: true,
      vehicleId: vehicle.id,
      code: "AVAILABLE",
      message: `Vehicle ${vehicle.registrationPlate} is available.`,
      requestedInterval: {
        startsAt: rawInterval.startsAtIso,
        endsAt: rawInterval.endsAtIso,
        durationHours: rawInterval.durationHours,
      },
      effectiveInterval: {
        startsAt: effectiveInterval.startsAtIso,
        endsAt: effectiveInterval.endsAtIso,
      },
    };
  }

  /**
   * Evaluates available candidate vehicles across a tenant's fleet
   */
  async searchAvailableVehicles(
    tenantId: string,
    request: AvailabilitySearchRequestDto
  ): Promise<AvailabilitySearchResultDto> {
    const rawInterval = new TimeInterval(request.pickupAt, request.returnAt);
    const turnaround = request.turnaroundMinutes || 0;
    const effectiveInterval = rawInterval.withTurnaroundBuffer(turnaround, true);

    // List all fleet vehicles for tenant
    const fleetResult = await this.vehicleRepo.findAll(tenantId, {
      category: request.vehicleCategoryId,
      limit: 1000,
    });
    const fleet = fleetResult.vehicles;

    const candidateVehicles: AvailableCandidateVehicle[] = [];

    for (const vehicle of fleet) {
      if (!AvailabilityEngine.isVehicleOperable(vehicle)) {
        continue;
      }

      // Feature matching if specified
      if (request.features && request.features.length > 0) {
        const vehicleFeatures = vehicle.features || [];
        const hasAllFeatures = request.features.every((f) =>
          vehicleFeatures.includes(f)
        );
        if (!hasAllFeatures) continue;
      }

      // Check allocations
      const overlappingAllocations = await this.allocationRepo.findOverlappingAllocations(
        tenantId,
        vehicle.id,
        effectiveInterval.startsAtIso,
        effectiveInterval.endsAtIso
      );

      if (overlappingAllocations.length > 0) continue;

      // Check blocks
      const overlappingBlocks = await this.blockRepo.findOverlappingBlocks(
        tenantId,
        vehicle.id,
        effectiveInterval.startsAtIso,
        effectiveInterval.endsAtIso
      );

      if (overlappingBlocks.length > 0) continue;

      candidateVehicles.push({
        id: vehicle.id,
        tenantId: vehicle.tenantId,
        registrationNumber: (vehicle as any).registrationPlate || (vehicle as any).registrationNumber,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        vehicleCategoryId: (vehicle as any).vehicleCategoryId || vehicle.category,
        categoryName: (vehicle as any).categoryName || vehicle.category,
        branchId: (vehicle as any).branchId,
        dailyRate: (vehicle as any).dailyRate || 0,
        operationalStatus: vehicle.lifecycleStatus || "OPERATIONAL",
        availabilityStatus: (vehicle as any).availabilityStatus || "AVAILABLE",
        fuelType: vehicle.fuelType,
        transmission: vehicle.transmission,
        features: vehicle.features,
      });
    }

    const limit = request.limit || 50;
    const offset = request.offset || 0;
    const paged = candidateVehicles.slice(offset, offset + limit);

    return {
      vehicles: paged,
      totalAvailable: candidateVehicles.length,
      requestedInterval: {
        startsAt: rawInterval.startsAtIso,
        endsAt: rawInterval.endsAtIso,
        durationHours: rawInterval.durationHours,
      },
    };
  }

  /**
   * Atomically creates a confirmed or active vehicle allocation
   */
  async createAllocation(
    tenantId: string,
    dto: CreateAllocationDto,
    actorUserId?: string
  ): Promise<VehicleAllocation> {
    await this.assertSubscriptionPermitsWrite(tenantId);

    const vehicle = await this.vehicleRepo.findById(dto.vehicleId, tenantId);
    if (!vehicle) {
      throw new RecordNotFoundError("Vehicle", dto.vehicleId);
    }
    if (vehicle.tenantId !== tenantId) {
      throw new CrossTenantViolationError(tenantId, vehicle.tenantId);
    }

    if (!AvailabilityEngine.isVehicleOperable(vehicle)) {
      throw new VehicleNotOperationalError(
        vehicle.id,
        vehicle.lifecycleStatus || "NON_OPERATIONAL"
      );
    }

    // Check active blocks
    const targetInterval = new TimeInterval(dto.startsAt, dto.endsAt);
    const overlappingBlocks = await this.blockRepo.findOverlappingBlocks(
      tenantId,
      vehicle.id,
      targetInterval.startsAtIso,
      targetInterval.endsAtIso
    );

    if (overlappingBlocks.length > 0) {
      const block = overlappingBlocks[0];
      throw new AvailabilityEngineConflictError(
        `Cannot allocate vehicle ${vehicle.registrationPlate}: active ${block.blockType} block '${block.reason}' exists for this interval.`
      );
    }

    const allocation = await this.allocationRepo.createAllocation(tenantId, {
      ...dto,
      actorUserId,
    });

    // Audit and Outbox emission
    await this.auditRepo.record({
      tenantId,
      actorId: actorUserId || "SYSTEM",
      actorType: "USER",
      action: "AVAILABILITY_ALLOCATION_CREATED",
      resourceType: "VEHICLE_ALLOCATION",
      resourceId: allocation.id,
      metadata: {
        vehicleId: allocation.vehicleId,
        allocationType: allocation.allocationType,
        startsAt: allocation.startsAt,
        endsAt: allocation.endsAt,
        status: allocation.status,
      },
    });

    await this.outboxRepo.publish({
      tenantId,
      eventType: "AVAILABILITY_ALLOCATION_CREATED",
      aggregateType: "VEHICLE_ALLOCATION",
      aggregateId: allocation.id,
      payload: {
        allocationId: allocation.id,
        vehicleId: allocation.vehicleId,
        allocationType: allocation.allocationType,
        startsAt: allocation.startsAt,
        endsAt: allocation.endsAt,
        status: allocation.status,
      },
    });

    return allocation;
  }

  /**
   * Releases an active or confirmed allocation
   */
  async releaseAllocation(
    tenantId: string,
    allocationId: string,
    reason?: string,
    actorUserId?: string
  ): Promise<VehicleAllocation> {
    const allocation = await this.allocationRepo.releaseAllocation(
      allocationId,
      tenantId,
      reason,
      actorUserId
    );

    await this.auditRepo.record({
      tenantId,
      actorId: actorUserId || "SYSTEM",
      actorType: "USER",
      action: "AVAILABILITY_ALLOCATION_RELEASED",
      resourceType: "VEHICLE_ALLOCATION",
      resourceId: allocation.id,
      metadata: {
        vehicleId: allocation.vehicleId,
        reason: reason || "Released",
      },
    });

    await this.outboxRepo.publish({
      tenantId,
      eventType: "AVAILABILITY_ALLOCATION_RELEASED",
      aggregateType: "VEHICLE_ALLOCATION",
      aggregateId: allocation.id,
      payload: {
        allocationId: allocation.id,
        vehicleId: allocation.vehicleId,
        reason: reason || "Released",
      },
    });

    return allocation;
  }

  /**
   * Creates a temporary checkout hold with TTL
   */
  async createHold(
    tenantId: string,
    dto: CreateHoldDto,
    actorUserId?: string
  ): Promise<{ allocation: VehicleAllocation; hold: AllocationHold }> {
    await this.assertSubscriptionPermitsWrite(tenantId);

    const vehicle = await this.vehicleRepo.findById(dto.vehicleId, tenantId);
    if (!vehicle) {
      throw new RecordNotFoundError("Vehicle", dto.vehicleId);
    }
    if (vehicle.tenantId !== tenantId) {
      throw new CrossTenantViolationError(tenantId, vehicle.tenantId);
    }

    if (!AvailabilityEngine.isVehicleOperable(vehicle)) {
      throw new VehicleNotOperationalError(
        vehicle.id,
        vehicle.lifecycleStatus || "NON_OPERATIONAL"
      );
    }

    const { allocation, hold } = await this.allocationRepo.createHold(tenantId, {
      ...dto,
      actorUserId,
    });

    await this.auditRepo.record({
      tenantId,
      actorId: actorUserId || "SYSTEM",
      actorType: "USER",
      action: "AVAILABILITY_HOLD_CREATED",
      resourceType: "ALLOCATION_HOLD",
      resourceId: hold.id,
      metadata: {
        vehicleId: hold.vehicleId,
        holdToken: hold.holdToken,
        expiresAt: hold.expiresAt,
      },
    });

    await this.outboxRepo.publish({
      tenantId,
      eventType: "AVAILABILITY_HOLD_CREATED",
      aggregateType: "ALLOCATION_HOLD",
      aggregateId: hold.id,
      payload: {
        holdId: hold.id,
        allocationId: allocation.id,
        holdToken: hold.holdToken,
        vehicleId: hold.vehicleId,
        expiresAt: hold.expiresAt,
      },
    });

    return { allocation, hold };
  }

  /**
   * Confirms a temporary hold into a confirmed booking allocation
   */
  async confirmHold(
    tenantId: string,
    holdToken: string,
    dto: ConfirmHoldDto,
    actorUserId?: string
  ): Promise<VehicleAllocation> {
    await this.assertSubscriptionPermitsWrite(tenantId);

    const allocation = await this.allocationRepo.confirmHold(tenantId, holdToken, {
      ...dto,
      actorUserId,
    });

    await this.auditRepo.record({
      tenantId,
      actorId: actorUserId || "SYSTEM",
      actorType: "USER",
      action: "AVAILABILITY_HOLD_CONFIRMED",
      resourceType: "VEHICLE_ALLOCATION",
      resourceId: allocation.id,
      metadata: {
        vehicleId: allocation.vehicleId,
        sourceType: dto.sourceType,
        sourceId: dto.sourceId,
      },
    });

    await this.outboxRepo.publish({
      tenantId,
      eventType: "AVAILABILITY_HOLD_CONFIRMED",
      aggregateType: "VEHICLE_ALLOCATION",
      aggregateId: allocation.id,
      payload: {
        allocationId: allocation.id,
        vehicleId: allocation.vehicleId,
        sourceType: dto.sourceType,
        sourceId: dto.sourceId,
      },
    });

    return allocation;
  }

  /**
   * Releases a temporary hold early
   */
  async releaseHold(
    tenantId: string,
    holdTokenOrId: string,
    actorUserId?: string
  ): Promise<void> {
    await this.allocationRepo.releaseHold(tenantId, holdTokenOrId, actorUserId);
  }

  /**
   * Creates an administrative, maintenance, or compliance block
   */
  async createVehicleBlock(
    tenantId: string,
    dto: CreateVehicleBlockDto,
    actorUserId?: string
  ): Promise<VehicleBlock> {
    const vehicle = await this.vehicleRepo.findById(dto.vehicleId, tenantId);
    if (!vehicle) {
      throw new RecordNotFoundError("Vehicle", dto.vehicleId);
    }
    if (vehicle.tenantId !== tenantId) {
      throw new CrossTenantViolationError(tenantId, vehicle.tenantId);
    }

    // Concurrently create backing allocation to lock GiST exclusion ledger
    const allocation = await this.allocationRepo.createAllocation(tenantId, {
      vehicleId: dto.vehicleId,
      allocationType: "MAINTENANCE",
      startsAt: dto.startsAt,
      endsAt: dto.endsAt,
      reason: `Vehicle Block: ${dto.blockType} - ${dto.reason}`,
      notes: dto.notes,
      actorUserId,
    });

    const block = await this.blockRepo.createBlock(tenantId, {
      ...dto,
      allocationId: allocation.id,
      actorUserId,
    });

    await this.auditRepo.record({
      tenantId,
      actorId: actorUserId || "SYSTEM",
      actorType: "USER",
      action: "AVAILABILITY_BLOCK_CREATED",
      resourceType: "VEHICLE_BLOCK",
      resourceId: block.id,
      metadata: {
        vehicleId: block.vehicleId,
        blockType: block.blockType,
        startsAt: block.startsAt,
        endsAt: block.endsAt,
        reason: block.reason,
      },
    });

    await this.outboxRepo.publish({
      tenantId,
      eventType: "AVAILABILITY_BLOCK_CREATED",
      aggregateType: "VEHICLE_BLOCK",
      aggregateId: block.id,
      payload: {
        blockId: block.id,
        vehicleId: block.vehicleId,
        blockType: block.blockType,
        startsAt: block.startsAt,
        endsAt: block.endsAt,
      },
    });

    return block;
  }

  /**
   * Releases an active vehicle block
   */
  async releaseVehicleBlock(
    tenantId: string,
    blockId: string,
    reason?: string,
    actorUserId?: string
  ): Promise<VehicleBlock> {
    const block = await this.blockRepo.releaseBlock(
      blockId,
      tenantId,
      reason,
      actorUserId
    );

    if (block.allocationId) {
      try {
        await this.allocationRepo.releaseAllocation(
          block.allocationId,
          tenantId,
          reason || "Associated vehicle block released",
          actorUserId
        );
      } catch {
        // Ignore if already released
      }
    }

    await this.auditRepo.record({
      tenantId,
      actorId: actorUserId || "SYSTEM",
      actorType: "USER",
      action: "AVAILABILITY_BLOCK_RELEASED",
      resourceType: "VEHICLE_BLOCK",
      resourceId: block.id,
      metadata: {
        vehicleId: block.vehicleId,
        reason: reason || "Released",
      },
    });

    return block;
  }

  /**
   * Fetches the availability calendar summary for a vehicle
   */
  async getVehicleCalendar(
    tenantId: string,
    vehicleId: string,
    windowStart: string,
    windowEnd: string
  ): Promise<VehicleAvailabilityCalendarResponse> {
    const window = new TimeInterval(windowStart, windowEnd);

    const vehicle = await this.vehicleRepo.findById(vehicleId, tenantId);
    if (!vehicle) {
      throw new RecordNotFoundError("Vehicle", vehicleId);
    }
    if (vehicle.tenantId !== tenantId) {
      throw new CrossTenantViolationError(tenantId, vehicle.tenantId);
    }

    const allocations = await this.allocationRepo.findAllocations(tenantId, {
      vehicleId,
      from: window.startsAtIso,
      to: window.endsAtIso,
    });

    const blocks = await this.blockRepo.listBlocks(tenantId, {
      vehicleId,
      from: window.startsAtIso,
      to: window.endsAtIso,
    });

    return AvailabilityEngine.generateCalendarSummary(
      vehicleId,
      window,
      allocations,
      blocks
    );
  }

  /**
   * Concurrency-safe vehicle substitution: allocates replacement vehicle first, then releases original
   */
  async substituteVehicle(
    tenantId: string,
    sourceAllocationId: string,
    newVehicleId: string,
    actorUserId?: string
  ): Promise<{ previousAllocation: VehicleAllocation; newAllocation: VehicleAllocation }> {
    await this.assertSubscriptionPermitsWrite(tenantId);

    const previousAllocation = await this.allocationRepo.findById(sourceAllocationId, tenantId);
    if (!previousAllocation) {
      throw new RecordNotFoundError("VehicleAllocation", sourceAllocationId);
    }

    const newVehicle = await this.vehicleRepo.findById(newVehicleId, tenantId);
    if (!newVehicle) {
      throw new RecordNotFoundError("Vehicle", newVehicleId);
    }
    if (newVehicle.tenantId !== tenantId) {
      throw new CrossTenantViolationError(tenantId, newVehicle.tenantId);
    }

    if (!AvailabilityEngine.isVehicleOperable(newVehicle)) {
      throw new VehicleNotOperationalError(
        newVehicle.id,
        newVehicle.lifecycleStatus || "NON_OPERATIONAL"
      );
    }

    // 1. Allocate new vehicle for exact same window
    const newAllocation = await this.allocationRepo.createAllocation(tenantId, {
      vehicleId: newVehicleId,
      allocationType: previousAllocation.allocationType,
      sourceType: previousAllocation.sourceType || undefined,
      sourceId: previousAllocation.sourceId || undefined,
      startsAt: previousAllocation.startsAt,
      endsAt: previousAllocation.endsAt,
      reason: `Vehicle substitution for previous allocation ${sourceAllocationId}`,
      actorUserId,
    });

    // 2. Release previous allocation
    const updatedPrev = await this.allocationRepo.releaseAllocation(
      sourceAllocationId,
      tenantId,
      `Substituted with vehicle ${newVehicle.registrationPlate} (${newVehicle.id})`,
      actorUserId
    );

    // Audit and outbox
    await this.auditRepo.record({
      tenantId,
      actorId: actorUserId || "SYSTEM",
      actorType: "USER",
      action: "AVAILABILITY_VEHICLE_SUBSTITUTED",
      resourceType: "VEHICLE_ALLOCATION",
      resourceId: newAllocation.id,
      metadata: {
        sourceAllocationId,
        oldVehicleId: previousAllocation.vehicleId,
        newVehicleId,
      },
    });

    return {
      previousAllocation: updatedPrev,
      newAllocation,
    };
  }
}

class AvailabilityEngineConflictError extends Error {
  public readonly code = "AVAILABILITY_CONFLICT";
  constructor(message: string) {
    super(message);
    this.name = "AvailabilityConflictError";
  }
}
