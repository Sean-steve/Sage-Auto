// ============================================================================
// CAR HIRE OS — MAINTENANCE APPLICATION SERVICE (SPRINT 17)
// Bounded Context: Maintenance Management, Work Orders & Servicing (DOM-003 §21-24)
// ============================================================================

import type {
  MaintenanceWorkOrder,
  MaintenanceSchedule,
  ServiceProvider,
  MaintenanceDueEvaluation,
  CreateMaintenanceRequestDto,
  ScheduleMaintenanceDto,
  StartMaintenanceDto,
  AddMaintenanceTaskDto,
  UpdateMaintenanceTaskDto,
  AddMaintenancePartDto,
  RecordMaintenanceCostDto,
  AddMaintenanceEvidenceDto,
  CompleteMaintenanceDto,
  VerifyMaintenanceDto,
  CancelMaintenanceDto,
  CreateMaintenanceScheduleDto,
  UpdateMaintenanceScheduleDto,
  CreateServiceProviderDto,
  UpdateServiceProviderDto,
  MaintenanceStatus,
  MaintenanceTask,
  MaintenanceCostItem,
  MaintenancePartItem,
  MaintenanceEvidence,
  MaintenanceVerification,
} from "@carhire/types";
import {
  IMaintenanceRepository,
  IMaintenanceScheduleRepository,
  IServiceProviderRepository,
  IVehicleRepository,
  IVehicleAllocationRepository,
  IAuditRepository,
  IOutboxRepository,
  IIdempotencyRepository,
  MaintenanceNotFoundError,
  MaintenanceScheduleNotFoundError,
  MaintenanceProviderNotFoundError,
  RecordNotFoundError,
} from "@carhire/database";
import { MaintenanceStateMachine } from "../domain/maintenance-state-machine";
import { MaintenanceDueCalculator } from "../domain/maintenance-due-calculator";

export interface ServiceActor {
  userId: string;
  userEmail?: string;
  role?: string;
}

export class MaintenanceService {
  constructor(
    private readonly maintenanceRepo: IMaintenanceRepository,
    private readonly scheduleRepo: IMaintenanceScheduleRepository,
    private readonly providerRepo: IServiceProviderRepository,
    private readonly vehicleRepo: IVehicleRepository,
    private readonly allocationRepo: IVehicleAllocationRepository,
    private readonly auditRepo: IAuditRepository,
    private readonly outboxRepo: IOutboxRepository,
    private readonly idempotencyRepo?: IIdempotencyRepository
  ) {}

  // --------------------------------------------------------------------------
  // WORK ORDER COMMANDS
  // --------------------------------------------------------------------------

