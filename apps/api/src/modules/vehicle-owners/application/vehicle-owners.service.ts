// ============================================================================
// CAR HIRE OS — VEHICLE OWNER APPLICATION SERVICE (DOM-001, DOM-003)
// Orchestration for Asset Investors, Fleet Partners & Commercial Agreements
// ============================================================================

import type {
  VehicleOwner,
  VehicleOwnership,
  Vehicle,
  CreateVehicleOwnerDto,
  UpdateVehicleOwnerDto,
  AssignVehicleOwnershipDto,
  TransferVehicleOwnershipDto,
  ChangeOwnershipAgreementDto,
  VehicleOwnerFilterQueryDto,
} from "@carhire/types";
import {
  IVehicleOwnerRepository,
  IVehicleOwnershipRepository,
  IVehicleRepository,
  IAuditRepository,
  IOutboxRepository,
} from "@carhire/database";
import {
  VehicleOwnerNotFoundError,
  VehicleOwnershipNotFoundError,
  InvalidRevenueShareError,
} from "../domain/errors/vehicle-owner.errors";

export class VehicleOwnersService {
  constructor(
    private readonly ownerRepository: IVehicleOwnerRepository,
    private readonly ownershipRepository: IVehicleOwnershipRepository,
    private readonly vehicleRepository: IVehicleRepository,
    private readonly auditRepository: IAuditRepository,
    private readonly outboxRepository: IOutboxRepository
  ) {}

  async createOwner(
    tenantId: string,
    dto: CreateVehicleOwnerDto,
    actorId: string,
    actorName: string
  ): Promise<VehicleOwner> {
    const created = await this.ownerRepository.create({
      tenantId,
      name: dto.name,
      companyName: dto.companyName,
      ownerType: dto.ownerType || "INDIVIDUAL",
      email: dto.email,
      phone: dto.phone,
      idOrPassportNumber: dto.idOrPassportNumber,
      taxPinNumber: dto.taxPinNumber,
      payoutBank: dto.payoutBank,
      payoutAccountNumber: dto.payoutAccountNumber,
      payoutMpesaNumber: dto.payoutMpesaNumber,
      ownershipType: dto.ownershipType || "INDIVIDUAL",
      status: "ACTIVE",
      notes: dto.notes,
      version: 1,
    });

    await this.auditRepository.record({
      tenantId,
      actorId,
      actorType: "USER",
      action: "vehicle_owner.create",
      resourceType: "vehicle_owner",
      resourceId: created.id,
      metadata: { name: created.name, email: created.email, phone: created.phone },
    });

    await this.outboxRepository.publish({
      tenantId,
      eventType: "vehicle_owner.created",
      aggregateType: "vehicle_owner",
      aggregateId: created.id,
      payload: { ownerId: created.id, name: created.name },
    });

    return created;
  }

  async getOwner(tenantId: string, id: string): Promise<VehicleOwner> {
    const owner = await this.ownerRepository.findById(id, tenantId);
    if (!owner) {
      throw new VehicleOwnerNotFoundError(id);
    }
    return owner;
  }

  async listOwners(
    tenantId: string,
    filter?: VehicleOwnerFilterQueryDto
  ): Promise<{ owners: VehicleOwner[]; total: number }> {
    return this.ownerRepository.findAll(tenantId, filter);
  }

  async updateOwner(
    tenantId: string,
    id: string,
    dto: UpdateVehicleOwnerDto,
    actorId: string,
    actorName: string
  ): Promise<VehicleOwner> {
    await this.getOwner(tenantId, id);

    const updated = await this.ownerRepository.update(
      id,
      tenantId,
      dto,
      dto.expectedVersion
    );

    await this.auditRepository.record({
      tenantId,
      actorId,
      actorType: "USER",
      action: "vehicle_owner.update",
      resourceType: "vehicle_owner",
      resourceId: id,
      metadata: { changedFields: Object.keys(dto) },
    });

    return updated;
  }

