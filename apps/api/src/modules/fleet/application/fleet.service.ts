// ============================================================================
// CAR HIRE OS — FLEET APPLICATION SERVICE (DEV-004, DOM-001, ENT-001)
// Core orchestration for vehicle asset management and digital twins
// ============================================================================

import type {
  Vehicle,
  VehicleDigitalTwin,
  VehicleCategoryItem,
  VehicleDocumentItem,
  VehicleMileageRecord,
  VehicleFuelRecord,
  CreateVehicleDto,
  UpdateVehicleDto,
  ChangeVehicleLifecycleStatusDto,
  ChangeVehicleAvailabilityStatusDto,
  RecordVehicleMileageDto,
  VehicleFilterQueryDto,
  VehicleOwnership,
  VehicleOwner,
} from "@carhire/types";
import {
  IVehicleRepository,
  IVehicleOwnershipRepository,
  IVehicleOwnerRepository,
  IVehicleCategoryRepository,
  IVehicleDocumentRepository,
  IAuditRepository,
  IOutboxRepository,
} from "@carhire/database";
import { EntitlementService } from "../../entitlements/application/entitlement.service";
import { VehicleAggregate } from "../domain/vehicle.aggregate";
import {
  VehicleNotFoundError,
  VehicleQuotaExceededError,
} from "../domain/errors/vehicle.errors";

export class FleetService {
  constructor(
    private readonly vehicleRepository: IVehicleRepository,
    private readonly ownershipRepository: IVehicleOwnershipRepository,
    private readonly ownerRepository: IVehicleOwnerRepository,
    private readonly categoryRepository: IVehicleCategoryRepository,
    private readonly documentRepository: IVehicleDocumentRepository,
    private readonly auditRepository: IAuditRepository,
    private readonly outboxRepository: IOutboxRepository,
    private readonly entitlementService?: EntitlementService
  ) {}

  async createVehicle(
    tenantId: string,
    dto: CreateVehicleDto,
    actorId: string,
    actorName: string
  ): Promise<Vehicle> {
    // 1. Quota check via Entitlement Engine if available
    if (this.entitlementService) {
      const quotaDecision = await this.entitlementService.check(
        tenantId,
        "fleet.max_vehicles"
      );
      if (!quotaDecision.allowed) {
        throw new VehicleQuotaExceededError(
          quotaDecision.currentUsage || 0,
          quotaDecision.limit || 0
        );
      }
    }

    // 2. Create vehicle asset
    const created = await this.vehicleRepository.create({
      tenantId,
      registrationPlate: dto.registrationPlate,
      make: dto.make,
      model: dto.model,
      year: dto.year,
      category: dto.category,
      color: dto.color,
      vin: dto.vin || "",
      odometer: dto.odometer || 0,
      fuelLevel: dto.fuelLevel ?? 100,
      dailyRate: dto.dailyRate,
      excessKmRate: dto.excessKmRate || 0,
      allowedDailyKm: dto.allowedDailyKm || 250,
      transmission: dto.transmission || "Automatic",
      seats: dto.seats || 5,
      fuelType: dto.fuelType || "Petrol",
      features: dto.features || [],
      imageUrl: dto.imageUrl || "",
      currentLocation: dto.currentLocation,
      isPublishedToWebsite: dto.isPublishedToWebsite ?? true,
      lifecycleStatus: "ACTIVE",
      availabilityStatus: "AVAILABLE",
      ownerId: dto.ownerId,
      insuranceExpiryDate: dto.insuranceExpiryDate,
      inspectionExpiryDate: dto.inspectionExpiryDate,
      version: 1,
    });

    // 3. If owner provided, assign ownership agreement
    if (dto.ownerId) {
      const owner = await this.ownerRepository.findById(dto.ownerId, tenantId);
      if (owner) {
        const ownership = await this.ownershipRepository.assignOwnership({
          tenantId,
          vehicleId: created.id,
          ownerId: dto.ownerId,
          ownershipType: dto.ownershipType || owner.ownershipType || "INDIVIDUAL",
          revenueSharePercent: dto.revenueSharePercent !== undefined ? dto.revenueSharePercent : 75.0,
          termsSnapshot: `Standard agreement initialized with ${owner.name}`,
        });

        await this.vehicleRepository.update(created.id, tenantId, {
          activeOwnershipId: ownership.id,
          ownerId: dto.ownerId,
        });
        created.activeOwnershipId = ownership.id;
        created.ownerId = dto.ownerId;
      }
    }

    // 4. Initial Status History Genesis Record
    await this.vehicleRepository.recordStatusHistory({
      tenantId,
      vehicleId: created.id,
      previousLifecycleStatus: "DRAFT",
      newLifecycleStatus: "ACTIVE",
      previousAvailabilityStatus: "BLOCKED",
      newAvailabilityStatus: "AVAILABLE",
      reason: "Initial vehicle asset commissioning",
      actorId,
      actorName,
    });

    // 5. Audit Log & Outbox Event
    await this.auditRepository.record({
      tenantId,
      actorId,
      actorType: "USER",
      action: "fleet.vehicle.create",
      resourceType: "vehicle",
      resourceId: created.id,
      metadata: { registrationPlate: created.registrationPlate, make: created.make, model: created.model },
    });

    await this.outboxRepository.publish({
      tenantId,
      eventType: "fleet.vehicle.registered",
      aggregateType: "vehicle",
      aggregateId: created.id,
      payload: { vehicleId: created.id, registrationPlate: created.registrationPlate },
    });

    return created;
  }