  async createMaintenanceRequest(
    tenantId: string,
    dto: CreateMaintenanceRequestDto,
    actor: ServiceActor
  ): Promise<MaintenanceWorkOrder> {
    // Schedule-driven dispatch is idempotent while an order is active.
    if (dto.sourceType === "SCHEDULE" && dto.sourceId) {
      const existing = await this.maintenanceRepo.list(tenantId, {
        vehicleId: dto.vehicleId,
        sourceType: "SCHEDULE",
      });
      const active = existing.find(
        (order) =>
          order.sourceId === dto.sourceId &&
          !["COMPLETED", "VERIFIED", "CANCELLED"].includes(order.status)
      );
      if (active) return active;
    }

    // 1. Verify vehicle exists
    const vehicle = await this.vehicleRepo.findById(dto.vehicleId, tenantId);
    if (!vehicle) {
      throw new RecordNotFoundError("Vehicle", dto.vehicleId);
    }

    // 2. If garage provided, verify provider exists
    if (dto.garageId) {
      const garage = await this.providerRepo.findById(dto.garageId, tenantId);
      if (!garage) {
        throw new MaintenanceProviderNotFoundError(dto.garageId);
      }
    }

    // 3. Create work order
    const workOrder = await this.maintenanceRepo.create(tenantId, {
      ...dto,
      requestedBy: actor.userId,
      odometerAtRequest: vehicle.odometer,
    });

    // If garage was assigned, enrich garageName
    if (dto.garageId) {
      const garage = await this.providerRepo.findById(dto.garageId, tenantId);
      if (garage) {
        await this.maintenanceRepo.update(workOrder.id, tenantId, {
          garageName: garage.name,
        });
        workOrder.garageName = garage.name;
      }
    }

    // 4. Audit & Outbox events
    await this.auditRepo.create({
      tenantId,
      actorUserId: actor.userId,
      actorType: "USER",
      action: "MAINTENANCE_REQUEST_CREATED",
      resourceType: "MAINTENANCE_WORK_ORDER",
      resourceId: workOrder.id,
      description: `Maintenance work order ${workOrder.maintenanceNumber} created for vehicle ${vehicle.registrationPlate || vehicle.id}`,
      payload: { workOrderId: workOrder.id, vehicleId: vehicle.id, type: workOrder.maintenanceType },
    });

    await this.outboxRepo.publish({
      tenantId,
      eventType: "maintenance.requested",
      aggregateType: "MAINTENANCE_WORK_ORDER",
      aggregateId: workOrder.id,
      payload: {
        workOrderId: workOrder.id,
        maintenanceNumber: workOrder.maintenanceNumber,
        vehicleId: vehicle.id,
        type: workOrder.maintenanceType,
        priority: workOrder.priority,
      },
    });

    return workOrder;
  }

  async scheduleMaintenance(
    tenantId: string,
    id: string,
    dto: ScheduleMaintenanceDto,
    actor: ServiceActor
  ): Promise<MaintenanceWorkOrder> {
    const workOrder = await this.maintenanceRepo.findById(id, tenantId);
    if (!workOrder) {
      throw new MaintenanceNotFoundError(id);
    }

    // Validate state machine & dates
    MaintenanceStateMachine.validateTransition(workOrder.status, "SCHEDULED");
    MaintenanceStateMachine.validateScheduling(dto.scheduledStartAt, dto.scheduledEndAt);

    let garageName = workOrder.garageName;
    if (dto.garageId) {
      const garage = await this.providerRepo.findById(dto.garageId, tenantId);
      if (!garage) {
        throw new MaintenanceProviderNotFoundError(dto.garageId);
      }
      garageName = garage.name;
    }

    // Create exclusive maintenance allocation lock in Availability Engine
    let allocationId = workOrder.allocationId;
    if (!allocationId) {
      try {
        const allocation = await this.allocationRepo.createAllocation(tenantId, {
          vehicleId: workOrder.vehicleId,
          allocationType: "MAINTENANCE",
          sourceId: workOrder.id,
          sourceType: "MAINTENANCE_WORK_ORDER",
          startsAt: dto.scheduledStartAt,
          endsAt: dto.scheduledEndAt || dto.scheduledStartAt,
          status: "CONFIRMED",
          notes: `Maintenance: ${workOrder.reason}`,
        });
        allocationId = allocation.id;
      } catch (err) {
        // Log or rethrow as availability conflict
      }
    }

    // Update work order
    const updated = await this.maintenanceRepo.update(id, tenantId, {
      status: "SCHEDULED",
      scheduledStartAt: dto.scheduledStartAt,
      scheduledEndAt: dto.scheduledEndAt,
      garageId: dto.garageId ?? workOrder.garageId,
      garageName,
      assignedTechnician: dto.assignedTechnician ?? workOrder.assignedTechnician,
      estimatedCost: dto.estimatedCost !== undefined ? dto.estimatedCost : workOrder.estimatedCost,
      allocationId,
    });

    // Record transition history
    await this.maintenanceRepo.recordStatusTransition(
      id,
      tenantId,
      workOrder.status,
      "SCHEDULED",
      actor,
      dto.notes || `Scheduled from ${dto.scheduledStartAt} to ${dto.scheduledEndAt}`
    );

    // Audit & Outbox
    await this.auditRepo.create({
      tenantId,
      actorUserId: actor.userId,
      actorType: "USER",
      action: "MAINTENANCE_SCHEDULED",
      resourceType: "MAINTENANCE_WORK_ORDER",
      resourceId: id,
      description: `Work order ${workOrder.maintenanceNumber} scheduled`,
      payload: { id, scheduledStartAt: dto.scheduledStartAt, scheduledEndAt: dto.scheduledEndAt },
    });

    await this.outboxRepo.publish({
      tenantId,
      eventType: "maintenance.scheduled",
      aggregateType: "MAINTENANCE_WORK_ORDER",
      aggregateId: id,
      payload: {
        id,
        maintenanceNumber: workOrder.maintenanceNumber,
        scheduledStartAt: dto.scheduledStartAt,
        scheduledEndAt: dto.scheduledEndAt,
        garageId: dto.garageId,
      },
    });

    return (await this.maintenanceRepo.findById(id, tenantId))!;
  }