  async assignOwnership(
    tenantId: string,
    dto: AssignVehicleOwnershipDto,
    actorId: string,
    actorName: string
  ): Promise<VehicleOwnership> {
    // 1. Verify owner and vehicle exist in tenant
    const owner = await this.getOwner(tenantId, dto.ownerId);
    const vehicle = await this.vehicleRepository.findById(dto.vehicleId, tenantId);
    if (!vehicle) {
      throw new Error(`Vehicle '${dto.vehicleId}' not found.`);
    }

    // 2. Validate revenue share bounds (0 to 100%)
    if (dto.revenueSharePercent < 0 || dto.revenueSharePercent > 100) {
      throw new InvalidRevenueShareError(dto.revenueSharePercent);
    }

    // 3. Assign ownership atomically (retires active, inserts new)
    const ownership = await this.ownershipRepository.assignOwnership({
      tenantId,
      vehicleId: dto.vehicleId,
      ownerId: dto.ownerId,
      ownershipType: dto.ownershipType,
      revenueSharePercent: dto.revenueSharePercent,
      fixedMonthlyPayout: dto.fixedMonthlyPayout,
      allowableExpenseDeductions: dto.allowableExpenseDeductions ?? true,
      termsSnapshot: dto.termsSnapshot || `Agreement assigned to ${owner.name}`,
      notes: dto.notes,
      startDate: dto.startDate || new Date().toISOString(),
    });

    // 4. Update vehicle root pointers
    await this.vehicleRepository.update(dto.vehicleId, tenantId, {
      activeOwnershipId: ownership.id,
      ownerId: dto.ownerId,
    });

    // 5. Audit & Outbox
    await this.auditRepository.record({
      tenantId,
      actorId,
      actorType: "USER",
      action: "vehicle_ownership.manage",
      resourceType: "vehicle_ownership",
      resourceId: ownership.id,
      metadata: { vehicleId: vehicle.id, ownerId: owner.id, revenueSharePercent: dto.revenueSharePercent },
    });

    await this.outboxRepository.publish({
      tenantId,
      eventType: "vehicle_ownership.assigned",
      aggregateType: "vehicle_ownership",
      aggregateId: ownership.id,
      payload: { vehicleId: vehicle.id, ownerId: owner.id, ownershipId: ownership.id },
    });

    return ownership;
  }

  async transferOwnership(
    tenantId: string,
    vehicleId: string,
    dto: TransferVehicleOwnershipDto,
    actorId: string,
    actorName: string
  ): Promise<VehicleOwnership> {
    return this.assignOwnership(
      tenantId,
      {
        vehicleId,
        ownerId: dto.newOwnerId,
        ownershipType: dto.ownershipType,
        revenueSharePercent: dto.revenueSharePercent,
        fixedMonthlyPayout: dto.fixedMonthlyPayout,
        allowableExpenseDeductions: dto.allowableExpenseDeductions,
        termsSnapshot: dto.termsSnapshot || `Ownership transferred to new investor`,
        notes: dto.notes,
        startDate: dto.effectiveDate,
      },
      actorId,
      actorName
    );
  }

  async changeAgreement(
    tenantId: string,
    vehicleId: string,
    dto: ChangeOwnershipAgreementDto,
    actorId: string,
    actorName: string
  ): Promise<VehicleOwnership> {
    const active = await this.ownershipRepository.findActiveByVehicleId(vehicleId, tenantId);
    if (!active) {
      throw new VehicleOwnershipNotFoundError(`No active agreement for vehicle ${vehicleId}`);
    }

    if (dto.revenueSharePercent < 0 || dto.revenueSharePercent > 100) {
      throw new InvalidRevenueShareError(dto.revenueSharePercent);
    }

    return this.assignOwnership(
      tenantId,
      {
        vehicleId,
        ownerId: active.ownerId,
        ownershipType: active.ownershipType,
        revenueSharePercent: dto.revenueSharePercent,
        fixedMonthlyPayout: dto.fixedMonthlyPayout !== undefined ? dto.fixedMonthlyPayout : active.fixedMonthlyPayout,
        allowableExpenseDeductions: dto.allowableExpenseDeductions !== undefined ? dto.allowableExpenseDeductions : active.allowableExpenseDeductions,
        termsSnapshot: dto.termsSnapshot?.trim() || `Revenue share: ${dto.revenueSharePercent}%. Expense deductions: ${(dto.allowableExpenseDeductions !== undefined ? dto.allowableExpenseDeductions : active.allowableExpenseDeductions) ? "allowed" : "not allowed"}.`,
        notes: dto.notes || active.notes,
        startDate: dto.effectiveDate || new Date().toISOString(),
      },
      actorId,
      actorName
    );
  }

  async getOwnershipHistory(tenantId: string, vehicleId: string): Promise<(VehicleOwnership & { owner?: VehicleOwner })[]> {
    const raw = await this.ownershipRepository.findHistoryByVehicleId(vehicleId, tenantId);
    return Promise.all(
      raw.map(async (h) => {
        const owner = await this.ownerRepository.findById(h.ownerId, tenantId);
        return { ...h, owner: owner || undefined };
      })
    );
  }

  async getOwnerVehicles(tenantId: string, ownerId: string): Promise<Vehicle[]> {
    await this.getOwner(tenantId, ownerId);
    const { vehicles } = await this.vehicleRepository.findAll(tenantId, { ownerId, limit: 100 });
    return vehicles;
  }

  async deleteOwner(
    tenantId: string,
    id: string,
    actorId: string,
    actorName: string
  ): Promise<void> {
    const owner = await this.getOwner(tenantId, id);
    const vehicles = await this.getOwnerVehicles(tenantId, id);
    if (vehicles.length > 0) {
      throw new Error(`Cannot delete owner '${owner.name}' because they have ${vehicles.length} vehicle(s) attached.`);
    }

    await this.ownerRepository.delete(id, tenantId);

    await this.auditRepository.record({
      tenantId,
      actorId,
      actorType: "USER",
      action: "vehicle_owner.delete",
      resourceType: "vehicle_owner",
      resourceId: id,
      metadata: { name: owner.name },
    });
  }
}
