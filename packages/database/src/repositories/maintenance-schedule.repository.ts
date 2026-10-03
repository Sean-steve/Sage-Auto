import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — MAINTENANCE SCHEDULE PERSISTENCE REPOSITORY (SPRINT 17)
// Bounded Context: Preventive Maintenance & Service Schedules (DOM-003 §21)
// ============================================================================

import type {
  MaintenanceSchedule,
  MaintenanceScheduleStatus,
  CreateMaintenanceScheduleDto,
  UpdateMaintenanceScheduleDto,
  MaintenanceType,
} from "@carhire/types";
import {
  MaintenanceScheduleNotFoundError,
  CrossTenantViolationError,
} from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IMaintenanceScheduleRepository {
  create(
    tenantId: string,
    data: CreateMaintenanceScheduleDto,
    tx?: TransactionContext
  ): Promise<MaintenanceSchedule>;

  findById(
    id: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<MaintenanceSchedule | null>;

  findByVehicleId(
    vehicleId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<MaintenanceSchedule[]>;

  list(
    tenantId: string,
    filters?: {
      vehicleId?: string;
      vehicleCategoryId?: string;
      maintenanceType?: MaintenanceType;
      status?: MaintenanceScheduleStatus;
      isSafetyCritical?: boolean;
    },
    tx?: TransactionContext
  ): Promise<MaintenanceSchedule[]>;

  update(
    id: string,
    tenantId: string,
    data: UpdateMaintenanceScheduleDto,
    tx?: TransactionContext
  ): Promise<MaintenanceSchedule>;

  deactivate(
    id: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<MaintenanceSchedule>;

  seed(schedules: MaintenanceSchedule[]): void;
}

export class MaintenanceScheduleRepository implements IMaintenanceScheduleRepository {
  private static store: Map<string, MaintenanceSchedule> = createRecordStore("maintenance-schedule.repository:store");

  private get schedules(): Map<string, MaintenanceSchedule> {
    return MaintenanceScheduleRepository.store;
  }

  static clear(): void {
    MaintenanceScheduleRepository.store.clear();
  }

  private calculateNextDue(
    lastCompletedAt: string | undefined,
    lastCompletedOdometer: number | undefined,
    intervalDays: number | undefined,
    intervalMonths: number | undefined,
    intervalDistanceKm: number | undefined
  ): { nextDueAt?: string; nextDueOdometer?: number } {
    let nextDueAt: string | undefined = undefined;
    let nextDueOdometer: number | undefined = undefined;

    const baseDate = lastCompletedAt ? new Date(lastCompletedAt) : new Date();

    if (intervalDays && intervalDays > 0) {
      const d = new Date(baseDate.getTime());
      d.setDate(d.getDate() + intervalDays);
      nextDueAt = d.toISOString();
    } else if (intervalMonths && intervalMonths > 0) {
      const d = new Date(baseDate.getTime());
      d.setMonth(d.getMonth() + intervalMonths);
      nextDueAt = d.toISOString();
    }

    if (intervalDistanceKm && intervalDistanceKm > 0) {
      const baseOdo = lastCompletedOdometer !== undefined ? lastCompletedOdometer : 0;
      nextDueOdometer = baseOdo + intervalDistanceKm;
    }

    return { nextDueAt, nextDueOdometer };
  }

  async create(
    tenantId: string,
    data: CreateMaintenanceScheduleDto,
    tx?: TransactionContext
  ): Promise<MaintenanceSchedule> {
    if (!tenantId) {
      throw new Error("TenantId is mandatory to create a maintenance schedule.");
    }

    const now = new Date().toISOString();
    const { nextDueAt, nextDueOdometer } = this.calculateNextDue(
      data.lastCompletedAt,
      data.lastCompletedOdometer,
      data.intervalDays,
      data.intervalMonths,
      data.intervalDistanceKm
    );

    const schedule: MaintenanceSchedule = {
      id: crypto.randomUUID(),
      tenantId,
      vehicleId: data.vehicleId,
      vehicleCategoryId: data.vehicleCategoryId,
      modelScope: data.modelScope?.trim(),
      name: data.name.trim(),
      maintenanceType: data.maintenanceType,
      intervalDistanceKm: data.intervalDistanceKm,
      intervalDays: data.intervalDays,
      intervalMonths: data.intervalMonths,
      lastCompletedAt: data.lastCompletedAt,
      lastCompletedOdometer: data.lastCompletedOdometer,
      nextDueAt,
      nextDueOdometer,
      dueSoonDistanceThresholdKm: data.dueSoonDistanceThresholdKm ?? 500,
      dueSoonDaysThreshold: data.dueSoonDaysThreshold ?? 14,
      status: "ACTIVE",
      isSafetyCritical: data.isSafetyCritical ?? false,
      notes: data.notes?.trim(),
      createdAt: now,
      updatedAt: now,
    };

    this.schedules.set(schedule.id, schedule);
    return { ...schedule };
  }

  async findById(
    id: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<MaintenanceSchedule | null> {
    const s = this.schedules.get(id);
    if (!s) return null;
    if (s.tenantId !== tenantId) {
      throw new CrossTenantViolationError(s.tenantId, tenantId);
    }
    return { ...s };
  }

  async findByVehicleId(
    vehicleId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<MaintenanceSchedule[]> {
    return Array.from(this.schedules.values())
      .filter((s) => s.tenantId === tenantId && s.vehicleId === vehicleId)
      .map((s) => ({ ...s }));
  }

  async list(
    tenantId: string,
    filters?: {
      vehicleId?: string;
      vehicleCategoryId?: string;
      maintenanceType?: MaintenanceType;
      status?: MaintenanceScheduleStatus;
      isSafetyCritical?: boolean;
    },
    tx?: TransactionContext
  ): Promise<MaintenanceSchedule[]> {
    let result = Array.from(this.schedules.values()).filter(
      (s) => s.tenantId === tenantId
    );

    if (filters?.vehicleId) {
      result = result.filter((s) => s.vehicleId === filters.vehicleId || !s.vehicleId);
    }
    if (filters?.vehicleCategoryId) {
      result = result.filter(
        (s) => s.vehicleCategoryId === filters.vehicleCategoryId || !s.vehicleCategoryId
      );
    }
    if (filters?.maintenanceType) {
      result = result.filter((s) => s.maintenanceType === filters.maintenanceType);
    }
    if (filters?.status) {
      result = result.filter((s) => s.status === filters.status);
    }
    if (filters?.isSafetyCritical !== undefined) {
      result = result.filter((s) => s.isSafetyCritical === filters.isSafetyCritical);
    }

    return result.sort((a, b) => a.name.localeCompare(b.name)).map((s) => ({ ...s }));
  }

  async update(
    id: string,
    tenantId: string,
    data: UpdateMaintenanceScheduleDto,
    tx?: TransactionContext
  ): Promise<MaintenanceSchedule> {
    const schedule = await this.findById(id, tenantId, tx);
    if (!schedule) {
      throw new MaintenanceScheduleNotFoundError(id);
    }

    const intervalDays = data.intervalDays !== undefined ? data.intervalDays : schedule.intervalDays;
    const intervalMonths = data.intervalMonths !== undefined ? data.intervalMonths : schedule.intervalMonths;
    const intervalDistanceKm =
      data.intervalDistanceKm !== undefined ? data.intervalDistanceKm : schedule.intervalDistanceKm;
    const lastCompletedAt =
      data.lastCompletedAt !== undefined ? data.lastCompletedAt : schedule.lastCompletedAt;
    const lastCompletedOdometer =
      data.lastCompletedOdometer !== undefined
        ? data.lastCompletedOdometer
        : schedule.lastCompletedOdometer;

    let nextDueAt = data.nextDueAt !== undefined ? data.nextDueAt : schedule.nextDueAt;
    let nextDueOdometer =
      data.nextDueOdometer !== undefined ? data.nextDueOdometer : schedule.nextDueOdometer;

    // If completion facts or intervals changed, auto-recalculate nextDue if not explicitly overridden
    if (
      (data.lastCompletedAt !== undefined ||
        data.lastCompletedOdometer !== undefined ||
        data.intervalDays !== undefined ||
        data.intervalMonths !== undefined ||
        data.intervalDistanceKm !== undefined) &&
      data.nextDueAt === undefined &&
      data.nextDueOdometer === undefined
    ) {
      const recalculated = this.calculateNextDue(
        lastCompletedAt,
        lastCompletedOdometer,
        intervalDays,
        intervalMonths,
        intervalDistanceKm
      );
      nextDueAt = recalculated.nextDueAt;
      nextDueOdometer = recalculated.nextDueOdometer;
    }

    const updated: MaintenanceSchedule = {
      ...schedule,
      name: data.name !== undefined ? data.name.trim() : schedule.name,
      maintenanceType: data.maintenanceType ?? schedule.maintenanceType,
      intervalDistanceKm,
      intervalDays,
      intervalMonths,
      dueSoonDistanceThresholdKm:
        data.dueSoonDistanceThresholdKm !== undefined
          ? data.dueSoonDistanceThresholdKm
          : schedule.dueSoonDistanceThresholdKm,
      dueSoonDaysThreshold:
        data.dueSoonDaysThreshold !== undefined
          ? data.dueSoonDaysThreshold
          : schedule.dueSoonDaysThreshold,
      isSafetyCritical:
        data.isSafetyCritical !== undefined
          ? data.isSafetyCritical
          : schedule.isSafetyCritical,
      status: data.status ?? schedule.status,
      lastCompletedAt,
      lastCompletedOdometer,
      nextDueAt,
      nextDueOdometer,
      notes: data.notes !== undefined ? data.notes.trim() : schedule.notes,
      updatedAt: new Date().toISOString(),
    };

    this.schedules.set(id, updated);
    return { ...updated };
  }

  async deactivate(
    id: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<MaintenanceSchedule> {
    return this.update(id, tenantId, { status: "DEACTIVATED" }, tx);
  }

  seed(schedules: MaintenanceSchedule[]): void {
    for (const s of schedules) {
      this.schedules.set(s.id, { ...s });
    }
  }
}