  async startMaintenance(
    tenantId: string,
    id: string,
    dto: StartMaintenanceDto,
    actor: ServiceActor
  ): Promise<MaintenanceWorkOrder> {
    const workOrder = await this.maintenanceRepo.findById(id, tenantId);
    if (!workOrder) {
      throw new MaintenanceNotFoundError(id);
    }

    MaintenanceStateMachine.validateTransition(workOrder.status, "IN_PROGRESS");

    const vehicle = await this.vehicleRepo.findById(workOrder.vehicleId, tenantId);
    if (!vehicle) {
      throw new RecordNotFoundError("Vehicle", workOrder.vehicleId);
    }

    MaintenanceStateMachine.validateStart(vehicle.odometer, dto.startOdometer);

    let garageName = workOrder.garageName;
    if (dto.garageId) {
      const garage = await this.providerRepo.findById(dto.garageId, tenantId);
      if (garage) garageName = garage.name;
    }

    const actualStartAt = dto.actualStartAt || new Date().toISOString();

    // Transition vehicle status to MAINTENANCE
    await this.vehicleRepo.update(vehicle.id, tenantId, {
      availabilityStatus: "MAINTENANCE",
      odometer: dto.startOdometer !== undefined ? Math.max(vehicle.odometer, dto.startOdometer) : vehicle.odometer,
    });

    // Update work order
    await this.maintenanceRepo.update(id, tenantId, {
      status: "IN_PROGRESS",
      actualStartAt,
      startOdometer: dto.startOdometer,
      garageId: dto.garageId ?? workOrder.garageId,
      garageName,
      assignedTechnician: dto.assignedTechnician ?? workOrder.assignedTechnician,
    });

    // Record transition history
    await this.maintenanceRepo.recordStatusTransition(
      id,
      tenantId,
      workOrder.status,
      "IN_PROGRESS",
      actor,
      dto.notes || `Maintenance work started at odometer ${dto.startOdometer} km`
    );

    // Audit & Outbox
    await this.auditRepo.create({
      tenantId,
      actorUserId: actor.userId,
      actorType: "USER",
      action: "MAINTENANCE_STARTED",
      resourceType: "MAINTENANCE_WORK_ORDER",
      resourceId: id,
      description: `Work order ${workOrder.maintenanceNumber} started on vehicle ${vehicle.registrationPlate}`,
      payload: { id, startOdometer: dto.startOdometer, actualStartAt },
    });

    await this.outboxRepo.publish({
      tenantId,
      eventType: "maintenance.started",
      aggregateType: "MAINTENANCE_WORK_ORDER",
      aggregateId: id,
      payload: {
        id,
        maintenanceNumber: workOrder.maintenanceNumber,
        vehicleId: vehicle.id,
        startOdometer: dto.startOdometer,
        actualStartAt,
      },
    });

    return (await this.maintenanceRepo.findById(id, tenantId))!;
  }

