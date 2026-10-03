// ============================================================================
// CAR HIRE OS — PREVENTIVE MAINTENANCE SCAN JOB (DEV-011, BRS-003)
// Evaluates vehicle mileage and schedule dates, enqueues maintenance events
// ============================================================================

import { CommandJobPayload, EVENT_TYPES } from "@carhire/contracts";
import { MaintenanceScheduleRepository, VehicleRepository, OutboxRepository } from "@carhire/database";

export interface MaintenanceCheckJobData {
  tenantId?: string;
  overdueDaysThreshold?: number;
  now?: string;
}

export interface MaintenanceCheckResult {
  scanned: number;
  dueCount: number;
  status: "completed";
}

export async function processMaintenanceCheck(
  data: MaintenanceCheckJobData = { overdueDaysThreshold: 0 }
): Promise<MaintenanceCheckResult> {
  const scheduleRepo = new MaintenanceScheduleRepository();
  const vehicleRepo = new VehicleRepository();
  const outboxRepo = new OutboxRepository();

  const now = data.now ? new Date(data.now) : new Date();
  let scanned = 0;
  let dueCount = 0;

  const tenants: string[] = data.tenantId ? [data.tenantId] : Array.from((MaintenanceScheduleRepository as any).store?.keys() || []);

  for (const tenantId of tenants) {
    try {
      const schedules = await scheduleRepo.list(tenantId, { status: "ACTIVE" as any });
      scanned += schedules.length;

      for (const schedule of schedules) {
        let isDue = false;

        // Check date threshold
        const dueDateVal = schedule.nextDueAt || (schedule as any).nextDueDate;
        if (dueDateVal) {
          const nextDueDate = new Date(dueDateVal);
          if (nextDueDate <= now) {
            isDue = true;
          }
        }

        // Check odometer threshold
        const dueOdoVal = schedule.nextDueOdometer ?? (schedule as any).nextDueMileage;
        if (!isDue && schedule.vehicleId && dueOdoVal !== undefined) {
          const vehicle = await vehicleRepo.findById(schedule.vehicleId, tenantId as string);
          if (vehicle && vehicle.odometer >= dueOdoVal) {
            isDue = true;
          }
        }

        if (isDue) {
          dueCount++;
          await outboxRepo.record({
            eventType: EVENT_TYPES.MAINTENANCE_SCHEDULED,
            aggregateType: "MaintenanceSchedule",
            aggregateId: schedule.id,
            tenantId: tenantId as string,
            source: "carhire.worker.maintenance-check",
            correlationId: crypto.randomUUID(),
            payload: {
              scheduleId: schedule.id,
              vehicleId: schedule.vehicleId,
              maintenanceType: schedule.maintenanceType,
              name: schedule.name,
              evaluatedAt: now.toISOString(),
            },
          });
        }
      }
    } catch (err) {
      console.error(`[Worker:MaintenanceCheck] Error scanning maintenance for tenant ${tenantId}:`, err);
    }
  }

  return {
    scanned,
    dueCount,
    status: "completed",
  };
}

/**
 * Worker Command Handler invoked by the Background Execution Platform.
 */
export async function handleCheckMaintenanceCommand(
  command: CommandJobPayload<MaintenanceCheckJobData>
): Promise<MaintenanceCheckResult> {
  const data: MaintenanceCheckJobData = {
    ...command.data,
    tenantId: command.tenantId || command.data?.tenantId,
  };
  return processMaintenanceCheck(data);
}