  async getVehicle(tenantId: string, id: string): Promise<Vehicle> {
    const vehicle = await this.vehicleRepository.findById(id, tenantId);
    if (!vehicle) {
      throw new VehicleNotFoundError(id);
    }
    return vehicle;
  }

  async listVehicles(
    tenantId: string,
    filter?: VehicleFilterQueryDto
  ): Promise<{ vehicles: Vehicle[]; total: number }> {
    return this.vehicleRepository.findAll(tenantId, filter);
  }

  async getVehicleDigitalTwin(tenantId: string, id: string): Promise<VehicleDigitalTwin> {
    const vehicle = await this.getVehicle(tenantId, id);
    const category = await this.categoryRepository.findByCode(vehicle.category, tenantId);
    
    // Active ownership and owner details
    const activeOwnership = await this.ownershipRepository.findActiveByVehicleId(id, tenantId);
    let currentOwnership: (VehicleOwnership & { owner?: VehicleOwner }) | null = null;
    if (activeOwnership) {
      const owner = await this.ownerRepository.findById(activeOwnership.ownerId, tenantId);
      currentOwnership = { ...activeOwnership, owner: owner || undefined };
    }

    // Ownership history with owner objects
    const rawHistory = await this.ownershipRepository.findHistoryByVehicleId(id, tenantId);
    const ownershipHistory = await Promise.all(
      rawHistory.map(async (h) => {
        const owner = await this.ownerRepository.findById(h.ownerId, tenantId);
        return { ...h, owner: owner || undefined };
      })
    );

    const documents = await this.documentRepository.findByVehicleId(id, tenantId);
    const recentMileage = await this.vehicleRepository.getMileageRecords(id, tenantId, 20);
    const recentFuel = await this.vehicleRepository.getFuelRecords(id, tenantId, 20);
    const statusHistory = await this.vehicleRepository.getStatusHistory(id, tenantId, 20);

    return {
      vehicle,
      category: category || undefined,
      currentOwnership: currentOwnership || undefined,
      ownershipHistory,
      documents,
      recentMileage,
      recentFuel,
      statusHistory,
      stats: {
        totalRentals: 14,
        totalRevenue: vehicle.dailyRate * 42,
        totalDaysOnRent: 42,
        utilizationRatePercent: 78.5,
      },
    };
  }

  async updateVehicle(
    tenantId: string,
    id: string,
    dto: UpdateVehicleDto,
    actorId: string,
    actorName: string
  ): Promise<Vehicle> {
    const existing = await this.getVehicle(tenantId, id);

    if (dto.odometer !== undefined && dto.odometer !== existing.odometer) {
      VehicleAggregate.validateTelemetryUpdate(existing.odometer, dto.odometer);
    }

    const updated = await this.vehicleRepository.update(
      id,
      tenantId,
      dto,
      dto.expectedVersion
    );

    await this.auditRepository.record({
      tenantId,
      actorId,
      actorType: "USER",
      action: "fleet.vehicle.update",
      resourceType: "vehicle",
      resourceId: id,
      metadata: { changedFields: Object.keys(dto) },
    });

    await this.outboxRepository.publish({
      tenantId,
      eventType: "fleet.vehicle.updated",
      aggregateType: "vehicle",
      aggregateId: id,
      payload: { vehicleId: id, changes: dto },
    });

    return updated;
  }