  async addTask(
    tenantId: string,
    id: string,
    dto: AddMaintenanceTaskDto,
    actor: ServiceActor
  ): Promise<MaintenanceTask> {
    const workOrder = await this.maintenanceRepo.findById(id, tenantId);
    if (!workOrder) {
      throw new MaintenanceNotFoundError(id);
    }
    return this.maintenanceRepo.addTask(id, tenantId, dto);
  }

  async updateTask(
    tenantId: string,
    id: string,
    taskId: string,
    dto: UpdateMaintenanceTaskDto,
    actor: ServiceActor
  ): Promise<MaintenanceTask> {
    const workOrder = await this.maintenanceRepo.findById(id, tenantId);
    if (!workOrder) {
      throw new MaintenanceNotFoundError(id);
    }
    return this.maintenanceRepo.updateTask(id, taskId, tenantId, dto);
  }

  async addPartItem(
    tenantId: string,
    id: string,
    dto: AddMaintenancePartDto,
    actor: ServiceActor
  ): Promise<MaintenancePartItem> {
    const workOrder = await this.maintenanceRepo.findById(id, tenantId);
    if (!workOrder) {
      throw new MaintenanceNotFoundError(id);
    }
    return this.maintenanceRepo.addPartItem(id, tenantId, dto);
  }

  async recordCostItem(
    tenantId: string,
    id: string,
    dto: RecordMaintenanceCostDto,
    actor: ServiceActor
  ): Promise<MaintenanceCostItem> {
    const workOrder = await this.maintenanceRepo.findById(id, tenantId);
    if (!workOrder) {
      throw new MaintenanceNotFoundError(id);
    }
    return this.maintenanceRepo.addCostItem(id, tenantId, dto);
  }

  async addEvidence(
    tenantId: string,
    id: string,
    dto: AddMaintenanceEvidenceDto,
    actor: ServiceActor
  ): Promise<MaintenanceEvidence> {
    const workOrder = await this.maintenanceRepo.findById(id, tenantId);
    if (!workOrder) {
      throw new MaintenanceNotFoundError(id);
    }
    return this.maintenanceRepo.addEvidence(id, tenantId, {
      ...dto,
      uploadedBy: actor.userId,
    });
  }

  async completeMaintenance(
    tenantId: string,
    id: string,
    dto: CompleteMaintenanceDto,
    actor: ServiceActor
  ): Promise<MaintenanceWorkOrder> {
    const workOrder = await this.maintenanceRepo.findById(id, tenantId);
    if (!workOrder) {
      throw new MaintenanceNotFoundError(id);
    }

    MaintenanceStateMachine.validateTransition(workOrder.status, "COMPLETED");
    MaintenanceStateMachine.validateCompletion(workOrder, dto.completionOdometer);

    const actualCompletedAt = dto.actualCompletedAt || new Date().toISOString();

    // Calculate actual cost
    let actualCost = dto.actualCost !== undefined ? dto.actualCost : workOrder.actualCost;
    if (actualCost <= 0) {
      const partsSum = (workOrder.parts || []).reduce((s, p) => s + (p.totalCost || 0), 0);
      const tasksSum = (workOrder.tasks || []).reduce((s, t) => s + (t.actualCost || 0), 0);
      const costItemsSum = (workOrder.costItems || []).reduce((s, c) => s + (c.actualCost || 0), 0);
      actualCost = partsSum + tasksSum + costItemsSum;
    }

    // Update work order
    await this.maintenanceRepo.update(id, tenantId, {
      status: "COMPLETED",
      actualCompletedAt,
      completionOdometer: dto.completionOdometer,
      actualCost,
    });

    // Record transition history
    await this.maintenanceRepo.recordStatusTransition(
      id,
      tenantId,
      workOrder.status,
      "COMPLETED",
      actor,
      dto.notes || `Maintenance completed at odometer ${dto.completionOdometer} km. Total cost: ${actualCost}`
    );

    // Audit & Outbox
    await this.auditRepo.create({
      tenantId,
      actorUserId: actor.userId,
      actorType: "USER",
      action: "MAINTENANCE_COMPLETED",
      resourceType: "MAINTENANCE_WORK_ORDER",
      resourceId: id,
      description: `Work order ${workOrder.maintenanceNumber} completed`,
      payload: { id, completionOdometer: dto.completionOdometer, actualCost },
    });

    await this.outboxRepo.publish({
      tenantId,
      eventType: "maintenance.completed",
      aggregateType: "MAINTENANCE_WORK_ORDER",
      aggregateId: id,
      payload: {
        id,
        maintenanceNumber: workOrder.maintenanceNumber,
        completionOdometer: dto.completionOdometer,
        actualCost,
        actualCompletedAt,
      },
    });

    return (await this.maintenanceRepo.findById(id, tenantId))!;
  }

