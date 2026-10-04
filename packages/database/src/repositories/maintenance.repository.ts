import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — MAINTENANCE WORK ORDER PERSISTENCE REPOSITORY (SPRINT 17)
// Bounded Context: Maintenance Management & Vehicle Servicing (DOM-003 §21)
// ============================================================================

import type {
  MaintenanceWorkOrder,
  MaintenanceStatus,
  MaintenanceType,
  MaintenancePriority,
  MaintenanceTask,
  MaintenancePartItem,
  MaintenanceCostItem,
  MaintenanceEvidence,
  MaintenanceVerification,
  MaintenanceStatusHistory,
  CreateMaintenanceRequestDto,
  AddMaintenanceTaskDto,
  UpdateMaintenanceTaskDto,
  AddMaintenancePartDto,
  RecordMaintenanceCostDto,
  AddMaintenanceEvidenceDto,
} from "@carhire/types";
import {
  MaintenanceNotFoundError,
  MaintenanceConcurrencyConflictError,
  CrossTenantViolationError,
} from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IMaintenanceRepository {
  create(
    tenantId: string,
    data: CreateMaintenanceRequestDto & {
      maintenanceNumber?: string;
      requestedBy: string;
      odometerAtRequest?: number;
      ownershipTermsSnapshot?: MaintenanceWorkOrder["ownershipTermsSnapshot"];
    },
    tx?: TransactionContext
  ): Promise<MaintenanceWorkOrder>;

  findById(
    id: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<MaintenanceWorkOrder | null>;

  findByMaintenanceNumber(
    maintenanceNumber: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<MaintenanceWorkOrder | null>;

  findByVehicleId(
    vehicleId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<MaintenanceWorkOrder[]>;

  list(
    tenantId: string,
    filters?: {
      vehicleId?: string;
      status?: MaintenanceStatus | MaintenanceStatus[];
      maintenanceType?: MaintenanceType;
      priority?: MaintenancePriority;
      garageId?: string;
      sourceType?: string;
      search?: string;
    },
    tx?: TransactionContext
  ): Promise<MaintenanceWorkOrder[]>;

  listByTenant(tenantId: string, tx?: TransactionContext): Promise<MaintenanceWorkOrder[]>;

  update(
    id: string,
    tenantId: string,
    data: Partial<MaintenanceWorkOrder> & { expectedVersion?: number },
    tx?: TransactionContext
  ): Promise<MaintenanceWorkOrder>;

  addTask(
    maintenanceId: string,
    tenantId: string,
    task: AddMaintenanceTaskDto,
    tx?: TransactionContext
  ): Promise<MaintenanceTask>;

  updateTask(
    maintenanceId: string,
    taskId: string,
    tenantId: string,
    data: UpdateMaintenanceTaskDto,
    tx?: TransactionContext
  ): Promise<MaintenanceTask>;

  addCostItem(
    maintenanceId: string,
    tenantId: string,
    item: RecordMaintenanceCostDto,
    tx?: TransactionContext
  ): Promise<MaintenanceCostItem>;

  addPartItem(
    maintenanceId: string,
    tenantId: string,
    item: AddMaintenancePartDto,
    tx?: TransactionContext
  ): Promise<MaintenancePartItem>;

  addEvidence(
    maintenanceId: string,
    tenantId: string,
    evidence: AddMaintenanceEvidenceDto & { uploadedBy: string },
    tx?: TransactionContext
  ): Promise<MaintenanceEvidence>;

  recordStatusTransition(
    maintenanceId: string,
    tenantId: string,
    fromStatus: MaintenanceStatus,
    toStatus: MaintenanceStatus,
    actor: { userId: string },
    reason?: string,
    tx?: TransactionContext
  ): Promise<MaintenanceStatusHistory>;

  recordVerification(
    maintenanceId: string,
    tenantId: string,
    verification: MaintenanceVerification,
    tx?: TransactionContext
  ): Promise<MaintenanceVerification>;

  generateMaintenanceNumber(tenantId: string, tx?: TransactionContext): Promise<string>;

  seed(workOrders: MaintenanceWorkOrder[]): void;
}

export class MaintenanceRepository implements IMaintenanceRepository {
  private workOrders: Map<string, MaintenanceWorkOrder> = createRecordStore("maintenance.repository:workOrders");
  private counters: Map<string, number> = createRecordStore("maintenance.repository:counters");

  async generateMaintenanceNumber(tenantId: string, tx?: TransactionContext): Promise<string> {
    const year = new Date().getFullYear();
    const key = `${tenantId}:${year}`;
    const nextSeq = (this.counters.get(key) || 0) + 1;
    this.counters.set(key, nextSeq);
    return `MNT-${year}-${String(nextSeq).padStart(6, "0")}`;
  }

  async create(
    tenantId: string,
    data: CreateMaintenanceRequestDto & {
      maintenanceNumber?: string;
      requestedBy: string;
      odometerAtRequest?: number;
      ownershipTermsSnapshot?: MaintenanceWorkOrder["ownershipTermsSnapshot"];
    },
    tx?: TransactionContext
  ): Promise<MaintenanceWorkOrder> {
    if (!tenantId) {
      throw new Error("TenantId is mandatory to create a maintenance work order.");
    }

    const now = new Date().toISOString();
    const maintenanceNumber =
      data.maintenanceNumber || (await this.generateMaintenanceNumber(tenantId, tx));

    const tasks: MaintenanceTask[] = (data.tasks || []).map((t) => ({
      id: crypto.randomUUID(),
      maintenanceId: "", // Will be assigned below
      tenantId,
      taskType: t.taskType.trim(),
      description: t.description.trim(),
      isRequired: t.isRequired ?? true,
      status: "PENDING",
      estimatedCost: t.estimatedCost,
      actualCost: 0,
    }));

    const workOrder: MaintenanceWorkOrder = {
      id: (data as any).id || crypto.randomUUID(),
      tenantId,
      maintenanceNumber,
      vehicleId: data.vehicleId,
      status: "REQUESTED",
      maintenanceType: data.maintenanceType,
      priority: data.priority || "NORMAL",
      sourceType: data.sourceType || "MANUAL",
      sourceId: data.sourceId,
      requestedAt: now,
      requestedBy: data.requestedBy,
      reason: data.reason.trim(),
      description: data.description?.trim(),
      scheduledStartAt: data.scheduledStartAt,
      scheduledEndAt: data.scheduledEndAt,
      garageId: data.garageId,
      assignedTechnician: data.assignedTechnician?.trim(),
      odometerAtRequest: data.odometerAtRequest,
      estimatedCost: data.estimatedCost || 0,
      actualCost: 0,
      currency: data.currency || "KES",
      isSafetyCritical: data.isSafetyCritical ?? false,
      ownershipTermsSnapshot: data.ownershipTermsSnapshot,
      tasks: tasks.map((t) => ({ ...t, maintenanceId: workOrder ? workOrder.id : "" })),
      parts: [],
      costItems: [],
      evidence: [],
      statusHistory: [
        {
          id: crypto.randomUUID(),
          maintenanceId: "",
          tenantId,
          fromStatus: "REQUESTED",
          toStatus: "REQUESTED",
          reason: "Initial maintenance request logged",
          changedBy: data.requestedBy,
          changedAt: now,
        },
      ],
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    // Fix IDs
    workOrder.tasks = tasks.map((t) => ({ ...t, maintenanceId: workOrder.id }));
    if (workOrder.statusHistory && workOrder.statusHistory[0]) {
      workOrder.statusHistory[0].maintenanceId = workOrder.id;
    }

    this.workOrders.set(workOrder.id, workOrder);
    return JSON.parse(JSON.stringify(workOrder));
  }

  async findById(
    id: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<MaintenanceWorkOrder | null> {
    const wo = this.workOrders.get(id);
    if (!wo) return null;
    if (wo.tenantId !== tenantId) {
      throw new CrossTenantViolationError(wo.tenantId, tenantId);
    }
    return JSON.parse(JSON.stringify(wo));
  }

  async findByMaintenanceNumber(
    maintenanceNumber: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<MaintenanceWorkOrder | null> {
    const wo = Array.from(this.workOrders.values()).find(
      (w) => w.tenantId === tenantId && w.maintenanceNumber === maintenanceNumber
    );
    if (!wo) return null;
    return JSON.parse(JSON.stringify(wo));
  }

  async findByVehicleId(
    vehicleId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<MaintenanceWorkOrder[]> {
    return Array.from(this.workOrders.values())
      .filter((w) => w.tenantId === tenantId && w.vehicleId === vehicleId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((w) => JSON.parse(JSON.stringify(w)));
  }

  async list(
    tenantId: string,
    filters?: {
      vehicleId?: string;
      status?: MaintenanceStatus | MaintenanceStatus[];
      maintenanceType?: MaintenanceType;
      priority?: MaintenancePriority;
      garageId?: string;
      sourceType?: string;
      search?: string;
    },
    tx?: TransactionContext
  ): Promise<MaintenanceWorkOrder[]> {
    let result = Array.from(this.workOrders.values()).filter(
      (w) => w.tenantId === tenantId
    );

    if (filters?.vehicleId) {
      result = result.filter((w) => w.vehicleId === filters.vehicleId);
    }

    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        result = result.filter((w) => (filters.status as MaintenanceStatus[]).includes(w.status));
      } else {
        result = result.filter((w) => w.status === filters.status);
      }
    }

    if (filters?.maintenanceType) {
      result = result.filter((w) => w.maintenanceType === filters.maintenanceType);
    }

    if (filters?.priority) {
      result = result.filter((w) => w.priority === filters.priority);
    }

    if (filters?.garageId) {
      result = result.filter((w) => w.garageId === filters.garageId);
    }

    if (filters?.sourceType) {
      result = result.filter((w) => w.sourceType === filters.sourceType);
    }

    if (filters?.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (w) =>
          w.maintenanceNumber.toLowerCase().includes(q) ||
          w.reason.toLowerCase().includes(q) ||
          w.description?.toLowerCase().includes(q) ||
          w.assignedTechnician?.toLowerCase().includes(q)
      );
    }

    return result
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((w) => JSON.parse(JSON.stringify(w)));
  }

  async listByTenant(tenantId: string, tx?: TransactionContext): Promise<MaintenanceWorkOrder[]> {
    return this.list(tenantId, undefined, tx);
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<MaintenanceWorkOrder> & { expectedVersion?: number },
    tx?: TransactionContext
  ): Promise<MaintenanceWorkOrder> {
    const existing = await this.findById(id, tenantId, tx);
    if (!existing) {
      throw new MaintenanceNotFoundError(id);
    }

    if (data.expectedVersion !== undefined && existing.version !== data.expectedVersion) {
      throw new MaintenanceConcurrencyConflictError(id, data.expectedVersion, existing.version);
    }

    const updated: MaintenanceWorkOrder = {
      ...existing,
      ...data,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    };

    this.workOrders.set(id, updated);
    return JSON.parse(JSON.stringify(updated));
  }

  async addTask(
    maintenanceId: string,
    tenantId: string,
    task: AddMaintenanceTaskDto,
    tx?: TransactionContext
  ): Promise<MaintenanceTask> {
    const wo = await this.findById(maintenanceId, tenantId, tx);
    if (!wo) {
      throw new MaintenanceNotFoundError(maintenanceId);
    }

    const newTask: MaintenanceTask = {
      id: crypto.randomUUID(),
      maintenanceId,
      tenantId,
      taskType: task.taskType.trim(),
      description: task.description.trim(),
      isRequired: task.isRequired ?? true,
      status: "PENDING",
      estimatedCost: task.estimatedCost,
      actualCost: 0,
    };

    const tasks = wo.tasks || [];
    tasks.push(newTask);

    await this.update(maintenanceId, tenantId, { tasks }, tx);
    return { ...newTask };
  }

  async updateTask(
    maintenanceId: string,
    taskId: string,
    tenantId: string,
    data: UpdateMaintenanceTaskDto,
    tx?: TransactionContext
  ): Promise<MaintenanceTask> {
    const wo = await this.findById(maintenanceId, tenantId, tx);
    if (!wo) {
      throw new MaintenanceNotFoundError(maintenanceId);
    }

    const tasks = wo.tasks || [];
    const taskIndex = tasks.findIndex((t) => t.id === taskId);
    if (taskIndex === -1) {
      throw new MaintenanceNotFoundError(`Task ${taskId} on work order ${maintenanceId}`);
    }

    const existingTask = tasks[taskIndex];
    const updatedTask: MaintenanceTask = {
      ...existingTask,
      status: data.status ?? existingTask.status,
      actualCost: data.actualCost !== undefined ? data.actualCost : existingTask.actualCost,
      notes: data.notes !== undefined ? data.notes.trim() : existingTask.notes,
      completedAt: data.status === "COMPLETED" ? new Date().toISOString() : existingTask.completedAt,
    };

    tasks[taskIndex] = updatedTask;

    // Recalculate actual costs
    const totalActualCost =
      tasks.reduce((sum, t) => sum + (t.actualCost || 0), 0) +
      (wo.parts || []).reduce((sum, p) => sum + (p.totalCost || 0), 0) +
      (wo.costItems || []).reduce((sum, c) => sum + (c.actualCost || 0), 0);

    await this.update(maintenanceId, tenantId, { tasks, actualCost: totalActualCost }, tx);
    return { ...updatedTask };
  }

  async addCostItem(
    maintenanceId: string,
    tenantId: string,
    item: RecordMaintenanceCostDto,
    tx?: TransactionContext
  ): Promise<MaintenanceCostItem> {
    const wo = await this.findById(maintenanceId, tenantId, tx);
    if (!wo) {
      throw new MaintenanceNotFoundError(maintenanceId);
    }

    const costItem: MaintenanceCostItem = {
      id: crypto.randomUUID(),
      maintenanceId,
      tenantId,
      category: item.category,
      description: item.description.trim(),
      estimatedCost: item.estimatedCost || 0,
      actualCost: item.actualCost,
      currency: item.currency || wo.currency || "KES",
      notes: item.notes?.trim(),
    };

    const costItems = wo.costItems || [];
    costItems.push(costItem);

    const totalActualCost =
      (wo.tasks || []).reduce((sum, t) => sum + (t.actualCost || 0), 0) +
      (wo.parts || []).reduce((sum, p) => sum + (p.totalCost || 0), 0) +
      costItems.reduce((sum, c) => sum + (c.actualCost || 0), 0);

    await this.update(maintenanceId, tenantId, { costItems, actualCost: totalActualCost }, tx);
    return { ...costItem };
  }

  async addPartItem(
    maintenanceId: string,
    tenantId: string,
    item: AddMaintenancePartDto,
    tx?: TransactionContext
  ): Promise<MaintenancePartItem> {
    const wo = await this.findById(maintenanceId, tenantId, tx);
    if (!wo) {
      throw new MaintenanceNotFoundError(maintenanceId);
    }

    const totalCost = item.quantity * item.unitCost;
    const partItem: MaintenancePartItem = {
      id: crypto.randomUUID(),
      maintenanceId,
      tenantId,
      partNumber: item.partNumber?.trim().toUpperCase(),
      description: item.description.trim(),
      quantity: item.quantity,
      unitCost: item.unitCost,
      totalCost,
      currency: item.currency || wo.currency || "KES",
      supplierId: item.supplierId,
      notes: item.notes?.trim(),
    };

    const parts = wo.parts || [];
    parts.push(partItem);

    const totalActualCost =
      (wo.tasks || []).reduce((sum, t) => sum + (t.actualCost || 0), 0) +
      parts.reduce((sum, p) => sum + (p.totalCost || 0), 0) +
      (wo.costItems || []).reduce((sum, c) => sum + (c.actualCost || 0), 0);

    await this.update(maintenanceId, tenantId, { parts, actualCost: totalActualCost }, tx);
    return { ...partItem };
  }

  async addEvidence(
    maintenanceId: string,
    tenantId: string,
    evidence: AddMaintenanceEvidenceDto & { uploadedBy: string },
    tx?: TransactionContext
  ): Promise<MaintenanceEvidence> {
    const wo = await this.findById(maintenanceId, tenantId, tx);
    if (!wo) {
      throw new MaintenanceNotFoundError(maintenanceId);
    }

    const newEvidence: MaintenanceEvidence = {
      id: crypto.randomUUID(),
      maintenanceId,
      tenantId,
      fileReference: evidence.fileReference.trim(),
      fileType: evidence.fileType,
      description: evidence.description?.trim(),
      uploadedAt: new Date().toISOString(),
      uploadedBy: evidence.uploadedBy,
    };

    const evList = wo.evidence || [];
    evList.push(newEvidence);

    await this.update(maintenanceId, tenantId, { evidence: evList }, tx);
    return { ...newEvidence };
  }

  async recordStatusTransition(
    maintenanceId: string,
    tenantId: string,
    fromStatus: MaintenanceStatus,
    toStatus: MaintenanceStatus,
    actor: { userId: string },
    reason?: string,
    tx?: TransactionContext
  ): Promise<MaintenanceStatusHistory> {
    const wo = await this.findById(maintenanceId, tenantId, tx);
    if (!wo) {
      throw new MaintenanceNotFoundError(maintenanceId);
    }

    const historyRecord: MaintenanceStatusHistory = {
      id: crypto.randomUUID(),
      maintenanceId,
      tenantId,
      fromStatus,
      toStatus,
      reason: reason?.trim(),
      changedBy: actor.userId,
      changedAt: new Date().toISOString(),
    };

    const statusHistory = wo.statusHistory || [];
    statusHistory.push(historyRecord);

    await this.update(maintenanceId, tenantId, { status: toStatus, statusHistory }, tx);
    return { ...historyRecord };
  }

  async recordVerification(
    maintenanceId: string,
    tenantId: string,
    verification: MaintenanceVerification,
    tx?: TransactionContext
  ): Promise<MaintenanceVerification> {
    await this.update(
      maintenanceId,
      tenantId,
      {
        verification,
        verifiedAt: verification.verifiedAt,
      },
      tx
    );
    return { ...verification };
  }

  seed(workOrders: MaintenanceWorkOrder[]): void {
    for (const w of workOrders) {
      this.workOrders.set(w.id, JSON.parse(JSON.stringify(w)));
    }
  }
}