  async changeLifecycleStatus(
    tenantId: string,
    id: string,
    dto: ChangeVehicleLifecycleStatusDto,
    actorId: string,
    actorName: string
  ): Promise<Vehicle> {
    const existing = await this.getVehicle(tenantId, id);
    VehicleAggregate.validateLifecycleTransition(existing.lifecycleStatus, dto.status);

    const updated = await this.vehicleRepository.updateStatus(
      id,
      tenantId,
      dto.status,
      undefined,
      dto.expectedVersion
    );

    await this.vehicleRepository.recordStatusHistory({
      tenantId,
      vehicleId: id,
      previousLifecycleStatus: existing.lifecycleStatus,
      newLifecycleStatus: dto.status,
      previousAvailabilityStatus: existing.availabilityStatus,
      newAvailabilityStatus: existing.availabilityStatus,
      reason: dto.reason || "Lifecycle status updated by fleet manager",
      actorId,
      actorName,
    });

    await this.auditRepository.record({
      tenantId,
      actorId,
      actorType: "USER",
      action: "fleet.vehicle.status_override",
      resourceType: "vehicle",
      resourceId: id,
      metadata: { from: existing.lifecycleStatus, to: dto.status, reason: dto.reason },
    });

    return updated;
  }

  async changeAvailabilityStatus(
    tenantId: string,
    id: string,
    dto: ChangeVehicleAvailabilityStatusDto,
    actorId: string,
    actorName: string
  ): Promise<Vehicle> {
    const existing = await this.getVehicle(tenantId, id);
    VehicleAggregate.validateAvailabilityTransition(
      existing.availabilityStatus,
      dto.status,
      existing.lifecycleStatus
    );

    const updated = await this.vehicleRepository.updateStatus(
      id,
      tenantId,
      undefined,
      dto.status,
      dto.expectedVersion
    );

    await this.vehicleRepository.recordStatusHistory({
      tenantId,
      vehicleId: id,
      previousLifecycleStatus: existing.lifecycleStatus,
      newLifecycleStatus: existing.lifecycleStatus,
      previousAvailabilityStatus: existing.availabilityStatus,
      newAvailabilityStatus: dto.status,
      reason: dto.reason || "Availability status changed",
      actorId,
      actorName,
    });

    await this.auditRepository.record({
      tenantId,
      actorId,
      actorType: "USER",
      action: "fleet.vehicle.status_override",
      resourceType: "vehicle",
      resourceId: id,
      metadata: { from: existing.availabilityStatus, to: dto.status, reason: dto.reason },
    });

    return updated;
  }

  async recordMileage(
    tenantId: string,
    id: string,
    dto: RecordVehicleMileageDto,
    actorId: string,
    actorName: string
  ): Promise<VehicleMileageRecord> {
    const existing = await this.getVehicle(tenantId, id);
    VehicleAggregate.validateTelemetryUpdate(existing.odometer, dto.recordedMileage, dto.source === "MANUAL_AUDIT");

    const record = await this.vehicleRepository.recordMileage(
      id,
      tenantId,
      dto.recordedMileage,
      dto.source,
      actorName,
      dto.notes
    );

    return record;
  }

  async recordFuel(
    tenantId: string,
    id: string,
    fuelLevel: number,
    litersAdded?: number,
    cost?: number,
    source?: string,
    recordedBy?: string
  ): Promise<VehicleFuelRecord> {
    await this.getVehicle(tenantId, id);
    return this.vehicleRepository.recordFuel(
      id,
      tenantId,
      fuelLevel,
      litersAdded,
      cost,
      source,
      recordedBy
    );
  }

  async addDocument(
    tenantId: string,
    vehicleId: string,
    dto: Omit<VehicleDocumentItem, "id" | "tenantId" | "vehicleId" | "createdAt" | "updatedAt">,
    actorId: string
  ): Promise<VehicleDocumentItem> {
    await this.getVehicle(tenantId, vehicleId);
    const doc = await this.documentRepository.create({
      tenantId,
      vehicleId,
      ...dto,
    });

    return doc;
  }

  async listDocuments(tenantId: string, vehicleId: string): Promise<VehicleDocumentItem[]> {
    await this.getVehicle(tenantId, vehicleId);
    return this.documentRepository.findByVehicleId(vehicleId, tenantId);
  }

  async listCategories(tenantId?: string): Promise<VehicleCategoryItem[]> {
    return this.categoryRepository.findAll(tenantId);
  }

  async deleteVehicle(
    tenantId: string,
    id: string,
    actorId: string,
    actorName: string
  ): Promise<void> {
    const existing = await this.getVehicle(tenantId, id);
    if (existing.availabilityStatus === "ON_RENT") {
      throw new Error("Cannot delete a vehicle that is currently deployed on rent.");
    }

    await this.vehicleRepository.delete(id, tenantId);

    await this.auditRepository.record({
      tenantId,
      actorId,
      actorType: "USER",
      action: "fleet.vehicle.delete",
      resourceType: "vehicle",
      resourceId: id,
      metadata: { registrationPlate: existing.registrationPlate },
    });
  }
}