  async verifyMaintenance(
    tenantId: string,
    id: string,
    dto: VerifyMaintenanceDto,
    actor: ServiceActor
  ): Promise<MaintenanceWorkOrder> {
    const workOrder = await this.maintenanceRepo.findById(id, tenantId);
    if (!workOrder) {
      throw new MaintenanceNotFoundError(id);
    }

    MaintenanceStateMachine.validateTransition(workOrder.status, "VERIFIED");
    MaintenanceStateMachine.validateVerification(workOrder);

    const verifiedAt = dto.verifiedAt || new Date().toISOString();
    const releaseStatus = dto.releaseVehicleStatus || (dto.passedInspection ? "AVAILABLE" : "GROUNDED");

    const verificationRecord: MaintenanceVerification = {
      id: crypto.randomUUID(),
      maintenanceId: id,
      tenantId,
      verifiedBy: actor.userId,
      verifiedAt,
      passedInspection: dto.passedInspection,
      roadTested: dto.roadTested,
      qualityScore: dto.qualityScore ?? (dto.passedInspection ? 100 : 0),
      releaseVehicleStatus: releaseStatus,
      verificationNotes: dto.verificationNotes,
      evidenceIds: dto.evidenceIds,
    };

    // 1. Record verification on work order
    await this.maintenanceRepo.recordVerification(id, tenantId, verificationRecord);

    // 2. Update work order status to VERIFIED
    await this.maintenanceRepo.update(id, tenantId, {
      status: "VERIFIED",
      verifiedAt,
    });

    // 3. Update Vehicle state and odometer
    const vehicle = await this.vehicleRepo.findById(workOrder.vehicleId, tenantId);
    if (vehicle) {
      const newOdometer =
        workOrder.completionOdometer && workOrder.completionOdometer > vehicle.odometer
          ? workOrder.completionOdometer
          : vehicle.odometer;

      const mappedAvailabilityStatus =
        releaseStatus === "AVAILABLE"
          ? "AVAILABLE"
          : releaseStatus === "MAINTENANCE"
          ? "MAINTENANCE"
          : "BLOCKED";

      await this.vehicleRepo.update(vehicle.id, tenantId, {
        availabilityStatus: mappedAvailabilityStatus,
        odometer: newOdometer,
      });
    }

    // 4. Release availability allocation lock
    if (workOrder.allocationId) {
      try {
        await this.allocationRepo.deleteAllocation(workOrder.allocationId, tenantId);
      } catch {
        // Allocation may already have been released
      }
    }

    // 5. If recalculateNextSchedule, update corresponding MaintenanceSchedules for this vehicle & type
    if (dto.recalculateNextSchedule !== false && workOrder.completionOdometer) {
      const schedules = await this.scheduleRepo.findByVehicleId(workOrder.vehicleId, tenantId);
      const matchingSchedule = schedules.find(
        (s) => s.status === "ACTIVE" && s.maintenanceType === workOrder.maintenanceType
      );
      if (matchingSchedule) {
        await this.scheduleRepo.update(matchingSchedule.id, tenantId, {
          lastCompletedAt: verifiedAt,
          lastCompletedOdometer: workOrder.completionOdometer,
        });
      }
    }

    // 6. Record status transition history
    await this.maintenanceRepo.recordStatusTransition(
      id,
      tenantId,
      "COMPLETED",
      "VERIFIED",
      actor,
      dto.verificationNotes || `QA verification passed: ${dto.passedInspection}. Vehicle released to ${releaseStatus}.`
    );

    // 7. Audit & Outbox
    await this.auditRepo.create({
      tenantId,
      actorUserId: actor.userId,
      actorType: "USER",
      action: "MAINTENANCE_VERIFIED",
      resourceType: "MAINTENANCE_WORK_ORDER",
      resourceId: id,
      description: `Work order ${workOrder.maintenanceNumber} verified and vehicle released to ${releaseStatus}`,
      payload: { id, passedInspection: dto.passedInspection, releaseStatus },
    });

    await this.outboxRepo.publish({
      tenantId,
      eventType: "maintenance.verified",
      aggregateType: "MAINTENANCE_WORK_ORDER",
      aggregateId: id,
      payload: {
        id,
        maintenanceNumber: workOrder.maintenanceNumber,
        vehicleId: workOrder.vehicleId,
        releaseStatus,
        passedInspection: dto.passedInspection,
      },
    });

    return (await this.maintenanceRepo.findById(id, tenantId))!;
  }

