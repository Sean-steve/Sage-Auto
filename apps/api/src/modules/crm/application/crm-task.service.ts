// ============================================================================
// CAR HIRE OS — CRM TASK SERVICE (Sprint 33)
// ============================================================================

import {
  CrmTaskRecord,
  CrmTaskPriority,
  CrmTaskStatus,
} from "@car-hire-os/types";
import {
  ICrmTaskRepository,
  IOutboxRepository,
} from "@car-hire-os/database";
import { EVENT_TYPES } from "@car-hire-os/contracts";
import { CrmTaskNotFoundError } from "../domain/crm.errors";

export interface CreateTaskDto {
  tenantId: string;
  entityType: "LEAD" | "SALES_QUOTE";
  entityId: string;
  title: string;
  description?: string;
  dueDate: string;
  priority?: CrmTaskPriority;
  assignedUserId: string;
}

export interface UpdateTaskDto {
  title?: string;
  description?: string;
  dueDate?: string;
  priority?: CrmTaskPriority;
  assignedUserId?: string;
  status?: CrmTaskStatus;
}

export class CrmTaskService {
  constructor(
    private readonly taskRepo: ICrmTaskRepository,
    private readonly outboxRepo?: IOutboxRepository
  ) {}

  async createTask(dto: CreateTaskDto): Promise<CrmTaskRecord> {
    const task = await this.taskRepo.save({
      id: "",
      tenantId: dto.tenantId,
      entityType: dto.entityType,
      entityId: dto.entityId,
      title: dto.title,
      description: dto.description,
      dueDate: dto.dueDate,
      priority: dto.priority || "MEDIUM",
      status: "PENDING",
      assignedUserId: dto.assignedUserId,
      createdAt: "",
      updatedAt: "",
    });

    if (this.outboxRepo) {
      await this.outboxRepo.publish({
        tenantId: dto.tenantId,
        eventType: EVENT_TYPES.CRM_TASK_CREATED,
        aggregateType: "CRM_TASK",
        aggregateId: task.id,
        payload: {
          taskId: task.id,
          entityType: task.entityType,
          entityId: task.entityId,
          title: task.title,
          dueDate: task.dueDate,
          assignedUserId: task.assignedUserId,
        },
      });
    }

    return task;
  }

  async completeTask(tenantId: string, taskId: string, completedBy: string): Promise<CrmTaskRecord> {
    const task = await this.taskRepo.findByTenantAndId(tenantId, taskId);
    if (!task) {
      throw new CrmTaskNotFoundError(taskId);
    }

    task.status = "COMPLETED";
    task.completedAt = new Date().toISOString();
    task.completedBy = completedBy;

    const updated = await this.taskRepo.save(task);

    if (this.outboxRepo) {
      await this.outboxRepo.publish({
        tenantId,
        eventType: EVENT_TYPES.CRM_TASK_COMPLETED,
        aggregateType: "CRM_TASK",
        aggregateId: task.id,
        payload: {
          taskId: task.id,
          completedBy,
          completedAt: task.completedAt,
        },
      });
    }

    return updated;
  }

  async rescheduleTask(tenantId: string, taskId: string, newDueDate: string): Promise<CrmTaskRecord> {
    const task = await this.taskRepo.findByTenantAndId(tenantId, taskId);
    if (!task) {
      throw new CrmTaskNotFoundError(taskId);
    }

    task.dueDate = newDueDate;
    const updated = await this.taskRepo.save(task);

    if (this.outboxRepo) {
      await this.outboxRepo.publish({
        tenantId,
        eventType: EVENT_TYPES.CRM_TASK_RESCHEDULED,
        aggregateType: "CRM_TASK",
        aggregateId: task.id,
        payload: {
          taskId: task.id,
          newDueDate,
        },
      });
    }

    return updated;
  }

  async getTasksByEntity(
    tenantId: string,
    entityType: "LEAD" | "SALES_QUOTE",
    entityId: string
  ): Promise<CrmTaskRecord[]> {
    return this.taskRepo.findByEntity(tenantId, entityType, entityId);
  }

  async getTasksByUser(tenantId: string, userId: string, status?: CrmTaskStatus): Promise<CrmTaskRecord[]> {
    return this.taskRepo.findByUser(tenantId, userId, status);
  }

  async deleteTask(tenantId: string, taskId: string): Promise<boolean> {
    return this.taskRepo.delete(tenantId, taskId);
  }
}