  async cancelMaintenance(
    tenantId: string,
    id: string,
    dto: CancelMaintenanceDto,
    actor: ServiceActor
  ): Promise<MaintenanceWorkOrder> {
    const workOrder = await this.maintenanceRepo.findById(id, tenantId);
    if (!workOrder) {
      throw new MaintenanceNotFoundError(id);
    }

    MaintenanceStateMachine.validateTransition(workOrder.status, "CANCELLED");

    // Release allocation if scheduled
    if (workOrder.allocationId) {
      try {
        await this.allocationRepo.deleteAllocation(workOrder.allocationId, tenantId);
      } catch {
        // Ignored
      }
    }

    await this.maintenanceRepo.update(id, tenantId, {
      status: "CANCELLED",
    });

    await this.maintenanceRepo.recordStatusTransition(
      id,
      tenantId,
      workOrder.status,
      "CANCELLED",
      actor,
      dto.reason
    );

    await this.auditRepo.create({
      tenantId,
      actorUserId: actor.userId,
      actorType: "USER",
      action: "MAINTENANCE_CANCELLED",
      resourceType: "MAINTENANCE_WORK_ORDER",
      resourceId: id,
      description: `Work order ${workOrder.maintenanceNumber} cancelled: ${dto.reason}`,
      payload: { id, reason: dto.reason },
    });

    await this.outboxRepo.publish({
      tenantId,
      eventType: "maintenance.cancelled",
      aggregateType: "MAINTENANCE_WORK_ORDER",
      aggregateId: id,
      payload: {
        id,
        maintenanceNumber: workOrder.maintenanceNumber,
        reason: dto.reason,
      },
    });

    return (await this.maintenanceRepo.findById(id, tenantId))!;
  }

  // --------------------------------------------------------------------------
  // WORK ORDER QUERIES
  // --------------------------------------------------------------------------

  async getById(tenantId: string, id: string): Promise<MaintenanceWorkOrder> {
    const wo = await this.maintenanceRepo.findById(id, tenantId);
    if (!wo) {
      throw new MaintenanceNotFoundError(id);
    }
    return wo;
  }

  async getByMaintenanceNumber(tenantId: string, maintenanceNumber: string): Promise<MaintenanceWorkOrder> {
    const wo = await this.maintenanceRepo.findByMaintenanceNumber(maintenanceNumber, tenantId);
    if (!wo) {
      throw new MaintenanceNotFoundError(maintenanceNumber);
    }
    return wo;
  }

  async listWorkOrders(
    tenantId: string,
    filters?: {
      vehicleId?: string;
      status?: MaintenanceStatus | MaintenanceStatus[];
      maintenanceType?: any;
      priority?: any;
      garageId?: string;
      search?: string;
    }
  ): Promise<MaintenanceWorkOrder[]> {
    return this.maintenanceRepo.list(tenantId, filters);
  }

  // --------------------------------------------------------------------------
  // SERVICE SCHEDULES & PREVENTIVE INTERVALS
  // --------------------------------------------------------------------------

  async createSchedule(
    tenantId: string,
    dto: CreateMaintenanceScheduleDto
  ): Promise<MaintenanceSchedule> {
    return this.scheduleRepo.create(tenantId, dto);
  }

  async updateSchedule(
    tenantId: string,
    id: string,
    dto: UpdateMaintenanceScheduleDto
  ): Promise<MaintenanceSchedule> {
    return this.scheduleRepo.update(id, tenantId, dto);
  }

  async getScheduleById(tenantId: string, id: string): Promise<MaintenanceSchedule> {
    const s = await this.scheduleRepo.findById(id, tenantId);
    if (!s) {
      throw new MaintenanceScheduleNotFoundError(id);
    }
    return s;
  }

  async listSchedules(
    tenantId: string,
    filters?: {
      vehicleId?: string;
      vehicleCategoryId?: string;
      maintenanceType?: any;
      status?: any;
      isSafetyCritical?: boolean;
    }
  ): Promise<MaintenanceSchedule[]> {
    return this.scheduleRepo.list(tenantId, filters);
  }

  async evaluateDueSchedules(
    tenantId: string,
    vehicleId?: string
  ): Promise<MaintenanceDueEvaluation[]> {
    const schedules = await this.scheduleRepo.list(tenantId, {
      vehicleId,
      status: "ACTIVE",
    });

    const evaluations: MaintenanceDueEvaluation[] = [];
    const now = new Date();

    for (const schedule of schedules) {
      if (schedule.vehicleId) {
        const vehicle = await this.vehicleRepo.findById(schedule.vehicleId, tenantId);
        if (vehicle) {
          const evalResult = MaintenanceDueCalculator.evaluateSchedule(
            schedule,
            {
              vehicleId: vehicle.id,
              registrationPlate: vehicle.registrationPlate,
              currentOdometer: vehicle.odometer,
            },
            now
          );
          evaluations.push(evalResult);
        }
      } else {
        // Schedule applies across category or fleet
        const vehicleResult = await this.vehicleRepo.findAll(tenantId, {
          category: schedule.vehicleCategoryId,
        });

        for (const vehicle of vehicleResult.vehicles) {
          const evalResult = MaintenanceDueCalculator.evaluateSchedule(
            schedule,
            {
              vehicleId: vehicle.id,
              registrationPlate: vehicle.registrationPlate,
              currentOdometer: vehicle.odometer,
            },
            now
          );
          evaluations.push(evalResult);
        }
      }
    }

    return evaluations;
  }

  // --------------------------------------------------------------------------
  // SERVICE PROVIDERS / GARAGES
  // --------------------------------------------------------------------------

  async createServiceProvider(
    tenantId: string,
    dto: CreateServiceProviderDto
  ): Promise<ServiceProvider> {
    return this.providerRepo.create(tenantId, dto);
  }

  async updateServiceProvider(
    tenantId: string,
    id: string,
    dto: UpdateServiceProviderDto
  ): Promise<ServiceProvider> {
    return this.providerRepo.update(id, tenantId, dto);
  }

  async getServiceProviderById(tenantId: string, id: string): Promise<ServiceProvider> {
    const p = await this.providerRepo.findById(id, tenantId);
    if (!p) {
      throw new MaintenanceProviderNotFoundError(id);
    }
    return p;
  }

  async listServiceProviders(
    tenantId: string,
    filters?: {
      status?: any;
      serviceType?: any;
      search?: string;
    }
  ): Promise<ServiceProvider[]> {
    return this.providerRepo.list(tenantId, filters);
  }
}
